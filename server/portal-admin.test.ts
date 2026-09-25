import { beforeEach, describe, expect, it } from 'vitest';
import type { AuthIdentity } from './types';

import {
  PortalInvitationError,
  acceptPortalInvitation,
  createPortalInvitation,
  expirePortalInvitation,
  listPortalInvitations,
  resendPortalInvitation,
  resetPortalInvitationRateLimitsForTest,
  revokePortalInvitation,
} from './portal-invitations';
import { FakeD1Database } from './testing/fake-d1';

const now = new Date('2026-09-25T15:00:00.000Z');
const owner: AuthIdentity = { user_id: 'owner-1', organization_id: 'org-1', role: 'owner_admin' };
const dispatcher: AuthIdentity = { user_id: 'dispatcher-1', organization_id: 'org-1', role: 'dispatcher' };

function fixture() {
  const db = new FakeD1Database();
  db.customers.push(
    { id: 'customer-1', organization_id: 'org-1', name: 'Jamie Customer' },
    { id: 'customer-2', organization_id: 'org-1', name: 'Sibling Customer' },
    { id: 'customer-1', organization_id: 'org-2', name: 'Other Tenant Customer' },
  );
  return db;
}

const ids = (() => {
  let value = 0;
  return () => `generated-${++value}`;
})();
const secrets = (() => {
  let value = 0;
  return () => `portal_opaque_secret_${String(++value).padStart(8, '0')}`;
})();

