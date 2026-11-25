import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, api, login } from './helpers.js';

test('internal customer notes, monitoring and authoritative CSV export', async (t) => {
  const env = await startTestApp();
  t.after(env.cleanup);

  const session = await login(env.base);
  const f = env.fixtures;
  const created = await api(env.base, `/customers/${f.customerId}/notes`, {
    method: 'POST',
    token: session.token,
    body: { text: 'Gate code is on the side entrance.' }
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.customerId, f.customerId);
  assert.equal(created.body.data.visibility, 'internal');

  const listed = await api(env.base, `/customers/${f.customerId}/notes`, { token: session.token });
  assert.equal(listed.status, 200);
  assert.ok(listed.body.data.some((note) => note.id === created.body.data.id));

  const other = await api(env.base, '/auth/register', {
    method: 'POST',
    body: {
      businessName: 'Notes Other Workspace',
      name: 'Another Owner',
      email: `notes.${Date.now()}@example.test`,
      phone: '+233 30 000 0001',
      password: f.newPassword
    }
  });
  const crossTenant = await api(env.base, `/customers/${f.customerId}/notes`, { token: other.body.data.token });
  assert.equal(crossTenant.status, 404);

  const monitoring = await api(env.base, '/monitoring', { token: session.token });
  assert.equal(monitoring.status, 200);
  assert.equal(monitoring.body.data.api.status, 'ok');
  assert.ok(monitoring.body.data.database.adapter);

  const csv = await api(env.base, '/analytics/export/customers', { token: session.token });
  assert.equal(csv.status, 200);
  assert.match(csv.text, /"Customer ID"/);
  assert.ok(!csv.text.includes('Use /analytics'));
});
