import test from 'node:test';
import assert from 'node:assert/strict';
import { assertProductionConfig, runtimeConfig, getSessionSecret, getWebhookSecret, getEncryptionKey } from '../dist/core/config.js';
import { createApp } from '../dist/app.js';

const VALID_PRODUCTION_ENV = {
  NODE_ENV: 'production',
  DATA_STORE: 'postgres',
  DATABASE_URL: 'postgres://nexora:secret@127.0.0.1:5432/nexora',
  QUEUE_DRIVER: 'redis',
  REDIS_URL: 'redis://127.0.0.1:6379',
  SMTP_URL: 'smtp://user:secret@smtp.example.test:587',
  CORS_ORIGIN: 'https://app.example.test',
  PUBLIC_URL: 'https://app.example.test',
  SESSION_SECRET: 'a-unique-session-secret-that-is-long-enough',
  WEBHOOK_SECRET: 'a-unique-webhook-secret-long-enough',
  FILE_ENCRYPTION_KEY: 'a-unique-file-encryption-key-long-enough'
};

function withEnv(values, run) {
  const keys = [...new Set([...Object.keys(values), ...Object.keys(VALID_PRODUCTION_ENV)])];
  const saved = new Map(keys.map((key) => [key, process.env[key]]));
  try {
    for (const key of keys) {
      if (values[key] === undefined) delete process.env[key];
      else process.env[key] = values[key];
    }
    return run();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('production configuration fails fast on every missing prerequisite', async (t) => {
  withEnv(VALID_PRODUCTION_ENV, () => {
    assert.doesNotThrow(() => assertProductionConfig());
    assert.equal(process.env.REQUIRE_HTTPS, 'true');
    assert.equal(process.env.SEED_DEMO, 'false');
    const config = runtimeConfig();
    assert.equal(config.production, true);
    assert.equal(config.demoMode, false);
    assert.equal(config.dataStore, 'postgres');
    assert.equal(config.queueDriver, 'redis');
    assert.equal(config.requireHttps, true);
    assert.ok(config.smtpConfigured && config.redisConfigured);
  });

  const cases = [
    ['DATA_STORE', 'production requires DATA_STORE=postgres'],
    ['DATABASE_URL', 'production requires a valid DATABASE_URL'],
    ['QUEUE_DRIVER', 'production requires QUEUE_DRIVER=redis'],
    ['REDIS_URL', 'production requires a valid REDIS_URL'],
    ['SMTP_URL', 'production requires SMTP_URL'],
    ['CORS_ORIGIN', 'production requires CORS_ORIGIN'],
    ['PUBLIC_URL', 'production requires PUBLIC_URL'],
    ['SESSION_SECRET', 'SESSION_SECRET must be set'],
    ['WEBHOOK_SECRET', 'WEBHOOK_SECRET must be set'],
    ['FILE_ENCRYPTION_KEY', 'FILE_ENCRYPTION_KEY must be set']
  ];
  for (const [missing, message] of cases) {
    const env = { ...VALID_PRODUCTION_ENV };
    delete env[missing];
    withEnv(env, () => {
      assert.throws(() => assertProductionConfig(), new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    });
  }
});

test('production rejects demo secrets and demo data flags', async () => {
  for (const [key, value] of [
    ['SESSION_SECRET', 'nexora-development-secret'],
    ['WEBHOOK_SECRET', 'changeme'],
    ['FILE_ENCRYPTION_KEY', 'demo']
  ]) {
    withEnv({ ...VALID_PRODUCTION_ENV, [key]: value }, () => {
      assert.throws(() => assertProductionConfig(), new RegExp(`${key} must be set`));
    });
  }
  withEnv({ ...VALID_PRODUCTION_ENV, REQUIRE_HTTPS: 'false', SEED_DEMO: 'true' }, () => {
    assert.doesNotThrow(() => assertProductionConfig());
    assert.equal(process.env.REQUIRE_HTTPS, 'true');
    assert.equal(process.env.SEED_DEMO, 'false');
  });
});

test('production secrets resolve only from validated configuration', async () => {
  withEnv(VALID_PRODUCTION_ENV, () => {
    assert.equal(getSessionSecret(), VALID_PRODUCTION_ENV.SESSION_SECRET);
    assert.equal(getWebhookSecret(), VALID_PRODUCTION_ENV.WEBHOOK_SECRET);
    assert.equal(getEncryptionKey(), VALID_PRODUCTION_ENV.FILE_ENCRYPTION_KEY);
  });
});

test('createApp refuses to start in production without real backing services', async () => {
  const keys = Object.keys(VALID_PRODUCTION_ENV);
  const saved = new Map(keys.map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries({ ...VALID_PRODUCTION_ENV, DATA_STORE: 'file' })) process.env[key] = value;
    await assert.rejects(() => createApp(), /production requires DATA_STORE=postgres/);
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
