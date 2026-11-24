import type { Context } from './types.js';
import type { Store } from './store.js';

export const PERMISSIONS = [
  'auth:read', 'business:read', 'business:update', 'business:register',
  'employees:read', 'employees:invite', 'employees:update', 'employees:deactivate',
  'departments:read', 'departments:create', 'departments:update',
  'roles:read', 'roles:update',
  'customers:read', 'customers:create', 'customers:update', 'customers:merge', 'customers:export',
  'inbox:read', 'inbox:respond', 'inbox:assign', 'inbox:categorise', 'inbox:takeover',
  'sales:read', 'sales:create', 'sales:update',
  'orders:read', 'orders:create', 'orders:update', 'orders:cancel',
  'inventory:read', 'inventory:create', 'inventory:adjust',
  'suppliers:read', 'suppliers:create',
  'purchaseRequests:read', 'purchaseRequests:create', 'purchaseRequests:approve',
  'finance:read', 'finance:create', 'finance:update', 'finance:verify', 'finance:approve',
  'tasks:read', 'tasks:create', 'tasks:update',
  'workflows:read', 'workflows:create', 'workflows:update', 'workflows:execute',
  'agents:read', 'agents:configure', 'agents:approve',
  'analytics:read', 'analytics:export',
  'integrations:read', 'integrations:connect', 'integrations:disconnect',
  'notifications:read', 'notifications:update',
  'audit:read', 'audit:export',
  'data:export', 'data:delete'
] as const;

export type Permission = typeof PERMISSIONS[number];

const all = [...PERMISSIONS];

const manager = [
  'auth:read', 'business:read', 'employees:read', 'departments:read', 'roles:read',
  'customers:read', 'customers:create', 'customers:update',
  'inbox:read', 'inbox:respond', 'inbox:assign', 'inbox:categorise', 'inbox:takeover',
  'sales:read', 'sales:create', 'sales:update',
  'orders:read', 'orders:update',
  'inventory:read', 'inventory:adjust', 'suppliers:read', 'purchaseRequests:read', 'purchaseRequests:approve',
  'finance:read', 'tasks:read', 'tasks:create', 'tasks:update',
  'workflows:read', 'workflows:update', 'agents:read',
  'analytics:read', 'notifications:read', 'notifications:update'
];

const sales = [
  'auth:read', 'business:read', 'customers:read', 'customers:create', 'customers:update',
  'inbox:read', 'inbox:respond', 'sales:read', 'sales:create', 'sales:update',
  'orders:read', 'orders:create', 'inventory:read', 'tasks:read', 'tasks:update',
  'analytics:read', 'notifications:read', 'notifications:update'
];

const support = [
  'auth:read', 'business:read', 'customers:read', 'inbox:read', 'inbox:respond',
  'inbox:assign', 'inbox:categorise', 'inbox:takeover', 'orders:read',
  'tasks:read', 'tasks:update', 'analytics:read', 'notifications:read', 'notifications:update'
];

const inventory = [
  'auth:read', 'business:read', 'customers:read', 'orders:read', 'inventory:read',
  'inventory:create', 'inventory:adjust', 'suppliers:read', 'suppliers:create',
  'purchaseRequests:read', 'purchaseRequests:create', 'tasks:read', 'tasks:update',
  'analytics:read', 'notifications:read', 'notifications:update'
];

const finance = [
  'auth:read', 'business:read', 'customers:read', 'orders:read',
  'finance:read', 'finance:create', 'finance:update', 'tasks:read', 'tasks:update',
  'analytics:read', 'analytics:export', 'notifications:read', 'notifications:update'
];

const admin = all.filter((p) => !['business:register', 'data:delete'].includes(p));

export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: all,
  admin,
  manager,
  sales,
  support,
  inventory,
  finance
};

/** Sensitive permissions always require the owner even for administrators. */
export const OWNER_ONLY = new Set<Permission>(['business:register', 'roles:update', 'data:delete']);

export async function hasPermission(ctx: Context, permission: Permission, store: Store): Promise<boolean> {
  if (OWNER_ONLY.has(permission) && ctx.role !== 'owner') return false;
  const override = await store.find<{ role: string; permission: string; enabled: boolean }>(
    'rolePermissions',
    (r) => r.role === ctx.role && r.permission === permission,
    ctx
  );
  if (override) return Boolean(override.enabled);
  return (DEFAULT_ROLE_PERMISSIONS[ctx.role] || []).includes(permission);
}

export async function requirePermission(ctx: Context, permission: Permission, store: Store): Promise<void> {
  const ok = await hasPermission(ctx, permission, store);
  if (!ok) throw new Error(`FORBIDDEN:${permission}`);
}
