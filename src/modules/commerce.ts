import { randomUUID } from 'node:crypto';
import type { Context } from '../core/types.js';
import type { Store } from '../core/store.js';
import { errors } from '../core/errors.js';
import { recordAudit } from '../core/audit.js';
import { bus } from '../core/events.js';
import { getAdapter } from '../core/webhooks.js';

function emit(ctx: Context, type: string, payload: Record<string, unknown>): void {
  bus.emit('business-event', { type, businessId: ctx.businessId, payload, occurredAt: new Date().toISOString() });
}

/** Collections and candidate fields that may point at a customer record. */
const MERGE_REFERENCES: { collection: Parameters<Store['get']>[0]; fields: string[] }[] = [
  { collection: 'conversations', fields: ['customer', 'customerId'] },
  { collection: 'orders', fields: ['customer', 'customerId'] },
  { collection: 'invoices', fields: ['customer', 'customerId'] },
  { collection: 'leads', fields: ['customer', 'customerId'] },
  { collection: 'messages', fields: ['customerId', 'customer'] },
  { collection: 'tasks', fields: ['customer', 'customerId'] },
  { collection: 'customerIdentifiers', fields: ['customerId'] },
  { collection: 'purchaseRequests', fields: ['customer', 'customerId'] },
  { collection: 'salesActivities', fields: ['customer', 'customerId'] },
  { collection: 'notifications', fields: ['customerId', 'customer'] }
];

const MERGE_SKIP_FIELDS = new Set(['id', 'businessId', 'createdAt', 'updatedAt', 'version', 'status', 'deletedAt', 'deletedBy', 'duplicateOf']);

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

export class SalesModule {
  constructor(private store: Store) {}

  async createOrder(ctx: Context, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const customerId = String(input.customer || '');
    const customer = await this.store.get<Record<string, unknown>>('customers', customerId, ctx);
    if (!customer) throw errors.badRequest('Choose an existing customer');
    const lines = input.items as [string, unknown][] | { productId: string; quantity: unknown }[] | undefined;
    if (!Array.isArray(lines) || !lines.length) throw errors.badRequest('Add at least one product to the order');

    const orderItems: Record<string, unknown>[] = [];
    let total = 0;
    let held = false;
    for (const line of lines) {
      const productId = String(Array.isArray(line) ? line[0] : line.productId);
      const quantity = Number(Array.isArray(line) ? line[1] : line.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) throw errors.badRequest('Each quantity must be a whole number greater than zero');
      const product = await this.store.get<Record<string, unknown>>('products', productId, ctx);
      if (!product) throw errors.badRequest(`Product ${productId} was not found`);
      const inventory = await this.store.find<Record<string, unknown>>('inventory', (i) => i.productId === productId, ctx);
      const available = Number(inventory?.quantity ?? product.stock ?? 0);
      if (available < quantity) held = true;
      const unitPrice = Number(product.price || 0);
      const lineTotal = unitPrice * quantity;
      total += lineTotal;
      orderItems.push({ productId, quantity, unitPrice, lineTotal });
    }

    const id = String(input.id || `ORD-${10483 + (await this.store.list('orders', undefined, ctx)).length}`);
    if (await this.store.get('orders', id, ctx)) throw errors.conflict('Order already exists');
    const order = await this.store.transaction(async () => {
      const created = await this.store.insert('orders', {
        id,
        customer: customerId,
        date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        items: orderItems.map((item) => [item.productId, item.quantity]),
        status: held ? 'On hold' : 'Confirmed',
        pay: 'Unpaid',
        by: ctx.employeeId,
        channel: input.channel || 'webchat',
        total,
        currency: input.currency || 'GHS',
        stockHeld: held,
        history: [{ at: new Date().toISOString(), status: held ? 'On hold' : 'Confirmed', by: ctx.employeeId }]
      }, ctx);
      for (const item of orderItems) {
        await this.store.insert('orderItems', { id: `${id}_${item.productId}_${randomUUID().slice(0, 4)}`, orderId: id, ...item }, ctx);
      }
      return created;
    });
    await recordAudit(this.store, ctx, { actorId: ctx.employeeId, actorType: 'Employee', action: 'Created order', resource: id, result: 'Success', meta: { total, items: orderItems.length } });
    emit(ctx, 'order.created', { orderId: id, customerId, total, held });
    return order;
  }

