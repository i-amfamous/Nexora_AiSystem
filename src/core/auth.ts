import { randomUUID } from 'node:crypto';
import type { Context } from './types.js';
import type { Store } from './store.js';
import { hashPassword, hashToken, randomToken, signToken, verifyPassword, verifyToken } from './crypto.js';
import { recordAudit } from './audit.js';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS } from './rbac.js';
import { errors } from './errors.js';
import { getSessionSecret, isProduction } from './config.js';
import { sendMail } from './mailer.js';
import { buildWorkspaceTemplate } from './seed.js';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;

const ROLE_META: Record<string, string> = {
  owner: 'Full control of the workspace, billing and approvals.',
  admin: 'Manages people, departments and settings within granted permissions.',
  manager: 'Monitors a department, assigns tasks and approves requests.',
  sales: 'Customers, leads and orders.',
  support: 'Assigned conversations and permitted customer data.',
  inventory: 'Products, stock movements, suppliers and purchase requests.',
  finance: 'Invoices, payments, expenses and financial reports.'
};

export interface AuthResult {
  token: string;
  user: Record<string, unknown>;
  context: Context;
}

function contextFrom(user: Record<string, unknown>, sessionId: string, ip: string, userAgent: string): Context {
  return {
    userId: String(user.id),
    employeeId: String(user.employeeId),
    businessId: String(user.businessId),
    role: String(user.role),
    sessionId,
    ip,
    userAgent
  };
}

export async function createWorkspaceDefaults(store: Store, businessId: string, ownerEmployeeId: string): Promise<void> {
  const systemCtx = { businessId, employeeId: ownerEmployeeId, role: 'owner', userId: '', sessionId: '', ip: '', userAgent: '' } as Context;
  for (const [role, description] of Object.entries(ROLE_META)) {
    await store.insert('roles', { id: role, name: role, description, system: role === 'owner' }, systemCtx);
    await store.insert('userRoles', { userId: `u_${ownerEmployeeId}`, roleId: role }, { businessId, employeeId: ownerEmployeeId, role, userId: '', sessionId: '', ip: '', userAgent: '' } as Context);
    for (const permission of PERMISSIONS) {
      await store.insert('rolePermissions', {
        id: `rp_${role}_${permission}`,
        role,
        permission,
        enabled: DEFAULT_ROLE_PERMISSIONS[role]?.includes(permission) || false
      }, { businessId, employeeId: ownerEmployeeId, role, userId: '', sessionId: '', ip: '', userAgent: '' } as Context);
    }
  }

  for (const permission of PERMISSIONS) {
    await store.insert('permissions', { id: `perm_${permission}`, key: permission }, systemCtx);
  }

  // Structural defaults are generated in code, never copied from another
  // tenant. This keeps production workspaces free of demo customers, users,
  // conversations, sessions and statistics.
  const template = buildWorkspaceTemplate(businessId);
  for (const collection of [
    'departments', 'communicationChannels', 'integrations', 'channelConnections',
    'agents', 'agentConfigurations', 'agentPermissions', 'metrics'
  ] as Parameters<Store['list']>[0][]) {
    for (const record of template[collection] || []) {
      const { id, businessId: _b, createdAt: _c, updatedAt: _u, ...rest } = record as Record<string, unknown>;
      if (!id) continue;
      await store.insert(collection, { ...rest, id: String(id) }, systemCtx);
    }
  }
}

export async function registerBusiness(store: Store, input: Record<string, unknown>, ip: string, userAgent: string): Promise<AuthResult> {
  const businessId = `ws_${randomUUID().replace(/-/g, '').slice(0, 9).toUpperCase()}`;
  const employeeId = `e_owner_${randomUUID().replace(/-/g, '').slice(0, 6)}`;
  const business = await store.insert('businesses', {
    id: businessId,
    businessId,
    name: input.businessName,
    email: input.email,
    phone: input.phone,
    address: input.address || '',
    currency: input.currency || 'GHS',
    timezone: input.timezone || 'Africa/Accra',
    short: String(input.businessName || 'NB').slice(0, 2).toUpperCase(),
    plan: 'Starter',
    status: 'active'
  });
  await store.insert('employees', {
    id: employeeId, name: input.name, email: input.email, role: 'owner', dept: 'd1', status: 'active', last: 'Online now', device: '', tasksDone: 0, tasksOpen: 0
  }, { businessId, employeeId, role: 'owner', userId: '', sessionId: '', ip, userAgent } as Context);
  const user = await store.insert('users', {
    id: `u_${employeeId}`,
    email: input.email,
    name: input.name,
    employeeId,
    businessId,
    role: 'owner',
    status: 'active',
    passwordHash: hashPassword(String(input.password))
  }, { businessId, employeeId, role: 'owner', userId: '', sessionId: '', ip, userAgent } as Context);
  await createWorkspaceDefaults(store, businessId, employeeId);

  const ctx = contextFrom(user, '', ip, userAgent);
  await recordAudit(store, ctx, { actorId: employeeId, actorType: 'Employee', action: 'Registered business workspace', resource: businessId, result: 'Success' });
  return issueSession(store, user, ip, userAgent);
}

