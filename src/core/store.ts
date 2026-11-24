import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { BaseRecord, CollectionName, Context } from './types.js';
import { buildSeed } from './seed.js';

export type Database = Record<string, BaseRecord[]>;

export interface Store {
  init(): Promise<void>;
  insert<T extends Record<string, unknown> = Record<string, unknown>>(collection: CollectionName, record: Record<string, unknown>, ctx?: Context): Promise<T>;
  get<T extends Record<string, unknown> = Record<string, unknown>>(collection: CollectionName, id: string, ctx?: Context): Promise<T | null>;
  list<T extends Record<string, unknown> = Record<string, unknown>>(collection: CollectionName, filter?: (record: T) => boolean, ctx?: Context): Promise<T[]>;
  find<T extends Record<string, unknown> = Record<string, unknown>>(collection: CollectionName, predicate: (record: T) => boolean, ctx?: Context): Promise<T | null>;
  update<T extends Record<string, unknown> = Record<string, unknown>>(collection: CollectionName, id: string, patch: Record<string, unknown>, ctx?: Context): Promise<T | null>;
  remove(collection: CollectionName, id: string, ctx?: Context): Promise<boolean>;
  snapshot(): Promise<Database>;
  replaceCollection(collection: CollectionName, records: BaseRecord[]): Promise<void>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function matchesTenant(record: BaseRecord, ctx?: Context): boolean {
  if (!ctx) return true;
  return record.businessId === ctx.businessId;
}

export class FileStore implements Store {
  private db: Database = {};
  private file: string;
  private lock: Promise<unknown> = Promise.resolve();
  private transactionDepth = 0;

  constructor(file = process.env.DATA_FILE || '.data/nexora.json') {
    this.file = path.resolve(process.cwd(), file);
  }

  async init(): Promise<void> {
    if (fs.existsSync(this.file)) {
      try {
        this.db = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Database;
        return;
      } catch {
        // Corrupt dev store: rebuild from the seed.
      }
    }
    this.db = buildSeed();
    await this.persist();
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    if (this.transactionDepth > 0) return fn();
    const run = this.lock.then(fn, fn);
    this.lock = run.catch(() => undefined);
    return run;
  }

  private async persist(): Promise<void> {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.db, null, 2));
    fs.renameSync(tmp, this.file);
  }

  private bucket(collection: CollectionName): BaseRecord[] {
    if (!this.db[collection]) this.db[collection] = [];
    return this.db[collection];
  }

  async insert<T extends Record<string, unknown> = Record<string, unknown>>(collection: CollectionName, record: Record<string, unknown>, ctx?: Context): Promise<T> {
    return this.withLock(async () => {
      const now = new Date().toISOString();
      const created: BaseRecord = {
        ...clone(record),
        id: record.id || `${collection.slice(0, 3)}_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
        businessId: ctx ? ctx.businessId : record.businessId,
        createdAt: record.createdAt || now,
        updatedAt: now
      } as BaseRecord;
      const bucket = this.bucket(collection);
      if (bucket.some((r) => r.id === created.id && matchesTenant(r, ctx))) {
        throw new Error(`Duplicate id ${created.id} in ${collection}`);
      }
      bucket.push(created);
      await this.persist();
      return clone(created) as unknown as T;
    });
  }

  async get<T extends Record<string, unknown> = Record<string, unknown>>(collection: CollectionName, id: string, ctx?: Context): Promise<T | null> {
    const found = this.bucket(collection).find((r) => r.id === id && matchesTenant(r, ctx));
    return found ? clone(found) as unknown as T : null;
  }

  async list<T extends Record<string, unknown> = Record<string, unknown>>(collection: CollectionName, filter?: (record: T) => boolean, ctx?: Context): Promise<T[]> {
    return this.bucket(collection)
      .filter((r) => matchesTenant(r, ctx))
      .map((r) => clone(r) as unknown as T)
      .filter((r) => !filter || filter(r));
  }

  async find<T extends Record<string, unknown> = Record<string, unknown>>(collection: CollectionName, predicate: (record: T) => boolean, ctx?: Context): Promise<T | null> {
    for (const record of this.bucket(collection)) {
      if (!matchesTenant(record, ctx)) continue;
      const copy = clone(record) as unknown as T;
      if (predicate(copy)) return copy;
    }
    return null;
  }

  async update<T extends Record<string, unknown> = Record<string, unknown>>(collection: CollectionName, id: string, patch: Record<string, unknown>, ctx?: Context): Promise<T | null> {
    return this.withLock(async () => {
      const record = this.bucket(collection).find((r) => r.id === id && matchesTenant(r, ctx));
      if (!record) return null;
      const next = { ...record, ...clone(patch), id: record.id, businessId: record.businessId, updatedAt: new Date().toISOString() };
      const index = this.bucket(collection).indexOf(record);
      this.bucket(collection)[index] = next;
      await this.persist();
      return clone(next) as unknown as T;
    });
  }

  async remove(collection: CollectionName, id: string, ctx?: Context): Promise<boolean> {
    return this.withLock(async () => {
      const bucket = this.bucket(collection);
      const index = bucket.findIndex((r) => r.id === id && matchesTenant(r, ctx));
      if (index === -1) return false;
      bucket.splice(index, 1);
      await this.persist();
      return true;
    });
  }

  async snapshot(): Promise<Database> {
    return clone(this.db);
  }

  async replaceCollection(collection: CollectionName, records: BaseRecord[]): Promise<void> {
    return this.withLock(async () => {
      this.db[collection] = clone(records);
      await this.persist();
    });
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.withLock(async () => {
      const before = clone(this.db);
      this.transactionDepth++;
      try {
        const result = await fn();
        await this.persist();
        return result;
      } catch (error) {
        this.db = before;
        await this.persist();
        throw error;
      } finally {
        this.transactionDepth--;
      }
    });
  }

  async close(): Promise<void> {
    await this.lock;
  }
}
