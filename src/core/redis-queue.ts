import { createHash, randomUUID } from 'node:crypto';
import { Queue, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import type { Context } from './types.js';
import type { Store } from './store.js';
import { JobQueue, type JobPayload } from './queue.js';
import { recordAudit } from './audit.js';
import { logger } from './logger.js';

const QUEUE_NAME = 'nexora-jobs';

interface RedisJobData {
  storeId: string;
  type: string;
  payload: Record<string, unknown>;
  ctx?: Context;
}

/** BullMQ-backed queue for production. Job state is mirrored into the Store so
 * monitoring, retry endpoints and tenant-scoped views keep one contract. */
export class RedisJobQueue extends JobQueue {
  private readonly bull: Queue<RedisJobData>;
  private worker: Worker<RedisJobData> | null = null;
  private readonly workerConnection: Redis;
  private readonly queueConnection: Redis;

  constructor(store: Store, redisUrl: string) {
    super(store, 0);
    const options = { maxRetriesPerRequest: null as null, enableReadyCheck: true };
    this.queueConnection = new Redis(redisUrl, options);
    this.workerConnection = new Redis(redisUrl, options);
    this.bull = new Queue<RedisJobData>(QUEUE_NAME, { connection: this.queueConnection });
  }

  async enqueue(ctx: Context | undefined, input: JobPayload): Promise<Record<string, unknown>> {
    const businessId = ctx?.businessId || String(input.payload.businessId || '');
    const key = input.idempotencyKey;
    const id = key
      ? `job_${createHash('sha256').update(`${businessId}:${input.type}:${key}`).digest('hex').slice(0, 24)}`
      : `job_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

    const existing = await this.store.get<Record<string, unknown>>('jobs', id, ctx);
    if (existing) return existing;

    const job = await this.store.insert('jobs', {
      id,
      type: input.type,
      payload: input.payload,
      ctx: input.ctx || null,
      businessId,
      status: 'queued',
      attempts: 0,
      maxAttempts: input.maxAttempts ?? 3,
      runAt: input.runAt || new Date().toISOString(),
      idempotencyKey: key || null,
      lastError: null
    }, ctx);

    try {
      await this.bull.add(QUEUE_NAME, {
        storeId: id,
        type: input.type,
        payload: input.payload,
        ...(input.ctx ? { ctx: input.ctx } : {})
      }, {
        jobId: id,
        attempts: input.maxAttempts ?? 3,
        backoff: { type: 'exponential', delay: 1000 },
        delay: Math.max(0, new Date(String(job.runAt)).getTime() - Date.now()),
        removeOnComplete: 1000,
        removeOnFail: 5000
      });
    } catch (error) {
      await this.store.update('jobs', id, {
        status: 'dead',
        lastError: error instanceof Error ? error.message : String(error)
      }, ctx);
      throw error;
    }
    return job;
  }

  async runOnce(): Promise<number> {
    // BullMQ workers consume continuously; there is no manual poll cycle.
    return 0;
  }

  start(): void {
    if (this.worker) return;
    this.worker = new Worker<RedisJobData>(QUEUE_NAME, async (job) => this.process(job), {
      connection: this.workerConnection,
      concurrency: Number(process.env.QUEUE_CONCURRENCY || 5)
    });
    this.worker.on('error', (error) => logger.error('Redis worker error', { message: error.message }));
  }

  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
    await this.bull.close();
    this.workerConnection.disconnect();
    this.queueConnection.disconnect();
  }

  async retry(ctx: Context, jobId: string): Promise<Record<string, unknown>> {
    const job = await this.store.get<Record<string, unknown>>('jobs', jobId, ctx);
    if (!job) throw new Error('NOT_FOUND:Job not found');
    const addJob = () => this.bull.add(QUEUE_NAME, {
      storeId: jobId,
      type: String(job.type),
      payload: (job.payload || {}) as Record<string, unknown>,
      ...(job.ctx ? { ctx: job.ctx as Context } : {})
    }, {
      jobId,
      attempts: Number(job.maxAttempts || 3),
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 1000,
      removeOnFail: 5000
    });
    const bullJob = await this.bull.getJob(jobId);
    if (bullJob) {
      try {
        await bullJob.retry();
      } catch {
        // A completed job cannot be retried in place; replace it for a manual retry.
        await bullJob.remove().catch(() => undefined);
        await addJob();
      }
    } else {
      await addJob();
    }
    await this.store.update('jobs', jobId, { status: 'queued', attempts: 0, runAt: new Date().toISOString(), lastError: null }, ctx);
    return (await this.store.get('jobs', jobId, ctx))!;
  }

  private async process(job: Job<RedisJobData>): Promise<void> {
    const storeId = String(job.data.storeId || job.id);
    const ctx = job.data.ctx;
    const current = await this.store.get<Record<string, unknown>>('jobs', storeId, ctx);
    if (!current || current.status === 'succeeded') return;

    await this.store.update('jobs', storeId, { status: 'running', attempts: job.attemptsMade + 1 }, ctx);
    const handler = this.handlers.get(job.data.type);
    if (!handler) {
      await this.store.update('jobs', storeId, {
        status: 'dead',
        lastError: `No handler registered for ${job.data.type}`,
        finishedAt: new Date().toISOString()
      }, ctx);
      throw new Error(`No handler registered for ${job.data.type}`);
    }

    try {
      await handler(job.data.payload, ctx, storeId);
      await this.store.update('jobs', storeId, {
        status: 'succeeded',
        lastError: null,
        finishedAt: new Date().toISOString()
      }, ctx);
      if (ctx) {
        await recordAudit(this.store, ctx, {
          actorId: ctx.employeeId,
          actorType: 'Workflow',
          action: `Completed background job ${job.data.type}`,
          resource: storeId,
          result: 'Success'
        });
      }
    } catch (error) {
      const attempts = job.attemptsMade + 1;
      const maxAttempts = Number(current.maxAttempts || job.opts.attempts || 3);
      const message = error instanceof Error ? error.message : String(error);
      await this.store.update('jobs', storeId, {
        status: attempts < maxAttempts ? 'queued' : 'dead',
        runAt: new Date(Date.now() + Math.min(60_000, 1000 * 2 ** attempts)).toISOString(),
        lastError: message,
        ...(attempts >= maxAttempts ? { finishedAt: new Date().toISOString() } : {})
      }, ctx);
      if (ctx && attempts >= maxAttempts) {
        await this.store.insert('notifications', {
          title: `Background job failed: ${job.data.type}`,
          body: message,
          type: 'workflow',
          unread: true,
          go: '#/automation',
          recipientId: ctx.employeeId,
          channels: ['inApp', 'desktop']
        }, ctx);
      }
      throw error;
    }
  }
}
