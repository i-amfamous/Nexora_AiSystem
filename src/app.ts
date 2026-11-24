import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { FileStore, type Store } from './core/store.js';
import { PostgresStore } from './core/postgres-store.js';
import { EventHub } from './core/events.js';
import { JobQueue } from './core/queue.js';
import { RedisJobQueue } from './core/redis-queue.js';
import { StorageService } from './core/storage.js';
import { assertProductionConfig, runtimeConfig } from './core/config.js';
import { logger } from './core/logger.js';
import { startBackupScheduler } from './core/backup.js';
import { resolveToken } from './core/auth.js';
import { ApiError } from './core/errors.js';
import { Router, type ApiRequest, type ApiResponse } from './api/router.js';

export interface AppOptions {
  store?: Store;
  dataFile?: string;
  autoStartQueue?: boolean;
}

export interface NexoraApp {
  server: http.Server;
  store: Store;
  router: Router;
  events: EventHub;
  queue: JobQueue;
  close(): Promise<void>;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

interface RateEntry { count: number; reset: number }

export async function createApp(options: AppOptions = {}): Promise<NexoraApp> {
  assertProductionConfig();
  const config = runtimeConfig();
  let store: Store;
  if (options.store) {
    store = options.store;
  } else if (config.dataStore === 'postgres') {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required when DATA_STORE=postgres');
    store = new PostgresStore(process.env.DATABASE_URL);
  } else {
    store = new FileStore(options.dataFile);
  }
  await store.init();
  const events = new EventHub(store);
  const queue = config.queueDriver === 'redis' && !options.store
    ? new RedisJobQueue(store, String(process.env.REDIS_URL))
    : new JobQueue(store);
  const storage = new StorageService(store);
  const router = new Router(store, events, queue, storage);
  const rateLimits = new Map<string, RateEntry>();
  const interfaceRoot = path.resolve(process.cwd(), 'interface');
  const stopBackups = config.production && options.autoStartQueue !== false ? startBackupScheduler() : () => undefined;

  const server = http.createServer(async (req, res) => {
    const requestId = randomUUID();
    const started = Date.now();
    try {
      if (process.env.REQUIRE_HTTPS === 'true' && req.headers['x-forwarded-proto'] !== 'https') {
        res.writeHead(301, { location: `https://${req.headers.host || 'localhost'}${req.url || '/'}` }).end();
        return;
      }
      applySecurityHeaders(req, res);
      if (!applyCors(req, res)) return;
      if (req.method === 'OPTIONS') {
        res.writeHead(204).end();
        return;
      }
      if (!enforceRateLimit(req, res, rateLimits)) return;

      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      if (!url.pathname.startsWith('/api/')) {
        serveStatic(url.pathname, res, interfaceRoot);
        return;
      }

      const rawBody = await readBody(req);
      let body: Record<string, unknown> = {};
      if (rawBody) {
        try {
          body = JSON.parse(rawBody) as Record<string, unknown>;
        } catch {
          throw new ApiError(400, 'VALIDATION_ERROR', 'Request body must be valid JSON');
        }
      }
      const token = bearer(req);
      const ctx = token ? await resolveToken(store, token, req.socket.remoteAddress || '', String(req.headers['user-agent'] || '')) : undefined;
      const apiRequest: ApiRequest = {
        method: req.method || 'GET',
        path: url.pathname,
        url,
        headers: req.headers as Record<string, string | string[] | undefined>,
        rawBody,
        body: body && typeof body === 'object' ? body : {},
        ctx: ctx || undefined,
        requestId,
        ip: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim()
      };
      const response = await router.handle(apiRequest);
      send(res, response, requestId);
      logger.info('http request', {
        requestId,
        method: apiRequest.method,
        path: url.pathname,
        status: response.status,
        durationMs: Date.now() - started,
        businessId: apiRequest.ctx?.businessId
      });
    } catch (error) {
      logger.error('http request failed', {
        requestId,
        method: req.method,
        path: (req.url || '').split('?')[0],
        durationMs: Date.now() - started,
        message: error instanceof Error ? error.message : String(error)
      });
      sendError(res, error, requestId);
    }
  });

  events.attach(server);
  if (options.autoStartQueue !== false) queue.start();

  return {
    server,
    store,
    router,
    events,
    queue,
    async close() {
      stopBackups();
      await queue.stop();
      events.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await store.close();
    }
  };
}

function applySecurityHeaders(req: IncomingMessage, res: ServerResponse): void {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('content-security-policy', "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  if (req.headers['x-forwarded-proto'] === 'https' || process.env.REQUIRE_HTTPS === 'true') {
    res.setHeader('strict-transport-security', 'max-age=31536000; includeSubDomains');
  }
}

function applyCors(req: IncomingMessage, res: ServerResponse): boolean {
  const origin = String(req.headers.origin || '');
  const allowed = process.env.CORS_ORIGIN || process.env.ALLOWED_ORIGINS;
  if (!origin || !allowed || allowed.split(',').map((item) => item.trim()).includes(origin)) {
    if (allowed && origin) {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('access-control-allow-credentials', 'true');
      res.setHeader('vary', 'Origin');
    }
    res.setHeader('access-control-allow-headers', 'authorization, content-type, idempotency-key, if-match');
    res.setHeader('access-control-allow-methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    return true;
  }
  res.writeHead(403, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { code: 'CORS_DENIED', message: 'Origin is not allowed' } }));
  return false;
}

