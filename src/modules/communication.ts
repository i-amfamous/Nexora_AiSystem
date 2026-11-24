import { randomUUID } from 'node:crypto';
import type { Context, BaseRecord } from '../core/types.js';
import type { Store } from '../core/store.js';
import type { JobQueue } from '../core/queue.js';
import { errors } from '../core/errors.js';
import { recordAudit } from '../core/audit.js';
import { getAdapter, type NormalizedInbound } from '../core/webhooks.js';
import type { StorageService } from '../core/storage.js';
import { bus } from '../core/events.js';

export class CommunicationModule {
  constructor(
    private store: Store,
    private queue: JobQueue,
    readonly storage: StorageService
  ) {}

  async ingest(ctx: Context, inbound: NormalizedInbound, eventId: string): Promise<Record<string, unknown>> {
    const existingMessage = await this.store.find<Record<string, unknown>>(
      'messages',
      (m) => m.externalId === inbound.externalId && m.channel === inbound.channel,
      ctx
    );
    if (existingMessage) return existingMessage;

    let customer = await this.store.find<Record<string, unknown>>(
      'customers',
      (c) => String(c.phone).replace(/\s/g, '') === inbound.customerIdentifier.replace(/\s/g, ''),
      ctx
    );
    if (!customer && inbound.customerIdentifier) {
      customer = await this.store.insert('customers', {
        id: `c_${randomUUID().replace(/-/g, '').slice(0, 8)}`,
        name: inbound.customerName || `New ${inbound.channel} contact`,
        phone: inbound.customerIdentifier,
        email: '',
        city: '',
        tags: ['New'],
        value: 0,
        orders: 0,
        since: new Date().toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
        owner: ctx.employeeId,
        last: 'Just now'
      }, ctx);
      await this.store.insert('customerIdentifiers', {
        id: `ci_${customer.id}_${inbound.channel}`,
        customerId: customer.id,
        type: inbound.channel,
        value: inbound.customerIdentifier
      }, ctx);
    }

    let conversation = await this.store.find<Record<string, unknown>>(
      'conversations',
      (c) => c.customer === customer?.id && c.channel === inbound.channel && c.status !== 'Resolved',
      ctx
    );
    if (!conversation) {
      conversation = await this.store.insert('conversations', {
        id: `v${randomUUID().replace(/-/g, '').slice(0, 5)}`,
        customer: customer?.id || '',
        channel: inbound.channel,
        status: 'Open',
        priority: 'Normal',
        category: 'General',
        mode: 'ai',
        unread: true,
        assignee: null,
        teamId: null,
        last: 'Just now'
      }, ctx);
      await this.store.insert('conversationAssignments', {
        id: `asg_${conversation.id}`,
        conversationId: conversation.id,
        employeeId: null,
        teamId: null
      }, ctx);
    }

    const message = await this.store.insert('messages', {
      id: `msg_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      conversationId: conversation.id,
      customerId: customer?.id || null,
      channel: inbound.channel,
      externalId: inbound.externalId,
      direction: 'in',
      dir: 'in',
      from: inbound.customerIdentifier,
      text: inbound.text,
      at: inbound.timestamp || new Date().toISOString(),
      status: 'Delivered',
      deliveryStatus: inbound.status || 'received',
      webhookEventId: eventId,
      raw: inbound.raw
    }, ctx);

    for (const attachment of inbound.attachments) {
      if (attachment.data) {
        const record = await this.storage.put(ctx, {
          name: attachment.name,
          mimeType: attachment.mimeType || 'application/octet-stream',
          data: Buffer.from(attachment.data, 'base64'),
          conversationId: String(conversation.id),
          customerId: customer ? String(customer.id) : undefined
        });
        await this.store.insert('messageAttachments', {
          id: `att_${randomUUID().replace(/-/g, '').slice(0, 10)}`,
          conversationId: conversation.id,
          messageId: message.id,
          name: attachment.name,
          fileId: record.id
        }, ctx);
      } else {
        await this.store.insert('messageAttachments', {
          id: `att_${randomUUID().replace(/-/g, '').slice(0, 10)}`,
          conversationId: conversation.id,
          messageId: message.id,
          name: attachment.name,
          url: attachment.url || ''
        }, ctx);
      }
    }

    await this.store.update('conversations', String(conversation.id), { unread: true, last: 'Just now' }, ctx);
    await this.store.insert('notifications', {
      title: `New ${inbound.channel} message`,
      body: inbound.text.slice(0, 140),
      type: 'message',
      unread: true,
      go: `#/inbox/${conversation.id}`,
      recipientId: conversation.assignee || null,
      channels: ['inApp', 'desktop']
    }, ctx);
    await recordAudit(storeSafe(this.store), ctx, {
      actorId: `integration:${inbound.channel}`,
      actorType: 'Integration',
      action: 'Received channel message',
      resource: String(message.id),
      result: 'Success'
    });
    bus.emit('business-event', {
      type: 'message.received',
      businessId: ctx.businessId,
      payload: { messageId: message.id, conversationId: conversation.id, channel: inbound.channel, category: conversation.category },
      occurredAt: new Date().toISOString(),
      eventId
    });
    return message;
  }