  /**
   * Reassign every reference from the duplicate customer to the kept customer,
   * merge sparse profile fields and recalculate order totals. Redaction and the
   * audit entry for both ids are handled by the calling route.
   */
  async mergeCustomers(ctx: Context, targetId: string, sourceId: string): Promise<{
    customer: Record<string, unknown>;
    reassigned: Record<string, number>;
  }> {
    if (targetId === sourceId) throw errors.badRequest('Choose a different customer to merge');
    const target = await this.store.get<Record<string, unknown>>('customers', targetId, ctx);
    if (!target) throw errors.notFound('Customer to keep was not found');
    const source = await this.store.get<Record<string, unknown>>('customers', sourceId, ctx);
    if (!source) throw errors.notFound('Customer to merge was not found');

    const reassigned: Record<string, number> = {};
    for (const { collection, fields } of MERGE_REFERENCES) {
      const records = await this.store.list<Record<string, unknown>>(collection, undefined, ctx);
      let count = 0;
      for (const record of records) {
        const patch: Record<string, unknown> = {};
        for (const field of fields) {
          if (record[field] === sourceId) patch[field] = targetId;
        }
        if (!Object.keys(patch).length) continue;
        await this.store.update(collection, String(record.id), patch, ctx);
        count++;
      }
      reassigned[collection] = count;
    }

    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(source)) {
      if (MERGE_SKIP_FIELDS.has(key) || isEmpty(value)) continue;
      if (key === 'tags') {
        const tags = Array.isArray(target.tags) ? [...target.tags as unknown[]] : [];
        for (const tag of Array.isArray(value) ? value : [value]) {
          if (!tags.some((existing) => String(existing) === String(tag))) tags.push(tag);
        }
        patch.tags = tags;
      } else if (isEmpty(target[key])) {
        patch[key] = value;
      }
    }

    const orders = await this.store.list<Record<string, unknown>>(
      'orders',
      (order) => order.customer === targetId || order.customerId === targetId,
      ctx
    );
    if (orders.length) {
      patch.value = orders.reduce((sum, order) => sum + (Number(order.total) || 0), 0);
      patch.orders = orders.length;
    }

    const customer = await this.store.update('customers', targetId, patch, ctx);
    if (!customer) throw errors.notFound('Customer to keep was not found');
    return { customer, reassigned };
  }

  async updateStatus(ctx: Context, orderId: string, status: string): Promise<Record<string, unknown>> {
    const order = await this.store.get<Record<string, unknown>>('orders', orderId, ctx);
    if (!order) throw errors.notFound('Order not found');
    const history = Array.isArray(order.history) ? [...order.history] : [];
    history.push({ at: new Date().toISOString(), status, by: ctx.employeeId });
    const updated = await this.store.update('orders', orderId, { status, history }, ctx);
    await recordAudit(this.store, ctx, { actorId: ctx.employeeId, actorType: 'Employee', action: 'Changed order status', resource: orderId, result: 'Success', meta: { from: order.status, to: status } });
    emit(ctx, 'order.status_changed', { orderId, status });
    if (status === 'Delivered') await this.store.insert('salesActivities', { id: `act_${randomUUID().slice(0, 8)}`, orderId, type: 'Fulfilment', summary: 'Order delivered', by: ctx.employeeId, at: new Date().toISOString() }, ctx);
    return updated!;
  }
}

export class InventoryModule {
  constructor(private store: Store) {}

  async createProduct(ctx: Context, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const sku = String(input.sku || '').trim();
    if (!sku) throw errors.badRequest('SKU is required');
    if (await this.store.find<Record<string, unknown>>('products', (p) => p.sku === sku, ctx)) throw errors.conflict('A product with this SKU already exists');
    const product = await this.store.insert('products', {
      ...input,
      id: String(input.id || `p_${randomUUID().replace(/-/g, '').slice(0, 8)}`),
      price: Number(input.price || 0),
      cost: Number(input.cost || 0),
      stock: Number(input.stock || 0),
      threshold: Number(input.threshold || 10),
      sold30: 0
    }, ctx);
    await this.store.insert('inventory', {
      id: `inv_${product.id}`,
      productId: product.id,
      quantity: product.stock,
      threshold: product.threshold,
      updatedBy: ctx.employeeId
    }, ctx);
    await recordAudit(this.store, ctx, { actorId: ctx.employeeId, actorType: 'Employee', action: 'Created product', resource: String(product.id), result: 'Success' });
    return product;
  }

