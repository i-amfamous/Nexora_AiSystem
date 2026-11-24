import type { Context } from '../core/types.js';
import type { Store } from '../core/store.js';
import { errors } from '../core/errors.js';
import { recordAudit } from '../core/audit.js';

const COLLECTION: Parameters<Store['insert']>[0] = 'customerNotes';

/** Internal, employee-only notes attached to a customer record (FR-05.5).
 * Notes are never exposed to channel adapters or AI agents as customer facts. */
export class CustomerNotesModule {
  constructor(private store: Store) {}

  async list(ctx: Context, customerId: string): Promise<Record<string, unknown>[]> {
    const customer = await this.store.get<Record<string, unknown>>('customers', customerId, ctx);
    if (!customer) throw errors.notFound('Customer not found');
    const notes = await this.store.list<Record<string, unknown>>(COLLECTION, (note) => note.customerId === customerId, ctx);
    return notes.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }

  async add(ctx: Context, customerId: string, text: string): Promise<Record<string, unknown>> {
    const customer = await this.store.get<Record<string, unknown>>('customers', customerId, ctx);
    if (!customer) throw errors.notFound('Customer not found');
    const body = String(text || '').trim();
    if (!body) throw errors.badRequest('Note text is required');
    if (body.length > 10_000) throw errors.badRequest('Note is too long');

    const author = await this.store.get<Record<string, unknown>>('employees', ctx.employeeId, ctx);
    const note = await this.store.insert(COLLECTION, {
      customerId,
      text: body,
      authorId: ctx.employeeId,
      authorName: author?.name || ctx.employeeId,
      visibility: 'internal'
    }, ctx);

    await recordAudit(this.store, ctx, {
      actorId: ctx.employeeId,
      actorType: 'Employee',
      action: 'Added internal customer note',
      resource: customerId,
      result: 'Success',
      meta: { noteId: note.id }
    });
    return note;
  }
}
