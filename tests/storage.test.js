import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FileStore } from '../dist/core/store.js';
import { StorageService } from '../dist/core/storage.js';

test('file attachments are encrypted at rest and scoped to the workspace', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexora-storage-'));
  process.env.FILE_ENCRYPTION_KEY = 'test-file-encryption-key';
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
  const storage = new StorageService(store, path.join(dir, 'files'));
  const plaintext = 'confidential customer attachment: 0244001122';
  const stored = await storage.put(ctx, {
    name: 'note.txt',
    mimeType: 'text/plain',
    data: Buffer.from(plaintext, 'utf8'),
    conversationId: 'v1'
  });

  const onDisk = fs.readFileSync(String(stored.path));
  assert.equal(onDisk.includes(Buffer.from(plaintext, 'utf8')), false);
  const roundtrip = await storage.get(ctx, String(stored.id));
  assert.equal(roundtrip.data.toString('utf8'), plaintext);
  assert.equal(roundtrip.record.name, 'note.txt');

  const otherCtx = { ...ctx, businessId: 'ws_other' };
  await assert.rejects(() => storage.get(otherCtx, String(stored.id)), /File not found/);
});
