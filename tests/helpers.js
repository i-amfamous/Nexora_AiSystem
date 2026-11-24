import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../dist/app.js';

export async function startTestApp(options = {}) {
  process.env.NODE_ENV = 'test';
  for (const [key, value] of Object.entries(options.env || {})) process.env[key] = value;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `nexora-test-${randomUUID().slice(0, 8)}-`));
  const app = await createApp({
    dataFile: path.join(dir, 'data.json'),
    autoStartQueue: options.autoStartQueue === true
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const port = app.server.address().port;
  return {
    app,
    base: `http://127.0.0.1:${port}/api/v1`,
    wsBase: `ws://127.0.0.1:${port}/ws`,
    async cleanup() {
      app.server.closeAllConnections?.();
      await app.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

export async function api(base, endpoint, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${base}${endpoint}`, {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    redirect: 'manual'
  });
  const text = await response.text();
  let parsed = null;
  if (text) {
    try { parsed = JSON.parse(text); } catch { parsed = text; }
  }
  return { status: response.status, body: parsed, headers: response.headers, text };
}

export async function login(base, email = 'owner@example.test', password = 'redacted-password') {
  const result = await api(base, '/auth/login', { method: 'POST', body: { email, password } });
  if (result.status !== 200) throw new Error(`Test login failed: ${result.text}`);
  return result.body.data;
}