  async adjust(ctx: Context, productId: string, delta: number, reason: string): Promise<Record<string, unknown>> {
    const product = await this.store.get<Record<string, unknown>>('products', productId, ctx);
    if (!product) throw errors.notFound('Product not found');
    if (!Number.isInteger(delta) || delta === 0) throw errors.badRequest('Enter a non-zero whole-number adjustment');
    const inventory = await this.store.find<Record<string, unknown>>('inventory', (i) => i.productId === productId, ctx);
    const current = Number(inventory?.quantity ?? product.stock ?? 0);
    if (current + delta < 0) throw errors.conflict('Stock cannot be reduced below zero');
    const updated = await this.store.transaction(async () => {
      if (inventory) await this.store.update('inventory', String(inventory.id), { quantity: current + delta, updatedBy: ctx.employeeId }, ctx);
      const productUpdate = await this.store.update('products', productId, { stock: current + delta }, ctx);
      const movement = await this.store.insert('stockMovements', {
        id: `mv_${randomUUID().replace(/-/g, '').slice(0, 10)}`,
        productId,
        type: delta > 0 ? 'Addition' : 'Deduction',
        change: delta,
        balance: current + delta,
        reason,
        by: ctx.employeeId,
        when: new Date().toISOString()
      }, ctx);
      return { product: productUpdate, movement };
    });
    if (current + delta <= Number(product.threshold || 0)) {
      await this.store.insert('notifications', {
        title: `${product.name} is at or below its threshold`,
        body: `${current + delta} left. Threshold is ${product.threshold}.`,
        type: 'stock',
        unread: true,
        go: '#/inventory',
        recipientId: ctx.employeeId,
        channels: ['inApp', 'desktop']
      }, ctx);
      emit(ctx, 'stock.threshold', { productId, quantity: current + delta, threshold: product.threshold });
    }
    await recordAudit(this.store, ctx, { actorId: ctx.employeeId, actorType: 'Employee', action: 'Adjusted stock', resource: productId, result: 'Success', meta: { delta, reason } });
    return updated.product!;
  }
}

export class FinanceModule {
  constructor(private store: Store) {}

