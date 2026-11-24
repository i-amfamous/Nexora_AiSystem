import { randomUUID } from 'node:crypto';
import type { Context } from '../core/types.js';
import type { Store } from '../core/store.js';
import type { JobQueue } from '../core/queue.js';
import { bus } from '../core/events.js';
import { recordAudit } from '../core/audit.js';
import type { AIOrchestrator } from '../core/ai/orchestrator.js';

export interface BusinessEvent {
  type: string;
  businessId: string;
  payload: Record<string, unknown>;
  occurredAt: string;
  eventId: string;
}

export class WorkflowModule {
  constructor(private store: Store, private queue: JobQueue, private ai: AIOrchestrator) {
    bus.on('business-event', (event: BusinessEvent) => { void this.handleEvent(event); });
    this.queue.register('execute_workflow', (payload, ctx, jobId) => this.execute(payload, ctx, jobId));
  }

  private async systemContext(businessId: string): Promise<Context | undefined> {
    const all = await this.store.list<Record<string, unknown>>('employees');
    const owner = all.find((employee) => employee.businessId === businessId && employee.role === 'owner');
    if (!owner) return undefined;
    return {
      userId: `u_${owner.id}`,
      employeeId: String(owner.id),
      businessId,
      role: 'owner',
      sessionId: `workflow_${businessId}`,
      ip: 'system',
      userAgent: 'Nexora workflow engine'
    };
  }

  async handleEvent(event: BusinessEvent): Promise<void> {
    const ctx = await this.systemContext(event.businessId);
    if (!ctx) return;
    const workflows = await this.store.list<Record<string, unknown>>('workflows', (w) => w.active === true, ctx);
    for (const workflow of workflows) {
      const trigger = await this.store.find<Record<string, unknown>>('workflowTriggers', (t) => t.workflowId === workflow.id, ctx);
      if (!trigger || trigger.trigger !== event.type) continue;
      if (!this.conditionsMet(workflow, event.payload)) continue;
      await this.queue.enqueue(ctx, {
        type: 'execute_workflow',
        ctx,
        payload: {
          businessId: event.businessId,
          workflowId: workflow.id,
          eventId: event.eventId,
          eventType: event.type,
          event: event.payload
        },
        idempotencyKey: `workflow:${workflow.id}:${event.eventId}`
      });
    }
  }

  private conditionsMet(workflow: Record<string, unknown>, payload: Record<string, unknown>): boolean {
    const conditions = Array.isArray(workflow.conditions) ? workflow.conditions as Record<string, unknown>[] : [];
    return conditions.every((condition) => {
      const field = String(condition.field || '');
      const operator = String(condition.operator || 'equals');
      const expected = condition.value;
      const actual = payload[field];
      if (operator === 'equals') return String(actual) === String(expected);
      if (operator === 'notEquals') return String(actual) !== String(expected);
      if (operator === 'greaterThan') return Number(actual) > Number(expected);
      if (operator === 'lessThan') return Number(actual) < Number(expected);
      if (operator === 'contains') return String(actual || '').includes(String(expected));
      return true;
    });
  }