function enforceRateLimit(req: IncomingMessage, res: ServerResponse, limits: Map<string, RateEntry>): boolean {
  const pathname = (req.url || '').split('?')[0];
  if (pathname === '/api/v1/health') return true;
  const isAuth = pathname.includes('/auth/');
  const isWebhook = pathname.startsWith('/api/v1/webhooks/');
  const configuredMax = Number(process.env.RATE_LIMIT_MAX || 0);
  const fallback = isAuth ? 12 : isWebhook ? 120 : 600;
  const limit = configuredMax > 0 ? configuredMax : fallback;
  const configuredWindow = Number(process.env.RATE_LIMIT_WINDOW_MS || 0);
  const windowMs = configuredWindow > 0 ? configuredWindow : 60_000;
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  const key = `${ip}:${isAuth ? 'auth' : isWebhook ? 'webhooks' : 'api'}`;
  const now = Date.now();
  if (limits.size > 10_000) {
    for (const [storedKey, stored] of limits) if (stored.reset < now) limits.delete(storedKey);
  }
  let entry = limits.get(key);
  if (!entry || entry.reset < now) {
    entry = { count: 0, reset: now + windowMs };
    limits.set(key, entry);
  }
  entry.count++;
  if (entry.count > limit) {
    res.setHeader('retry-after', String(Math.ceil((entry.reset - now) / 1000)));
    res.writeHead(429, { 'content-type': 'application/json' }).end(JSON.stringify({
      error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again shortly.' }
    }));
    return false;
  }
  res.setHeader('x-ratelimit-limit', String(limit));
  res.setHeader('x-ratelimit-remaining', String(Math.max(0, limit - entry.count)));
  return true;
}

function bearer(req: IncomingMessage): string {
  const value = String(req.headers.authorization || '');
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    size += buffer.length;
    if (size > 10 * 1024 * 1024) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function send(res: ServerResponse, response: ApiResponse, requestId: string): void {
  const headers: Record<string, string> = { 'x-request-id': requestId, ...(response.headers || {}) };
  if (response.raw !== undefined) {
    headers['content-type'] = response.contentType || 'application/octet-stream';
    res.writeHead(response.status, headers).end(response.raw);
    return;
  }
  headers['content-type'] = 'application/json; charset=utf-8';
  res.writeHead(response.status, headers).end(JSON.stringify({ data: response.body ?? null, requestId }));
}

function sendError(res: ServerResponse, error: unknown, requestId: string): void {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Unexpected error';
  let details: unknown;
  if (error instanceof ApiError) {
    status = error.status;
    code = error.code;
    message = error.message;
    details = error.details;
  } else if (error instanceof Error) {
    message = error.message;
    if (message.startsWith('FORBIDDEN:')) { status = 403; code = 'FORBIDDEN'; }
    else if (message.startsWith('NOT_FOUND:')) { status = 404; code = 'NOT_FOUND'; }
    else if (message.startsWith('CONFLICT:')) { status = 409; code = 'CONFLICT'; message = message.slice(9); }
    else if (message.startsWith('UNKNOWN_TOOL:')) { status = 400; code = 'VALIDATION_ERROR'; }
    else if (status === 500) logger.error('unhandled request error', { requestId, message: error.message, stack: error.stack });
  }
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'x-request-id': requestId
  }).end(JSON.stringify({ error: { code, message, ...(details ? { details } : {}) }, requestId }));
}

function serveStatic(pathname: string, res: ServerResponse, root: string): void {
  let relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  if (relative === 'openapi.json') {
    const openapi = path.resolve(process.cwd(), 'docs/openapi.json');
    if (fs.existsSync(openapi)) {
      res.writeHead(200, { 'content-type': MIME['.json'] }).end(fs.readFileSync(openapi));
      return;
    }
  }
  const resolved = path.resolve(root, relative);
  if (!resolved.startsWith(root + path.sep) && resolved !== path.join(root, 'index.html')) {
    res.writeHead(403, { 'content-type': 'text/plain' }).end('Forbidden');
    return;
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    if (path.extname(relative)) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
      return;
    }
    const index = path.join(root, 'index.html');
    if (fs.existsSync(index)) {
      res.writeHead(200, { 'content-type': MIME['.html'] }).end(fs.readFileSync(index));
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(resolved)] || 'application/octet-stream', 'cache-control': 'no-cache' }).end(fs.readFileSync(resolved));
}