  async createInvoice(ctx: Context, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const customerId = String(input.customer || '');
    const customer = await this.store.get<Record<string, unknown>>('customers', customerId, ctx);
    if (!customer) throw errors.badRequest('Choose an existing customer');
    let total = Number(input.total || 0);
    let orderId = String(input.order || '');
    if (orderId) {
      const items = await this.store.list<Record<string, unknown>>('orderItems', (i) => i.orderId === orderId, ctx);
      total = items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
    }
    if (!Number.isFinite(total) || total <= 0) throw errors.badRequest('Invoice total must be greater than zero');
    const id = String(input.id || `INV-${2595 + (await this.store.list('invoices', undefined, ctx)).length}`);
    if (await this.store.get('invoices', id, ctx)) throw errors.conflict('Invoice already exists');
    const invoice = await this.store.transaction(async () => {
      const created = await this.store.insert('invoices', {
        id,
        customer: customerId,
        order: orderId || null,
        total,
        paid: 0,
        status: 'Unpaid',
        issued: new Date().toISOString(),
        due: String(input.due || new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10)),
        history: [{ at: new Date().toISOString(), action: 'Invoice created', by: ctx.employeeId }]
      }, ctx);
      await this.store.insert('invoiceItems', {
        id: `${id}_item`,
        invoiceId: id,
        description: `Invoice ${id}`,
        quantity: 1,
        unitPrice: total,
        lineTotal: total
      }, ctx);
      return created;
    });
    await recordAudit(this.store, ctx, { actorId: ctx.employeeId, actorType: 'Employee', action: 'Created invoice', resource: id, result: 'Success', meta: { total } });
    emit(ctx, 'invoice.created', { invoiceId: id, customerId, total });
    return invoice;
  }

  async recordPayment(ctx: Context, input: Record<string, unknown>, verified = false, provider = ''): Promise<Record<string, unknown>> {
    const invoiceId = String(input.invoice || '');
    const invoice = await this.store.get<Record<string, unknown>>('invoices', invoiceId, ctx);
    if (!invoice) throw errors.badRequest('Choose an existing invoice');
    const amount = Number(input.amount || 0);
    if (!(amount > 0)) throw errors.badRequest('Payment amount must be greater than zero');
    const id = String(input.id || `PAY-${randomUUID().replace(/-/g, '').slice(0, 4).toUpperCase()}`);
    const payment = await this.store.insert('payments', {
      id,
      invoice: invoiceId,
      customer: invoice.customer,
      amount,
      method: String(input.method || (verified ? provider : 'Manual')),
      status: verified ? 'Verified' : 'Recorded (unverified)',
      verifiedBy: verified ? provider : null,
      recordedBy: ctx.employeeId,
      at: new Date().toISOString()
    }, ctx);
    const paid = Number(invoice.paid || 0) + amount;
    await this.store.update('invoices', invoiceId, {
      paid,
      status: paid >= Number(invoice.total) ? 'Paid' : 'Part paid',
      history: [...(Array.isArray(invoice.history) ? invoice.history : []), { at: new Date().toISOString(), action: verified ? `Payment verified by ${provider}` : 'Manual payment recorded', by: ctx.employeeId }]
    }, ctx);
    await recordAudit(this.store, ctx, {
      actorId: verified ? provider : ctx.employeeId,
      actorType: verified ? 'Integration' : 'Employee',
      action: verified ? 'Verified payment' : 'Recorded manual payment',
      resource: id,
      result: 'Success',
      meta: { amount, invoiceId }
    });
    emit(ctx, 'payment.status_changed', { paymentId: id, invoiceId, verified, amount });
    return payment;
  }

  /** Send an invoice reminder through a channel adapter and record the delivery trail. */
  async sendReminder(ctx: Context, invoiceId: string, channel: string, message: string): Promise<{
    providerResult: { providerMessageId: string; status: string };
    invoice: Record<string, unknown>;
  }> {
    const invoice = await this.store.get<Record<string, unknown>>('invoices', invoiceId, ctx);
    if (!invoice) throw errors.notFound('Invoice not found');
    const customer = await this.store.get<Record<string, unknown>>('customers', String(invoice.customer || ''), ctx);
    if (!customer) throw errors.notFound('Invoice customer not found');
    const deliveryChannel = String(channel || 'email');
    const to = deliveryChannel === 'email'
      ? String(customer.email || customer.phone || '')
      : String(customer.phone || customer.email || '');
    const providerResult = await getAdapter(deliveryChannel).send({ to, text: message });

    const owner = (await this.store.list<Record<string, unknown>>('employees', (employee) => employee.role === 'owner', ctx))[0];
    const history = Array.isArray(invoice.history) ? [...invoice.history] : [];
    history.push({
      at: new Date().toISOString(),
      action: `Reminder sent via ${deliveryChannel}`,
      by: ctx.employeeId,
      channel: deliveryChannel,
      message
    });
    const updated = await this.store.update('invoices', invoiceId, { history }, ctx);
    await this.store.insert('notifications', {
      title: `Invoice reminder sent for ${invoiceId}`,
      body: message.slice(0, 140),
      type: 'invoice',
      unread: true,
      go: `#/finance/invoices/${invoiceId}`,
      recipientId: owner ? String(owner.id) : ctx.employeeId,
      channels: ['inApp', 'desktop']
    }, ctx);
    await recordAudit(this.store, ctx, {
      actorId: ctx.employeeId,
      actorType: 'Employee',
      action: 'Sent invoice reminder',
      resource: invoiceId,
      result: 'Success',
      meta: { channel: deliveryChannel, customerId: String(customer.id), providerMessageId: providerResult.providerMessageId }
    });
    emit(ctx, 'invoice.reminder_sent', { invoiceId, channel: deliveryChannel });
    return { providerResult, invoice: updated! };
  }

  async createExpense(ctx: Context, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const amount = Number(input.amount || 0);
    if (!(amount > 0)) throw errors.badRequest('Expense amount must be greater than zero');
    const expense = await this.store.insert('expenses', {
      ...input,
      id: String(input.id || `EXP-${randomUUID().replace(/-/g, '').slice(0, 4).toUpperCase()}`),
      amount,
      by: ctx.employeeId,
      date: new Date().toISOString()
    }, ctx);
    await recordAudit(this.store, ctx, { actorId: ctx.employeeId, actorType: 'Employee', action: 'Recorded expense', resource: String(expense.id), result: 'Success', meta: { amount } });
    return expense;
  }
}