async function issueSession(store: Store, user: Record<string, unknown>, ip: string, userAgent: string): Promise<AuthResult> {
  const sessionId = `s_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const token = signToken({ sid: sessionId, uid: String(user.id), bid: String(user.businessId), exp: expiresAt }, getSessionSecret());
  await store.insert('sessions', {
    id: sessionId,
    userId: user.id,
    employeeId: user.employeeId,
    tokenHash: hashToken(token),
    device: userAgent || 'Unknown device',
    ip,
    active: true,
    expiresAt: new Date(expiresAt).toISOString(),
    current: true
  }, { businessId: String(user.businessId), employeeId: String(user.employeeId), role: String(user.role), userId: String(user.id), sessionId, ip, userAgent } as Context);
  return { token, user, context: contextFrom(user, sessionId, ip, userAgent) };
}

export async function login(store: Store, email: string, password: string, ip: string, userAgent: string): Promise<AuthResult> {
  const user = await store.find<Record<string, unknown>>('users', (u) => String(u.email).toLowerCase() === email.toLowerCase());
  if (!user || !verifyPassword(password, String(user.passwordHash))) throw errors.unauthorized('Email or password is incorrect');
  if (user.status !== 'active') throw errors.unauthorized('This account is not active');
  const employee = await store.get<Record<string, unknown>>('employees', String(user.employeeId));
  if (!employee || employee.status !== 'active') throw errors.unauthorized('This employee account is not active');
  const result = await issueSession(store, user, ip, userAgent);
  await recordAudit(store, result.context, { actorId: String(user.employeeId), actorType: 'Employee', action: 'Signed in', resource: `Session ${result.context.sessionId}`, result: 'Success' });
  return result;
}

export async function resolveToken(store: Store, token: string, ip: string, userAgent: string): Promise<Context | null> {
  const payload = verifyToken(token, getSessionSecret());
  if (!payload || typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
  const session = await store.get<Record<string, unknown>>('sessions', String(payload.sid));
  if (!session || !session.active || session.tokenHash !== hashToken(token)) return null;
  const user = await store.get<Record<string, unknown>>('users', String(payload.uid));
  if (!user || user.status !== 'active') return null;
  const employee = await store.get<Record<string, unknown>>('employees', String(user.employeeId));
  if (!employee || employee.status !== 'active') return null;
  return contextFrom({ ...user, businessId: payload.bid }, String(payload.sid), ip, userAgent);
}

export async function requestPasswordReset(store: Store, email: string): Promise<string | null> {
  const user = await store.find<Record<string, unknown>>('users', (u) => String(u.email).toLowerCase() === email.toLowerCase());
  if (!user) return null;
  const token = randomToken();
  await store.insert('passwordResets', {
    id: `pr_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + RESET_TTL_MS).toISOString(),
    used: false
  }, { businessId: String(user.businessId), employeeId: String(user.employeeId), role: String(user.role), userId: String(user.id), sessionId: '', ip: '', userAgent: '' } as Context);
  if (isProduction()) {
    const publicUrl = String(process.env.PUBLIC_URL || 'http://localhost:4000').replace(/\/$/, '');
    const link = `${publicUrl}/#/auth/reset?token=${encodeURIComponent(token)}`;
    await sendMail({
      to: String(user.email),
      subject: 'Reset your Nexora password',
      text: `Use this link to reset your Nexora password. It expires in 30 minutes.\n\n${link}\n\nIf you did not request this, ignore this email.`,
      html: `<p>Use this link to reset your Nexora password. It expires in 30 minutes.</p><p><a href="${link}">Reset password</a></p><p>If you did not request this, ignore this email.</p>`
    });
    return null;
  }
  return token;
}

