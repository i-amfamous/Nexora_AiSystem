import { createCipheriv, createDecipheriv, createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Context } from './types.js';
import type { Store } from './store.js';
import { errors } from './errors.js';

export interface StoredFileInput {
  name: string;
  mimeType: string;
  data: Buffer;
  conversationId?: string;
  customerId?: string;
}

export interface StoredFile extends Record<string, unknown> {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  path: string;
}

/** Local encrypted object-storage adapter. Replace with an S3-compatible adapter by
 * implementing the same interface; business modules never touch the filesystem. */
export class StorageService {
  private root: string;
  private key: Buffer;

  constructor(private store: Store, root = process.env.STORAGE_DIR || '.data/files') {
    this.root = path.resolve(process.cwd(), root);
    this.key = createHash('sha256').update(process.env.FILE_ENCRYPTION_KEY || 'nexora-development-file-key').digest();
  }

  private tenantDir(businessId: string): string {
    const safe = businessId.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safe) throw errors.badRequest('Invalid workspace identifier');
    const dir = path.join(this.root, safe);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  async put(ctx: Context, input: StoredFileInput): Promise<StoredFile> {
    if (!input.name || !input.data?.length) throw errors.badRequest('A file name and content are required');
    const id = `file_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    // AES-GCM uses a 12-byte nonce; randomUUID hex is 2 characters per byte.
    const iv = randomUUID().replace(/-/g, '').slice(0, 24);
    const cipher = createCipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'hex'));
    const encrypted = Buffer.concat([cipher.update(input.data), cipher.final()]);
    const tag = cipher.getAuthTag();
    const file = path.join(this.tenantDir(ctx.businessId), `${id}.enc`);
    fs.writeFileSync(file, Buffer.concat([Buffer.from(iv, 'hex'), tag, encrypted]));
    const record = await this.store.insert('fileRecords', {
      id,
      name: path.basename(input.name),
      mimeType: input.mimeType || 'application/octet-stream',
      size: input.data.length,
      path: file,
      uploadedBy: ctx.employeeId,
      conversationId: input.conversationId || null,
      customerId: input.customerId || null
    }, ctx);
    return record as StoredFile;
  }

  private decrypt(record: Record<string, unknown>): Buffer {
    const stored = fs.readFileSync(String(record.path));
    const iv = stored.subarray(0, 12);
    const tag = stored.subarray(12, 28);
    const data = stored.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]);
  }

  async get(ctx: Context, id: string): Promise<{ record: StoredFile; data: Buffer }> {
    const record = await this.store.get<Record<string, unknown>>('fileRecords', id, ctx);
    if (!record) throw errors.notFound('File not found');
    return { record: record as StoredFile, data: this.decrypt(record) };
  }

  async list(ctx: Context): Promise<StoredFile[]> {
    return (await this.store.list<Record<string, unknown>>('fileRecords', undefined, ctx)) as StoredFile[];
  }

  async remove(ctx: Context, id: string): Promise<void> {
    const record = await this.store.get<Record<string, unknown>>('fileRecords', id, ctx);
    if (!record) throw errors.notFound('File not found');
    fs.rmSync(String(record.path), { force: true });
    await this.store.remove('fileRecords', id, ctx);
  }
}