  async reply(ctx: Context, conversationId: string, text: string, agentId?: string): Promise<Record<string, unknown>> {
    const conversation = await this.store.get<Record<string, unknown>>('conversations', conversationId, ctx);
    if (!conversation) throw errors.notFound('Conversation not found');
    if (conversation.status === 'Resolved') throw errors.conflict('Conversation is resolved');
    if (conversation.mode === 'human' && agentId) throw errors.conflict('A person has taken over this conversation');
    const adapter = getAdapter(String(conversation.channel));
    const messageId = `msg_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const message = await this.store.insert('messages', {
      id: messageId,
      conversationId,
      channel: conversation.channel,
      direction: 'out',
      dir: 'out',
      text,
      at: new Date().toISOString(),
      status: 'Queued',
      deliveryStatus: 'queued',
      sentBy: agentId ? `agent:${agentId}` : ctx.employeeId
    }, ctx);
    try {
      const result = await adapter.send({ to: String(conversation.customer || ''), text });
      await this.store.update('messages', messageId, {
        status: result.status === 'queued' ? 'Queued' : 'Sent',
        deliveryStatus: result.status,
        externalId: result.providerMessageId
      }, ctx);
    } catch (error) {
      await this.queue.enqueue(ctx, {
        type: 'deliver_message',
        payload: { messageId, conversationId, text, channel: conversation.channel, businessId: ctx.businessId },
        ctx,
        idempotencyKey: `deliver:${messageId}`
      });
      await this.store.update('messages', messageId, { status: 'Retry scheduled', deliveryStatus: 'failed' }, ctx);
    }
    await this.store.update('conversations', conversationId, { unread: false, last: 'Just now' }, ctx);
    await recordAudit(storeSafe(this.store), ctx, {
      actorId: agentId || ctx.employeeId,
      actorType: agentId ? 'AI agent' : 'Employee',
      action: 'Sent conversation reply',
      resource: conversationId,
      result: 'Success'
    });
    return message;
  }

  async assign(ctx: Context, conversationId: string, employeeId: string | null, teamId: string | null = null): Promise<Record<string, unknown>> {
    const conversation = await this.store.get<Record<string, unknown>>('conversations', conversationId, ctx);
    if (!conversation) throw errors.notFound('Conversation not found');
    if (employeeId) {
      const employee = await this.store.get<Record<string, unknown>>('employees', employeeId, ctx);
      if (!employee) throw errors.notFound('Employee not found');
    }
    const updated = await this.store.update('conversations', conversationId, { assignee: employeeId, teamId, mode: employeeId ? 'human' : conversation.mode }, ctx);
    const assignment = await this.store.find<Record<string, unknown>>('conversationAssignments', (a) => a.conversationId === conversationId, ctx);
    if (assignment) await this.store.update('conversationAssignments', String(assignment.id), { employeeId, teamId }, ctx);
    await recordAudit(storeSafe(this.store), ctx, {
      actorId: ctx.employeeId,
      actorType: 'Employee',
      action: employeeId ? 'Took over conversation from AI' : 'Unassigned conversation',
      resource: conversationId,
      result: 'Success'
    });
    await this.store.insert('notifications', {
      title: employeeId ? 'Conversation assigned to you' : 'Conversation unassigned',
      body: `${conversationId} was updated.`,
      type: 'message',
      unread: true,
      go: `#/inbox/${conversationId}`,
      recipientId: employeeId || ctx.employeeId,
      channels: ['inApp', 'desktop']
    }, ctx);
    return updated!;
  }

  async updateMetadata(ctx: Context, conversationId: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
    const allowed: Record<string, unknown> = {};
    for (const key of ['status', 'priority', 'category', 'unread']) {
      if (patch[key] !== undefined) allowed[key] = patch[key];
    }
    if (patch.mode === 'human' || patch.mode === 'ai') allowed.mode = patch.mode;
    const record = await this.store.update('conversations', conversationId, allowed, ctx);
    if (!record) throw errors.notFound('Conversation not found');
    await recordAudit(storeSafe(this.store), ctx, {
      actorId: ctx.employeeId,
      actorType: 'Employee',
      action: 'Updated conversation',
      resource: conversationId,
      result: 'Success',
      meta: allowed
    });
    return record;
  }

  /** Keep an internal note linked to a conversation without sending anything to the customer. */
  async addNote(ctx: Context, conversationId: string, text: string): Promise<Record<string, unknown>> {
    const conversation = await this.store.get<Record<string, unknown>>('conversations', conversationId, ctx);
    if (!conversation) throw errors.notFound('Conversation not found');
    const note = await this.store.insert('conversationNotes', {
      id: `note_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      conversationId,
      text,
      authorId: ctx.employeeId,
      businessId: ctx.businessId,
      createdAt: new Date().toISOString()
    }, ctx);
    await recordAudit(this.store, ctx, {
      actorId: ctx.employeeId,
      actorType: 'Employee',
      action: 'Added conversation note',
      resource: conversationId,
      result: 'Success',
      meta: { noteId: note.id }
    });
    return note;
  }

  /** Persist or clear a conversation draft; a null value removes the draft. */
  async updateDraft(ctx: Context, conversationId: string, text: string | null): Promise<Record<string, unknown>> {
    const conversation = await this.store.get<Record<string, unknown>>('conversations', conversationId, ctx);
    if (!conversation) throw errors.notFound('Conversation not found');
    if (text !== null && typeof text !== 'string') throw errors.badRequest('Draft text must be a string or null');
    const updated = await this.store.update('conversations', conversationId, { draft: text }, ctx);
    await recordAudit(this.store, ctx, {
      actorId: ctx.employeeId,
      actorType: 'Employee',
      action: text === null ? 'Cleared conversation draft' : 'Updated conversation draft',
      resource: conversationId,
      result: 'Success'
    });
    return updated!;
  }

  async deliveryStatus(ctx: Context, channel: string, externalId: string, status: string): Promise<Record<string, unknown>[]> {
    const messages = await this.store.list<Record<string, unknown>>('messages', (m) => m.externalId === externalId && m.channel === channel, ctx);
    for (const message of messages) {
      await this.store.update('messages', String(message.id), { deliveryStatus: status, status: status === 'failed' ? 'Failed' : 'Delivered' }, ctx);
    }
    return messages;
  }
}

function storeSafe(store: Store): Store {
  return store;
}
