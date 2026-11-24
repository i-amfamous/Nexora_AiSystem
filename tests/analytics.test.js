import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FileStore } from '../dist/core/store.js';
import { AnalyticsModule } from '../dist/modules/analytics.js';

test('CSV exports are generated from authoritative tenant records', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexora-analytics-'));
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
  const analytics = new AnalyticsModule(store, { run: async () => ({ response: '' }) });

  const customers = await analytics.exportDataset(ctx, 'customers');
  assert.equal(customers.filename, 'nexora-customers.csv');
  assert.match(customers.body, /^"Customer ID"/);
  assert.ok(customers.body.split('\n').length > 1, 'expected seeded customer rows');

  const inventory = await analytics.exportDataset(ctx, 'inventory');
  assert.match(inventory.body, /"SKU"/);
  assert.ok(inventory.body.split('\n').length > 1, 'expected seeded product rows');

  await assert.rejects(() => analytics.exportDataset(ctx, 'unknown'), /CSV dataset not found/);
});
