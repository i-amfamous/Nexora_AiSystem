import { PERMISSIONS } from '../core/rbac.js';
import { RESOURCES } from '../modules/records.js';

const jsonBody = (extra: Record<string, unknown> = {}) => ({
  required: true,
  content: { 'application/json': { schema: { type: 'object', additionalProperties: true, ...extra } } }
});

const okResponse = { description: 'Successful response', content: { 'application/json': { schema: { type: 'object', properties: { data: { description: 'Endpoint payload' }, requestId: { type: 'string' } } } } } };
const errorResponse = { description: 'Error response', content: { 'application/json': { schema: { type: 'object', properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' }, details: {} } }, requestId: { type: 'string' } } } } } };
const secured = [{ bearerAuth: [] }];

function op(summary: string, options: { auth?: boolean; body?: boolean; permission?: string; params?: Record<string, unknown>[] } = {}): Record<string, unknown> {
  return {
    summary,
    tags: options.permission ? [options.permission.split(':')[0]] : ['system'],
    ...(options.auth === false ? {} : { security: secured }),
    ...(options.permission ? { description: `Requires ${options.permission}` } : {}),
    ...(options.params?.length ? { parameters: options.params } : {}),
    ...(options.body ? { requestBody: jsonBody() } : {}),
    responses: { '200': okResponse, '400': errorResponse, '401': errorResponse, '403': errorResponse, '429': errorResponse }
  };
}

const listParams: Record<string, unknown>[] = [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 }, description: 'Page number' },
  { name: 'pageSize', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 }, description: 'Rows per page (alias: limit)' },
  { name: 'sort', in: 'query', schema: { type: 'string' }, description: 'Field to sort by' },
  { name: 'order', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] }, description: 'Sort direction' },
  { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Free-text search across record fields' }
];