export async function resetPassword(store: Store, token: string, newPassword: string): Promise<void> {
  const reset = await store.find<Record<string, unknown>>('passwordResets', (r) => r.tokenHash === hashToken(token) && !r.used && new Date(String(r.expiresAt)).getTime() > Date.now());
  if (!reset) throw errors.badRequest('This reset link is invalid or has expired');
  await store.update('users', String(reset.userId), { passwordHash: hashPassword(newPassword) });
  await store.update('passwordResets', String(reset.id), { used: true });
  const sessions = await store.list<Record<string, unknown>>('sessions', (s) => s.userId === reset.userId);
  for (const session of sessions) await store.remove('sessions', String(session.id));
}

/** End the session attached to the current request and leave a signed-out audit entry. */
export async function logout(store: Store, ctx: Context): Promise<void> {
  const session = await store.get<Record<string, unknown>>('sessions', ctx.sessionId, ctx);
  if (!session) throw errors.notFound('Session not found');
  await store.update('sessions', ctx.sessionId, { active: false }, ctx);
  await recordAudit(store, ctx, {
    actorId: ctx.employeeId,
    actorType: 'Employee',
    action: 'Signed out',
    resource: ctx.sessionId,
    result: 'Success'
  });
}

/** Verify the existing secret, install a new hash and sign out every other session of this user. */
export async function changePassword(store: Store, ctx: Context, currentPassword: string, newPassword: string): Promise<void> {
  const user = await store.get<Record<string, unknown>>('users', ctx.userId, ctx);
  if (!user) throw errors.notFound('User not found');
  if (!verifyPassword(currentPassword, String(user.passwordHash))) throw errors.badRequest('Current password is incorrect');
  if (newPassword.length < 10) throw errors.badRequest('New password must be at least 10 characters long');
  await store.update('users', ctx.userId, { passwordHash: hashPassword(newPassword) }, ctx);
  const sessions = await store.list<Record<string, unknown>>('sessions', (session) => session.userId === ctx.userId, ctx);
  for (const session of sessions) {
    if (session.id !== ctx.sessionId) await store.update('sessions', String(session.id), { active: false }, ctx);
  }
  await recordAudit(store, ctx, {
    actorId: ctx.employeeId,
    actorType: 'Employee',
    action: 'Changed password',
    resource: ctx.userId,
    result: 'Success',
    meta: { revokedSessions: sessions.filter((session) => session.id !== ctx.sessionId).length }
  });
}

export async function listSessions(store: Store, ctx: Context): Promise<Record<string, unknown>[]> {
  return store.list<Record<string, unknown>>('sessions', (s) => s.employeeId === ctx.employeeId && s.active === true, ctx);
}

export async function revokeSession(store: Store, ctx: Context, sessionId: string): Promise<void> {
  const session = await store.get<Record<string, unknown>>('sessions', sessionId, ctx);
  if (!session || session.employeeId !== ctx.employeeId) throw errors.notFound('Session not found');
  await store.update('sessions', sessionId, { active: false }, ctx);
  await recordAudit(store, ctx, { actorId: ctx.employeeId, actorType: 'Employee', action: 'Signed out a device', resource: sessionId, result: 'Success' });
}

export async function revokeOtherSessions(store: Store, ctx: Context): Promise<void> {
  const sessions = await listSessions(store, ctx);
  for (const session of sessions) {
    if (session.id !== ctx.sessionId) await store.update('sessions', String(session.id), { active: false }, ctx);
  }
  await recordAudit(store, ctx, { actorId: ctx.employeeId, actorType: 'Employee', action: 'Signed out other devices', resource: ctx.employeeId, result: 'Success' });
}

