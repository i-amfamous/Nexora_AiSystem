import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { startTestApp, api, login } from './helpers.js';
import { RESOURCES } from '../dist/modules/records.js';
import { PERMISSIONS } from '../dist/core/rbac.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const spec = JSON.parse(fs.readFileSync(path.join(root, 'docs/openapi.json'), 'utf8'));
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

function documentedOperations() {
  const operations = [];
  for (const [template, item] of Object.entries(spec.paths)) {
    for (const method of METHODS) {
      if (!item[method]) continue;
      operations.push({ method: method.toUpperCase(), template });
    }
  }
  return operations;
}

function templateToSource(template) {
  const pattern = template.replace(/\{([^}]+)\}/g, ':$1');
  const source = pattern.split('/').map((segment) => {
    if (segment.startsWith(':')) return '([^/]+)';
    return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('/');
  return new RegExp(`^${source}$`).source;
}

function relativeEndpoint(template) {
  return template.replace(/^\/api\/v1/, '') || '/';
}

function concretePath(template) {
  const values = {
    view: 'overview', dataset: 'sales', provider: 'paystack', channel: 'webchat',
    tool: 'get_analytics', id: 'test-id', executionId: 'test-execution'
  };
  return template.replace(/\{([^}]+)\}/g, (_match, name) => values[name] || 'test-param');
}

const BODIES = {
  'POST /api/v1/auth/login': { email: 'owner@example.test', password: 'redacted-password' },
  'POST /api/v1/auth/register': { businessName: 'System Sweep', name: 'System Sweep Owner', email: `sweep-${Date.now()}@example.test`, password: 'redacted-password' },
  'POST /api/v1/auth/password-reset/request': { email: 'owner@example.test' },
  'POST /api/v1/auth/password-reset/confirm': { token: 'not-a-real-token', password: 'redacted-password' },
  'POST /api/v1/auth/password/change': { currentPassword: 'incorrect', newPassword: 'redacted-password' },
  'POST /api/v1/data/delete': { collection: 'customers', id: 'test-id', confirmation: 'DELETE' },
  'POST /api/v1/agents/{id}/run': { prompt: 'Summarise the workspace' },
  'POST /api/v1/workflows/schedule': { workflowId: 'test-id', runAt: new Date(Date.now() + 60_000).toISOString() },
  'POST /api/v1/approvals/{id}/decide': { decision: 'approve', note: 'System sweep' },
  'POST /api/v1/integrations/{id}/connect': { credentials: { token: 'test-token' } },
  'POST /api/v1/files': { name: 'sweep.txt', mimeType: 'text/plain', dataBase64: 'c3dlZXA=' },
  'POST /api/v1/conversations/{id}/reply': { text: 'System sweep reply' },
  'POST /api/v1/conversations/{id}/notes': { text: 'System sweep note' },
  'POST /api/v1/conversations/{id}/drafts': { text: 'System sweep draft' },
  'POST /api/v1/channels/{channel}/message': { to: '+233000000000', text: 'System sweep message' },
  'POST /api/v1/customers/{id}/notes': { text: 'System sweep note' },
  'POST /api/v1/invoices/{id}/reminder': { message: 'System sweep reminder', channel: 'email' },
  'POST /api/v1/payments/{id}/verify': { provider: 'paystack' },
  'POST /api/v1/products/{id}/adjust': { delta: 1, reason: 'System sweep' },
  'POST /api/v1/workflows/{id}/dry-run': { conditions: [], actions: [], payload: {} },
  'POST /api/v1/workflows/{id}/test': { payload: {} },
  'POST /api/v1/agents/{id}/configure': { automationLevel: 'suggest', dailyLimit: 5 },
  'PUT /api/v1/agents/{id}/tools/{tool}': { enabled: false },
  'PUT /api/v1/notifications/preferences': { preferences: { inApp: true } },
  'PUT /api/v1/roles/{id}/permissions': { permissions: { 'customers:read': true } },
  'POST /api/v1/analytics/summary': { range: '7d' }
};

test('system: registered API routes and OpenAPI document are in exact parity', async (t) => {
  const env = await startTestApp();
  t.after(env.cleanup);

  const registered = env.app.router.routes.map((route) => `${route.method} ${route.regex.source}`);
  const registeredSet = new Set(registered);
  const documented = documentedOperations();

  const missing = [];
  for (const operation of documented) {
    const key = `${operation.method} ${templateToSource(operation.template)}`;
    if (!registeredSet.has(key)) missing.push(`${operation.method} ${operation.template}`);
  }
  assert.deepEqual(missing, [], 'documented operations must all be registered');

  const documentedSet = new Set(documented.map((operation) => `${operation.method} ${templateToSource(operation.template)}`));
  const undocumented = [...new Set(registered)].filter((key) => !documentedSet.has(key));
  assert.deepEqual(undocumented, [], 'registered routes must all be documented');

  const duplicateSources = registered.filter((key, index) => registered.indexOf(key) !== index);
  assert.ok(Array.isArray(duplicateSources), 'duplicate registrations must be accounted for');
  assert.equal(documented.length, new Set(registered).size);
});

