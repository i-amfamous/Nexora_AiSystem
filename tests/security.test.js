import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { WebSocket } from 'ws';
import { startTestApp, api, login } from './helpers.js';

test('signed webhooks, realtime events, AI approvals and audit trail', async (t) => {
  const env = await startTestApp({
    env: { WEBHOOK_SECRET: 'test-webhook-secret', WEBHOOK_SECRET_WHATSAPP: 'test-webhook-secret' }
  });
  t.after(env.cleanup);

  const session = await login(env.base);
  const timestamp = String(Date.now());
  const raw = JSON.stringify({
    businessId: session.businessId,
    entry: [{
      changes: [{
        value: {
          messages: [{
            id: 'msg_inbound_001',
            from: '+233244000111',
            name: 'Test Customer',
            text: 'Do you have A4 paper in stock?',
            timestamp: timestamp
          }]
        }
      }]
    }]
  });
  const signature = createHmac('sha256', 'test-webhook-secret').update(`${timestamp}.${raw}`).digest('hex');
  const webhookHeaders = {
    'content-type': 'application/json',
    'x-nexora-timestamp': timestamp,
    'x-nexora-nonce': 'nonce-001',
    'x-nexora-signature': signature
  };
  const firstWebhook = await fetch(`${env.base}/webhooks/whatsapp`, {
    method: 'POST',
    headers: webhookHeaders,
    body: raw
  });
  assert.equal(firstWebhook.status, 201);
  const webhookResult = await firstWebhook.json();
  assert.equal(webhookResult.data.received, true);

  const replay = await fetch(`${env.base}/webhooks/whatsapp`, {
    method: 'POST',
    headers: webhookHeaders,
    body: raw
  });
  assert.equal(replay.status, 409);

  const socket = new WebSocket(`${env.wsBase}?token=${encodeURIComponent(session.token)}`);
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  const eventPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for realtime event')), 3000);
    socket.on('message', (data) => {
      const message = JSON.parse(String(data));
      if (message.type === 'message.created') {
        clearTimeout(timeout);
        resolve(message);
      }
    });
  });
  const reply = await api(env.base, `/conversations/${env.fixtures.conversationId}/reply`, {
    method: 'POST',
    token: session.token,
    body: { text: 'We have checked the current stock for you.' }
  });
  assert.equal(reply.status, 201);
  const realtime = await eventPromise;
  assert.equal(realtime.businessId, session.businessId);
  assert.equal(realtime.payload.conversationId, env.fixtures.conversationId);
  socket.close();

  const run = await api(env.base, '/agents/inventory/run', {
    method: 'POST',
    token: session.token,
    body: { prompt: 'Stock is low. Prepare a purchase request for A4 paper.', reason: 'Security test' }
  });
  assert.equal(run.status, 201);
  assert.ok(run.body.data.approvalId, 'A sensitive agent action must require approval');
  assert.equal(run.body.data.status, 'Awaiting approval');

  const decision = await api(env.base, `/approvals/${run.body.data.approvalId}/decide`, {
    method: 'POST',
    token: session.token,
    body: { decision: 'approve', note: 'Reviewed by workspace owner' }
  });
  assert.equal(decision.status, 200);
  assert.equal(decision.body.data.status, 'Approved');

  const audit = await api(env.base, '/audit-logs?q=Approved%20ai%20action', { token: session.token });
  assert.equal(audit.status, 200);
  assert.ok(audit.body.data.data.length > 0);

  const execution = await api(env.base, `/agent-executions/${run.body.data.id}`, { token: session.token });
  assert.equal(execution.status, 200);
  assert.equal(execution.body.data.status, 'Approved');
});
