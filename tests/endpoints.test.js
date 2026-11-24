import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, api, login } from './helpers.js';

test('SRS v2 endpoint surface: sessions, notes, merges, reminders and preferences', async (t) => {
  const env = await startTestApp();
  t.after(env.cleanup);
  const session = await login(env.base);
  const token = session.token;

  /* Internal notes and drafts are tenant-scoped conversation state. */
  const note = await api(env.base, '/conversations/v1/notes', {
    method: 'POST', token, body: { text: 'Customer prefers a morning delivery slot.' }
  });
  assert.equal(note.status, 201);
  assert.equal(note.body.data.conversationId, 'v1');
  assert.equal(note.body.data.text, 'Customer prefers a morning delivery slot.');
  assert.equal(note.body.data.authorId, session.user.employeeId);
  assert.equal(note.body.data.businessId, session.businessId);
  assert.ok(note.body.data.id);

  const draftSaved = await api(env.base, '/conversations/v1/drafts', {
    method: 'POST', token, body: { text: 'Draft reply for the owner to review.' }
  });
  assert.equal(draftSaved.status, 200);
  assert.equal(draftSaved.body.data.draft, 'Draft reply for the owner to review.');
  const draftCleared = await api(env.base, '/conversations/v1/drafts', {
    method: 'POST', token, body: { text: null }
  });
  assert.equal(draftCleared.status, 200);
  assert.equal(draftCleared.body.data.draft, null);

  /* Customer merge moves references, merges tags and redacts the duplicate. */
  const sourceOrder = await api(env.base, '/orders', {
    method: 'POST', token, body: { customer: 'c9', items: [['p1', 1]], channel: 'webchat' }
  });
  assert.equal(sourceOrder.status, 201);
  const merge = await api(env.base, '/customers/c1/merge', {
    method: 'POST', token, body: { sourceId: 'c9' }, headers: { 'idempotency-key': 'merge-c9-into-c1' }
  });
  assert.equal(merge.status, 200);
  assert.equal(merge.body.data.mergedSourceId, 'c9');
  assert.ok(merge.body.data.reassigned.orders >= 1);
  assert.ok(merge.body.data.customer.tags.includes('Retail'));
  assert.equal(new Set(merge.body.data.customer.tags).size, merge.body.data.customer.tags.length);
  const movedOrder = await api(env.base, `/orders/${sourceOrder.body.data.id}`, { token });
  assert.equal(movedOrder.body.data.customer, 'c1');
  const redactedSource = await api(env.base, '/customers/c9', { token });
  assert.equal(redactedSource.body.data.status, 'deleted');
  assert.equal(redactedSource.body.data.name, '[redacted]');
  const allOrders = await api(env.base, '/orders?pageSize=200', { token });
  const keptOrders = allOrders.body.data.data.filter((order) => order.customer === 'c1');
  assert.equal(merge.body.data.customer.orders, keptOrders.length);
  assert.equal(merge.body.data.customer.value, keptOrders.reduce((sum, order) => sum + Number(order.total || 0), 0));
  const mergeAudit = await api(env.base, '/audit-logs?q=Merged%20customer', { token });
  assert.ok(mergeAudit.body.data.data.some((log) => log.meta?.sourceId === 'c9' && log.meta?.targetId === 'c1'));

  /* Invoice reminder goes through a channel adapter and leaves a delivery trail. */
  const reminder = await api(env.base, '/invoices/INV-2610/reminder', {
    method: 'POST', token, body: { channel: 'email', message: 'Kindly settle the outstanding invoice.' }
  });
  assert.equal(reminder.status, 202);
  assert.equal(reminder.body.data.sent, true);
  assert.ok(reminder.body.data.providerResult.providerMessageId);
  assert.equal(reminder.body.data.invoice.history.at(-1).action, 'Reminder sent via email');
  const bootstrap = await api(env.base, '/bootstrap', { token });
  const owner = bootstrap.body.data.employees.find((employee) => employee.role === 'owner');
  const reminderNotification = bootstrap.body.data.notifications.find((item) => item.title === 'Invoice reminder sent for INV-2610');
  assert.ok(reminderNotification);
  assert.equal(reminderNotification.recipientId, owner.id);
  assert.ok(bootstrap.body.data.conversationNotes.some((item) => item.id === note.body.data.id));
  assert.ok(bootstrap.body.data.workflowTriggers.length > 0);

  /* Invitations can be resent with a newly generated temporary password. */
  const invited = await api(env.base, '/employees/invite', {
    method: 'POST', token,
    body: { name: 'Resend Check', email: 'resend.check@example.test', role: 'sales' }
  });
  assert.equal(invited.status, 201);
  const resent = await api(env.base, `/employees/${invited.body.data.id}/invite/resend`, {
    method: 'POST', token, body: { email: 'resend.check@example.test' }
  });
  assert.equal(resent.status, 200);
  assert.equal(resent.body.data.id, invited.body.data.id);
  assert.ok(resent.body.data.temporaryPassword);
  assert.notEqual(resent.body.data.temporaryPassword, invited.body.data.temporaryPassword);
  const resendAudit = await api(env.base, '/audit-logs?q=Resent', { token });
  assert.ok(resendAudit.body.data.data.some((log) => log.resource === invited.body.data.id));

  /* Workflow trigger CRUD is available through the generic resource surface. */
  const triggers = await api(env.base, '/workflow-triggers', { token });
  assert.equal(triggers.status, 200);
  assert.ok(triggers.body.data.data.some((item) => item.workflowId === 'w2'));
  const trigger = await api(env.base, '/workflow-triggers', {
    method: 'POST', token, body: { workflowId: 'w2', trigger: 'manual.test', label: 'Manual dry run' }
  });
  assert.equal(trigger.status, 201);
  const triggerUpdate = await api(env.base, `/workflow-triggers/${trigger.body.data.id}`, {
    method: 'PATCH', token, body: { label: 'Updated dry run' }
  });
  assert.equal(triggerUpdate.status, 200);
  assert.equal(triggerUpdate.body.data.label, 'Updated dry run');

  /* Dry runs evaluate conditions without queueing a job or applying actions. */
  const before = await api(env.base, '/workflow-executions?pageSize=200', { token });
  const dryRunBody = {
    trigger: 'message.received',
    conditions: [{ field: 'channel', operator: 'equals', value: 'whatsapp' }],
    actions: [{ type: 'notify', title: 'Preview only' }],
    payload: { channel: 'whatsapp' }
  };
  const dryMatch = await api(env.base, '/workflows/w2/dry-run', { method: 'POST', token, body: dryRunBody });
  assert.equal(dryMatch.status, 200);
  assert.equal(dryMatch.body.data.matched, true);
  assert.equal(dryMatch.body.data.wouldEnqueue, true);
  assert.deepEqual(dryMatch.body.data.actions, dryRunBody.actions);
  assert.deepEqual(dryMatch.body.data.results[0], {
    field: 'channel', operator: 'equals', expected: 'whatsapp', actual: 'whatsapp', passed: true
  });
  const dryMiss = await api(env.base, '/workflows/w2/dry-run', {
    method: 'POST', token,
    body: { ...dryRunBody, conditions: [{ field: 'channel', operator: 'equals', value: 'email' }] }
  });
  assert.equal(dryMiss.status, 200);
  assert.equal(dryMiss.body.data.matched, false);
  assert.equal(dryMiss.body.data.wouldEnqueue, false);
  assert.equal(dryMiss.body.data.results[0].passed, false);
  const after = await api(env.base, '/workflow-executions?pageSize=200', { token });
  assert.equal(after.body.data.data.length, before.body.data.data.length);

  /* Notification preferences live on the business and appear in bootstrap. */
  const defaults = await api(env.base, '/notifications/preferences', { token });
  assert.equal(defaults.status, 200);
  assert.deepEqual(defaults.body.data, {
    inApp: true, desktop: true, email: false, assignment: true, stock: true, approval: true, workflowFailure: true
  });
  const preferences = await api(env.base, '/notifications/preferences', {
    method: 'PUT', token, body: { email: true, stock: false }
  });
  assert.equal(preferences.status, 200);
  assert.equal(preferences.body.data.email, true);
  assert.equal(preferences.body.data.stock, false);
  assert.equal(preferences.body.data.desktop, true);
  const bootAfterPreferences = await api(env.base, '/bootstrap', { token });
  assert.equal(bootAfterPreferences.body.data.notificationPreferences.email, true);
  assert.equal(bootAfterPreferences.body.data.notificationPreferences.stock, false);

  /* Business profile accepts the tax identification number used by settings. */
  const business = await api(env.base, '/businesses/current', {
    method: 'PATCH', token, body: { tin: 'TIN-REDACTED', registrationNumber: 'RN-001' }
  });
  assert.equal(business.status, 200);
  assert.equal(business.body.data.tin, 'TIN-REDACTED');
  assert.equal(business.body.data.registrationNumber, 'RN-001');

  /* Password change keeps the current session and revokes the other ones. */
  const otherSession = await login(env.base);
  const changed = await api(env.base, '/auth/password/change', {
    method: 'POST', token, body: { currentPassword: 'redacted-password', newPassword: 'redacted-password' }
  });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.data.message, 'Password updated');
  const currentStillValid = await api(env.base, '/auth/me', { token });
  assert.equal(currentStillValid.status, 200);
  const otherRevoked = await api(env.base, '/auth/me', { token: otherSession.token });
  assert.equal(otherRevoked.status, 401);
  const oldPassword = await api(env.base, '/auth/login', {
    method: 'POST', body: { email: 'owner@example.test', password: 'redacted-password' }
  });
  assert.equal(oldPassword.status, 401);
  const newSession = await login(env.base, 'owner@example.test', 'redacted-password');
  const shortPassword = await api(env.base, '/auth/password/change', {
    method: 'POST', token: newSession.token, body: { currentPassword: 'redacted-password', newPassword: 'short' }
  });
  assert.equal(shortPassword.status, 400);

  /* Logout revokes only the token that was used to sign out. */
  const logout = await api(env.base, '/auth/logout', { method: 'POST', token: newSession.token });
  assert.equal(logout.status, 200);
  assert.equal(logout.body.data.message, 'Signed out');
  const afterLogout = await api(env.base, '/auth/me', { token: newSession.token });
  assert.equal(afterLogout.status, 401);
  assert.equal((await api(env.base, '/auth/me', { token })).status, 200);
});
