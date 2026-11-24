import { randomUUID } from 'node:crypto';
import type { Context } from '../core/types.js';
import type { Store } from '../core/store.js';
import type { JobQueue } from '../core/queue.js';
import { errors } from '../core/errors.js';
import { encryptSecret, decryptSecret } from '../core/crypto.js';
import { recordAudit } from '../core/audit.js';
import { getAdapter } from '../core/webhooks.js';

export class IntegrationModule {
  constructor(private store: Store, private queue: JobQueue) {
    this.queue.register('integration_sync', (payload, ctx) => this.sync(payload, ctx));
  }

  async connect(ctx: Context, integrationId: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const integration = await this.store.get<Record<string, unknown>>('integrations', integrationId, ctx);
    if (!integration) throw errors.notFound('Integration not found');
    const credentials = input.credentials;
    if (credentials && typeof credentials !== 'object') throw errors.badRequest('Credentials must be an object');
    const updated = await this.store.update('integrations', integrationId, {
      status: 'connected',
      detail: String(input.detail || integration.detail || 'Connected'),
      sync: 'Just now',
      credentialsEncrypted: credentials ? true : Boolean(integration.credentialsEncrypted),
      credentialsCiphertext: credentials ? encryptSecret(JSON.stringify(credentials)) : (integration.credentialsCiphertext || null),
      failureCount: 0,
      lastError: null,
      connectedBy: ctx.employeeId
    }, ctx);
    if (String(integration.cat) === 'Communication') {
      const existing = await this.store.find<Record<string, unknown>>('channelConnections', (c) => c.channel === integrationId, ctx);
      const payload = {
        channel: integrationId,
        status: 'connected',
        identity: String(input.detail || integration.detail || ''),
        lastSync: new Date().toISOString()
      };
      if (existing) await this.store.update('channelConnections', String(existing.id), payload, ctx);
      else await this.store.insert('channelConnections', { id: `conn_${integrationId}`, ...payload }, ctx);
    }
    await recordAudit(this.store, ctx, { actorId: ctx.employeeId, actorType: 'Employee', action: 'Connected integration', resource: integrationId, result: 'Success' });
    return updated!;
  }

  async disconnect(ctx: Context, integrationId: string): Promise<Record<string, unknown>> {
    const integration = await this.store.get<Record<string, unknown>>('integrations', integrationId, ctx);
    if (!integration) throw errors.notFound('Integration not found');
    const updated = await this.store.update('integrations', integrationId, {
      status: 'off',
      sync: '',
      credentialsCiphertext: null,
      credentialsEncrypted: false,
      disconnectedBy: ctx.employeeId
    }, ctx);
    const connection = await this.store.find<Record<string, unknown>>('channelConnections', (c) => c.channel === integrationId, ctx);
    if (connection) await this.store.update('channelConnections', String(connection.id), { status: 'disconnected' }, ctx);
    await recordAudit(this.store, ctx, { actorId: ctx.employeeId, actorType: 'Employee', action: 'Disconnected integration', resource: integrationId, result: 'Success' });
    return updated!;
  }

  async credentials(ctx: Context, integrationId: string): Promise<Record<string, unknown>> {
    const integration = await this.store.get<Record<string, unknown>>('integrations', integrationId, ctx);
    if (!integration?.credentialsCiphertext) return {};
    return JSON.parse(decryptSecret(String(integration.credentialsCiphertext))) as Record<string, unknown>;
  }

  async status(ctx: Context, integrationId: string): Promise<Record<string, unknown>> {
    const integration = await this.store.get<Record<string, unknown>>('integrations', integrationId, ctx);
    if (!integration) throw errors.notFound('Integration not found');
    const adapterStatus = await getAdapter(integrationId).status();
    return {
      id: integration.id,
      status: integration.status,
      detail: adapterStatus.detail,
      lastSync: integration.sync || null,
      failureCount: integration.failureCount || 0,
      lastError: integration.lastError || null
    };
  }

  async syncNow(ctx: Context, integrationId: string): Promise<Record<string, unknown>> {
    const integration = await this.store.get<Record<string, unknown>>('integrations', integrationId, ctx);
    if (!integration) throw errors.notFound('Integration not found');
    const job = await this.queue.enqueue(ctx, {
      type: 'integration_sync',
      ctx,
      payload: { businessId: ctx.businessId, integrationId },
      idempotencyKey: `sync:${integrationId}:${new Date().toISOString().slice(0, 16)}`
    });
    await this.store.update('integrations', integrationId, { sync: 'Sync requested' }, ctx);
    return job;
  }

  private async sync(payload: Record<string, unknown>, ctx: Context | undefined): Promise<void> {
    if (!ctx) throw new Error('Integration sync requires tenant context');
    const integrationId = String(payload.integrationId || '');
    const integration = await this.store.get<Record<string, unknown>>('integrations', integrationId, ctx);
    if (!integration || integration.status !== 'connected') return;
    const endpoint = process.env[`${integrationId.toUpperCase()}_SYNC_URL`];
    if (endpoint) {
      const credentials = await this.credentials(ctx, integrationId);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(credentials.token ? { authorization: `Bearer ${String(credentials.token)}` } : {}) },
        body: JSON.stringify({ integrationId, businessId: ctx.businessId })
      });
      if (!response.ok) throw new Error(`Sync failed with provider status ${response.status}`);
    }
    await this.store.update('integrations', integrationId, { sync: 'Just now', failureCount: 0, lastError: null }, ctx);
  }

  async recordFailure(ctx: Context, integrationId: string, error: string): Promise<void> {
    const integration = await this.store.get<Record<string, unknown>>('integrations', integrationId, ctx);
    if (!integration) return;
    const failureCount = Number(integration.failureCount || 0) + 1;
    await this.store.update('integrations', integrationId, {
      status: failureCount >= 3 ? 'error' : 'degraded',
      failureCount,
      lastError: error.slice(0, 500),
      sync: 'Failed'
    }, ctx);
    await this.store.insert('notifications', {
      title: `Integration needs attention: ${integration.name || integrationId}`,
      body: error.slice(0, 200),
      type: 'integration',
      unread: true,
      go: '#/integrations',
      recipientId: ctx.employeeId,
      channels: ['inApp', 'desktop']
    }, ctx);
    await recordAudit(this.store, ctx, { actorId: `integration:${integrationId}`, actorType: 'Integration', action: 'Integration failure', resource: integrationId, result: 'Failed', meta: { error } });
  }
}
