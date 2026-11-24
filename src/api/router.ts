import { createHash, randomUUID } from 'node:crypto';
import type { Context } from '../core/types.js';
import type { Store } from '../core/store.js';
import { errors, ApiError } from '../core/errors.js';
import { hasPermission, PERMISSIONS, type Permission } from '../core/rbac.js';
import { login, logout, changePassword, registerBusiness, requestPasswordReset, resetPassword, listSessions, revokeSession, revokeOtherSessions, inviteEmployee, resendInvite, deactivateEmployee, changeEmployeeRole } from '../core/auth.js';
import { recordAudit } from '../core/audit.js';
import { verifyWebhook, getAdapter } from '../core/webhooks.js';
import type { EventHub } from '../core/events.js';
import type { JobQueue } from '../core/queue.js';
import type { StorageService } from '../core/storage.js';
import { AIOrchestrator } from '../core/ai/orchestrator.js';
import { TOOL_NAMES } from '../core/ai/tools.js';
import { RESOURCES, createRecord, getRecord, listRecords, parseQuery, removeRecord, updateRecord } from '../modules/records.js';
import { CommunicationModule } from '../modules/communication.js';
import { SalesModule, InventoryModule, FinanceModule } from '../modules/commerce.js';
import { WorkflowModule } from '../modules/workflow.js';
import { IntegrationModule } from '../modules/integrations.js';
import { DataProtectionModule } from '../modules/data-protection.js';
import { AnalyticsModule } from '../modules/analytics.js';
import { CustomerNotesModule } from '../modules/customer-notes.js';
import { MonitoringModule } from '../modules/monitoring.js';

export interface ApiRequest {
  method: string;
  path: string;
  url: URL;
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
  body: Record<string, unknown>;
  ctx?: Context;
  requestId: string;
  ip: string;
}

export interface ApiResponse {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
  raw?: string;
  contentType?: string;
}

interface RouteOptions {
  auth?: boolean;
  permission?: Permission;
  idempotent?: boolean;
}

interface Route {
  method: string;
  regex: RegExp;
  params: string[];
  handler: (req: ApiRequest, params: Record<string, string>) => Promise<ApiResponse>;
  options: RouteOptions;
}

const ok = (body: unknown, status = 200): ApiResponse => ({ status, body });

interface ConditionResult {
  field: string;
  operator: string;
  expected: unknown;
  actual: unknown;
  passed: boolean;
}

/** Mirrors the workflow engine's condition operators without queueing or applying actions. */
function evaluateWorkflowConditions(conditions: Record<string, unknown>[], payload: Record<string, unknown>): ConditionResult[] {
  return conditions.map((condition) => {
    const field = String(condition.field || '');
    const operator = String(condition.operator || 'equals');
    const expected = condition.value !== undefined ? condition.value : condition.expected;
    const actual = payload[field];
    let passed: boolean;
    if (operator === 'equals') passed = String(actual) === String(expected);
    else if (operator === 'notEquals') passed = String(actual) !== String(expected);
    else if (operator === 'greaterThan') passed = Number(actual) > Number(expected);
    else if (operator === 'lessThan') passed = Number(actual) < Number(expected);
    else if (operator === 'contains') passed = String(actual || '').includes(String(expected));
    else passed = true;
    return {
      field,
      operator,
      expected: expected === undefined ? null : expected,
      actual: actual === undefined ? null : actual,
      passed
    };
  });
}

const DEFAULT_NOTIFICATION_PREFERENCES: Record<string, boolean> = {
  inApp: true,
  desktop: true,
  email: false,
  assignment: true,
  stock: true,
  approval: true,
  workflowFailure: true
};

function publicUser(user: Record<string, unknown>): Record<string, unknown> {
  const { passwordHash: _hash, ...rest } = user;
  return rest;
}

function header(req: ApiRequest, name: string): string {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] || '' : value || '';
}

export class Router {
  private routes: Route[] = [];
  readonly modules: {
    ai: AIOrchestrator;
    communication: CommunicationModule;
    sales: SalesModule;
    inventory: InventoryModule;
    finance: FinanceModule;
    workflow: WorkflowModule;
    integrations: IntegrationModule;
    dataProtection: DataProtectionModule;
    analytics: AnalyticsModule;
    customerNotes: CustomerNotesModule;
    monitoring: MonitoringModule;
  };

  constructor(
    private store: Store,
    private events: EventHub,
    private queue: JobQueue,
    storage: StorageService
  ) {
    const ai = new AIOrchestrator(store);
    this.modules = {
      ai,
      communication: new CommunicationModule(store, queue, storage),
      sales: new SalesModule(store),
      inventory: new InventoryModule(store),
      finance: new FinanceModule(store),
      workflow: new WorkflowModule(store, queue, ai),
      integrations: new IntegrationModule(store, queue),
      dataProtection: new DataProtectionModule(store),
      analytics: new AnalyticsModule(store, ai),
      customerNotes: new CustomerNotesModule(store),
      monitoring: new MonitoringModule(store)
    };
    this.registerRoutes();
    this.registerQueueHandlers();
  }

