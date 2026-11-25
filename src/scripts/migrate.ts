import '../core/env.js';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = new Set(process.argv.slice(2));
const printOnly = args.has('--print');
const checkOnly = args.has('--check');
const schemaPath = path.resolve(process.cwd(), 'db/schema.sql');

if (!fs.existsSync(schemaPath)) {
  console.error(`[Nexora] Migration file not found: ${schemaPath}`);
  process.exit(1);
}

const sql = fs.readFileSync(schemaPath, 'utf8');

if (checkOnly) {
  const required = ['CREATE TABLE IF NOT EXISTS public.businesses', 'ENABLE ROW LEVEL SECURITY', 'audit_logs', 'CREATE OR REPLACE FUNCTION'];
  const missing = required.filter((token) => !sql.includes(token));
  if (missing.length) {
    console.error(`[Nexora] Schema check failed. Missing: ${missing.join(', ')}`);
    process.exit(1);
  }
  console.log(`[Nexora] Schema check passed (${sql.split('\n').length} lines).`);
  process.exit(0);
}

if (printOnly || !process.env.DATABASE_URL) {
  if (!process.env.DATABASE_URL) console.error('[Nexora] DATABASE_URL is not set; printing SQL instead of applying it.');
  process.stdout.write(sql);
  process.exit(0);
}

let url: URL;
try {
  url = new URL(process.env.DATABASE_URL);
} catch {
  console.error('[Nexora] DATABASE_URL is not a valid PostgreSQL URL.');
  process.exit(1);
}

const env: Record<string, string> = { ...process.env } as Record<string, string>;
env.PGHOST = decodeURIComponent(url.hostname);
env.PGPORT = url.port || '5432';
env.PGUSER = decodeURIComponent(url.username || 'postgres');
env.PGDATABASE = decodeURIComponent(url.pathname.replace(/^\//, '')) || 'nexora';
if (url.password) env.PGPASSWORD = decodeURIComponent(url.password);

const result = spawnSync('psql', ['-v', 'ON_ERROR_STOP=1', '-f', schemaPath], { stdio: 'inherit', env });
if (result.error) {
  console.error('[Nexora] psql was not found. Install PostgreSQL client tools or run: npm run migrate -- --print | psql "$DATABASE_URL"');
  process.exit(1);
}
if (result.status !== 0) {
  console.error(`[Nexora] Migration failed with exit code ${result.status}.`);
  process.exit(result.status || 1);
}
console.log('[Nexora] Database schema applied successfully.');
