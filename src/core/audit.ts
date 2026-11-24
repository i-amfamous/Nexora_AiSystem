import { randomUUID } from 'node:crypto';
import type { AuditInput, Context } from './types.js';
import type { Store } from './store.js';

export async function recordAudit(
  store: Store,
  ctx: Context | { businessId: string; employeeId: string; role: string; userId: string },
  input: AuditInput
): Promise<void> {
  const actorName = input.actorId || ctx.employeeId;
  await store.insert('auditLogs', {
    id: `audit_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
    occurredAt: new Date().toISOString(),
    workspaceId: input.businessId || ctx.businessId,
    workspaceIdentifier: ctx.businessId,
    actor: actorName,
    actorId: input.actorId || ctx.employeeId,
    actorType: input.actorType,
    action: input.action,
    resource: input.resource,
    result: input.result,
    approvalReference: input.approvalId || null,
    meta: input.meta || {},
    ip: 'ip' in ctx ? ctx.ip : undefined,
    userAgent: 'userAgent' in ctx ? ctx.userAgent : undefined
  }, 'businessId' in ctx && ctx.businessId ? (ctx as Context) : undefined);
}
