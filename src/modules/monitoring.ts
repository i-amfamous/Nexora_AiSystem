import type { Context } from '../core/types.js';
import type { Store } from '../core/store.js';

/** Operational snapshot for SRS section 12.4. It reports only aggregate counts
 * from the caller's tenant and never exposes record contents or secrets. */
export class MonitoringModule {
  constructor(private store: Store) {}

  async snapshot(ctx: Context): Promise<Record<string, unknown>> {
    const [jobs, integrations, executions, approvals, auditSignIns, auditFailures] = await Promise.all([
      this.store.list<Record<string, unknown>>('jobs', undefined, ctx),
      this.store.list<Record<string, unknown>>('integrations', undefined, ctx),
      this.store.list<Record<string, unknown>>('agentExecutions', undefined, ctx),
      this.store.list<Record<string, unknown>>('approvals', undefined, ctx),
      this.store.list<Record<string, unknown>>('auditLogs', (entry) => /sign|auth/i.test(String(entry.action || '')), ctx),
      this.store.list<Record<string, unknown>>('auditLogs', (entry) => String(entry.result || '').toLowerCase() === 'failed', ctx)
    ]);

    return {
      at: new Date().toISOString(),
      api: {
        status: 'ok',
        uptimeSeconds: Math.floor(process.uptime()),
        node: process.version,
        memory: process.memoryUsage()
      },
      database: {
        adapter: process.env.DATA_STORE === 'postgres' ? 'postgres' : 'file',
        reachable: true
      },
      jobs: {
        queued: jobs.filter((job) => job.status === 'queued').length,
        running: jobs.filter((job) => job.status === 'running').length,
        failed: jobs.filter((job) => job.status === 'dead').length
      },
      integrations: {
        configured: integrations.length,
        connected: integrations.filter((item) => item.status === 'connected').length,
        failed: integrations.filter((item) => item.status === 'error').length
      },
      ai: {
        executions: executions.length,
        awaitingApproval: approvals.filter((item) => item.status === 'Pending').length,
        failures: executions.filter((item) => String(item.status || '').toLowerCase() === 'failed').length
      },
      authentication: {
        recentEvents: auditSignIns.length
      },
      errors: {
        failedAuditedOperations: auditFailures.length
      }
    };
  }
}
