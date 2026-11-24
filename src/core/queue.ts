import { randomUUID } from 'node:crypto';
import type { Context } from './types.js';
import type { Store } from './store.js';
import { recordAudit } from './audit.js';

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'dead';

export interface JobPayload {
  type: string;
  payload: Record<string, unknown>;
  ctx?: Context;
  runAt?: string;
  maxAttempts?: number;
  idempotencyKey?: string;
}

export interface JobHandler {
  (payload: Record<string, unknown>, ctx: Context | undefined, jobId: string): Promise<void>;
}

/** Durable background queue. The Store abstraction keeps it portable; a Redis/BullMQ
 * adapter can replace this class without changing module callers. */
export class JobQueue {
  protected handlers = new Map<string, JobHandler>();
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(protected readonly store: Store, private pollMs = 1000) {}

  register(type: string, handler: JobHandler): void {
    this.handlers.set(type, handler);
  }

  async enqueue(ctx: Context | undefined, input: JobPayload): Promise<Record<string, unknown>> {
    const businessId = ctx?.businessId || (input.payload.businessId as string) || '';
    const key = input.idempotencyKey;
    if (key) {
      const existing = await this.store.find<Record<string, unknown>>(
        'jobs',
        (j) => j.idempotencyKey === key && j.businessId === businessId,
        ctx
      );
      if (existing) return existing;
    }
    const id = `job_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const job = await this.store.insert('jobs', {
      id,
      type: input.type,
      payload: input.payload,
      businessId,
      status: 'queued',
      attempts: 0,
      maxAttempts: input.maxAttempts ?? 3,
      runAt: input.runAt || new Date().toISOString(),
      idempotencyKey: key || null,
      lastError: null
    }, ctx);
    return job;
  }

  async runOnce(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const due = await this.store.list<Record<string, unknown>>(
        'jobs',
        (j) => j.status === 'queued' && new Date(String(j.runAt)).getTime() <= Date.now(),
        undefined
      );
      let processed = 0;
      for (const job of due.sort((a, b) => String(a.runAt).localeCompare(String(b.runAt)))) {
        await this.processStoreJob(job);
        processed++;
      }
      return processed;
    } finally {
      this.running = false;
    }
  }

  private async processStoreJob(job: Record<string, unknown>): Promise<void> {
    const ctx = job.ctx as Context | undefined;
    const jobId = String(job.id);
    const current = await this.store.get<Record<string, unknown>>('jobs', jobId, ctx);
    if (!current || current.status !== 'queued') return;
    await this.store.update('jobs', jobId, { status: 'running', attempts: Number(current.attempts || 0) + 1 }, ctx);
    const handler = this.handlers.get(String(job.type));
    if (!handler) {
      await this.fail(job, ctx, `No handler registered for ${String(job.type)}`, false);
      return;
    }
    try {
      await handler((job.payload || {}) as Record<string, unknown>, ctx, jobId);
      await this.store.update('jobs', jobId, { status: 'succeeded', lastError: null, finishedAt: new Date().toISOString() }, ctx);
      if (ctx) {
        await recordAudit(this.store, ctx, {
          actorId: ctx.employeeId,
          actorType: 'Workflow',
          action: `Completed background job ${String(job.type)}`,
          resource: jobId,
          result: 'Success'
        });
      }
    } catch (error) {
      await this.fail(job, ctx, error instanceof Error ? error.message : String(error), true);
    }
  }

  private async fail(job: Record<string, unknown>, ctx: Context | undefined, message: string, retryable: boolean): Promise<void> {
    const attempts = Number(job.attempts || 0) + 1;
    const maxAttempts = Number(job.maxAttempts || 3);
    const status: JobStatus = retryable && attempts < maxAttempts ? 'queued' : 'dead';
    const delayMs = Math.min(60_000, 1000 * 2 ** Math.max(0, attempts - 1));
    const runAt = new Date(Date.now() + delayMs).toISOString();
    await this.store.update('jobs', String(job.id), { status, runAt, lastError: message }, ctx);
    if (ctx) {
      await this.store.insert('notifications', {
        title: status === 'dead' ? `Background job failed: ${String(job.type)}` : `Background job retry scheduled: ${String(job.type)}`,
        body: message,
        type: 'workflow',
        unread: true,
        go: '#/automation',
        recipientId: ctx.employeeId,
        channels: ['inApp', 'desktop']
      }, ctx);
      await recordAudit(this.store, ctx, {
        actorId: ctx.employeeId,
        actorType: 'Workflow',
        action: `Background job ${String(job.type)} ${status === 'dead' ? 'failed' : 'queued for retry'}`,
        resource: String(job.id),
        result: 'Failed',
        meta: { attempts, error: message }
      });
    }
  }

  async retry(ctx: Context, jobId: string): Promise<Record<string, unknown>> {
    const job = await this.store.get<Record<string, unknown>>('jobs', jobId, ctx);
    if (!job) throw new Error('NOT_FOUND:Job not found');
    await this.store.update('jobs', jobId, { status: 'queued', attempts: 0, runAt: new Date().toISOString(), lastError: null }, ctx);
    return (await this.store.get('jobs', jobId, ctx))!;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.runOnce(); }, this.pollMs);
    this.timer.unref();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
