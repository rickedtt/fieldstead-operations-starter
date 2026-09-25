import { describe, expect, it } from 'vitest';
import { authenticateBearer, AuthError } from './auth';
import { FakeD1Database } from './testing/fake-d1';
import type { VerifiedJwtClaims } from './types';

function database(): FakeD1Database {
  const db = new FakeD1Database();
  db.users.push({
    id: 'user-1', organization_id: 'org-1', role: 'field_crew', status: 'active',
  });
  return db;
}

const verifier = async (): Promise<VerifiedJwtClaims> => ({
  sub: 'user-1',
  organization_id: 'org-1',
  session_id: 'session-1',
  device_id: 'device-1',
});

describe('sync authentication', () => {
  it('rejects missing and malformed bearer authorization', async () => {
    const environment = { DB: database() as unknown as D1Database, JWT_ASYMMETRIC_VERIFIER: verifier };
    await expect(authenticateBearer(null, environment)).rejects.toMatchObject({ status: 401 });
    await expect(authenticateBearer('Basic abc', environment)).rejects.toBeInstanceOf(AuthError);
  });

  it('uses active D1 tenant and role while preserving verified session/device claims', async () => {
    await expect(authenticateBearer('Bearer verified-token', {
      DB: database() as unknown as D1Database,
      JWT_ASYMMETRIC_VERIFIER: verifier,
    })).resolves.toEqual({
      user_id: 'user-1',
      organization_id: 'org-1',
      role: 'field_crew',
      session_id: 'session-1',
      device_id: 'device-1',
    });
  });

  it('rejects incomplete identity claims before database authorization', async () => {
    await expect(authenticateBearer('Bearer verified-token', {
      DB: database() as unknown as D1Database,
      JWT_ASYMMETRIC_VERIFIER: async () => ({
        sub: 'user-1', organization_id: 'org-1', session_id: '', device_id: 'device-1',
      }),
    })).rejects.toMatchObject({ status: 401, code: 'authentication_failed' });
  });

  it('rejects users not active in the claimed tenant', async () => {
    await expect(authenticateBearer('Bearer verified-token', {
      DB: database() as unknown as D1Database,
      JWT_ASYMMETRIC_VERIFIER: async () => ({
        sub: 'user-1', organization_id: 'org-other', session_id: 'session-1', device_id: 'device-1',
      }),
    })).rejects.toMatchObject({ status: 403 });
  });
});
