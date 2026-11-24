import type { Context } from '../types.js';
import type { Store } from '../store.js';

export interface AgentContext extends Context {
  agentId: string;
  automationLevel: 'suggest' | 'prepare' | 'execute';
}

export interface ToolDefinition {
  name: string;
  description: string;
  risk: 'low' | 'high';
  handler: (store: Store, ctx: AgentContext, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

const first = <T extends Record<string, unknown>>(items: T[]): T | null => items[0] || null;

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'get_product_availability',
    description: 'Returns authoritative product price and stock information from the inventory module.',
    risk: 'low',
    async handler(store, ctx, args) {
      const id = args.productId ? String(args.productId) : '';
      const records = await store.list<Record<string, unknown>>('products', (p) => !id || p.id === id || String(p.sku).toLowerCase() === id.toLowerCase(), ctx);
      const product = first(records);
      if (!product) return { found: false, message: 'No matching product was found in the catalogue.' };
      const inventory = await store.find<Record<string, unknown>>('inventory', (i) => i.productId === product.id, ctx);
      return {
        found: true,
        productId: product.id,
        name: product.name,
        sku: product.sku,
        price: product.price,
        currency: product.currency || 'GHS',
        available: Number(inventory?.quantity ?? product.stock ?? 0) > 0,
        quantity: Number(inventory?.quantity ?? product.stock ?? 0)
      };
    }
  },
  {
    name: 'get_customer',
    description: 'Returns permitted customer profile information.',
    risk: 'low',
    async handler(store, ctx, args) {
      const id = String(args.customerId || '');
      const records = await store.list<Record<string, unknown>>('customers', (c) => !id || c.id === id || String(c.phone) === id, ctx);
      const customer = first(records);
      if (!customer) return { found: false, message: 'No matching customer was found.' };
      return {
        found: true,
        customerId: customer.id,
        name: customer.name,
        company: customer.company || '',
        city: customer.city || '',
        tags: customer.tags || []
      };
    }
  },
  {
    name: 'get_order',
    description: 'Returns an order status and total calculated from recorded order items.',
    risk: 'low',
    async handler(store, ctx, args) {
      const id = String(args.orderId || '');
      const order = first(await store.list<Record<string, unknown>>('orders', (o) => o.id === id, ctx));
      if (!order) return { found: false, message: 'No matching order was found.' };
      const items = await store.list<Record<string, unknown>>('orderItems', (i) => i.orderId === id, ctx);
      const total = items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
      return { found: true, orderId: order.id, status: order.status, paymentStatus: order.pay, total, itemCount: items.length };
    }
  },
  {
    name: 'list_low_stock',
    description: 'Lists products at or below their configured low-stock threshold.',
    risk: 'low',
    async handler(store, ctx) {
      const products = await store.list<Record<string, unknown>>('products', undefined, ctx);
      return {
        items: products
          .filter((p) => Number(p.stock ?? 0) <= Number(p.threshold ?? 0))
          .slice(0, 20)
          .map((p) => ({ id: p.id, name: p.name, stock: p.stock, threshold: p.threshold }))
      };
    }
  },
  {
    name: 'get_finance_summary',
    description: 'Returns a summary of authorised invoice and expense records.',
    risk: 'low',
    async handler(store, ctx, args) {
      const invoices = await store.list<Record<string, unknown>>('invoices', undefined, ctx);
      const expenses = await store.list<Record<string, unknown>>('expenses', undefined, ctx);
      const customerId = String(args.customerId || '');
      const scoped = customerId ? invoices.filter((invoice) => invoice.customer === customerId) : invoices;
      return {
        invoiceCount: scoped.length,
        outstanding: scoped.reduce((sum, invoice) => sum + Math.max(0, Number(invoice.total || 0) - Number(invoice.paid || 0)), 0),
        expenseTotal: expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0),
        paymentVerified: false
      };
    }
  },
  {
    name: 'get_task_summary',
    description: 'Returns open and overdue task counts.',
    risk: 'low',
    async handler(store, ctx) {
      const tasks = await store.list<Record<string, unknown>>('tasks', undefined, ctx);
      return {
        total: tasks.length,
        open: tasks.filter((task) => !['Done', 'Completed'].includes(String(task.status))).length,
        overdue: tasks.filter((task) => task.overdue === true).length
      };
    }
  },
  {
    name: 'get_analytics',
    description: 'Returns recorded business metrics for an authorised summary.',
    risk: 'low',
    async handler(store, ctx) {
      const metrics = await store.list<Record<string, unknown>>('metrics', undefined, ctx);
      return Object.fromEntries(metrics.map((metric) => [metric.id, metric.value]));
    }
  },
  {
    name: 'create_task',
    description: 'Creates a low-risk internal task after permission and automation-level checks.',
    risk: 'low',
    async handler(store, ctx, args) {
      if (ctx.automationLevel !== 'execute') return { requiresApproval: true, proposal: { title: args.title, who: args.who } };
      return await store.insert('tasks', {
        title: String(args.title || 'AI recommended follow-up'),
        who: String(args.who || ''),
        due: String(args.due || 'Today'),
        priority: String(args.priority || 'Medium'),
        status: 'Open',
        overdue: false,
        source: `Agent ${ctx.agentId}`
      }, ctx);
    }
  },
  {
    name: 'prepare_purchase_request',
    description: 'Prepares a purchase request for human approval; it never commits the request.',
    risk: 'high',
    async handler(_store, _ctx, args) {
      return { requiresApproval: true, proposal: { type: 'purchaseRequest', ...args } };
    }
  },
  {
    name: 'prepare_refund',
    description: 'Prepares a refund proposal; refunds always require human approval and trusted verification.',
    risk: 'high',
    async handler(_store, _ctx, args) {
      return { requiresApproval: true, proposal: { type: 'refund', ...args } };
    }
  }
];

export const TOOL_NAMES = TOOL_DEFINITIONS.map((tool) => tool.name);

export function getTool(name: string): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.find((tool) => tool.name === name);
}

export async function agentCanUseTool(store: Store, ctx: AgentContext, name: string): Promise<boolean> {
  const permission = await store.find<Record<string, unknown>>(
    'agentPermissions',
    (p) => p.agentId === ctx.agentId && p.tool === name,
    ctx
  );
  return Boolean(permission?.enabled);
}

export async function executeTool(
  store: Store,
  ctx: AgentContext,
  name: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const tool = getTool(name);
  if (!tool) throw new Error(`UNKNOWN_TOOL:${name}`);
  const allowed = await agentCanUseTool(store, ctx, name);
  const started = Date.now();
  let result: Record<string, unknown>;
  let status = 'Success';
  try {
    result = allowed
      ? await tool.handler(store, ctx, args)
      : { denied: true, message: `Agent ${ctx.agentId} is not permitted to use ${name}` };
    if (result.requiresApproval) status = 'Awaiting approval';
    if (result.denied) status = 'Denied';
  } catch (error) {
    status = 'Failed';
    result = { error: error instanceof Error ? error.message : String(error) };
  }
  await store.insert('agentToolExecutions', {
    agentId: ctx.agentId,
    tool: name,
    args,
    allowed,
    risk: tool.risk,
    status,
    durationMs: Date.now() - started,
    result: JSON.stringify(result).slice(0, 4000)
  }, ctx);
  return result;
}
