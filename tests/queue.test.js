import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, api, login } from './helpers.js';

test('background jobs execute workflows with durable status', async (t) => {
  const env = await startTestApp();
  t.after(env.cleanup);

  const session = await login(env.base);
  const f = env.fixtures;
  const queued = await api(env.base, `/workflows/${f.workflowId}/test`, {
    method: 'POST',
    token: session.token,
    body: { payload: { conversationId: f.conversationId, channel: 'WhatsApp', category: 'Order enquiry' } }
  });
  assert.equal(queued.status, 202);
  assert.equal(queued.body.data.status, 'queued');

  const jobsBefore = await api(env.base, '/jobs', { token: session.token });
  assert.ok(jobsBefore.body.data.data.some((job) => job.id === queued.body.data.id && job.status === 'queued'));

  const processed = await env.app.queue.runOnce();
  assert.ok(processed >= 1);

  const jobsAfter = await api(env.base, '/jobs', { token: session.token });
  const job = jobsAfter.body.data.data.find((item) => item.id === queued.body.data.id);
  assert.equal(job.status, 'succeeded');

  const executions = await api(env.base, `/workflow-executions?workflowId=${f.workflowId}`, { token: session.token });
  const execution = executions.body.data.data.find((item) => item.jobId === queued.body.data.id);
  assert.ok(execution);
  assert.equal(execution.result, 'Success');
});