test('system: every documented operation responds without a routing or server error', async (t) => {
  const env = await startTestApp();
  t.after(env.cleanup);
  const session = await login(env.base);
  const token = session.token;

  const operations = documentedOperations().filter((operation) => operation.template !== '/api/v1/auth/logout');
  const statusCounts = {};
  const failures = [];
  for (const operation of operations) {
    const key = `${operation.method} ${operation.template}`;
    const endpoint = concretePath(operation.template);
    const options = { method: operation.method, token };
    if (operation.method !== 'GET' && operation.method !== 'DELETE') options.body = BODIES[key] || {};
    const result = await api(env.base, endpoint, options);
    statusCounts[result.status] = (statusCounts[result.status] || 0) + 1;
    const contentType = String(result.headers.get('content-type') || '');
    const isUnknownRoute = result.status === 404 && result.body?.error?.message === 'Endpoint not found';
    if (result.status >= 500 || isUnknownRoute) {
      failures.push(`${key} -> ${result.status} ${result.text.slice(0, 300)}`);
    }
    if (contentType.includes('json')) {
      assert.ok(result.body && result.body.requestId, `${key} should return a requestId envelope`);
    }
  }

  assert.deepEqual(failures, [], 'every documented operation must be reachable and must not throw');
  assert.ok(operations.length >= 180, `expected at least 180 operations, got ${operations.length}`);
  assert.ok((statusCounts[200] || 0) > 80, `expected most operations to succeed, got ${JSON.stringify(statusCounts)}`);

  const logout = await api(env.base, '/auth/logout', { method: 'POST', token });
  assert.equal(logout.status, 200);
  const afterLogout = await api(env.base, '/auth/me', { token });
  assert.equal(afterLogout.status, 401);
});

test('system: generic CRUD succeeds for every creatable resource', async (t) => {
  const env = await startTestApp();
  t.after(env.cleanup);
  const { token } = await login(env.base);
  const bootstrap = await api(env.base, '/bootstrap', { token });
  const data = bootstrap.body.data;
  const customerId = data.customers[0].id;
  const productId = data.products[0].id;
  const invoiceId = data.invoices[0].id;

  const customBodies = {
    products: { sku: 'SYS-SWEEP-1', name: 'System sweep product', price: 100, cost: 60, stock: 5 },
    orders: { customer: customerId, items: [[productId, 1]], channel: 'webchat' },
    invoices: { customer: customerId, total: 250, due: '2026-12-31' },
    payments: { invoice: invoiceId, amount: 100, method: 'Bank transfer' },
    expenses: { amount: 50, category: 'Other', description: 'System sweep expense' }
  };

  const created = [];
  for (const [resource, config] of Object.entries(RESOURCES)) {
    const endpoint = `/${resource}`;
    const list = await api(env.base, `${endpoint}?page=1&pageSize=1&sort=id&order=desc`, { token });
    assert.equal(list.status, 200, `GET ${resource} failed: ${list.text}`);
    assert.ok(list.body.data.meta, `GET ${resource} must return pagination meta`);

    if (!config.create) continue;
    const id = `sys-${resource}`;
    const body = { id, name: `System sweep ${resource}`, ...(customBodies[resource] || {}) };
    const result = await api(env.base, endpoint, { method: 'POST', token, body });
    assert.ok(result.status === 200 || result.status === 201, `POST ${resource} failed: ${result.text}`);
    created.push({ resource, id });

    const detail = await api(env.base, `${endpoint}/${result.body.data.id}`, { token });
    assert.equal(detail.status, 200, `GET ${resource}/${id} failed: ${detail.text}`);

    if (config.update) {
      const patched = await api(env.base, `${endpoint}/${result.body.data.id}`, {
        method: 'PATCH', token, body: { name: `Patched ${resource}` }
      });
      assert.equal(patched.status, 200, `PATCH ${resource}/${id} failed: ${patched.text}`);
    }
  }

  for (const item of created) {
    const config = RESOURCES[item.resource];
    if (!config.remove) continue;
    const removed = await api(env.base, `/${item.resource}/${item.id}`, { method: 'DELETE', token });
    assert.equal(removed.status, 200, `DELETE ${item.resource}/${item.id} failed: ${removed.text}`);
    const missing = await api(env.base, `/${item.resource}/${item.id}`, { token });
    assert.equal(missing.status, 404);
  }

  assert.ok(created.length >= 20, `expected broad CRUD coverage, created ${created.length} records`);
});

const JS_FILES = ['icons.js', 'data.js', 'api.js', 'actions.js', 'ui.js', 'app.js', 'views-core.js', 'views-ops.js', 'views-ai.js'];
const FRONTEND = JS_FILES.map((name) => ({
  name,
  source: fs.readFileSync(path.join(root, 'interface/assets/js', name), 'utf8')
}));

function uniqueMatches(source, expression) {
  return new Set([...source.matchAll(expression)].map((match) => match[1]));
}

