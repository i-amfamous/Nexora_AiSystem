import type { Context } from '../core/types.js';
import type { Store } from '../core/store.js';
import type { CollectionName } from '../core/types.js';
import type { AIOrchestrator } from '../core/ai/orchestrator.js';
import { errors } from '../core/errors.js';
import { recordAudit } from '../core/audit.js';

export class AnalyticsModule {
  constructor(private store: Store, private ai: AIOrchestrator) {}

  private async metric(ctx: Context, id: string): Promise<unknown> {
    const record = await this.store.find<Record<string, unknown>>('metrics', (m) => m.id === id, ctx);
    return record?.value ?? [];
  }

  private pick<T>(values: T[], range: string): T[] {
    const count = range === 'today' ? 1 : range === '7d' ? 7 : range === 'q' ? 30 : values.length;
    return values.slice(-count);
  }

  async overview(ctx: Context, range = '30d'): Promise<Record<string, unknown>> {
    const [sales30, sales30prev, convVolume, aiHandled] = await Promise.all([
      this.metric(ctx, 'sales30'), this.metric(ctx, 'sales30prev'), this.metric(ctx, 'convVolume'), this.metric(ctx, 'aiHandled')
    ]) as [number[], number[], number[], number[]];
    const [orders, invoices, expenses, products, conversations, tasks, workflows, agents, executions] = await Promise.all([
      this.store.list<Record<string, unknown>>('orders', undefined, ctx),
      this.store.list<Record<string, unknown>>('invoices', undefined, ctx),
      this.store.list<Record<string, unknown>>('expenses', undefined, ctx),
      this.store.list<Record<string, unknown>>('products', undefined, ctx),
      this.store.list<Record<string, unknown>>('conversations', undefined, ctx),
      this.store.list<Record<string, unknown>>('tasks', undefined, ctx),
      this.store.list<Record<string, unknown>>('workflows', undefined, ctx),
      this.store.list<Record<string, unknown>>('agents', undefined, ctx),
      this.store.list<Record<string, unknown>>('agentExecutions', undefined, ctx)
    ]);
    const current = this.pick(sales30, range).reduce((a, b) => a + Number(b), 0);
    const previous = this.pick(sales30prev, range).reduce((a, b) => a + Number(b), 0);
    const outstanding = invoices.reduce((sum, invoice) => sum + Math.max(0, Number(invoice.total || 0) - Number(invoice.paid || 0)), 0);
    return {
      range,
      totalSales: current,
      previousSales: previous,
      salesChange: previous ? ((current - previous) / previous) * 100 : 0,
      orders: orders.length,
      outstandingInvoices: outstanding,
      totalExpenses: expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0),
      lowStock: products.filter((product) => Number(product.stock ?? 0) <= Number(product.threshold ?? 0)).length,
      unansweredConversations: conversations.filter((conversation) => conversation.unread === true).length,
      taskCompletion: tasks.length ? Math.round((tasks.filter((task) => ['Done', 'Completed'].includes(String(task.status))).length / tasks.length) * 100) : 0,
      activeAgents: agents.filter((agent) => agent.enabled === true).length,
      agentExecutions: executions.length,
      workflows: workflows.length,
      conversationVolume: this.pick(convVolume, range),
      aiHandled: this.pick(aiHandled, range),
      salesSeries: this.pick(sales30, range),
      previousSalesSeries: this.pick(sales30prev, range),
      sources: { orders: orders.length, invoices: invoices.length, expenses: expenses.length, products: products.length, conversations: conversations.length }
    };
  }

  async sales(ctx: Context, range = '30d'): Promise<Record<string, unknown>> {
    const overview = await this.overview(ctx, range);
    const byChannel = await this.metric(ctx, 'salesByChannel');
    const leads = await this.store.list<Record<string, unknown>>('leads', undefined, ctx);
    return {
      range,
      totalSales: overview.totalSales,
      salesChange: overview.salesChange,
      salesSeries: overview.salesSeries,
      byChannel,
      leadCount: leads.length,
      leadValue: leads.reduce((sum, lead) => sum + Number(lead.value || 0), 0),
      sources: overview.sources
    };
  }

  async inventory(ctx: Context): Promise<Record<string, unknown>> {
    const products = await this.store.list<Record<string, unknown>>('products', undefined, ctx);
    const movements = await this.store.list<Record<string, unknown>>('stockMovements', undefined, ctx);
    const requests = await this.store.list<Record<string, unknown>>('purchaseRequests', undefined, ctx);
    return {
      productCount: products.length,
      stockValue: products.reduce((sum, product) => sum + Number(product.cost || 0) * Number(product.stock || 0), 0),
      lowStock: products.filter((product) => Number(product.stock ?? 0) <= Number(product.threshold ?? 0)).map((product) => ({ id: product.id, name: product.name, stock: product.stock, threshold: product.threshold })),
      movements: movements.length,
      purchaseRequests: requests.length,
      sources: { products: products.length, movements: movements.length }
    };
  }

  async finance(ctx: Context, range = '30d'): Promise<Record<string, unknown>> {
    const overview = await this.overview(ctx, range);
    const payments = await this.store.list<Record<string, unknown>>('payments', undefined, ctx);
    return {
      range,
      outstanding: overview.outstandingInvoices,
      expenses: overview.totalExpenses,
      payments: payments.length,
      verifiedPayments: payments.filter((payment) => payment.status === 'Verified').length,
      unverifiedPayments: payments.filter((payment) => payment.status !== 'Verified').length,
      sources: overview.sources
    };
  }

  async communications(ctx: Context, range = '30d'): Promise<Record<string, unknown>> {
    const overview = await this.overview(ctx, range);
    const conversations = await this.store.list<Record<string, unknown>>('conversations', undefined, ctx);
    const messages = await this.store.list<Record<string, unknown>>('messages', undefined, ctx);
    const byChannel: Record<string, number> = {};
    for (const conversation of conversations) {
      const channel = String(conversation.channel || 'unknown');
      byChannel[channel] = (byChannel[channel] || 0) + 1;
    }
    return {
      range,
      conversations: conversations.length,
      messages: messages.length,
      unanswered: overview.unansweredConversations,
      byChannel,
      volume: overview.conversationVolume,
      aiHandled: overview.aiHandled,
      sources: { conversations: conversations.length, messages: messages.length }
    };
  }

  async people(ctx: Context): Promise<Record<string, unknown>> {
    const employees = await this.store.list<Record<string, unknown>>('employees', undefined, ctx);
    const tasks = await this.store.list<Record<string, unknown>>('tasks', undefined, ctx);
    return {
      employees: employees.length,
      active: employees.filter((employee) => employee.status === 'active').length,
      tasks: tasks.length,
      overdueTasks: tasks.filter((task) => task.overdue === true).length,
      byEmployee: employees.map((employee) => ({ id: employee.id, name: employee.name, open: tasks.filter((task) => task.who === employee.id && !['Done', 'Completed'].includes(String(task.status))).length }))
    };
  }

  async automation(ctx: Context): Promise<Record<string, unknown>> {
    const workflows = await this.store.list<Record<string, unknown>>('workflows', undefined, ctx);
    const executions = await this.store.list<Record<string, unknown>>('workflowExecutions', undefined, ctx);
    const agents = await this.store.list<Record<string, unknown>>('agents', undefined, ctx);
    const agentExecutions = await this.store.list<Record<string, unknown>>('agentExecutions', undefined, ctx);
    return {
      workflows: workflows.length,
      workflowExecutions: executions.length,
      failedWorkflows: executions.filter((execution) => execution.result === 'Failed').length,
      agents: agents.length,
      agentExecutions: agentExecutions.length,
      agentApprovals: agentExecutions.filter((execution) => execution.status === 'Awaiting approval').length,
      sources: { workflows: workflows.length, executions: executions.length, agentExecutions: agentExecutions.length }
    };
  }

  async summary(ctx: Context, range = '30d'): Promise<Record<string, unknown>> {
    const overview = await this.overview(ctx, range);
    const result = await this.ai.run(ctx, 'analyst', {
      prompt: `Summarise business performance for the last ${range}. Report only these recorded figures: sales ${overview.totalSales}, orders ${overview.orders}, outstanding ${overview.outstandingInvoices}, low stock ${overview.lowStock}, unanswered ${overview.unansweredConversations}.`,
      reason: 'Analytics summary requested by an authorised user'
    });
    return { ...result, figures: overview, traceableTo: overview.sources };
  }

  /** Authoritative CSV export built from tenant-scoped records. */
  async exportDataset(ctx: Context, dataset: string): Promise<{ filename: string; contentType: string; body: string }> {
    type Field = [key: string, label: string];
    const specs: Record<string, { collection: CollectionName; fields: Field[] }> = {
      sales: { collection: 'orders', fields: [['id', 'Order ID'], ['customer', 'Customer'], ['channel', 'Channel'], ['total', 'Total'], ['status', 'Status'], ['date', 'Date'], ['by', 'Responsible']] },
      orders: { collection: 'orders', fields: [['id', 'Order ID'], ['customer', 'Customer'], ['channel', 'Channel'], ['total', 'Total'], ['status', 'Status'], ['date', 'Date'], ['by', 'Responsible']] },
      customers: { collection: 'customers', fields: [['id', 'Customer ID'], ['name', 'Name'], ['company', 'Company'], ['phone', 'Phone'], ['email', 'Email'], ['city', 'City'], ['tags', 'Tags'], ['value', 'Value'], ['orders', 'Orders'], ['last', 'Last activity']] },
      leads: { collection: 'leads', fields: [['id', 'Lead ID'], ['name', 'Name'], ['company', 'Company'], ['stage', 'Stage'], ['value', 'Value'], ['owner', 'Owner'], ['next', 'Next follow-up']] },
      products: { collection: 'products', fields: [['id', 'Product ID'], ['sku', 'SKU'], ['name', 'Name'], ['category', 'Category'], ['price', 'Price'], ['cost', 'Cost'], ['stock', 'Stock'], ['threshold', 'Low-stock threshold'], ['supplier', 'Supplier']] },
      inventory: { collection: 'products', fields: [['id', 'Product ID'], ['sku', 'SKU'], ['name', 'Name'], ['stock', 'Stock'], ['threshold', 'Low-stock threshold'], ['supplier', 'Supplier']] },
      stockMovements: { collection: 'stockMovements', fields: [['id', 'Movement ID'], ['product', 'Product'], ['delta', 'Change'], ['reason', 'Reason'], ['date', 'Date'], ['by', 'By']] },
      invoices: { collection: 'invoices', fields: [['id', 'Invoice ID'], ['customer', 'Customer'], ['order', 'Order'], ['total', 'Total'], ['status', 'Status'], ['due', 'Due date'], ['paid', 'Paid']] },
      payments: { collection: 'payments', fields: [['id', 'Payment ID'], ['invoice', 'Invoice'], ['amount', 'Amount'], ['method', 'Method'], ['reference', 'Reference'], ['date', 'Date'], ['verified', 'Verified']] },
      expenses: { collection: 'expenses', fields: [['id', 'Expense ID'], ['category', 'Category'], ['amount', 'Amount'], ['date', 'Date'], ['description', 'Description'], ['by', 'By']] },
      finance: { collection: 'invoices', fields: [['id', 'Invoice ID'], ['customer', 'Customer'], ['total', 'Total'], ['status', 'Status'], ['due', 'Due date']] },
      conversations: { collection: 'conversations', fields: [['id', 'Conversation ID'], ['customer', 'Customer'], ['channel', 'Channel'], ['subject', 'Subject'], ['status', 'Status'], ['priority', 'Priority'], ['category', 'Category'], ['assignee', 'Assignee'], ['mode', 'Mode']] },
      messages: { collection: 'messages', fields: [['id', 'Message ID'], ['conversationId', 'Conversation'], ['channel', 'Channel'], ['direction', 'Direction'], ['text', 'Text'], ['status', 'Status'], ['createdAt', 'Created']] },
      tasks: { collection: 'tasks', fields: [['id', 'Task ID'], ['title', 'Title'], ['who', 'Assignee'], ['due', 'Due'], ['priority', 'Priority'], ['status', 'Status'], ['department', 'Department']] },
      employees: { collection: 'employees', fields: [['id', 'Employee ID'], ['name', 'Name'], ['email', 'Email'], ['role', 'Role'], ['department', 'Department'], ['status', 'Status']] },
      workflows: { collection: 'workflows', fields: [['id', 'Workflow ID'], ['name', 'Name'], ['active', 'Active'], ['conditions', 'Conditions'], ['actions', 'Actions']] },
      workflowExecutions: { collection: 'workflowExecutions', fields: [['id', 'Execution ID'], ['workflowId', 'Workflow'], ['trigger', 'Trigger'], ['result', 'Result'], ['when', 'When'], ['detail', 'Detail']] },
      agents: { collection: 'agents', fields: [['id', 'Agent ID'], ['name', 'Name'], ['enabled', 'Enabled'], ['level', 'Automation level'], ['purpose', 'Purpose']] },
      agentExecutions: { collection: 'agentExecutions', fields: [['id', 'Execution ID'], ['agentId', 'Agent'], ['status', 'Status'], ['when', 'When'], ['reason', 'Reason']] },
      approvals: { collection: 'approvals', fields: [['id', 'Approval ID'], ['type', 'Type'], ['requester', 'Requester'], ['action', 'Action'], ['resource', 'Resource'], ['status', 'Status']] },
      integrations: { collection: 'integrations', fields: [['id', 'Integration ID'], ['name', 'Name'], ['status', 'Status'], ['provider', 'Provider']] },
      notifications: { collection: 'notifications', fields: [['id', 'Notification ID'], ['title', 'Title'], ['type', 'Type'], ['recipientId', 'Recipient'], ['read', 'Read'], ['createdAt', 'Created']] },
      auditLogs: { collection: 'auditLogs', fields: [['id', 'Audit ID'], ['occurredAt', 'When'], ['actor', 'Actor'], ['actorType', 'Actor type'], ['action', 'Action'], ['resource', 'Resource'], ['result', 'Result']] }
    };
    const spec = specs[dataset];
    if (!spec) throw errors.notFound('CSV dataset not found');
    const records = await this.store.list<Record<string, unknown>>(spec.collection, undefined, ctx);
    const fields = spec.fields.length
      ? spec.fields
      : Array.from(new Set(records.flatMap((record) => Object.keys(record)))).sort().map((key) => [key, key] as Field);
    const escape = (value: unknown): string => {
      const text = value === undefined || value === null
        ? ''
        : typeof value === 'object' ? JSON.stringify(value) : String(value);
      return `"${text.replace(/"/g, '""')}"`;
    };
    const lines = [fields.map(([, label]) => escape(label)).join(',')];
    for (const record of records) lines.push(fields.map(([key]) => escape(record[key])).join(','));
    await recordAudit(this.store, ctx, {
      actorId: ctx.employeeId,
      actorType: 'Employee',
      action: `Exported ${dataset} CSV`,
      resource: dataset,
      result: 'Success',
      meta: { rows: records.length }
    });
    return {
      filename: `nexora-${dataset}.csv`,
      contentType: 'text/csv; charset=utf-8',
      body: lines.join('\n')
    };
  }
}
