import type { Context, CollectionName } from '../core/types.js';
import type { Store, Database } from '../core/store.js';
import { errors } from '../core/errors.js';
import { recordAudit } from '../core/audit.js';

const EXCLUDED: CollectionName[] = ['sessions', 'passwordResets', 'webhookNonces', 'idempotency', 'permissions', 'rolePermissions'];

export class DataProtectionModule {
  constructor(private store: Store) {}

  async exportData(ctx: Context): Promise<{ data: Database; meta: Record<string, unknown> }> {
    const snapshot = await this.store.snapshot();
    const data: Database = {};
    let records = 0;
    for (const [collection, values] of Object.entries(snapshot)) {
      if (EXCLUDED.includes(collection as CollectionName)) continue;
      const scoped = values.filter((record) => record.businessId === ctx.businessId);
      if (!scoped.length) continue;
      data[collection] = scoped;
      records += scoped.length;
    }
    await recordAudit(this.store, ctx, { actorId: ctx.employeeId, actorType: 'Employee', action: 'Exported workspace data', resource: ctx.businessId, result: 'Success', meta: { records } });
    return { data, meta: { businessId: ctx.businessId, exportedAt: new Date().toISOString(), records, format: 'json' } };
  }

  async deleteData(ctx: Context, target: { collection: CollectionName; id: string; confirmation: string }): Promise<Record<string, unknown>> {
    if (target.confirmation !== 'DELETE') throw errors.badRequest('Type DELETE to confirm controlled deletion');
    const record = await this.store.get<Record<string, unknown>>(target.collection, target.id, ctx);
    if (!record) throw errors.notFound('Record not found');
    const patch: Record<string, unknown> = {
      deletedAt: new Date().toISOString(),
      deletedBy: ctx.employeeId,
      status: 'deleted'
    };
    for (const field of ['name', 'email', 'phone', 'text', 'address', 'credentialsCiphertext', 'passwordHash']) {
      if (field in record) patch[field] = '[redacted]';
    }
    await this.store.update(target.collection, target.id, patch, ctx);
    if (target.collection === 'customers') {
      const identifiers = await this.store.list<Record<string, unknown>>('customerIdentifiers', (i) => i.customerId === target.id, ctx);
      for (const identifier of identifiers) await this.store.remove('customerIdentifiers', String(identifier.id), ctx);
    }
    await recordAudit(this.store, ctx, {
      actorId: ctx.employeeId,
      actorType: 'Employee',
      action: 'Deleted workspace data',
      resource: `${target.collection}:${target.id}`,
      result: 'Success'
    });
    return { id: target.id, collection: target.collection, deletedAt: patch.deletedAt, redacted: true };
  }

  async retentionPolicy(ctx: Context): Promise<Record<string, unknown>> {
    const business = await this.store.get<Record<string, unknown>>('businesses', ctx.businessId, ctx);
    return (business?.retentionPolicy as Record<string, unknown>) || {
      auditLogDays: 365,
      messageDays: 730,
      sessionDays: 30,
      backupDays: 90,
      enabled: true
    };
  }

  async updateRetentionPolicy(ctx: Context, policy: Record<string, unknown>): Promise<Record<string, unknown>> {
    await this.store.update('businesses', ctx.businessId, { retentionPolicy: policy }, ctx);
    await recordAudit(this.store, ctx, { actorId: ctx.employeeId, actorType: 'Employee', action: 'Updated data retention policy', resource: ctx.businessId, result: 'Success', meta: policy });
    return policy;
  }
}
