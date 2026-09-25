import type { AuthIdentity } from './types';
import { hashPortalSecret } from './portal-auth';

export type PortalInvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';
export type PortalInvitationView = {
  id: string;
  customerId: string;
  status: PortalInvitationStatus;
  expiresAt: string;
  createdAt: string;
};

type Dependencies = {
  now?: Date;
  newId?: () => string;
  newSecret?: () => string;
  rateLimitKey?: string;
};

type InvitationRow = {
  id: string;
  organization_id: string;
  customer_id: string;
  secret_hash: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_by_user_id: string;
  created_at: string;
};

const CREATE_LIMIT = 5;
const EXCHANGE_LIMIT = 10;
const MAX_EXPIRY_HOURS = 168;
const SESSION_HOURS = 24;
const exchangeAttempts = new Map<string, { windowStartedAt: number; count: number }>();

export function resetPortalInvitationRateLimitsForTest(): void {
  exchangeAttempts.clear();
}

export class PortalInvitationError extends Error {
  constructor(readonly status: 400 | 401 | 403 | 404 | 409 | 429, message?: string) {
    super(message ?? (status === 401 ? 'Unauthorized.' : status === 403 ? 'Forbidden.' : status === 404 ? 'Not found.' : status === 429 ? 'Too many requests.' : 'Invalid request.'));
    this.name = 'PortalInvitationError';
  }
}

function owner(identity: AuthIdentity): void {
  if (identity.role !== 'owner_admin') throw new PortalInvitationError(403);
}

function hours(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > MAX_EXPIRY_HOURS) throw new PortalInvitationError(400);
  return Number(value);
}

function randomSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `portal_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function dependencies(input: Dependencies) {
  return {
    now: input.now ?? new Date(),
    newId: input.newId ?? (() => crypto.randomUUID()),
    newSecret: input.newSecret ?? randomSecret,
    rateLimitKey: input.rateLimitKey ?? 'anonymous',
  };
}

function status(row: InvitationRow, now: Date): PortalInvitationStatus {
  if (row.revoked_at) return 'revoked';
  if (row.accepted_at) return 'accepted';
  if (row.expires_at <= now.toISOString()) return 'expired';
  return 'pending';
}

function view(row: InvitationRow, now: Date): PortalInvitationView {
  return { id: row.id, customerId: row.customer_id, status: status(row, now), expiresAt: row.expires_at, createdAt: row.created_at };
}

function audit(db: D1Database, input: { id: string; organizationId: string; customerId: string; actorUserId: string | null; eventType: string; invitationId: string; occurredAt: string }) {
  return db.prepare(`
    INSERT INTO activity_events (
      id, organization_id, customer_id, actor_user_id, event_type, detail_json,
      occurred_at, version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).bind(input.id, input.organizationId, input.customerId, input.actorUserId, input.eventType, JSON.stringify({ invitationId: input.invitationId }), input.occurredAt, input.occurredAt, input.occurredAt);
}

async function scopedInvitation(db: D1Database, identity: AuthIdentity, invitationId: string): Promise<InvitationRow> {
  const row = await db.prepare(`
    SELECT id, organization_id, customer_id, secret_hash, expires_at, accepted_at, revoked_at, created_by_user_id, created_at
    FROM portal_invitations WHERE organization_id = ? AND id = ? LIMIT 1
  `).bind(identity.organization_id, invitationId).first<InvitationRow>();
  if (!row) throw new PortalInvitationError(404);
  return row;
}

export async function createPortalInvitation(
  db: D1Database,
  identity: AuthIdentity,
  input: { customerId: string; expiresInHours: number },
  supplied: Dependencies = {},
): Promise<{ invitation: PortalInvitationView; token: string }> {
  owner(identity);
  const deps = dependencies(supplied);
  const expiryHours = hours(input.expiresInHours);
  const customer = await db.prepare('SELECT id FROM customers WHERE organization_id = ? AND id = ? LIMIT 1').bind(identity.organization_id, input.customerId).first<{ id: string }>();
  if (!customer) throw new PortalInvitationError(404);
  const windowStart = new Date(deps.now.getTime() - 60 * 60 * 1000).toISOString();
  const recent = await db.prepare('SELECT COUNT(*) AS count FROM portal_invitations WHERE organization_id = ? AND created_by_user_id = ? AND created_at > ?').bind(identity.organization_id, identity.user_id, windowStart).first<{ count: number }>();
  if (Number(recent?.count ?? 0) >= CREATE_LIMIT) throw new PortalInvitationError(429);

  const token = deps.newSecret();
  const tokenHash = await hashPortalSecret(token);
  const id = deps.newId();
  const createdAt = deps.now.toISOString();
  const expiresAt = new Date(deps.now.getTime() + expiryHours * 60 * 60 * 1000).toISOString();
  await db.batch([
    db.prepare(`INSERT INTO portal_invitations (id, organization_id, customer_id, secret_hash, expires_at, accepted_at, revoked_at, created_by_user_id, created_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?)`).bind(id, identity.organization_id, input.customerId, tokenHash, expiresAt, identity.user_id, createdAt),
    audit(db, { id: deps.newId(), organizationId: identity.organization_id, customerId: input.customerId, actorUserId: identity.user_id, eventType: 'portal.invitation.created', invitationId: id, occurredAt: createdAt }),
  ]);
  return { invitation: { id, customerId: input.customerId, status: 'pending', expiresAt, createdAt }, token };
}

export async function listPortalInvitations(db: D1Database, identity: AuthIdentity, customerId: string, supplied: Dependencies = {}): Promise<PortalInvitationView[]> {
  owner(identity);
  const deps = dependencies(supplied);
  const rows = await db.prepare(`SELECT id, organization_id, customer_id, secret_hash, expires_at, accepted_at, revoked_at, created_by_user_id, created_at FROM portal_invitations WHERE organization_id = ? AND customer_id = ? ORDER BY created_at DESC`).bind(identity.organization_id, customerId).all<InvitationRow>();
  return rows.results.map((row) => view(row, deps.now));
}

