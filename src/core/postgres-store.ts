import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Pool, type PoolClient } from 'pg';
import type { BaseRecord, CollectionName, Context } from './types.js';
import type { Database, Store } from './store.js';
import { buildSeed } from './seed.js';
import { errors } from './errors.js';

const ALL_COLLECTIONS: CollectionName[] = [
  'businesses', 'users', 'employees', 'departments', 'roles', 'permissions', 'userRoles', 'rolePermissions',
  'customers', 'customerIdentifiers', 'conversations', 'conversationAssignments', 'conversationNotes', 'customerNotes',
  'messages', 'messageAttachments', 'communicationChannels', 'channelConnections', 'leads', 'salesActivities',
  'orders', 'orderItems', 'products', 'productCategories', 'inventory', 'stockMovements', 'suppliers',
  'purchaseRequests', 'invoices', 'invoiceItems', 'payments', 'expenses', 'expenseCategories',
  'expenseCategoriesSeed', 'tasks', 'workflows', 'workflowTriggers', 'workflowExecutions', 'workflowApprovals',
  'agents', 'agentConfigurations', 'agentPermissions', 'agentExecutions', 'agentToolExecutions',
  'integrations', 'notifications', 'auditLogs', 'fileRecords', 'approvals', 'sessions', 'passwordResets',
  'idempotency', 'jobs', 'webhookNonces', 'metrics'
];

const SEED_ORDER: CollectionName[] = [
  'businesses', 'users', 'permissions', 'roles', 'rolePermissions', 'userRoles', 'departments', 'employees',
  ...ALL_COLLECTIONS.filter((name) => !['businesses', 'users', 'permissions', 'roles', 'rolePermissions', 'userRoles', 'departments', 'employees'].includes(name))
];

const NO_UPDATED_AT = new Set<CollectionName>([
  'passwordResets', 'idempotency', 'webhookNonces', 'messages', 'auditLogs', 'fileRecords'
]);

const NUMERIC_KEYS = new Set([
  'price', 'cost', 'stock', 'threshold', 'total', 'paid', 'amount', 'value', 'qty', 'size',
  'attempts', 'maxAttempts', 'version'
]);

interface TxState { client: PoolClient; depth: number }

function snake(name: string): string {
  return name.replace(/([A-Z])/g, '_$1').toLowerCase();
}

