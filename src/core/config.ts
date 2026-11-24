/** Central runtime configuration and production fail-fast checks.
 *
 * Development keeps the zero-setup demo defaults. Production refuses to start
 * unless the real backing services and secrets are configured, so a demo store
 * or placeholder secret can never silently reach a live environment.
 */

const PLACEHOLDERS = new Set([
  'replace-with-a-long-random-secret',
  'replace-with-provider-webhook-secret',
  'nexora-development-secret',
  'demo',
  'changeme'
]);

export interface RuntimeConfig {
  production: boolean;
  dataStore: 'file' | 'postgres';
  queueDriver: 'memory' | 'redis';
  requireHttps: boolean;
  demoMode: boolean;
  publicUrl: string;
  apiBaseUrl: string;
  smtpConfigured: boolean;
  redisConfigured: boolean;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function requiredSecret(name: string, minLength: number): string {
  const value = String(process.env[name] || '').trim();
  if (!value || PLACEHOLDERS.has(value.toLowerCase()) || value.length < minLength) {
    throw new Error(`[Nexora] ${name} must be set to a unique value of at least ${minLength} characters in production`);
  }
  return value;
}

export function getSessionSecret(): string {
  if (isProduction()) return requiredSecret('SESSION_SECRET', 32);
  return String(process.env.SESSION_SECRET || 'nexora-development-secret');
}

export function getWebhookSecret(): string {
  if (isProduction()) return requiredSecret('WEBHOOK_SECRET', 24);
  return String(process.env.WEBHOOK_SECRET || '');
}

export function getEncryptionKey(): string {
  if (isProduction()) return requiredSecret('FILE_ENCRYPTION_KEY', 32);
  return String(process.env.FILE_ENCRYPTION_KEY || process.env.INTEGRATION_ENCRYPTION_KEY || 'nexora-development-integration-key');
}

export function assertProductionConfig(): void {
  if (!isProduction()) return;

  if (process.env.DATA_STORE !== 'postgres') {
    throw new Error('[Nexora] production requires DATA_STORE=postgres with DATABASE_URL');
  }
  if (!String(process.env.DATABASE_URL || '').startsWith('postgres')) {
    throw new Error('[Nexora] production requires a valid DATABASE_URL');
  }
  if (process.env.QUEUE_DRIVER !== 'redis') {
    throw new Error('[Nexora] production requires QUEUE_DRIVER=redis with REDIS_URL');
  }
  if (!String(process.env.REDIS_URL || '').startsWith('redis')) {
    throw new Error('[Nexora] production requires a valid REDIS_URL');
  }
  if (!String(process.env.SMTP_URL || '').startsWith('smtp')) {
    throw new Error('[Nexora] production requires SMTP_URL for password resets and invitations');
  }
  if (!String(process.env.CORS_ORIGIN || process.env.ALLOWED_ORIGINS || '')) {
    throw new Error('[Nexora] production requires CORS_ORIGIN to be set to the public web origin');
  }
  if (!String(process.env.PUBLIC_URL || '')) {
    throw new Error('[Nexora] production requires PUBLIC_URL');
  }

  requiredSecret('SESSION_SECRET', 32);
  requiredSecret('WEBHOOK_SECRET', 24);
  requiredSecret('FILE_ENCRYPTION_KEY', 32);

  // Security headers and redirects are non-optional in production.
  process.env.REQUIRE_HTTPS = 'true';
  process.env.SEED_DEMO = 'false';
}

export function runtimeConfig(): RuntimeConfig {
  const production = isProduction();
  return {
    production,
    dataStore: process.env.DATA_STORE === 'postgres' ? 'postgres' : 'file',
    queueDriver: process.env.QUEUE_DRIVER === 'redis' ? 'redis' : 'memory',
    requireHttps: process.env.REQUIRE_HTTPS === 'true',
    demoMode: !production,
    publicUrl: String(process.env.PUBLIC_URL || 'http://localhost:4000'),
    apiBaseUrl: String(process.env.API_BASE_URL || 'http://localhost:4000'),
    smtpConfigured: Boolean(process.env.SMTP_URL),
    redisConfigured: Boolean(process.env.REDIS_URL)
  };
}