export async function resendPortalInvitation(
  db: D1Database,
  identity: AuthIdentity,
  invitationId: string,
  input: { expiresInHours: number },
  supplied: Dependencies = {},
): Promise<{ invitation: PortalInvitationView; token: string }> {
  owner(identity);
  const deps = dependencies(supplied);
  const existing = await scopedInvitation(db, identity, invitationId);
  await revokePortalInvitation(db, identity, invitationId, deps);
  const replacement = await createPortalInvitation(db, identity, { customerId: existing.customer_id, expiresInHours: input.expiresInHours }, deps);
  await audit(db, { id: deps.newId(), organizationId: identity.organization_id, customerId: existing.customer_id, actorUserId: identity.user_id, eventType: 'portal.invitation.resent', invitationId: replacement.invitation.id, occurredAt: deps.now.toISOString() }).run();
  return replacement;
}

export async function revokePortalInvitation(db: D1Database, identity: AuthIdentity, invitationId: string, supplied: Dependencies = {}): Promise<void> {
  owner(identity);
  const deps = dependencies(supplied);
  const row = await scopedInvitation(db, identity, invitationId);
  const occurredAt = deps.now.toISOString();
  await db.batch([
    db.prepare('UPDATE portal_invitations SET revoked_at = ? WHERE organization_id = ? AND id = ?').bind(occurredAt, identity.organization_id, invitationId),
    db.prepare('UPDATE portal_sessions SET revoked_at = ? WHERE organization_id = ? AND invitation_id = ? AND revoked_at IS NULL').bind(occurredAt, identity.organization_id, invitationId),
    audit(db, { id: deps.newId(), organizationId: identity.organization_id, customerId: row.customer_id, actorUserId: identity.user_id, eventType: 'portal.invitation.revoked', invitationId, occurredAt }),
  ]);
}

export async function expirePortalInvitation(db: D1Database, identity: AuthIdentity, invitationId: string, supplied: Dependencies = {}): Promise<void> {
  owner(identity);
  const deps = dependencies(supplied);
  const row = await scopedInvitation(db, identity, invitationId);
  const occurredAt = deps.now.toISOString();
  await db.batch([
    db.prepare('UPDATE portal_invitations SET expires_at = ? WHERE organization_id = ? AND id = ?').bind(occurredAt, identity.organization_id, invitationId),
    db.prepare('UPDATE portal_sessions SET revoked_at = ? WHERE organization_id = ? AND invitation_id = ? AND revoked_at IS NULL').bind(occurredAt, identity.organization_id, invitationId),
    audit(db, { id: deps.newId(), organizationId: identity.organization_id, customerId: row.customer_id, actorUserId: identity.user_id, eventType: 'portal.invitation.expired', invitationId, occurredAt }),
  ]);
}

function rateLimitExchange(key: string, now: Date): void {
  const current = exchangeAttempts.get(key);
  if (!current || now.getTime() - current.windowStartedAt >= 60 * 60 * 1000) {
    exchangeAttempts.set(key, { windowStartedAt: now.getTime(), count: 1 });
    return;
  }
  if (current.count >= EXCHANGE_LIMIT) throw new PortalInvitationError(429);
  current.count += 1;
}

export async function acceptPortalInvitation(
  db: D1Database,
  token: string,
  supplied: Dependencies = {},
): Promise<{ sessionToken: string; expiresAt: string }> {
  const deps = dependencies(supplied);
  rateLimitExchange(deps.rateLimitKey, deps.now);
  if (token.length < 20 || token.length > 256 || !/^[A-Za-z0-9_-]+$/.test(token)) throw new PortalInvitationError(401);
  const tokenHash = await hashPortalSecret(token);
  const row = await db.prepare(`
    SELECT id, organization_id, customer_id, secret_hash, expires_at, accepted_at, revoked_at, created_by_user_id, created_at
    FROM portal_invitations WHERE secret_hash = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ? LIMIT 1
  `).bind(tokenHash, deps.now.toISOString()).first<InvitationRow>();
  if (!row) throw new PortalInvitationError(401);
  const sessionToken = deps.newSecret();
  const sessionHash = await hashPortalSecret(sessionToken);
  const sessionId = deps.newId();
  const acceptedAt = deps.now.toISOString();
  const expiresAt = new Date(deps.now.getTime() + SESSION_HOURS * 60 * 60 * 1000).toISOString();
  const accepted = await db.batch([
    db.prepare('UPDATE portal_invitations SET accepted_at = ? WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?').bind(acceptedAt, row.id, acceptedAt),
    db.prepare(`INSERT INTO portal_sessions (id, organization_id, customer_id, invitation_id, secret_hash, expires_at, revoked_at, created_at) SELECT ?, ?, ?, ?, ?, ?, NULL, ? WHERE EXISTS (SELECT 1 FROM portal_invitations WHERE id = ? AND accepted_at = ?)`).bind(sessionId, row.organization_id, row.customer_id, row.id, sessionHash, expiresAt, acceptedAt, row.id, acceptedAt),
    audit(db, { id: deps.newId(), organizationId: row.organization_id, customerId: row.customer_id, actorUserId: null, eventType: 'portal.invitation.accepted', invitationId: row.id, occurredAt: acceptedAt }),
  ]);
  if (Number(accepted[0]?.meta?.changes ?? 0) !== 1 || Number(accepted[1]?.meta?.changes ?? 0) !== 1) throw new PortalInvitationError(401);
  return { sessionToken, expiresAt };
}