describe('portal invitation administration', () => {
  beforeEach(() => resetPortalInvitationRateLimitsForTest());
  it('allows only owner administrators to create tenant-bound invitations without persisting plaintext tokens', async () => {
    const db = fixture();
    await expect(createPortalInvitation(db as unknown as D1Database, dispatcher, { customerId: 'customer-1', expiresInHours: 24 }, { now, newId: ids, newSecret: secrets }))
      .rejects.toMatchObject({ status: 403, message: 'Forbidden.' });

    const created = await createPortalInvitation(db as unknown as D1Database, owner, { customerId: 'customer-1', expiresInHours: 24 }, { now, newId: ids, newSecret: secrets });
    expect(created.invitation).toMatchObject({ customerId: 'customer-1', expiresAt: '2026-09-26T15:00:00.000Z' });
    expect(created.token).toMatch(/^portal_opaque_secret_/);
    expect(JSON.stringify(db.portalInvitations)).not.toContain(created.token);
    expect(db.portalInvitations[0]).toMatchObject({ organization_id: 'org-1', customer_id: 'customer-1', created_by_user_id: 'owner-1' });
    expect(db.activities.at(-1)).toMatchObject({ organization_id: 'org-1', customer_id: 'customer-1', event_type: 'portal.invitation.created' });
    expect(String(db.activities.at(-1)?.detail_json)).not.toContain(created.token);
  });

  it('rejects wrong-customer and cross-tenant administration with generic errors', async () => {
    const db = fixture();
    await expect(createPortalInvitation(db as unknown as D1Database, owner, { customerId: 'missing', expiresInHours: 24 }, { now, newId: ids, newSecret: secrets }))
      .rejects.toMatchObject({ status: 404, message: 'Not found.' });
    await expect(revokePortalInvitation(db as unknown as D1Database, owner, 'other-tenant-invitation', { now, newId: ids }))
      .rejects.toMatchObject({ status: 404, message: 'Not found.' });
  });

  it('enforces bounded expiry and per-owner creation rate limits', async () => {
    const db = fixture();
    await expect(createPortalInvitation(db as unknown as D1Database, owner, { customerId: 'customer-1', expiresInHours: 0 }, { now, newId: ids, newSecret: secrets }))
      .rejects.toBeInstanceOf(PortalInvitationError);
    await expect(createPortalInvitation(db as unknown as D1Database, owner, { customerId: 'customer-1', expiresInHours: 169 }, { now, newId: ids, newSecret: secrets }))
      .rejects.toMatchObject({ status: 400 });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await createPortalInvitation(db as unknown as D1Database, owner, { customerId: 'customer-1', expiresInHours: 24 }, { now, newId: ids, newSecret: secrets });
    }
    await expect(createPortalInvitation(db as unknown as D1Database, owner, { customerId: 'customer-1', expiresInHours: 24 }, { now, newId: ids, newSecret: secrets }))
      .rejects.toMatchObject({ status: 429, message: 'Too many requests.' });
  });

  it('resends by revoking the old invitation, creates a fresh token, and lists no secret material', async () => {
    const db = fixture();
    const first = await createPortalInvitation(db as unknown as D1Database, owner, { customerId: 'customer-1', expiresInHours: 24 }, { now, newId: ids, newSecret: secrets });
    const resent = await resendPortalInvitation(db as unknown as D1Database, owner, first.invitation.id, { expiresInHours: 48 }, { now, newId: ids, newSecret: secrets });
    expect(resent.token).not.toBe(first.token);
    expect(db.portalInvitations.find((row) => row.id === first.invitation.id)?.revoked_at).toBe(now.toISOString());
    const listed = await listPortalInvitations(db as unknown as D1Database, owner, 'customer-1');
    expect(JSON.stringify(listed)).not.toContain('secret_hash');
    expect(listed).toHaveLength(2);
    expect(db.activities.map((row) => row.event_type)).toContain('portal.invitation.resent');
  });

  it('exchanges once into a read-only portal session and rejects replay, expiry, and revocation generically', async () => {
    const db = fixture();
    const created = await createPortalInvitation(db as unknown as D1Database, owner, { customerId: 'customer-1', expiresInHours: 24 }, { now, newId: ids, newSecret: secrets });
    const accepted = await acceptPortalInvitation(db as unknown as D1Database, created.token, { now, newId: ids, newSecret: secrets });
    expect(accepted.sessionToken).toMatch(/^portal_opaque_secret_/);
    expect(JSON.stringify(db.portalSessions)).not.toContain(accepted.sessionToken);
    expect(db.portalSessions[0]).toMatchObject({ organization_id: 'org-1', customer_id: 'customer-1', invitation_id: created.invitation.id });
    await expect(acceptPortalInvitation(db as unknown as D1Database, created.token, { now, newId: ids, newSecret: secrets }))
      .rejects.toMatchObject({ status: 401, message: 'Unauthorized.' });

    const expired = await createPortalInvitation(db as unknown as D1Database, owner, { customerId: 'customer-2', expiresInHours: 1 }, { now, newId: ids, newSecret: secrets });
    await expect(acceptPortalInvitation(db as unknown as D1Database, expired.token, { now: new Date('2026-09-25T16:00:01.000Z'), newId: ids, newSecret: secrets }))
      .rejects.toMatchObject({ status: 401, message: 'Unauthorized.' });

    const revoked = await createPortalInvitation(db as unknown as D1Database, owner, { customerId: 'customer-2', expiresInHours: 24 }, { now, newId: ids, newSecret: secrets });
    await revokePortalInvitation(db as unknown as D1Database, owner, revoked.invitation.id, { now, newId: ids });
    await expect(acceptPortalInvitation(db as unknown as D1Database, revoked.token, { now, newId: ids, newSecret: secrets }))
      .rejects.toMatchObject({ status: 401, message: 'Unauthorized.' });
  });

  it('revokes active sessions immediately and supports explicit owner expiry', async () => {
    const db = fixture();
    const created = await createPortalInvitation(db as unknown as D1Database, owner, { customerId: 'customer-1', expiresInHours: 24 }, { now, newId: ids, newSecret: secrets });
    await acceptPortalInvitation(db as unknown as D1Database, created.token, { now, newId: ids, newSecret: secrets });
    await revokePortalInvitation(db as unknown as D1Database, owner, created.invitation.id, { now, newId: ids });
    expect(db.portalSessions[0].revoked_at).toBe(now.toISOString());

    const second = await createPortalInvitation(db as unknown as D1Database, owner, { customerId: 'customer-2', expiresInHours: 24 }, { now, newId: ids, newSecret: secrets });
    await expirePortalInvitation(db as unknown as D1Database, owner, second.invitation.id, { now, newId: ids });
    expect(db.portalInvitations.find((row) => row.id === second.invitation.id)?.expires_at).toBe(now.toISOString());
  });

  it('rate limits token exchange attempts without revealing invitation state', async () => {
    const db = fixture();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expect(acceptPortalInvitation(db as unknown as D1Database, `invalid_opaque_token_${attempt}`, { now, newId: ids, newSecret: secrets, rateLimitKey: 'client-a' }))
        .rejects.toMatchObject({ status: 401, message: 'Unauthorized.' });
    }
    await expect(acceptPortalInvitation(db as unknown as D1Database, 'invalid_opaque_token_final', { now, newId: ids, newSecret: secrets, rateLimitKey: 'client-a' }))
      .rejects.toMatchObject({ status: 429, message: 'Too many requests.' });
  });
});