function quote(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function tableFor(collection: CollectionName): string {
  return `public.${quote(snake(collection))}`;
}

function pick(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function text(value: unknown, fallback = ''): string {
  return value === undefined || value === null ? fallback : String(value);
}

function nullable(value: unknown): string | null {
  return value === undefined || value === null ? null : String(value);
}

function boolean(value: unknown, fallback = false): boolean {
  return value === undefined || value === null ? fallback : Boolean(value);
}

function number(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function timestamp(value: unknown, fallback?: string): string | null {
  if (value === undefined || value === null || value === '') return fallback || null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? fallback || null : date.toISOString();
}

function json(value: unknown, fallback: unknown = {}): string {
  try {
    return JSON.stringify(value === undefined ? fallback : value);
  } catch {
    return JSON.stringify(fallback);
  }
}

/** Specialised columns required by the explicit tables in db/schema.sql.
 * Everything else lives in the `data` JSONB column so new business fields do
 * not require a migration. */
function specialisedColumns(collection: CollectionName, record: Record<string, unknown>): Record<string, unknown> {
  const columns: Record<string, unknown> = {};
  switch (collection) {
    case 'businesses':
      columns.name = text(pick(record, 'name'), 'Unnamed workspace');
      break;
    case 'users':
      columns.email = text(pick(record, 'email'));
      columns.employee_id = nullable(pick(record, 'employeeId'));
      columns.password_hash = text(pick(record, 'passwordHash'));
      columns.role = text(pick(record, 'role'), 'member');
      columns.active = boolean(pick(record, 'active'), true);
      break;
    case 'sessions':
      columns.user_id = text(pick(record, 'userId'));
      columns.employee_id = nullable(pick(record, 'employeeId'));
      columns.token_hash = text(pick(record, 'tokenHash'));
      columns.active = boolean(pick(record, 'active'), true);
      columns.expires_at = timestamp(pick(record, 'expiresAt'), new Date(Date.now() + 86_400_000).toISOString());
      columns.ip = nullable(pick(record, 'ip'));
      columns.user_agent = nullable(pick(record, 'userAgent'));
      break;
    case 'passwordResets':
      columns.email = text(pick(record, 'email'));
      columns.user_id = nullable(pick(record, 'userId'));
      columns.token_hash = text(pick(record, 'tokenHash'));
      columns.expires_at = timestamp(pick(record, 'expiresAt'), new Date(Date.now() + 3_600_000).toISOString());
      columns.used_at = timestamp(pick(record, 'usedAt'));
      break;
    case 'idempotency':
      columns.user_id = nullable(pick(record, 'userId'));
      columns.method = text(pick(record, 'method'), 'POST');
      columns.path = text(pick(record, 'path'), '/');
      columns.client_key = text(pick(record, 'clientKey'));
      columns.response = json(pick(record, 'response'), {});
      columns.expires_at = timestamp(pick(record, 'expiresAt'), new Date(Date.now() + 86_400_000).toISOString());
      break;
    case 'jobs':
      columns.type = text(pick(record, 'type'), 'unknown');
      columns.payload = json(pick(record, 'payload'), {});
      columns.context = pick(record, 'context') === undefined ? null : json(pick(record, 'context'), {});
      columns.status = text(pick(record, 'status'), 'queued');
      columns.attempts = number(pick(record, 'attempts'));
      columns.max_attempts = number(pick(record, 'maxAttempts'), 3);
      columns.run_at = timestamp(pick(record, 'runAt'), new Date().toISOString());
      columns.idempotency_key = nullable(pick(record, 'idempotencyKey'));
      columns.last_error = nullable(pick(record, 'lastError'));
      columns.finished_at = timestamp(pick(record, 'finishedAt'));
      break;
    case 'webhookNonces':
      columns.provider = text(pick(record, 'provider'));
      columns.event_id = text(pick(record, 'eventId'));
      break;
    case 'metrics':
      columns.value = json(pick(record, 'value'), []);
      break;
    case 'auditLogs':
      columns.actor_id = nullable(pick(record, 'actorId'));
      columns.actor_type = text(pick(record, 'actorType'), 'Employee');
      columns.action = text(pick(record, 'action'));
      columns.resource = nullable(pick(record, 'resource'));
      columns.result = nullable(pick(record, 'result'));
      columns.approval_id = nullable(pick(record, 'approvalReference') || pick(record, 'approvalId'));
      columns.meta = json(pick(record, 'meta'), {});
      break;
    case 'fileRecords':
      columns.name = text(pick(record, 'name'), 'attachment');
      columns.mime_type = text(pick(record, 'mimeType'), 'application/octet-stream');
      columns.size = number(pick(record, 'size'));
      columns.storage_path = text(pick(record, 'path'));
      columns.uploaded_by = nullable(pick(record, 'uploadedBy') || pick(record, 'authorId'));
      columns.conversation_id = nullable(pick(record, 'conversationId'));
      columns.customer_id = nullable(pick(record, 'customerId'));
      break;
    case 'conversations':
      columns.customer_id = nullable(pick(record, 'customerId') || pick(record, 'cust'));
      columns.channel = text(pick(record, 'channel'), 'webchat');
      columns.status = text(pick(record, 'status'), 'Open');
      columns.priority = nullable(pick(record, 'priority') ?? pick(record, 'prio'));
      columns.category = nullable(pick(record, 'category') ?? pick(record, 'cat'));
      columns.mode = text(pick(record, 'mode'), 'ai');
      columns.assignee = nullable(pick(record, 'assignee') || pick(record, 'handler'));
      columns.unread = boolean(pick(record, 'unread'));
      columns.last_at = timestamp(pick(record, 'lastAt') || pick(record, 'last'));
      break;
    case 'messages':
      columns.conversation_id = nullable(pick(record, 'conversationId'));
      columns.customer_id = nullable(pick(record, 'customerId'));
      columns.channel = text(pick(record, 'channel'), 'webchat');
      columns.external_id = nullable(pick(record, 'externalId'));
      columns.direction = text(pick(record, 'direction') || pick(record, 'dir'), 'inbound');
      columns.text = nullable(pick(record, 'text'));
      columns.sent_by = nullable(pick(record, 'sentBy') || pick(record, 'by'));
      columns.status = nullable(pick(record, 'status'));
      columns.delivery_status = nullable(pick(record, 'deliveryStatus'));
      columns.occurred_at = timestamp(pick(record, 'occurredAt') || pick(record, 'at'), new Date().toISOString())!;
      columns.raw = json(pick(record, 'raw'), {});
      break;
    case 'products':
      columns.sku = text(pick(record, 'sku'));
      columns.name = text(pick(record, 'name'));
      columns.price = number(pick(record, 'price'));
      columns.cost = number(pick(record, 'cost'));
      columns.stock = number(pick(record, 'stock'));
      columns.threshold = number(pick(record, 'threshold'));
      break;
    case 'orders':
      columns.customer_id = nullable(pick(record, 'customerId') || pick(record, 'customer'));
      columns.status = text(pick(record, 'status'), 'Confirmed');
      columns.payment_status = text(pick(record, 'paymentStatus'), 'Unpaid');
      columns.total = number(pick(record, 'total'));
      columns.currency = text(pick(record, 'currency'), 'GHS');
      break;
    case 'invoices':
      columns.customer_id = nullable(pick(record, 'customerId') || pick(record, 'customer'));
      columns.order_id = nullable(pick(record, 'orderId') || pick(record, 'order'));
      columns.total = number(pick(record, 'total'));
      columns.paid = number(pick(record, 'paid'));
      columns.status = text(pick(record, 'status'), 'Unpaid');
      columns.due_at = timestamp(pick(record, 'dueAt') || pick(record, 'due'))?.slice(0, 10) || null;
      break;
    default:
      break;
  }
  return columns;
}

function toRecord(row: Record<string, unknown>): BaseRecord {
  const data = (row.data && typeof row.data === 'object' ? row.data : {}) as Record<string, unknown>;
  const record: BaseRecord = {
    ...data,
    id: String(row.id),
    businessId: row.business_id === undefined || row.business_id === null ? undefined : String(row.business_id),
    createdAt: timestamp(row.created_at) || undefined,
    updatedAt: timestamp(row.updated_at) || undefined
  } as BaseRecord;
  for (const key of NUMERIC_KEYS) {
    if (typeof record[key] === 'string' && /^-?\d+(\.\d+)?$/.test(String(record[key]))) record[key] = Number(record[key]);
  }
  return record;
}

function buildInsert(
  collection: CollectionName,
  record: Record<string, unknown>,
  businessId: string
): { sql: string; values: unknown[] } {
  const id = String(record.id || `${collection.slice(0, 3)}_${randomUUID().replace(/-/g, '').slice(0, 16)}`);
  const columns: Record<string, unknown> = {
    id,
    data: json(record),
    ...specialisedColumns(collection, record)
  };
  if (collection !== 'businesses') columns.business_id = businessId || null;
  if (pick(record, 'createdAt') !== undefined) columns.created_at = timestamp(pick(record, 'createdAt'));
  if (!NO_UPDATED_AT.has(collection)) columns.updated_at = timestamp(pick(record, 'updatedAt')) || new Date().toISOString();

  const names = Object.keys(columns);
  const sql = `INSERT INTO ${tableFor(collection)} (${names.map(quote).join(', ')}) VALUES (${names.map((_, index) => `$${index + 1}`).join(', ')})`;
  return { sql, values: names.map((name) => columns[name]) };
}

/** PostgreSQL implementation of the Store contract. Tenant scope is enforced in
 * every query in addition to the RLS policies in db/schema.sql. */
export class PostgresStore implements Store {
  private pool: Pool;
  private als = new AsyncLocalStorage<TxState>();

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: Number(process.env.DB_POOL_MAX || 10),
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' } : undefined
    });
  }

  async init(): Promise<void> {
    const result = await this.query<{ count: number }>('SELECT count(*)::int AS count FROM public.businesses', [], undefined, true);
    if (Number(result.rows[0]?.count || 0) > 0) return;
    await this.transaction(async () => {
      const seed = buildSeed();
      for (const collection of SEED_ORDER) {
        for (const record of seed[collection] || []) {
          const businessId = collection === 'businesses' ? '' : String(record.businessId || '');
          const insert = buildInsert(collection, record, businessId);
          await this.query(`${insert.sql} ON CONFLICT (id) DO NOTHING`, insert.values);
        }
      }
    });
  }

  private async setContext(client: PoolClient, ctx?: Context, service = false): Promise<void> {
    await client.query("SELECT set_config('nexora.business_id', $1, false)", [ctx?.businessId || '']);
    await client.query("SELECT set_config('nexora.role', $1, false)", [service ? 'service' : 'app']);
  }

  private async query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values: unknown[] = [],
    ctx?: Context,
    service = false
  ): Promise<{ rows: T[]; rowCount: number }> {
    const active = this.als.getStore();
    if (active) return active.client.query(sql, values) as Promise<{ rows: T[]; rowCount: number }>;
    const client = await this.pool.connect();
    try {
      await this.setContext(client, ctx, service);
      return await client.query(sql, values) as { rows: T[]; rowCount: number };
    } finally {
      client.release();
    }
  }

  async insert<T extends Record<string, unknown> = Record<string, unknown>>(collection: CollectionName, record: Record<string, unknown>, ctx?: Context): Promise<T> {
    const businessId = collection === 'businesses' ? '' : String(ctx?.businessId || record.businessId || '');
    if (collection !== 'businesses' && !businessId) throw errors.badRequest('A workspace is required for this record');
    const insert = buildInsert(collection, record, businessId);
    try {
      const result = await this.query(`${insert.sql} RETURNING *`, insert.values, ctx);
      return toRecord(result.rows[0]) as unknown as T;
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new Error(`Duplicate id ${String(record.id || '')} in ${collection}`);
      throw error;
    }
  }

  async get<T extends Record<string, unknown> = Record<string, unknown>>(collection: CollectionName, id: string, ctx?: Context): Promise<T | null> {
    const sql = collection === 'businesses'
      ? `SELECT * FROM ${tableFor(collection)} WHERE id = $1 AND ($2::text IS NULL OR id = $2)`
      : `SELECT * FROM ${tableFor(collection)} WHERE id = $1 AND ($2::text IS NULL OR business_id = $2)`;
    const result = await this.query(sql, [id, ctx?.businessId || null], ctx);
    return result.rows[0] ? toRecord(result.rows[0]) as unknown as T : null;
  }

  async list<T extends Record<string, unknown> = Record<string, unknown>>(collection: CollectionName, filter?: (record: T) => boolean, ctx?: Context): Promise<T[]> {
    const column = collection === 'businesses' ? 'id' : 'business_id';
    const sql = `SELECT * FROM ${tableFor(collection)} WHERE ($1::text IS NULL OR ${column} = $1)`;
    const result = await this.query(sql, [ctx?.businessId || null], ctx);
    const rows = result.rows.map((row) => toRecord(row) as unknown as T);
    return filter ? rows.filter(filter) : rows;
  }

  async find<T extends Record<string, unknown> = Record<string, unknown>>(collection: CollectionName, predicate: (record: T) => boolean, ctx?: Context): Promise<T | null> {
    const rows = await this.list<T>(collection, predicate, ctx);
    return rows[0] || null;
  }

  async update<T extends Record<string, unknown> = Record<string, unknown>>(collection: CollectionName, id: string, patch: Record<string, unknown>, ctx?: Context): Promise<T | null> {
    const current = await this.get<Record<string, unknown>>(collection, id, ctx);
    if (!current) return null;
    const next: Record<string, unknown> = {
      ...current,
      ...patch,
      id: current.id,
      businessId: current.businessId,
      updatedAt: new Date().toISOString()
    };
    const fields: Record<string, unknown> = {
      data: json(next),
      ...specialisedColumns(collection, next)
    };
    if (!NO_UPDATED_AT.has(collection)) fields.updated_at = next.updatedAt;
    const names = Object.keys(fields);
    const businessId = String(current.businessId || '');
    const params: unknown[] = names.map((name) => fields[name]);
    params.push(id, ctx?.businessId || businessId || null);
    const sql = `UPDATE ${tableFor(collection)} SET ${names.map((name, index) => `${quote(name)} = $${index + 1}`).join(', ')} WHERE id = $${names.length + 1} AND ($${names.length + 2}::text IS NULL OR business_id = $${names.length + 2}) RETURNING *`;
    const result = await this.query(sql, params, ctx);
    return result.rows[0] ? toRecord(result.rows[0]) as unknown as T : null;
  }

  async remove(collection: CollectionName, id: string, ctx?: Context): Promise<boolean> {
    const sql = `DELETE FROM ${tableFor(collection)} WHERE id = $1 AND ($2::text IS NULL OR business_id = $2)`;
    const result = await this.query(sql, [id, ctx?.businessId || null], ctx);
    return Number(result.rowCount || 0) > 0;
  }

  async snapshot(): Promise<Database> {
    const data: Database = {};
    for (const collection of ALL_COLLECTIONS) {
      const result = await this.query(`SELECT * FROM ${tableFor(collection)}`, [], undefined, true);
      if (result.rows.length) data[collection] = result.rows.map((row) => toRecord(row));
    }
    return data;
  }

  async replaceCollection(collection: CollectionName, records: BaseRecord[]): Promise<void> {
    await this.transaction(async () => {
      const grouped = new Map<string, BaseRecord[]>();
      for (const record of records) {
        const key = String(record.businessId || '');
        grouped.set(key, [...(grouped.get(key) || []), record]);
      }
      for (const [businessId, items] of grouped) {
        await this.query(`DELETE FROM ${tableFor(collection)} WHERE business_id = $1`, [businessId]);
        for (const record of items) {
          const insert = buildInsert(collection, record, businessId);
          await this.query(`${insert.sql} ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`, insert.values);
        }
      }
    });
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const active = this.als.getStore();
    if (active) {
      const savepoint = `sp_${active.depth + 1}`;
      await active.client.query(`SAVEPOINT ${savepoint}`);
      try {
        const result = await fn();
        await active.client.query(`RELEASE SAVEPOINT ${savepoint}`);
        return result;
      } catch (error) {
        await active.client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await active.client.query(`RELEASE SAVEPOINT ${savepoint}`);
        throw error;
      }
    }

    const client = await this.pool.connect();
    try {
      await this.setContext(client, undefined, true);
      await client.query('BEGIN');
      const state: TxState = { client, depth: 1 };
      const result = await this.als.run(state, fn);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