export function openApiDocument(): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {
    '/api/v1/config': { get: op('Public runtime configuration including production and demoMode flags', { auth: false }) },
    '/api/v1/health': { get: op('Health check', { auth: false }) },
    '/api/v1/monitoring': { get: op('Operational metrics for API, jobs, integrations, AI and authentication events', { permission: 'analytics:read' }) },
    '/api/v1/meta/permissions': { get: op('List permissions and those granted to the current role') },
    '/api/v1/auth/register': { post: op('Register a business workspace and owner account', { auth: false, body: true }) },
    '/api/v1/auth/login': { post: op('Sign in and receive a session token', { auth: false, body: true }) },
    '/api/v1/auth/logout': { post: op('Revoke the current session and sign out') },
    '/api/v1/auth/password/change': { post: op('Change the current password and revoke other sessions', { body: true }) },
    '/api/v1/auth/me': { get: op('Get current user, workspace context and permissions') },
    '/api/v1/auth/password-reset/request': { post: op('Request a password reset token', { auth: false, body: true }) },
    '/api/v1/auth/password-reset/confirm': { post: op('Confirm a password reset', { auth: false, body: true }) },
    '/api/v1/auth/sessions': { get: op('List active sessions', { permission: 'auth:read' }) },
    '/api/v1/auth/sessions/{id}': { delete: op('Revoke a session', { permission: 'auth:read' }) },
    '/api/v1/auth/sessions/revoke-others': { post: op('Revoke all other sessions', { permission: 'auth:read' }) },
    '/api/v1/bootstrap': { get: op('Load all authorised workspace data for the web client', { permission: 'business:read' }) },
    '/api/v1/businesses': { get: op('List businesses visible to the current tenant', { permission: 'business:read' }) },
    '/api/v1/businesses/current': {
      get: op('Get the current business profile', { permission: 'business:read' }),
      patch: op('Update the current business profile', { permission: 'business:update', body: true })
    },
    '/api/v1/employees/invite': { post: op('Invite an employee', { permission: 'employees:invite', body: true }) },
    '/api/v1/employees/{id}/invite/resend': { post: op('Resend an employee invitation with a fresh temporary password', { permission: 'employees:invite', body: true }) },
    '/api/v1/employees/{id}/deactivate': { post: op('Revoke or restore employee access', { permission: 'employees:deactivate', body: true }) },
    '/api/v1/employees/{id}/role': { post: op('Change employee role and department', { permission: 'employees:update', body: true }) },
    '/api/v1/roles/{id}/permissions': {
      get: op('Get role permissions', { permission: 'roles:read' }),
      put: op('Configure role permissions', { permission: 'roles:update', body: true })
    },
    '/api/v1/conversations/{id}/reply': { post: op('Reply through the appropriate channel', { permission: 'inbox:respond', body: true }) },
    '/api/v1/conversations/{id}/notes': { post: op('Add an internal note to a conversation', { permission: 'inbox:respond', body: true }) },
    '/api/v1/conversations/{id}/drafts': { post: op('Save or clear (null) a conversation draft', { permission: 'inbox:respond', body: true }) },
    '/api/v1/conversations/{id}/assign': { post: op('Assign a conversation', { permission: 'inbox:assign', body: true }) },
    '/api/v1/conversations/{id}/takeover': { post: op('Take over an AI-managed conversation', { permission: 'inbox:takeover' }) },
    '/api/v1/channels/{channel}/message': { post: op('Send a message through a channel adapter', { permission: 'inbox:respond', body: true }) },
    '/api/v1/webhooks/{provider}': { post: op('Verified inbound provider webhook', { auth: false, body: true }) },
    '/api/v1/customers/duplicates': { get: op('Identify potential duplicate customers', { permission: 'customers:read' }) },
    '/api/v1/customers/{id}/notes': {
      get: op('List internal customer notes', { permission: 'customers:read' }),
      post: op('Add an internal customer note', { permission: 'customers:update', body: true })
    },
    '/api/v1/customers/{id}/merge': { post: op('Merge a duplicate customer into this one (idempotent with Idempotency-Key)', { permission: 'customers:merge', body: true }) },
    '/api/v1/orders': { post: op('Create an order with server-calculated totals', { permission: 'orders:create', body: true }) },
    '/api/v1/orders/{id}/status': { post: op('Update order status', { permission: 'orders:update', body: true }) },
    '/api/v1/orders/{id}/cancel': { post: op('Cancel an order', { permission: 'orders:cancel', body: true }) },
    '/api/v1/products': { post: op('Create a product', { permission: 'inventory:create', body: true }) },
    '/api/v1/products/{id}/adjust': { post: op('Adjust stock with movement history', { permission: 'inventory:adjust', body: true }) },
    '/api/v1/purchase-requests/{id}/approve': { post: op('Approve or reject a purchase request', { permission: 'purchaseRequests:approve', body: true }) },
    '/api/v1/invoices': { post: op('Create an invoice', { permission: 'finance:create', body: true }) },
    '/api/v1/invoices/{id}/reminder': { post: op('Send an invoice reminder through a channel adapter', { permission: 'finance:update', body: true }) },
    '/api/v1/payments': { post: op('Record a payment', { permission: 'finance:create', body: true }) },
    '/api/v1/payments/{id}/verify': { post: op('Verify a payment through a trusted provider', { permission: 'finance:verify', body: true }) },
    '/api/v1/expenses': { post: op('Record an expense', { permission: 'finance:create', body: true }) },
    '/api/v1/workflows/{id}/dry-run': { post: op('Evaluate workflow conditions against a payload without enqueueing or applying actions', { permission: 'workflows:execute', body: true }) },
    '/api/v1/workflows/{id}/toggle': { post: op('Activate or deactivate a workflow', { permission: 'workflows:update', body: true }) },
    '/api/v1/workflows/{id}/test': { post: op('Run a workflow in a background job', { permission: 'workflows:execute', body: true }) },
    '/api/v1/workflows/schedule': { post: op('Schedule a workflow execution', { permission: 'workflows:execute', body: true }) },
    '/api/v1/workflows/{id}/retry/{executionId}': { post: op('Retry a failed workflow execution', { permission: 'workflows:execute' }) },
    '/api/v1/agents/{id}/run': { post: op('Run a predefined AI agent through controlled tools', { permission: 'agents:read', body: true }) },
    '/api/v1/agents/{id}/configure': { post: op('Configure agent automation level, limits and policy', { permission: 'agents:configure', body: true }) },
    '/api/v1/agents/{id}/tools/{tool}': { put: op('Enable or disable an agent tool', { permission: 'agents:configure', body: true }) },
    '/api/v1/approvals/{id}/decide': { post: op('Approve or reject a sensitive action', { permission: 'agents:approve', body: true }) },
    '/api/v1/integrations/{id}/connect': { post: op('Connect an integration with encrypted credentials', { permission: 'integrations:connect', body: true }) },
    '/api/v1/integrations/{id}/disconnect': { post: op('Disconnect an integration', { permission: 'integrations:disconnect' }) },
    '/api/v1/integrations/{id}/sync': { post: op('Queue an integration synchronisation', { permission: 'integrations:connect' }) },
    '/api/v1/integrations/{id}/status': { get: op('Get integration connection status', { permission: 'integrations:read' }) },
    '/api/v1/notifications/preferences': {
      get: op('Get notification preferences for the current business', { permission: 'notifications:read' }),
      put: op('Update notification preferences for the current business', { permission: 'notifications:update', body: true })
    },
    '/api/v1/notifications/read-all': { post: op('Mark all notifications as read', { permission: 'notifications:update' }) },
    '/api/v1/analytics/{view}': { get: op('Get a dashboard view: overview, sales, inventory, finance, communications, people or automation', { permission: 'analytics:read', params: [{ name: 'view', in: 'path', required: true, schema: { type: 'string', enum: ['overview', 'sales', 'inventory', 'finance', 'communications', 'people', 'automation'] } }, { name: 'range', in: 'query', schema: { type: 'string', default: '30d' }, description: 'Reporting window, e.g. 7d, 30d, 90d' }] }) },
    '/api/v1/analytics/summary': { post: op('Generate a traceable AI summary of recorded figures', { permission: 'analytics:read', body: true }) },
    '/api/v1/analytics/export/{dataset}': { get: op('Export analytics as CSV', { permission: 'analytics:export' }) },
    '/api/v1/audit-logs/export': { get: op('Export audit logs', { permission: 'audit:export' }) },
    '/api/v1/data/export': { get: op('Export all workspace data', { permission: 'data:export' }) },
    '/api/v1/data/delete': { post: op('Controlled deletion with redaction', { permission: 'data:delete', body: true }) },
    '/api/v1/data/retention': {
      get: op('Get data retention policy', { permission: 'business:read' }),
      put: op('Update data retention policy', { permission: 'business:update', body: true })
    },
    '/api/v1/files': { post: op('Store an encrypted attachment', { permission: 'inbox:read', body: true }) },
    '/api/v1/files/{id}': { get: op('Retrieve an encrypted attachment', { permission: 'inbox:read' }) },
    '/api/v1/jobs': { get: op('List background jobs', { permission: 'workflows:read' }) },
    '/api/v1/jobs/{id}/retry': { post: op('Retry a background job', { permission: 'workflows:execute' }) }
  };

  for (const [resource, config] of Object.entries(RESOURCES)) {
    const base = `/api/v1/${resource}`;
    paths[base] ||= {};
    paths[base].get = op(`List ${resource} with pagination, filtering and sorting`, { permission: config.read, params: listParams });
    if (config.create) paths[base].post = op(`Create a ${config.label.toLowerCase()}`, { permission: config.create, body: true });
    paths[`${base}/{id}`] ||= {};
    paths[`${base}/{id}`].get = op(`Get a ${config.label.toLowerCase()}`, { permission: config.read });
    if (config.update) paths[`${base}/{id}`].patch = op(`Update a ${config.label.toLowerCase()}`, { permission: config.update, body: true });
    if (config.remove) paths[`${base}/{id}`].delete = op(`Delete a ${config.label.toLowerCase()}`, { permission: config.remove });
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Nexora API',
      version: '2.0.0',
      description: 'Versioned REST API for the Nexora Unified Business Operating Platform. All business resources are tenant-scoped and protected by RBAC.'
    },
    servers: [{ url: process.env.API_BASE_URL || 'http://localhost:4000', description: 'Nexora server' }],
    tags: Array.from(new Set(Object.values(paths).flatMap((methods) => Object.values(methods).map((method) => {
      const tags = (method as Record<string, unknown>).tags;
      return Array.isArray(tags) && tags.length ? String(tags[0]) : 'system';
    })))).map((name) => ({ name })),
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'HMAC' } },
      schemas: { Permission: { type: 'string', enum: PERMISSIONS } }
    },
    paths
  };
}