  private add(method: string, pattern: string, handler: Route['handler'], options: RouteOptions = {}): void {
    const params: string[] = [];
    const source = pattern.split('/').map((segment) => {
      if (segment.startsWith(':')) {
        params.push(segment.slice(1));
        return '([^/]+)';
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('/');
    this.routes.push({ method, regex: new RegExp(`^${source}$`), params, handler, options: { auth: true, ...options } });
  }

  async handle(req: ApiRequest): Promise<ApiResponse> {
    const route = this.routes.find((candidate) => candidate.method === req.method && candidate.regex.test(req.path));
    if (!route) throw errors.notFound('Endpoint not found');
    const match = route.regex.exec(req.path)!;
    const params: Record<string, string> = {};
    route.params.forEach((name, index) => { params[name] = decodeURIComponent(match[index + 1]); });

    if (route.options.auth !== false && !req.ctx) throw errors.unauthorized();
    if (route.options.permission && req.ctx) {
      const allowed = await hasPermission(req.ctx, route.options.permission, this.store);
      if (!allowed) throw errors.forbidden(`Your role does not have ${route.options.permission}`);
    }

    const idempotencyKey = route.options.idempotent ? header(req, 'idempotency-key') : '';
    if (idempotencyKey && req.ctx) {
      const key = createHash('sha256').update(`${req.ctx.businessId}:${req.ctx.userId}:${req.method}:${req.path}:${idempotencyKey}`).digest('hex');
      const cached = await this.store.find<Record<string, unknown>>('idempotency', (record) => record.id === key, req.ctx);
      if (cached) return cached.response as ApiResponse;
    }

    const response = await route.handler(req, params);
    if (idempotencyKey && req.ctx) {
      const key = createHash('sha256').update(`${req.ctx.businessId}:${req.ctx.userId}:${req.method}:${req.path}:${idempotencyKey}`).digest('hex');
      await this.store.insert('idempotency', { id: key, response, createdBy: req.ctx.employeeId }, req.ctx);
    }
    return response;
  }

  private async broadcast(ctx: Context, type: string, payload: Record<string, unknown>, audience?: Permission): Promise<void> {
    await this.events.broadcast(ctx, type, payload, audience);
  }

  private registerQueueHandlers(): void {
    this.queue.register('deliver_message', async (payload, ctx) => {
      const conversationId = String(payload.conversationId || '');
      const messageId = String(payload.messageId || '');
      if (!ctx) throw new Error('Delivery job requires tenant context');
      const adapter = getAdapter(String(payload.channel || 'webchat'));
      const result = await adapter.send({ to: String(payload.to || ''), text: String(payload.text || '') });
      await this.store.update('messages', messageId, { status: 'Sent', deliveryStatus: result.status, externalId: result.providerMessageId }, ctx);
      await this.store.update('conversations', conversationId, { last: 'Just now' }, ctx);
    });
  }

  private registerRoutes(): void {
    const p = '/api/v1';
    const notificationPreferences = async (ctx: Context): Promise<Record<string, boolean>> => {
      const business = await this.store.get<Record<string, unknown>>('businesses', ctx.businessId, ctx);
      const stored = (business?.notificationPreferences && typeof business.notificationPreferences === 'object'
        ? business.notificationPreferences : {}) as Record<string, unknown>;
      const result: Record<string, boolean> = { ...DEFAULT_NOTIFICATION_PREFERENCES };
      for (const key of Object.keys(DEFAULT_NOTIFICATION_PREFERENCES)) {
        if (stored[key] !== undefined) result[key] = Boolean(stored[key]);
      }
      return result;
    };

    this.add('GET', `${p}/health`, async () => ok({ status: 'ok', version: '2.0.0', time: new Date().toISOString() }), { auth: false });
    this.add('GET', `${p}/monitoring`, async (req) => ok(await this.modules.monitoring.snapshot(req.ctx!)), { permission: 'analytics:read' });
    this.add('GET', `${p}/meta/permissions`, async (req) => {
      const granted: Record<string, boolean> = {};
      for (const permission of PERMISSIONS) granted[permission] = await hasPermission(req.ctx!, permission, this.store);
      return ok({ permissions: PERMISSIONS, granted, role: req.ctx!.role });
    });

    /* Authentication and sessions */
    this.add('POST', `${p}/auth/register`, async (req) => {
      const result = await registerBusiness(this.store, req.body, req.ip, header(req, 'user-agent'));
      return ok({ token: result.token, user: publicUser(result.user), businessId: result.context.businessId }, 201);
    }, { auth: false, idempotent: true });
    this.add('POST', `${p}/auth/login`, async (req) => {
      const result = await login(this.store, String(req.body.email || ''), String(req.body.password || ''), req.ip, header(req, 'user-agent'));
      return ok({ token: result.token, user: publicUser(result.user), businessId: result.context.businessId });
    }, { auth: false });
    this.add('POST', `${p}/auth/logout`, async (req) => {
      await logout(this.store, req.ctx!);
      return ok({ message: 'Signed out' });
    });
    this.add('POST', `${p}/auth/password/change`, async (req) => {
      await changePassword(this.store, req.ctx!, String(req.body.currentPassword || ''), String(req.body.newPassword || ''));
      return ok({ message: 'Password updated' });
    });
    this.add('GET', `${p}/auth/me`, async (req) => {
      const granted: string[] = [];
      for (const permission of PERMISSIONS) if (await hasPermission(req.ctx!, permission, this.store)) granted.push(permission);
      return ok({ user: publicUser(await this.store.get('users', req.ctx!.userId, req.ctx!) || {}), context: req.ctx!, permissions: granted });
    });
    this.add('POST', `${p}/auth/password-reset/request`, async (req) => {
      const token = await requestPasswordReset(this.store, String(req.body.email || ''));
      const response: Record<string, unknown> = { message: 'If the email has an account, a reset link has been issued.' };
      if (process.env.NODE_ENV !== 'production' && token) response.token = token;
      return ok(response);
    }, { auth: false });
    this.add('POST', `${p}/auth/password-reset/confirm`, async (req) => {
      await resetPassword(this.store, String(req.body.token || ''), String(req.body.password || ''));
      return ok({ message: 'Password updated. Please sign in again.' });
    }, { auth: false });
    this.add('GET', `${p}/auth/sessions`, async (req) => ok({ data: await listSessions(this.store, req.ctx!) }), { permission: 'auth:read' });
    this.add('DELETE', `${p}/auth/sessions/:id`, async (req, params) => {
      await revokeSession(this.store, req.ctx!, params.id);
      return ok({ message: 'Device signed out' });
    }, { permission: 'auth:read' });
    this.add('POST', `${p}/auth/sessions/revoke-others`, async (req) => {
      await revokeOtherSessions(this.store, req.ctx!);
      return ok({ message: 'Other devices signed out' });
    }, { permission: 'auth:read' });

    /* Workspace and people */
    this.add('GET', `${p}/bootstrap`, async (req) => ok(await this.bootstrap(req.ctx!)), { permission: 'business:read' });
    this.add('GET', `${p}/businesses`, async (req) => ok({ data: await this.store.list('businesses', undefined, req.ctx!) }), { permission: 'business:read' });
    this.add('GET', `${p}/businesses/current`, async (req) => ok(await this.store.get('businesses', req.ctx!.businessId, req.ctx!)), { permission: 'business:read' });
    this.add('PATCH', `${p}/businesses/current`, async (req) => {
      const patch = this.pick(req.body, ['name', 'short', 'email', 'phone', 'address', 'region', 'country', 'currency', 'timezone', 'industry', 'plan', 'tin', 'registrationNumber']);
      const business = await this.store.update('businesses', req.ctx!.businessId, patch, req.ctx!);
      await recordAudit(this.store, req.ctx!, { actorId: req.ctx!.employeeId, actorType: 'Employee', action: 'Updated business profile', resource: req.ctx!.businessId, result: 'Success', meta: { fields: Object.keys(patch) } });
      await this.broadcast(req.ctx!, 'business.updated', { business });
      return ok(business);
    }, { permission: 'business:update' });
    this.add('POST', `${p}/employees/invite`, async (req) => {
      const employee = await inviteEmployee(this.store, req.ctx!, req.body);
      await this.broadcast(req.ctx!, 'employee.invited', { employee }, 'employees:read');
      return ok(employee, 201);
    }, { permission: 'employees:invite', idempotent: true });
    this.add('POST', `${p}/employees/:id/invite/resend`, async (req, params) => {
      const result = await resendInvite(this.store, req.ctx!, params.id, req.body);
      await this.broadcast(req.ctx!, 'employee.invited', { id: params.id }, 'employees:read');
      return ok(result);
    }, { permission: 'employees:invite' });
    this.add('POST', `${p}/employees/:id/deactivate`, async (req, params) => {
      await deactivateEmployee(this.store, req.ctx!, params.id, req.body.active !== false);
      return ok({ message: 'Employee access updated' });
    }, { permission: 'employees:deactivate' });
    this.add('POST', `${p}/employees/:id/role`, async (req, params) => {
      await changeEmployeeRole(this.store, req.ctx!, params.id, String(req.body.role || ''), String(req.body.department || ''));
      return ok({ message: 'Role updated' });
    }, { permission: 'employees:update' });
    this.add('GET', `${p}/roles/:id/permissions`, async (_req, params) => ok({ data: await this.store.list('rolePermissions', (record) => record.role === params.id, _req.ctx) }), { permission: 'roles:read' });
    this.add('PUT', `${p}/roles/:id/permissions`, async (req, params) => {
      const permissions = (req.body.permissions || {}) as Record<string, boolean>;
      for (const [permission, enabled] of Object.entries(permissions)) {
        if (!PERMISSIONS.includes(permission as Permission)) continue;
        const existing = await this.store.find<Record<string, unknown>>('rolePermissions', (record) => record.role === params.id && record.permission === permission, req.ctx);
        if (existing) await this.store.update('rolePermissions', String(existing.id), { enabled: Boolean(enabled) }, req.ctx);
        else await this.store.insert('rolePermissions', { id: `rp_${params.id}_${permission}`, role: params.id, permission, enabled: Boolean(enabled) }, req.ctx);
      }
      await recordAudit(this.store, req.ctx!, { actorId: req.ctx!.employeeId, actorType: 'Employee', action: 'Changed role permissions', resource: params.id, result: 'Success', meta: permissions });
      return ok({ message: 'Permissions updated' });
    }, { permission: 'roles:update' });

    /* Communication */
    this.add('POST', `${p}/conversations/:id/reply`, async (req, params) => {
      const message = await this.modules.communication.reply(req.ctx!, params.id, String(req.body.text || ''));
      await this.broadcast(req.ctx!, 'message.created', { conversationId: params.id, message }, 'inbox:read');
      return ok(message, 201);
    }, { permission: 'inbox:respond', idempotent: true });
    this.add('POST', `${p}/conversations/:id/notes`, async (req, params) => {
      const text = String(req.body.text ?? '').trim();
      if (!text) throw errors.badRequest('Note text is required');
      const note = await this.modules.communication.addNote(req.ctx!, params.id, text);
      await this.broadcast(req.ctx!, 'conversation.updated', { conversationId: params.id, note }, 'inbox:read');
      return ok(note, 201);
    }, { permission: 'inbox:respond' });
    this.add('POST', `${p}/conversations/:id/drafts`, async (req, params) => {
      if (!Object.prototype.hasOwnProperty.call(req.body, 'text')) throw errors.badRequest('Draft text is required');
      const text = req.body.text === null ? null : String(req.body.text);
      const conversation = await this.modules.communication.updateDraft(req.ctx!, params.id, text);
      await this.broadcast(req.ctx!, 'conversation.updated', { conversation }, 'inbox:read');
      return ok(conversation);
    }, { permission: 'inbox:respond' });
    this.add('POST', `${p}/conversations/:id/assign`, async (req, params) => {
      const conversation = await this.modules.communication.assign(req.ctx!, params.id, req.body.employeeId ? String(req.body.employeeId) : null, req.body.teamId ? String(req.body.teamId) : null);
      await this.broadcast(req.ctx!, 'conversation.updated', { conversation }, 'inbox:read');
      return ok(conversation);
    }, { permission: 'inbox:assign' });
    this.add('POST', `${p}/conversations/:id/takeover`, async (req, params) => {
      const conversation = await this.modules.communication.assign(req.ctx!, params.id, req.ctx!.employeeId, null);
      await this.broadcast(req.ctx!, 'conversation.takeover', { conversation }, 'inbox:read');
      return ok(conversation);
    }, { permission: 'inbox:takeover' });
    this.add('PATCH', `${p}/conversations/:id`, async (req, params) => {
      const conversation = await this.modules.communication.updateMetadata(req.ctx!, params.id, req.body);
      await this.broadcast(req.ctx!, 'conversation.updated', { conversation }, 'inbox:read');
      return ok(conversation);
    }, { permission: 'inbox:categorise' });
    this.add('POST', `${p}/channels/:channel/message`, async (req, params) => {
      const adapter = getAdapter(params.channel);
      const result = await adapter.send({ to: String(req.body.to || ''), text: String(req.body.text || ''), metadata: req.body.metadata as Record<string, unknown> | undefined });
      return ok(result, 202);
    }, { permission: 'inbox:respond' });
    this.add('POST', `${p}/webhooks/:provider`, async (req, params) => {
      const provider = params.provider;
      const verification = await verifyWebhook(this.store, provider, req.rawBody, req.headers);
      const body = JSON.parse(req.rawBody || '{}') as Record<string, unknown>;
      const businessId = String(body.businessId || body.workspaceId || '');
      let ctx: Context | undefined;
      if (businessId) {
        const business = await this.store.get('businesses', businessId);
        if (!business) throw errors.notFound('Workspace not found');
        const owner = (await this.store.list('employees')).find((employee) => employee.businessId === businessId && employee.role === 'owner');
        if (owner) ctx = { userId: `u_${owner.id}`, employeeId: String(owner.id), businessId, role: 'owner', sessionId: `webhook_${provider}`, ip: req.ip, userAgent: 'Provider webhook' };
      }
      if (provider === 'paystack' || provider === 'hubtel' || String(body.event || '').includes('payment')) {
        if (!ctx) throw errors.badRequest('Webhook must include businessId for payment events');
        const reference = String(body.reference || body.eventId || verification.eventId);
        const existing = await this.store.find<Record<string, unknown>>('payments', (payment) => payment.reference === reference, ctx);
        if (existing) return ok({ received: true, duplicate: true });
        const payment = await this.modules.finance.recordPayment(ctx, {
          invoice: String(body.invoice || body.invoiceId || ''),
          amount: Number(body.amount || 0) / 100,
          method: provider,
          reference
        }, true, provider);
        return ok({ received: true, payment });
      }
      if (!ctx) throw errors.badRequest('Webhook must include businessId');
      const inbound = getAdapter(provider).normalize(body);
      const message = await this.modules.communication.ingest(ctx, inbound, verification.eventId);
      await this.broadcast(ctx, 'message.received', { message }, 'inbox:read');
      return ok({ received: true, message }, 201);
    }, { auth: false });

    /* Customers, sales, orders, inventory, finance */
    this.add('GET', `${p}/customers/duplicates`, async (req) => {
      const customers = await this.store.list<Record<string, unknown>>('customers', undefined, req.ctx!);
      const groups: Record<string, Record<string, unknown>[]> = {};
      for (const customer of customers) {
        const key = String(customer.phone || '').replace(/\s/g, '').toLowerCase();
        if (key) (groups[key] ||= []).push(customer);
      }
      return ok({ data: Object.values(groups).filter((group) => group.length > 1) });
    }, { permission: 'customers:read' });
    this.add('GET', `${p}/customers/:id/notes`, async (req, params) => ok(await this.modules.customerNotes.list(req.ctx!, params.id)), { permission: 'customers:read' });
    this.add('POST', `${p}/customers/:id/notes`, async (req, params) => {
      const note = await this.modules.customerNotes.add(req.ctx!, params.id, String(req.body.text || ''));
      await this.broadcast(req.ctx!, 'customer.updated', { customerId: params.id, note }, 'customers:read');
      return ok(note, 201);
    }, { permission: 'customers:update', idempotent: true });
    this.add('POST', `${p}/customers/:id/merge`, async (req, params) => {
      const sourceId = String(req.body.sourceId || '');
      const { customer, reassigned } = await this.modules.sales.mergeCustomers(req.ctx!, params.id, sourceId);
      await this.modules.dataProtection.deleteData(req.ctx!, { collection: 'customers', id: sourceId, confirmation: 'DELETE' });
      await recordAudit(this.store, req.ctx!, {
        actorId: req.ctx!.employeeId,
        actorType: 'Employee',
        action: 'Merged customer records',
        resource: `${sourceId} -> ${params.id}`,
        result: 'Success',
        meta: { sourceId, targetId: params.id, reassigned }
      });
      await this.broadcast(req.ctx!, 'customer.updated', { customer }, 'customers:read');
      return ok({ customer, mergedSourceId: sourceId, reassigned });
    }, { permission: 'customers:merge', idempotent: true });
    this.add('POST', `${p}/orders`, async (req) => {
      const order = await this.modules.sales.createOrder(req.ctx!, req.body);
      await this.broadcast(req.ctx!, 'order.created', { order }, 'orders:read');
      return ok(order, 201);
    }, { permission: 'orders:create', idempotent: true });
    this.add('POST', `${p}/orders/:id/status`, async (req, params) => {
      const order = await this.modules.sales.updateStatus(req.ctx!, params.id, String(req.body.status || ''));
      await this.broadcast(req.ctx!, 'order.updated', { order }, 'orders:read');
      return ok(order);
    }, { permission: 'orders:update' });
    this.add('POST', `${p}/orders/:id/cancel`, async (req, params) => ok(await this.modules.sales.updateStatus(req.ctx!, params.id, 'Cancelled')), { permission: 'orders:cancel' });
    this.add('POST', `${p}/products`, async (req) => {
      const product = await this.modules.inventory.createProduct(req.ctx!, req.body);
      await this.broadcast(req.ctx!, 'product.created', { product }, 'inventory:read');
      return ok(product, 201);
    }, { permission: 'inventory:create', idempotent: true });
    this.add('POST', `${p}/products/:id/adjust`, async (req, params) => {
      const product = await this.modules.inventory.adjust(req.ctx!, params.id, Number(req.body.delta || 0), String(req.body.reason || 'Manual adjustment'));
      await this.broadcast(req.ctx!, 'inventory.updated', { product }, 'inventory:read');
      return ok(product);
    }, { permission: 'inventory:adjust', idempotent: true });
    this.add('POST', `${p}/purchase-requests/:id/approve`, async (req, params) => {
      const request = await this.store.update('purchaseRequests', params.id, { status: req.body.approved === false ? 'Rejected' : 'Approved', reviewedBy: req.ctx!.employeeId }, req.ctx!);
      if (!request) throw errors.notFound('Purchase request not found');
      await recordAudit(this.store, req.ctx!, { actorId: req.ctx!.employeeId, actorType: 'Employee', action: 'Decided purchase request', resource: params.id, result: String(request.status) as 'Success' | 'Denied' | 'Failed' | 'Awaiting approval' });
      return ok(request);
    }, { permission: 'purchaseRequests:approve' });
    this.add('POST', `${p}/invoices`, async (req) => {
      const invoice = await this.modules.finance.createInvoice(req.ctx!, req.body);
      await this.broadcast(req.ctx!, 'invoice.created', { invoice }, 'finance:read');
      return ok(invoice, 201);
    }, { permission: 'finance:create', idempotent: true });
    this.add('POST', `${p}/invoices/:id/reminder`, async (req, params) => {
      const message = String(req.body.message || '').trim();
      if (!message) throw errors.badRequest('Reminder message is required');
      const result = await this.modules.finance.sendReminder(req.ctx!, params.id, String(req.body.channel || 'email'), message);
      await this.broadcast(req.ctx!, 'invoice.updated', { invoice: result.invoice }, 'finance:read');
      return ok({ sent: true, providerResult: result.providerResult, invoice: result.invoice }, 202);
    }, { permission: 'finance:update' });
    this.add('POST', `${p}/payments`, async (req) => ok(await this.modules.finance.recordPayment(req.ctx!, req.body), 201), { permission: 'finance:create', idempotent: true });
    this.add('POST', `${p}/payments/:id/verify`, async (req, params) => {
      const provider = String(req.body.provider || '');
      if (!provider) throw errors.badRequest('A trusted payment provider is required');
      const payment = await this.store.get<Record<string, unknown>>('payments', params.id, req.ctx!);
      if (!payment) throw errors.notFound('Payment not found');
      const updated = await this.store.update('payments', params.id, { status: 'Verified', verifiedBy: provider, verifiedAt: new Date().toISOString() }, req.ctx!);
      await recordAudit(this.store, req.ctx!, { actorId: provider, actorType: 'Integration', action: 'Verified payment', resource: params.id, result: 'Success' });
      return ok(updated);
    }, { permission: 'finance:verify' });
    this.add('POST', `${p}/expenses`, async (req) => ok(await this.modules.finance.createExpense(req.ctx!, req.body), 201), { permission: 'finance:create', idempotent: true });

    /* Automation and AI */
    this.add('POST', `${p}/workflows/:id/dry-run`, async (req, params) => {
      const workflow = await this.store.get<Record<string, unknown>>('workflows', params.id, req.ctx!);
      if (!workflow) throw errors.notFound('Workflow not found');
      const conditions = Array.isArray(req.body.conditions) ? req.body.conditions as Record<string, unknown>[] : [];
      const actions = Array.isArray(req.body.actions) ? req.body.actions as Record<string, unknown>[] : [];
      const payload = (req.body.payload && typeof req.body.payload === 'object' ? req.body.payload : {}) as Record<string, unknown>;
      const results = evaluateWorkflowConditions(conditions, payload);
      const matched = results.every((result) => result.passed);
      return ok({ matched, results, actions, wouldEnqueue: matched && workflow.active !== false && workflow.on !== false });
    }, { permission: 'workflows:execute' });
    this.add('POST', `${p}/workflows/:id/toggle`, async (req, params) => {
      const workflow = await this.store.get<Record<string, unknown>>('workflows', params.id, req.ctx!);
      if (!workflow) throw errors.notFound('Workflow not found');
      const updated = await this.store.update('workflows', params.id, { active: req.body.active === undefined ? !workflow.active : Boolean(req.body.active), on: req.body.active === undefined ? !workflow.active : Boolean(req.body.active) }, req.ctx!);
      return ok(updated);
    }, { permission: 'workflows:update' });
    this.add('POST', `${p}/workflows/:id/test`, async (req, params) => {
      const job = await this.queue.enqueue(req.ctx!, {
        type: 'execute_workflow',
        ctx: req.ctx,
        payload: { businessId: req.ctx!.businessId, workflowId: params.id, eventType: 'manual.test', event: req.body.payload || {} },
        idempotencyKey: `workflow-test:${params.id}:${Date.now()}`
      });
      return ok(job, 202);
    }, { permission: 'workflows:execute' });
    this.add('POST', `${p}/workflows/schedule`, async (req) => ok(await this.modules.workflow.schedule(req.ctx!, req.body), 202), { permission: 'workflows:execute' });
    this.add('POST', `${p}/workflows/:id/retry/:executionId`, async (req, params) => {
      const execution = await this.store.get<Record<string, unknown>>('workflowExecutions', params.executionId, req.ctx!);
      if (!execution) throw errors.notFound('Workflow execution not found');
      const job = await this.queue.enqueue(req.ctx!, {
        type: 'execute_workflow',
        ctx: req.ctx,
        payload: { businessId: req.ctx!.businessId, workflowId: params.id, eventType: String(execution.trigger || 'retry'), event: {}, retryOf: params.executionId },
        idempotencyKey: `workflow-retry:${params.executionId}:${Date.now()}`
      });
      await this.store.update('workflowExecutions', params.executionId, { retried: true }, req.ctx!);
      return ok(job, 202);
    }, { permission: 'workflows:execute' });
    this.add('POST', `${p}/agents/:id/run`, async (req, params) => {
      const result = await this.modules.ai.run(req.ctx!, params.id, req.body as { prompt: string });
      await this.broadcast(req.ctx!, 'agent.executed', { result }, 'agents:read');
      return ok(result, 201);
    }, { permission: 'agents:read' });
    this.add('POST', `${p}/agents/:id/configure`, async (req, params) => {
      const config = await this.store.find<Record<string, unknown>>('agentConfigurations', (c) => c.agentId === params.id, req.ctx!);
      if (!config) throw errors.notFound('Agent configuration not found');
      const patch: Record<string, unknown> = {};
      if (req.body.automationLevel !== undefined) {
        const level = String(req.body.automationLevel) === 'approve' ? 'prepare' : String(req.body.automationLevel);
        if (!['suggest', 'prepare', 'execute'].includes(level)) throw errors.badRequest('Invalid automation level');
        patch.automationLevel = level;
      }
      if (req.body.dailyLimit !== undefined) patch.dailyLimit = Math.max(1, Number(req.body.dailyLimit));
      if (req.body.policy !== undefined) patch.policy = String(req.body.policy).slice(0, 4000);
      const updated = await this.store.update('agentConfigurations', String(config.id), patch, req.ctx!);
      await recordAudit(this.store, req.ctx!, { actorId: req.ctx!.employeeId, actorType: 'Employee', action: 'Configured AI agent', resource: params.id, result: 'Success', meta: patch });
      return ok(updated);
    }, { permission: 'agents:configure' });
    this.add('PUT', `${p}/agents/:id/tools/:tool`, async (req, params) => {
      if (!TOOL_NAMES.includes(params.tool)) throw errors.badRequest('Unknown tool');
      const permission = await this.store.find<Record<string, unknown>>('agentPermissions', (record) => record.agentId === params.id && record.tool === params.tool, req.ctx!);
      if (!permission) throw errors.notFound('Tool permission not found');
      const updated = await this.store.update('agentPermissions', String(permission.id), { enabled: Boolean(req.body.enabled) }, req.ctx!);
      await recordAudit(this.store, req.ctx!, { actorId: req.ctx!.employeeId, actorType: 'Employee', action: 'Changed agent tool permission', resource: `${params.id}:${params.tool}`, result: 'Success' });
      return ok(updated);
    }, { permission: 'agents:configure' });
    this.add('POST', `${p}/approvals/:id/decide`, async (req, params) => {
      const decision = String(req.body.decision || '') === 'reject' ? 'reject' : 'approve';
      const approval = await this.modules.ai.decide(req.ctx!, params.id, decision, req.body.note ? String(req.body.note) : undefined);
      await this.broadcast(req.ctx!, 'approval.decided', { approval }, 'agents:approve');
      return ok(approval);
    }, { permission: 'agents:approve', idempotent: true });

    /* Integrations, notifications, analytics, audit and data protection */
    this.add('POST', `${p}/integrations/:id/connect`, async (req, params) => ok(await this.modules.integrations.connect(req.ctx!, params.id, req.body)), { permission: 'integrations:connect' });
    this.add('POST', `${p}/integrations/:id/disconnect`, async (req, params) => ok(await this.modules.integrations.disconnect(req.ctx!, params.id)), { permission: 'integrations:disconnect' });
    this.add('POST', `${p}/integrations/:id/sync`, async (req, params) => ok(await this.modules.integrations.syncNow(req.ctx!, params.id), 202), { permission: 'integrations:connect' });
    this.add('GET', `${p}/integrations/:id/status`, async (req, params) => ok(await this.modules.integrations.status(req.ctx!, params.id)), { permission: 'integrations:read' });
    this.add('GET', `${p}/notifications/preferences`, async (req) => ok(await notificationPreferences(req.ctx!)), { permission: 'notifications:read' });
    this.add('PUT', `${p}/notifications/preferences`, async (req) => {
      const input = (req.body.preferences && typeof req.body.preferences === 'object' ? req.body.preferences : req.body) as Record<string, unknown>;
      const current = await notificationPreferences(req.ctx!);
      const preferences: Record<string, boolean> = { ...current };
      for (const key of Object.keys(DEFAULT_NOTIFICATION_PREFERENCES)) {
        if (input[key] !== undefined) preferences[key] = Boolean(input[key]);
      }
      await this.store.update('businesses', req.ctx!.businessId, { notificationPreferences: preferences }, req.ctx!);
      await recordAudit(this.store, req.ctx!, {
        actorId: req.ctx!.employeeId,
        actorType: 'Employee',
        action: 'Updated notification preferences',
        resource: req.ctx!.businessId,
        result: 'Success',
        meta: preferences
      });
      await this.broadcast(req.ctx!, 'notifications.updated', { preferences }, 'notifications:read');
      return ok(preferences);
    }, { permission: 'notifications:update' });
    this.add('POST', `${p}/notifications/read-all`, async (req) => {
      const notifications = await this.store.list<Record<string, unknown>>('notifications', (n) => n.unread === true, req.ctx!);
      for (const notification of notifications) await this.store.update('notifications', String(notification.id), { unread: false }, req.ctx!);
      await this.broadcast(req.ctx!, 'notifications.updated', { count: notifications.length }, 'notifications:read');
      return ok({ updated: notifications.length });
    }, { permission: 'notifications:update' });
    this.add('GET', `${p}/analytics/:view`, async (req, params) => {
      const range = String(req.url.searchParams.get('range') || '30d');
      const views: Record<string, () => Promise<Record<string, unknown>>> = {
        overview: () => this.modules.analytics.overview(req.ctx!, range),
        sales: () => this.modules.analytics.sales(req.ctx!, range),
        inventory: () => this.modules.analytics.inventory(req.ctx!),
        finance: () => this.modules.analytics.finance(req.ctx!, range),
        communications: () => this.modules.analytics.communications(req.ctx!, range),
        people: () => this.modules.analytics.people(req.ctx!),
        automation: () => this.modules.analytics.automation(req.ctx!)
      };
      const view = views[params.view];
      if (!view) throw errors.notFound('Analytics view not found');
      return ok(await view());
    }, { permission: 'analytics:read' });
    this.add('POST', `${p}/analytics/summary`, async (req) => ok(await this.modules.analytics.summary(req.ctx!, String(req.body.range || '30d'))), { permission: 'analytics:read' });
    this.add('GET', `${p}/analytics/export/:dataset`, async (req, params) => {
      const csv = await this.modules.analytics.exportDataset(req.ctx!, params.dataset);
      return { status: 200, raw: csv.body, contentType: csv.contentType, headers: { 'content-disposition': `attachment; filename="${csv.filename}"` } };
    }, { permission: 'analytics:export' });
    this.add('GET', `${p}/audit-logs/export`, async (req) => {
      const logs = await this.store.list('auditLogs', undefined, req.ctx!);
      return { status: 200, raw: JSON.stringify(logs, null, 2), contentType: 'application/json', headers: { 'content-disposition': 'attachment; filename="nexora-audit-logs.json"' } };
    }, { permission: 'audit:export' });
    this.add('GET', `${p}/data/export`, async (req) => ok(await this.modules.dataProtection.exportData(req.ctx!)), { permission: 'data:export' });
    this.add('POST', `${p}/data/delete`, async (req) => ok(await this.modules.dataProtection.deleteData(req.ctx!, {
      collection: String(req.body.collection || '') as Parameters<Store['get']>[0],
      id: String(req.body.id || ''),
      confirmation: String(req.body.confirmation || '')
    })), { permission: 'data:delete', idempotent: true });
    this.add('GET', `${p}/data/retention`, async (req) => ok(await this.modules.dataProtection.retentionPolicy(req.ctx!)), { permission: 'business:read' });
    this.add('PUT', `${p}/data/retention`, async (req) => ok(await this.modules.dataProtection.updateRetentionPolicy(req.ctx!, req.body)), { permission: 'business:update' });
    this.add('POST', `${p}/files`, async (req) => {
      const stored = await this.modules.communication['storage'].put(req.ctx!, {
        name: String(req.body.name || 'attachment'),
        mimeType: String(req.body.mimeType || 'application/octet-stream'),
        data: Buffer.from(String(req.body.dataBase64 || ''), 'base64'),
        conversationId: req.body.conversationId ? String(req.body.conversationId) : undefined,
        customerId: req.body.customerId ? String(req.body.customerId) : undefined
      });
      return ok(stored, 201);
    }, { permission: 'inbox:read' });
    this.add('GET', `${p}/files/:id`, async (req, params) => {
      const file = await this.modules.communication['storage'].get(req.ctx!, params.id);
      return { status: 200, raw: file.data.toString('base64'), contentType: file.record.mimeType as string, headers: { 'content-encoding': 'base64' } };
    }, { permission: 'inbox:read' });
    this.add('GET', `${p}/jobs`, async (req) => ok({ data: await this.store.list('jobs', undefined, req.ctx!) }), { permission: 'workflows:read' });
    this.add('POST', `${p}/jobs/:id/retry`, async (req, params) => ok(await this.queue.retry(req.ctx!, params.id)), { permission: 'workflows:execute' });

    /* Generic resource CRUD with tenant scoping, pagination, filtering and sorting */
    for (const [resource, config] of Object.entries(RESOURCES)) {
      this.add('GET', `${p}/${resource}`, async (req) => {
        const result = await listRecords(this.store, req.ctx!, resource, parseQuery(req.url.searchParams));
        return ok(result);
      }, { permission: config.read });
      this.add('GET', `${p}/${resource}/:id`, async (req, params) => ok(await getRecord(this.store, req.ctx!, resource, params.id)), { permission: config.read });
      if (config.create) {
        this.add('POST', `${p}/${resource}`, async (req) => {
          const record = await createRecord(this.store, req.ctx!, resource, req.body);
          await this.broadcast(req.ctx!, `${resource}.created`, { record }, config.read);
          return ok(record, 201);
        }, { permission: config.create, idempotent: true });
      }
      if (config.update) {
        this.add('PATCH', `${p}/${resource}/:id`, async (req, params) => {
          const record = await updateRecord(this.store, req.ctx!, resource, params.id, req.body, header(req, 'if-match') || undefined);
          await this.broadcast(req.ctx!, `${resource}.updated`, { record }, config.read);
          return ok(record);
        }, { permission: config.update });
      }
      if (config.remove) {
        this.add('DELETE', `${p}/${resource}/:id`, async (req, params) => {
          await removeRecord(this.store, req.ctx!, resource, params.id);
          await this.broadcast(req.ctx!, `${resource}.deleted`, { id: params.id }, config.read);
          return ok({ message: 'Deleted' });
        }, { permission: config.remove });
      }
    }
  }

  private pick(input: Record<string, unknown>, keys: string[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const key of keys) if (input[key] !== undefined) result[key] = input[key];
    return result;
  }

  private async bootstrap(ctx: Context): Promise<Record<string, unknown>> {
    const list = async (collection: Parameters<Store['list']>[0]) => this.store.list<Record<string, unknown>>(collection, undefined, ctx);
    const [business, departments, roles, employees, channels, customers, products, suppliers, movements, purchaseRequests, orders, leads, invoices, payments, expenses, tasks, conversations, messages, attachments, agents, agentPermissions, approvals, workflows, executions, integrations, notifications, auditLogs, sessions, metrics, conversationNotes, customerNotes, workflowTriggers] = await Promise.all([
      this.store.get<Record<string, unknown>>('businesses', ctx.businessId, ctx),
      list('departments'), list('roles'), list('employees'), list('communicationChannels'), list('customers'), list('products'), list('suppliers'), list('stockMovements'), list('purchaseRequests'), list('orders'), list('leads'), list('invoices'), list('payments'), list('expenses'), list('tasks'), list('conversations'), list('messages'), list('messageAttachments'), list('agents'), list('agentPermissions'), list('approvals'), list('workflows'), list('workflowExecutions'), list('integrations'), list('notifications'), list('auditLogs'), list('sessions'), list('metrics'), list('conversationNotes'), list('customerNotes'), list('workflowTriggers')
    ]);

    const messageMap = new Map<string, Record<string, unknown>[]>();
    for (const message of messages) {
      const key = String(message.conversationId || '');
      const listForConversation = messageMap.get(key) || [];
      const attached = attachments.filter((attachment) => attachment.messageId === message.id).map((attachment) => attachment.name);
      listForConversation.push({
        id: message.id,
        dir: message.dir || message.direction,
        text: message.text,
        at: message.at,
        status: message.status,
        ai: Boolean(message.sentBy && String(message.sentBy).startsWith('agent:')),
        by: message.sentBy,
        attach: attached[0]
      });
      messageMap.set(key, listForConversation);
    }

    return {
      business,
      notificationPreferences: (business?.notificationPreferences && typeof business.notificationPreferences === 'object'
        ? business.notificationPreferences : DEFAULT_NOTIFICATION_PREFERENCES),
      conversationNotes,
      customerNotes,
      departments,
      roles,
      employees,
      channels: Object.fromEntries(channels.map((channel) => [channel.id, channel])),
      customers,
      products,
      suppliers,
      movements,
      purchaseRequests,
      orders,
      leads,
      invoices,
      payments,
      expenses,
      tasks,
      conversations: conversations.map((conversation) => ({
        ...conversation,
        prio: conversation.prio ?? conversation.priority,
        cat: conversation.cat ?? conversation.category,
        handler: conversation.handler || conversation.mode,
        time: conversation.time || conversation.last,
        messages: messageMap.get(String(conversation.id)) || []
      })),
      agents: agents.map((agent) => ({
        ...agent,
        desc: agent.description || agent.desc,
        on: agent.enabled ?? agent.on,
        level: agent.automationLevel || agent.level,
        success: agent.successRate ?? agent.success,
        escal: agent.escalations ?? agent.escal,
        usage: agent.usagePercent ?? agent.usage,
        locked: agent.lockedActions || agent.locked,
        tools: agentPermissions.filter((permission) => permission.agentId === agent.id).map((permission) => [permission.legacyTool || permission.tool, permission.description, permission.enabled])
      })),
      approvals,
      workflows,
      workflowTriggers,
      executions,
      integrations,
      notifications: notifications.filter((notification) => !notification.recipientId || notification.recipientId === ctx.employeeId || !notification.recipientId),
      audit: auditLogs.map((log) => ({
        when: log.occurredAt || log.when,
        actor: log.actor || log.actorId,
        type: log.actorType || log.type,
        action: log.action,
        res: log.resource || log.res,
        result: log.result,
        approval: log.approvalReference || log.approval || ''
      })),
      sessions: sessions.filter((session) => session.employeeId === ctx.employeeId),
      sales30: metrics.find((metric) => metric.id === 'sales30')?.value || [],
      sales30prev: metrics.find((metric) => metric.id === 'sales30prev')?.value || [],
      salesByChannel: metrics.find((metric) => metric.id === 'salesByChannel')?.value || [],
      convVolume: metrics.find((metric) => metric.id === 'convVolume')?.value || [],
      aiHandled: metrics.find((metric) => metric.id === 'aiHandled')?.value || [],
      generatedAt: new Date().toISOString()
    };
  }
}
