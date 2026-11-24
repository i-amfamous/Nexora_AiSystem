import type { Context } from '../core/types.js';
import type { Store } from '../core/store.js';
import type { Permission } from '../core/rbac.js';
import { errors } from '../core/errors.js';
import { recordAudit } from '../core/audit.js';

export interface ResourceConfig {
  collection: Parameters<Store['list']>[0];
  read: Permission;
  create?: Permission;
  update?: Permission;
  remove?: Permission;
  label: string;
}

export const RESOURCES: Record<string, ResourceConfig> = {
  employees: { collection: 'employees', read: 'employees:read', create: 'employees:invite', update: 'employees:update', remove: 'data:delete', label: 'Employee' },
  departments: { collection: 'departments', read: 'departments:read', create: 'departments:create', update: 'departments:update', remove: 'data:delete', label: 'Department' },
  roles: { collection: 'roles', read: 'roles:read', update: 'roles:update', label: 'Role' },
  customers: { collection: 'customers', read: 'customers:read', create: 'customers:create', update: 'customers:update', remove: 'data:delete', label: 'Customer' },
  conversations: { collection: 'conversations', read: 'inbox:read', create: 'inbox:respond', update: 'inbox:assign', remove: 'data:delete', label: 'Conversation' },
  messages: { collection: 'messages', read: 'inbox:read', create: 'inbox:respond', label: 'Message' },
  channels: { collection: 'communicationChannels', read: 'integrations:read', update: 'integrations:connect', label: 'Channel' },
  leads: { collection: 'leads', read: 'sales:read', create: 'sales:create', update: 'sales:update', remove: 'data:delete', label: 'Lead' },
  orders: { collection: 'orders', read: 'orders:read', create: 'orders:create', update: 'orders:update', remove: 'data:delete', label: 'Order' },
  products: { collection: 'products', read: 'inventory:read', create: 'inventory:create', update: 'inventory:create', remove: 'data:delete', label: 'Product' },
  inventory: { collection: 'inventory', read: 'inventory:read', update: 'inventory:adjust', label: 'Inventory' },
  suppliers: { collection: 'suppliers', read: 'suppliers:read', create: 'suppliers:create', update: 'suppliers:create', label: 'Supplier' },
  invoices: { collection: 'invoices', read: 'finance:read', create: 'finance:create', update: 'finance:update', remove: 'data:delete', label: 'Invoice' },
  payments: { collection: 'payments', read: 'finance:read', create: 'finance:create', update: 'finance:verify', label: 'Payment' },
  expenses: { collection: 'expenses', read: 'finance:read', create: 'finance:create', update: 'finance:update', label: 'Expense' },
  tasks: { collection: 'tasks', read: 'tasks:read', create: 'tasks:create', update: 'tasks:update', remove: 'data:delete', label: 'Task' },
  workflows: { collection: 'workflows', read: 'workflows:read', create: 'workflows:create', update: 'workflows:update', remove: 'data:delete', label: 'Workflow' },
  'workflow-triggers': { collection: 'workflowTriggers', read: 'workflows:read', create: 'workflows:create', update: 'workflows:update', remove: 'data:delete', label: 'Workflow trigger' },
  agents: { collection: 'agents', read: 'agents:read', update: 'agents:configure', label: 'Agent' },
  integrations: { collection: 'integrations', read: 'integrations:read', create: 'integrations:connect', update: 'integrations:connect', label: 'Integration' },
  notifications: { collection: 'notifications', read: 'notifications:read', update: 'notifications:update', label: 'Notification' },
  'audit-logs': { collection: 'auditLogs', read: 'audit:read', label: 'Audit log' },
  approvals: { collection: 'approvals', read: 'agents:approve', update: 'agents:approve', label: 'Approval' },
  files: { collection: 'fileRecords', read: 'inbox:read', label: 'File' },
  'stock-movements': { collection: 'stockMovements', read: 'inventory:read', create: 'inventory:adjust', label: 'Stock movement' },
  'purchase-requests': { collection: 'purchaseRequests', read: 'purchaseRequests:read', create: 'purchaseRequests:create', update: 'purchaseRequests:approve', label: 'Purchase request' },
  'sales-activities': { collection: 'salesActivities', read: 'sales:read', create: 'sales:create', label: 'Sales activity' },
  'agent-executions': { collection: 'agentExecutions', read: 'agents:read', label: 'Agent execution' },
  'workflow-executions': { collection: 'workflowExecutions', read: 'workflows:read', label: 'Workflow execution' },
  'channel-connections': { collection: 'channelConnections', read: 'integrations:read', update: 'integrations:connect', label: 'Channel connection' }
};

export interface QueryOptions {
  page: number;
  pageSize: number;
  sort?: string;
  order: 'asc' | 'desc';
  q?: string;
  filters: Record<string, unknown>;
}

