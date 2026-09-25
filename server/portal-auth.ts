export type PortalIdentity = { organizationId: string; customerId: string; sessionId: string };

export class PortalAccessError extends Error {
  constructor(readonly status: 401 | 404, message = status === 401 ? 'Unauthorized.' : 'Not found.') {
    super(message);
    this.name = 'PortalAccessError';
  }
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashPortalSecret(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return hex(new Uint8Array(digest));
}

function opaqueSecret(authorization: string | null): string {
  if (!authorization?.startsWith('Bearer ')) throw new PortalAccessError(401);
  const secret = authorization.slice(7);
  if (secret.length < 20 || secret.length > 256 || !/^[A-Za-z0-9_-]+$/.test(secret)) {
    throw new PortalAccessError(401);
  }
  return secret;
}

export async function authenticatePortalSession(
  authorization: string | null,
  db: D1Database,
  now = new Date(),
): Promise<PortalIdentity> {
  const secretHash = await hashPortalSecret(opaqueSecret(authorization));
  const row = await db.prepare(`
    SELECT id, organization_id, customer_id, expires_at, revoked_at
    FROM portal_sessions
    WHERE secret_hash = ? AND revoked_at IS NULL AND expires_at > ?
    LIMIT 1
  `).bind(secretHash, now.toISOString()).first<{
    id: string; organization_id: string; customer_id: string; expires_at: string; revoked_at: string | null;
  }>();
  if (!row) throw new PortalAccessError(401);
  return { organizationId: row.organization_id, customerId: row.customer_id, sessionId: row.id };
}
