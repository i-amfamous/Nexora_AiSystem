import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, api, login } from './helpers.js';

test('API v1 auth, tenant isolation, RBAC and idempotency', async (t) => {
  const env = await startTestApp();
  t.after(env.cleanup);

  const health = await api(env.base, '/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.data.status, 'ok');

  const unauthenticated = await api(env.base, '/customers');
  assert.equal(unauthenticated.status, 401);
  assert.equal(unauthenticated.body.error.code, 'UNAUTHENTICATED');

  const session = await login(env.base);
  assert.equal(session.user.email, 'owner@example.test');
  assert.equal(session.businessId, 'ws_REDACTED');

  const me = await api(env.base, '/auth/me', { token: session.token });
  assert.equal(me.status, 200);
  assert.equal(me.body.data.context.role, 'owner');
  assert.ok(me.body.data.permissions.includes('orders:create'));

  const bootstrap = await api(env.base, '/bootstrap', { token: session.token });
  assert.equal(bootstrap.status, 200);
  assert.ok(bootstrap.body.data.employees.length > 0);
  assert.ok(bootstrap.body.data.agents.length >= 6);
  assert.ok(bootstrap.body.data.conversations.length > 0);

  const customer = bootstrap.body.data.customers.find((item) => item.id) || {};
  const product = bootstrap.body.data.products.find((item) => Number(item.stock) >= 2) || bootstrap.body.data.products[0];
  const orderBody = { customer: customer.id, items: [[product.id, 1]], channel: 'webchat' };
  const idempotencyHeaders = { 'idempotency-key': 'test-order-1' };
  const firstOrder = await api(env.base, '/orders', { method: 'POST', token: session.token, body: orderBody, headers: idempotencyHeaders });
  const secondOrder = await api(env.base, '/orders', { method: 'POST', token: session.token, body: orderBody, headers: idempotencyHeaders });
  assert.equal(firstOrder.status, 201);
  assert.equal(secondOrder.status, 201);
  assert.equal(firstOrder.body.data.id, secondOrder.body.data.id);

  const other = await api(env.base, '/auth/register', {
    method: 'POST',
    body: {
      businessName: 'Second Workspace Ltd',
      name: 'Ama Mensah',
      email: 'ama@secondworkspace.test',
      phone: '+233 30 000 0000',
      password: 'redacted-password',
      currency: 'GHS',
      timezone: 'Africa/Accra'
    }
  });
  assert.equal(other.status, 201);
  const otherToken = other.body.data.token;
  assert.notEqual(other.body.data.businessId, session.businessId);

  const crossTenantRead = await api(env.base, '/customers/c1', { token: otherToken });
  assert.equal(crossTenantRead.status, 404);

  const crossTenantList = await api(env.base, '/customers', { token: otherToken });
  assert.equal(crossTenantList.status, 200);
  assert.equal(crossTenantList.body.data.data.some((item) => item.id === 'c1'), false);

  const invite = await api(env.base, '/employees/invite', {
    method: 'POST',
    token: session.token,
    body: { name: 'Test Finance', email: 'finance.role@example.test', role: 'finance', department: 'd5' }
  });
  assert.equal(invite.status, 201);
  const invitedId = invite.body.data.id;
  const temporaryPassword = invite.body.data.temporaryPassword;
  assert.ok(temporaryPassword);

  const activate = await api(env.base, `/employees/${invitedId}/deactivate`, {
    method: 'POST',
    token: session.token,
    body: { active: true }
  });
  assert.equal(activate.status, 200);

  const finance = await login(env.base, 'finance.role@example.test', temporaryPassword);
  const forbiddenInvite = await api(env.base, '/employees/invite', {
    method: 'POST',
    token: finance.token,
    body: { name: 'Should Fail', email: 'should.fail@example.test', role: 'sales' }
  });
  assert.equal(forbiddenInvite.status, 403);
  assert.equal(forbiddenInvite.body.error.code, 'FORBIDDEN');

  const financeCustomers = await api(env.base, '/customers', { token: finance.token });
  assert.equal(financeCustomers.status, 200);
});