const RESERVED = new Set(['page', 'pageSize', 'sort', 'order', 'q', 'limit', 'offset']);

export function parseQuery(searchParams: URLSearchParams): QueryOptions {
  const page = Math.max(1, Number(searchParams.get('page') || 1) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(searchParams.get('pageSize') || searchParams.get('limit') || 50) || 50));
  const filters: Record<string, unknown> = {};
  for (const [key, value] of searchParams.entries()) {
    if (!RESERVED.has(key) && value !== '') filters[key] = value;
  }
  return {
    page,
    pageSize,
    sort: searchParams.get('sort') || undefined,
    order: searchParams.get('order') === 'desc' ? 'desc' : 'asc',
    q: searchParams.get('q') || undefined,
    filters
  };
}

export async function listRecords<T extends Record<string, unknown>>(
  store: Store,
  ctx: Context,
  resource: string,
  query: QueryOptions
): Promise<{ data: T[]; meta: Record<string, unknown> }> {
  const config = RESOURCES[resource];
  if (!config) throw errors.notFound('Resource not found');
  let records = await store.list<Record<string, unknown>>(config.collection, undefined, ctx);
  const q = query.q?.toLowerCase();
  if (q) {
    records = records.filter((record) => Object.values(record).some((value) => typeof value === 'string' && value.toLowerCase().includes(q)));
  }
  for (const [key, value] of Object.entries(query.filters)) {
    records = records.filter((record) => {
      const candidate = record[key];
      if (Array.isArray(candidate)) return candidate.some((item) => String(item) === String(value));
      return String(candidate) === String(value);
    });
  }
  if (query.sort) {
    records.sort((a, b) => {
      const left = a[query.sort!] ?? '';
      const right = b[query.sort!] ?? '';
      if (typeof left === 'number' && typeof right === 'number') return left - right;
      return String(left).localeCompare(String(right));
    });
    if (query.order === 'desc') records.reverse();
  }
  const total = records.length;
  const offset = (query.page - 1) * query.pageSize;
  return {
    data: records.slice(offset, offset + query.pageSize) as T[],
    meta: { total, page: query.page, pageSize: query.pageSize, pageCount: Math.ceil(total / query.pageSize) }
  };
}

export async function getRecord(store: Store, ctx: Context, resource: string, id: string): Promise<Record<string, unknown>> {
  const config = RESOURCES[resource];
  if (!config) throw errors.notFound('Resource not found');
  const record = await store.get<Record<string, unknown>>(config.collection, id, ctx);
  if (!record) throw errors.notFound(`${config.label} not found`);
  return record;
}

export async function createRecord(
  store: Store,
  ctx: Context,
  resource: string,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const config = RESOURCES[resource];
  if (!config || !config.create) throw errors.badRequest('This resource cannot be created');
  if (input.id && await store.get(config.collection, String(input.id), ctx)) {
    throw errors.conflict(`${config.label} already exists`);
  }
  const record = await store.insert(config.collection, { ...input, version: 1 }, ctx);
  await recordAudit(store, ctx, {
    actorId: ctx.employeeId,
    actorType: 'Employee',
    action: `Created ${config.label.toLowerCase()}`,
    resource: String(record.id),
    result: 'Success'
  });
  return record;
}

export async function updateRecord(
  store: Store,
  ctx: Context,
  resource: string,
  id: string,
  input: Record<string, unknown>,
  ifMatch?: string
): Promise<Record<string, unknown>> {
  const config = RESOURCES[resource];
  if (!config || !config.update) throw errors.badRequest('This resource cannot be updated');
  const current = await getRecord(store, ctx, resource, id);
  if (ifMatch && String(current.updatedAt) !== ifMatch && String(current.version) !== ifMatch) {
    throw errors.conflict('The record changed since you opened it. Reload and try again.', { current });
  }
  const record = await store.update(config.collection, id, {
    ...input,
    id: current.id,
    businessId: current.businessId,
    version: Number(current.version || 0) + 1
  }, ctx);
  await recordAudit(store, ctx, {
    actorId: ctx.employeeId,
    actorType: 'Employee',
    action: `Updated ${config.label.toLowerCase()}`,
    resource: id,
    result: 'Success',
    meta: { fields: Object.keys(input) }
  });
  return record!;
}

export async function removeRecord(store: Store, ctx: Context, resource: string, id: string): Promise<void> {
  const config = RESOURCES[resource];
  if (!config || !config.remove) throw errors.badRequest('This resource cannot be deleted');
  await getRecord(store, ctx, resource, id);
  await store.remove(config.collection, id, ctx);
  await recordAudit(store, ctx, {
    actorId: ctx.employeeId,
    actorType: 'Employee',
    action: `Deleted ${config.label.toLowerCase()}`,
    resource: id,
    result: 'Success'
  });
}
