import { createHash, timingSafeEqual } from 'node:crypto';
import type { Context } from './types.js';
import type { Store } from './store.js';
import { hmacHex } from './crypto.js';
import { errors } from './errors.js';

export interface NormalizedInbound {
  channel: string;
  externalId: string;
  customerIdentifier: string;
  customerName?: string;
  text: string;
  attachments: { name: string; mimeType?: string; data?: string; url?: string }[];
  timestamp?: string;
  status?: string;
  raw: Record<string, unknown>;
}

function constantEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function header(headers: Record<string, string | string[] | undefined>, name: string): string {
  const value = headers[name] || headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function secretFor(provider: string): string {
  const specific = process.env[`WEBHOOK_SECRET_${provider.toUpperCase()}`];
  return specific || process.env.WEBHOOK_SECRET || '';
}

/** Verifies provider signatures and rejects replays. Secrets never travel in URLs. */
export async function verifyWebhook(
  store: Store,
  provider: string,
  rawBody: string,
  headers: Record<string, string | string[] | undefined>,
  ctx?: Context
): Promise<{ provider: string; eventId: string }> {
  const secret = secretFor(provider);
  if (!secret) throw errors.internal(`Webhook secret is not configured for ${provider}`);

  const signature = header(headers, 'x-nexora-signature') || header(headers, 'x-hub-signature-256') || header(headers, 'x-telegram-bot-api-token');
  const normalized = signature.replace(/^sha256=/i, '');
  const timestamp = header(headers, 'x-nexora-timestamp') || header(headers, 'x-hub-timestamp');
  const nonce = header(headers, 'x-nexora-nonce') || header(headers, 'x-webhook-id');

  if (timestamp) {
    const age = Date.now() - Number(timestamp);
    if (!Number.isFinite(age) || age < -300_000 || age > 300_000) throw errors.badRequest('Webhook timestamp is outside the accepted window');
  }
  const signedPayload = timestamp ? `${timestamp}.${rawBody}` : rawBody;
  const expected = hmacHex(secret, signedPayload);
  if (!normalized || !constantEqual(expected, normalized)) throw errors.unauthorized('Webhook signature is invalid');

  const eventId = nonce || createHash('sha256').update(rawBody).digest('hex').slice(0, 24);
  const existing = await store.find<Record<string, unknown>>(
    'webhookNonces',
    (n) => n.id === `${provider}:${eventId}`,
    ctx
  );
  if (existing) throw errors.conflict('Webhook has already been processed');
  await store.insert('webhookNonces', {
    id: `${provider}:${eventId}`,
    provider,
    eventId,
    receivedAt: new Date().toISOString()
  }, ctx);
  return { provider, eventId };
}

export interface ChannelAdapter {
  provider: string;
  verify(store: Store, rawBody: string, headers: Record<string, string | string[] | undefined>, ctx?: Context): Promise<{ provider: string; eventId: string }>;
  normalize(body: Record<string, unknown>): NormalizedInbound;
  send(input: { to: string; text: string; metadata?: Record<string, unknown> }): Promise<{ providerMessageId: string; status: string }>;
  status(): Promise<{ connected: boolean; detail: string }>;
}

function baseNormalize(provider: string, body: Record<string, unknown>): NormalizedInbound {
  const entry = (body.entry as Record<string, unknown>[] | undefined)?.[0];
  const change = (entry?.changes as Record<string, unknown>[] | undefined)?.[0];
  const message = (change?.value as Record<string, unknown> | undefined)?.messages as Record<string, unknown>[] | undefined;
  const msg = message?.[0] || (body.message as Record<string, unknown>) || body;
  const identifier = String(msg.from || msg.from_number || msg.sender || msg.chat_id || msg.email || msg.customerId || '');
  const text = String(msg.text || msg.body || msg.caption || msg.content || '');
  return {
    channel: provider,
    externalId: String(msg.id || body.id || ''),
    customerIdentifier: identifier,
    customerName: msg.name ? String(msg.name) : undefined,
    text,
    attachments: Array.isArray(msg.attachments) ? msg.attachments as NormalizedInbound['attachments'] : [],
    timestamp: msg.timestamp ? String(msg.timestamp) : undefined,
    status: msg.status ? String(msg.status) : undefined,
    raw: body
  };
}

function createAdapter(provider: string): ChannelAdapter {
  return {
    provider,
    verify: (store, raw, headers, ctx) => verifyWebhook(store, provider, raw, headers, ctx),
    normalize: (body) => baseNormalize(provider, body),
    async send(input) {
      const endpoint = process.env[`${provider.toUpperCase()}_SEND_URL`];
      const token = process.env[`${provider.toUpperCase()}_TOKEN`];
      if (!endpoint) {
        return { providerMessageId: `local_${Date.now()}`, status: 'queued' };
      }
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ to: input.to, text: input.text, metadata: input.metadata || {} })
      });
      if (!response.ok) throw new Error(`${provider} delivery failed with ${response.status}`);
      const result = await response.json() as Record<string, unknown>;
      return { providerMessageId: String(result.id || result.message_id || ''), status: String(result.status || 'sent') };
    },
    async status() {
      return { connected: true, detail: endpointDetail(provider) };
    }
  };
}

function endpointDetail(provider: string): string {
  return process.env[`${provider.toUpperCase()}_SEND_URL`] ? 'Provider endpoint configured' : 'Local adapter mode';
}

const PROVIDERS = ['whatsapp', 'telegram', 'email', 'webchat', 'instagram', 'messenger'] as const;

export const channelAdapters: Record<string, ChannelAdapter> = Object.fromEntries(
  PROVIDERS.map((provider) => [provider, createAdapter(provider)])
);

export function getAdapter(channel: string): ChannelAdapter {
  return channelAdapters[channel] || createAdapter(channel);
}
