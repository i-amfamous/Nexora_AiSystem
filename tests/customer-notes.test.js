import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FileStore } from '../dist/core/store.js';
import { CustomerNotesModule } from '../dist/modules/customer-notes.js';
import { createFixtures, insertFixtures } from './fixtures.js';

test('internal customer notes are tenant scoped and audited', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexora-notes-'));
  const store = new FileStore(path.join(dir, 'data.json'));
  await store.init();
  t.after(async () => {
    await store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const fixtures = createFixtures();
  await insertFixtures(store, fixtures, ['customers']);
  const ctx = {
    userId: fixtures.ownerUserId,
    employeeId: fixtures.ownerEmployeeId,
    businessId: fixtures.businessId,
    role: 'owner',
    sessionId: 's_test',
    ip: '127.0.0.1',
    userAgent: 'test'
  };
  const notes = new CustomerNotesModule(store);
  const created = await notes.add(ctx, fixtures.customerId, 'Prefers delivery before 10:00.');
  assert.equal(created.customerId, fixtures.customerId);
  assert.equal(created.visibility, 'internal');
  assert.equal(created.authorId, fixtures.ownerEmployeeId);

  const listed = await notes.list(ctx, fixtures.customerId);
  assert.ok(listed.some((note) => note.id === created.id));

  const audit = await store.list('auditLogs', (entry) => String(entry.action) === 'Added internal customer note', ctx);
  assert.equal(audit.length, 1);

  await assert.rejects(() => notes.list({ ...ctx, businessId: 'ws_other' }, fixtures.customerId), /Customer not found/);
});