export async function inviteEmployee(store: Store, ctx: Context, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const employeeId = `e_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
  const temporaryPassword = randomToken(12);
  const employee = await store.insert('employees', {
    id: employeeId,
    name: input.name || String(input.email).split('@')[0],
    email: input.email,
    role: input.role || 'sales',
    dept: input.department || 'd2',
    status: 'invited',
    last: 'Invite sent just now',
    device: '',
    tasksDone: 0,
    tasksOpen: 0
  }, ctx);
  await store.insert('users', {
    id: `u_${employeeId}`, email: input.email, name: employee.name, employeeId, businessId: ctx.businessId,
    role: input.role || 'sales', status: 'invited', passwordHash: hashPassword(temporaryPassword)
  }, ctx);
  await store.insert('userRoles', { userId: `u_${employeeId}`, roleId: input.role || 'sales' }, ctx);
  await recordAudit(store, ctx, { actorId: ctx.employeeId, actorType: 'Employee', action: 'Invited employee', resource: employeeId, result: 'Success' });
  if (isProduction()) {
    const signIn = String(process.env.PUBLIC_URL || 'http://localhost:4000');
    await sendMail({
      to: String(input.email),
      subject: 'You are invited to Nexora',
      text: `Sign in at ${signIn} with ${String(input.email)} and this temporary password: ${temporaryPassword}\nChange it after your first sign-in.`,
      html: `<p>You are invited to Nexora.</p><p>Sign in at <a href="${signIn}">${signIn}</a> with <b>${String(input.email)}</b> and this temporary password: <b>${temporaryPassword}</b>.</p><p>Change it after your first sign-in.</p>`
    });
  }
  return { ...employee, temporaryPassword: isProduction() ? undefined : temporaryPassword };
}

/** Issue a fresh temporary password for an employee who has not activated their account. */
export async function resendInvite(store: Store, ctx: Context, employeeId: string, input: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const employee = await store.get<Record<string, unknown>>('employees', employeeId, ctx);
  if (!employee) throw errors.notFound('Employee not found');
  const user = await store.get<Record<string, unknown>>('users', `u_${employeeId}`, ctx)
    || await store.find<Record<string, unknown>>('users', (candidate) => candidate.employeeId === employeeId, ctx);
  if (!user) throw errors.notFound('Employee account not found');
  const email = input.email ? String(input.email) : String(user.email || employee.email || '');
  const temporaryPassword = randomToken(12);
  await store.update('users', String(user.id), { email, passwordHash: hashPassword(temporaryPassword), status: 'invited' }, ctx);
  await store.update('employees', employeeId, { email, status: 'invited', last: 'Invite resent just now' }, ctx);
  await recordAudit(store, ctx, {
    actorId: ctx.employeeId,
    actorType: 'Employee',
    action: 'Resent employee invitation',
    resource: employeeId,
    result: 'Success',
    meta: { email }
  });
  if (isProduction()) {
    const signIn = String(process.env.PUBLIC_URL || 'http://localhost:4000');
    await sendMail({
      to: email,
      subject: 'Your Nexora invitation was refreshed',
      text: `Sign in at ${signIn} with ${email} and this temporary password: ${temporaryPassword}\nChange it after signing in.`,
      html: `<p>Your Nexora invitation was refreshed.</p><p>Sign in at <a href="${signIn}">${signIn}</a> with <b>${email}</b> and this temporary password: <b>${temporaryPassword}</b>.</p>`
    });
  }
  return { id: employeeId, temporaryPassword: isProduction() ? undefined : temporaryPassword };
}

export async function deactivateEmployee(store: Store, ctx: Context, employeeId: string, active: boolean): Promise<void> {
  const employee = await store.get<Record<string, unknown>>('employees', employeeId, ctx);
  if (!employee) throw errors.notFound('Employee not found');
  await store.update('employees', employeeId, { status: active ? 'active' : 'deactivated', last: active ? 'Restored just now' : 'Access revoked just now' }, ctx);
  await store.update('users', `u_${employeeId}`, { status: active ? 'active' : 'deactivated' }, ctx);
  if (!active) {
    const sessions = await store.list<Record<string, unknown>>('sessions', (s) => s.employeeId === employeeId, ctx);
    for (const session of sessions) await store.update('sessions', String(session.id), { active: false }, ctx);
  }
  await recordAudit(store, ctx, { actorId: ctx.employeeId, actorType: 'Employee', action: active ? 'Restored employee access' : 'Revoked employee access', resource: employeeId, result: 'Success' });
}

export async function changeEmployeeRole(store: Store, ctx: Context, employeeId: string, role: string, department: string): Promise<void> {
  const employee = await store.get<Record<string, unknown>>('employees', employeeId, ctx);
  if (!employee) throw errors.notFound('Employee not found');
  await store.update('employees', employeeId, { role, dept: department }, ctx);
  await store.update('users', `u_${employeeId}`, { role }, ctx);
  await store.update('userRoles', `ur_${employeeId}`, { roleId: role }, ctx);
  await recordAudit(store, ctx, { actorId: ctx.employeeId, actorType: 'Employee', action: 'Changed employee role', resource: employeeId, result: 'Success', meta: { from: employee.role, to: role } });
}
