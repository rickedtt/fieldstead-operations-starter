import { describe, expect, it } from 'vitest';
import { authenticateBearer } from './auth';
import { FakeD1Database } from './testing/fake-d1';

function database(): FakeD1Database {
  const db = new FakeD1Database();
  db.users.push({ id: 'user-1', organization_id: 'org-1', role: 'field_crew', status: 'active' });
  return db;
}

describe('production identity claim boundary', () => {
  it('fails closed when asymmetric verification is not configured', async () => {
    await expect(authenticateBearer('Bearer a.b.c', {
      DB: database() as unknown as D1Database,
      JWT_ISSUER: 'https://identity.fieldstead.invalid/',
      JWT_AUDIENCE: 'fieldstead-sync',
    })).rejects.toMatchObject({ status: 503, code: 'authentication_unavailable' });
  });

  it('rejects legacy symmetric JWT configuration', async () => {
    await expect(authenticateBearer('Bearer a.b.c', {
      DB: database() as unknown as D1Database,
      JWT_SECRET: 'legacy-shared-secret',
      JWT_ISSUER: 'https://identity.fieldstead.invalid/',
      JWT_AUDIENCE: 'fieldstead-sync',
    })).rejects.toMatchObject({ status: 503, code: 'authentication_unavailable' });
  });
});
