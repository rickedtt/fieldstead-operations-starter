import { describe, expect, it } from 'vitest';
import { authenticateBearer, AuthError } from './auth';
import { FakeD1Database } from './testing/fake-d1';

const encoder = new TextEncoder();
const secret = 'correct-horse-battery-staple';

function base64url(value: Uint8Array | string): string {
  const bytes = typeof value === 'string' ? encoder.encode(value) : value;
  return Buffer.from(bytes).toString('base64url');
}

async function token(
  claims: Record<string, unknown>,
  signingSecret = secret,
): Promise<string> {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify(claims));
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(signingSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${header}.${payload}`));
  return `${header}.${payload}.${base64url(new Uint8Array(signature))}`;
}

function database(): FakeD1Database {
  const db = new FakeD1Database();
  db.users.push({
    id: 'user-1', organization_id: 'org-1', role: 'field_crew', status: 'active',
  });
  return db;
}

describe('sync authentication', () => {
  it('rejects missing and malformed bearer authorization', async () => {
    await expect(authenticateBearer(null, { DB: database() as unknown as D1Database, JWT_SECRET: secret }))
      .rejects.toMatchObject({ status: 401 });
    await expect(authenticateBearer('Basic abc', { DB: database() as unknown as D1Database, JWT_SECRET: secret }))
      .rejects.toBeInstanceOf(AuthError);
  });

  it('rejects an invalid signature, expired token, and future-issued token', async () => {
    const now = 2_000_000_000;
    const claims = { sub: 'user-1', organization_id: 'org-1', iat: now - 10, exp: now + 60 };
    await expect(authenticateBearer(`Bearer ${await token(claims, 'wrong-secret')}`, {
      DB: database() as unknown as D1Database, JWT_SECRET: secret,
    }, now)).rejects.toMatchObject({ status: 401 });
    await expect(authenticateBearer(`Bearer ${await token({ ...claims, exp: now - 1 })}`, {
      DB: database() as unknown as D1Database, JWT_SECRET: secret,
    }, now)).rejects.toMatchObject({ status: 401 });
    await expect(authenticateBearer(`Bearer ${await token({ ...claims, iat: now + 1 })}`, {
      DB: database() as unknown as D1Database, JWT_SECRET: secret,
    }, now)).rejects.toMatchObject({ status: 401 });
  });

  it('uses the active D1 user role instead of a token-supplied role', async () => {
    const now = 2_000_000_000;
    const bearer = await token({
      sub: 'user-1', organization_id: 'org-1', role: 'owner_admin', iat: now - 10, exp: now + 60,
    });
    await expect(authenticateBearer(`Bearer ${bearer}`, {
      DB: database() as unknown as D1Database, JWT_SECRET: secret,
    }, now)).resolves.toEqual({ user_id: 'user-1', organization_id: 'org-1', role: 'field_crew' });
  });

  it('requires configured issuer/audience and a bounded token lifetime', async () => {
    const now = 2_000_000_000;
    const environment = { DB: database() as unknown as D1Database, JWT_SECRET: secret, JWT_ISSUER: 'fieldstead', JWT_AUDIENCE: 'fieldstead-sync', JWT_MAX_LIFETIME_SECONDS: 900 };
    const valid = { sub: 'user-1', organization_id: 'org-1', iss: 'fieldstead', aud: 'fieldstead-sync', iat: now - 10, exp: now + 60 };
    await expect(authenticateBearer(`Bearer ${await token({ ...valid, iss: 'other' })}`, environment, now)).rejects.toMatchObject({ status: 401 });
    await expect(authenticateBearer(`Bearer ${await token({ ...valid, aud: 'other' })}`, environment, now)).rejects.toMatchObject({ status: 401 });
    await expect(authenticateBearer(`Bearer ${await token({ ...valid, exp: now + 901 })}`, environment, now)).rejects.toMatchObject({ status: 401 });
    await expect(authenticateBearer(`Bearer ${await token(valid)}`, environment, now)).resolves.toMatchObject({ user_id: 'user-1' });
  });
});