test('system: every UI trigger has a handler and every called API method is exported', () => {
  const triggers = new Set();
  const definitions = new Set();
  for (const file of FRONTEND) {
    for (const attribute of ['act', 'change', 'input']) {
      for (const name of uniqueMatches(file.source, new RegExp(`data-${attribute}="([^"]+)"`, 'g'))) triggers.add(name);
    }
    for (const name of uniqueMatches(file.source, /\bA\.actions\['([^']+)'\]\s*=/g)) definitions.add(name);
    for (const name of uniqueMatches(file.source, /\bA\.actions\.([A-Za-z0-9_-]+)\s*=/g)) definitions.add(name);
  }
  const missingHandlers = [...triggers].filter((name) => !definitions.has(name)).sort();
  assert.deepEqual(missingHandlers, [], 'every data-act/change/input trigger must have an A.actions handler');

  const apiSource = FRONTEND.find((file) => file.name === 'api.js').source;
  const exportsBlock = apiSource.slice(apiSource.indexOf('window.NXApi = {'));
  const exported = new Set([
    ...uniqueMatches(exportsBlock, /\b([A-Za-z0-9_]+)\s*:/g),
    ...uniqueMatches(exportsBlock, /\b([A-Za-z0-9_]+)\s*,/g)
  ]);
  const called = new Set();
  for (const file of FRONTEND) {
    if (file.name === 'api.js') continue;
    for (const name of uniqueMatches(file.source, /\bNXApi\.([A-Za-z0-9_]+)\s*\(/g)) called.add(name);
  }
  const missingMethods = [...called].filter((name) => !exported.has(name)).sort();
  assert.deepEqual(missingMethods, [], 'every NXApi method called by the UI must be exported');

  const appSource = FRONTEND.find((file) => file.name === 'app.js').source;
  const viewDefinitions = new Set();
  for (const file of FRONTEND) {
    for (const name of uniqueMatches(file.source, /\bA\.views\.([A-Za-z0-9_-]+)\s*=/g)) viewDefinitions.add(name);
  }
  const navIds = new Set();
  const navBlock = appSource.slice(appSource.indexOf('A.nav = ['), appSource.indexOf('A.pagePermissions'));
  for (const name of uniqueMatches(navBlock, /id:\s*'([a-z-]+)'/g)) navIds.add(name);
  const missingViews = [...navIds].filter((name) => !viewDefinitions.has(name)).sort();
  assert.deepEqual(missingViews, [], 'every navigation page must have a view renderer');
  assert.ok(triggers.size >= 90 && definitions.size >= 90, `expected full action coverage, got ${triggers.size}/${definitions.size}`);
});

test('system: every frontend route renders in a real DOM without errors', async () => {
  const html = fs.readFileSync(path.join(root, 'interface/index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'http://localhost:4000/', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  try {
    for (const file of FRONTEND) window.eval(file.source);

    const App = window.App;
    const NX = window.NX;
    assert.ok(App && NX, 'frontend must expose App and NX globals');
    assert.equal(Object.prototype.toString.call(NX), '[object Object]');
    assert.equal(window.NX, NX, 'bootstrap must never replace the NX object');

    App.config = { demoMode: true };
    App.applyIdentity(
      { employeeId: 'e1', role: 'owner', id: 'e1' },
      { businessId: NX.business.id, role: 'owner' },
      PERMISSIONS
    );
    App.signedIn = true;
    App.renderShell();

    const routes = [];
    for (const page of Object.keys(App.views)) routes.push(`#/${page}`);
    for (const special of [
      '#/inbox/v1', '#/customers/c/c1', '#/sales/activities', '#/sales/reports',
      '#/orders/o/ORD-10473', '#/inventory/movements', '#/inventory/suppliers',
      '#/inventory/requests', '#/inventory/p/p1', '#/finance/payments',
      '#/finance/expenses', '#/finance/summary', '#/finance/invoices/INV-2048',
      '#/employees/departments', '#/employees/roles', '#/automation/history',
      '#/automation/w/w2', '#/automation/new', '#/agents/approvals',
      '#/agents/history', '#/agents/a/a1', '#/analytics/communication',
      '#/analytics/people', '#/settings/notifications', '#/settings/security',
      '#/settings/apps', '#/settings/audit', '#/settings/data', '#/settings/appearance'
    ]) routes.push(special);

    const rendered = [];
    for (const route of routes) {
      window.location.hash = route;
      App.render();
      const content = window.document.getElementById('content');
      assert.ok(content && content.innerHTML.length > 50, `${route} rendered empty content`);
      assert.ok(!/undefined|\[object Object\]/.test(content.innerHTML.slice(0, 4000)), `${route} rendered broken values`);
      rendered.push(route);
    }

    for (const mode of ['login', 'register', 'forgot', 'reset']) {
      window.location.hash = `#/auth/${mode}`;
      App.signedIn = false;
      App.config = { demoMode: true };
      App.render();
      const authContent = window.document.getElementById('root').innerHTML;
      assert.ok(authContent.length > 100, `auth/${mode} rendered empty content`);
      assert.ok(authContent.includes('Nexora') || authContent.includes('Sign') || authContent.includes('password'), `auth/${mode} rendered unexpected content`);
    }

    assert.ok(rendered.length >= 40, `expected broad route coverage, rendered ${rendered.length}`);
  } finally {
    dom.window.close();
  }
});
