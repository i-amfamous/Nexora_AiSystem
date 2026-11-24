import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FileStore } from '../dist/core/store.js';
import { CustomerNotesModule } from '../dist/modules/customer-notes.js';

test('internal customer notes are tenant scoped and audited', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexora-notes-'));
  const store = new FileStore(path.join(dir, 'data.json'));
  await store.init();
  t.after(async () => {
    await store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const ctx = {
    userId: 'u_e1',
    employeeId: 'e1',
    businessId: 'ws_REDACTED',
    role: 'owner',
    sessionId: 's_test',
    ip: '127.0.0.1',
    userAgent: 'test'
  };
  const notes = new CustomerNotesModule(store);
  const created = await notes.add(ctx, 'c1', 'Prefers delivery before 10:00.');
  assert.equal(created.customerId, 'c1');
  assert.equal(created.visibility, 'internal');
  assert.equal(created.authorId, 'e1');

  const listed = await notes.list(ctx, 'c1');
  assert.ok(listed.some((note) => note.id === created.id));

  const audit = await store.list('auditLogs', (entry) => String(entry.action) === 'Added internal customer note', ctx);
  assert.equal(audit.length, 1);

  await assert.rejects(() => notes.list({ ...ctx, businessId: 'ws_other' }, 'c1'), /Customer not found/);
});