  private async execute(payload: Record<string, unknown>, ctx: Context | undefined, jobId: string): Promise<void> {
    const businessId = String(payload.businessId || ctx?.businessId || '');
    const context = ctx || await this.systemContext(businessId);
    if (!context) throw new Error('Unable to resolve workflow tenant context');
    const workflowId = String(payload.workflowId || '');
    const workflow = await this.store.get<Record<string, unknown>>('workflows', workflowId, context);
    if (!workflow || workflow.active !== true) return;
    const executionId = `wfe_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const actions = Array.isArray(workflow.actions) ? workflow.actions as Record<string, unknown>[] : [];
    const sensitive = actions.some((action) => ['refund', 'change_permission', 'delete_record', 'update_finance'].includes(String(action.type)));
    let status = 'Success';
    let approvalId: string | undefined;
    const results: Record<string, unknown>[] = [];
    if (sensitive) {
      approvalId = `APR-${randomUUID().replace(/-/g, '').slice(0, 4).toUpperCase()}`;
      await this.store.insert('approvals', {
        id: approvalId,
        type: 'Workflow action',
        requester: workflow.name || workflowId,
        requesterType: 'Workflow',
        action: actions.map((a) => a.type).join(', '),
        resource: workflowId,
        reason: 'Sensitive workflow action requires human approval.',
        status: 'Pending',
        proposed: actions,
        executionId
      }, context);
      status = 'Awaiting approval';
    } else {
      const eventPayload = (payload.event && typeof payload.event === 'object' ? payload.event : {}) as Record<string, unknown>;
      for (const action of actions) {
        try {
          results.push(await this.applyAction(context, action, eventPayload, workflowId, executionId));
        } catch (error) {
          status = 'Failed';
          results.push({ action: action.type, error: error instanceof Error ? error.message : String(error) });
        }
      }
      if (results.some((result) => result.error)) status = 'Failed';
    }
    await this.store.insert('workflowExecutions', {
      id: executionId,
      workflowId,
      trigger: String(payload.eventType || 'scheduled'),
      when: new Date().toISOString(),
      result: status,
      duration: '0.1 s',
      detail: status === 'Failed' ? results.map((r) => r.error).filter(Boolean).join('; ') : `${actions.length} action(s) processed`,
      jobId,
      approvalId: approvalId || null,
      results
    }, context);
    await recordAudit(this.store, context, {
      actorId: String(workflow.name || workflowId),
      actorType: 'Workflow',
      action: 'Executed workflow',
      resource: workflowId,
      result: status === 'Failed' ? 'Failed' : status === 'Awaiting approval' ? 'Awaiting approval' : 'Success',
      approvalId,
      meta: { executionId, jobId }
    });
    if (status === 'Failed') {
      await this.store.insert('notifications', {
        title: `Workflow failed: ${workflow.name || workflowId}`,
        body: results.map((r) => r.error).filter(Boolean).join('; '),
        type: 'workflow',
        unread: true,
        go: '#/automation',
        recipientId: context.employeeId,
        channels: ['inApp', 'desktop']
      }, context);
    }
  }

  private async applyAction(ctx: Context, action: Record<string, unknown>, payload: Record<string, unknown>, workflowId: string, executionId: string): Promise<Record<string, unknown>> {
    const type = String(action.type || '');
    if (type === 'create_task') {
      const task = await this.store.insert('tasks', {
        title: String(action.title || `Workflow ${workflowId} task`),
        who: String(action.who || ctx.employeeId),
        due: String(action.due || 'Today'),
        priority: String(action.priority || 'Medium'),
        status: 'Open',
        overdue: false,
        workflowId,
        executionId
      }, ctx);
      return { action: type, id: task.id };
    }
    if (type === 'assign_conversation') {
      const conversationId = String(payload.conversationId || action.conversationId || '');
      if (!conversationId) throw new Error('No conversation is associated with this event');
      await this.store.update('conversations', conversationId, { assignee: String(action.who || ctx.employeeId), mode: 'human' }, ctx);
      return { action: type, conversationId };
    }
    if (type === 'notify') {
      const notification = await this.store.insert('notifications', {
        title: String(action.title || 'Workflow notification'),
        body: String(action.body || `Workflow ${workflowId} was executed.`),
        type: 'workflow',
        unread: true,
        go: String(action.go || '#/automation'),
        recipientId: String(action.who || ctx.employeeId),
        channels: ['inApp', 'desktop']
      }, ctx);
      return { action: type, id: notification.id };
    }
    if (type === 'trigger_agent') {
      const result = await this.ai.run(ctx, String(action.agentId || 'support'), {
        prompt: String(action.prompt || `Workflow ${workflowId} triggered this agent.`),
        reason: `Workflow ${workflowId}`,
        conversationId: payload.conversationId ? String(payload.conversationId) : undefined
      });
      return { action: type, executionId: result.id };
    }
    if (type === 'update_record') {
      const collection = String(action.collection || '');
      const id = String(action.id || '');
      if (!collection || !id) throw new Error('update_record requires collection and id');
      await this.store.update(collection as Parameters<Store['update']>[0], id, (action.patch || {}) as Record<string, unknown>, ctx);
      return { action: type, collection, id };
    }
    throw new Error(`Unsupported workflow action: ${type}`);
  }

  async schedule(ctx: Context, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.queue.enqueue(ctx, {
      type: 'execute_workflow',
      ctx,
      payload: {
        businessId: ctx.businessId,
        workflowId: String(input.workflowId || ''),
        eventType: 'scheduled',
        event: input.payload || {}
      },
      runAt: input.runAt ? String(input.runAt) : new Date().toISOString(),
      idempotencyKey: input.idempotencyKey ? String(input.idempotencyKey) : undefined
    });
  }
}
