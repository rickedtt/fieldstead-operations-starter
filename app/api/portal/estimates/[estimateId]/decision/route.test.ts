import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeD1Database } from '../../../../../../server/testing/fake-d1';
import { hashPortalSecret } from '../../../../../../server/portal-auth';

const environment = vi.hoisted(() => ({ DB: undefined as D1Database | undefined }));
vi.mock('cloudflare:workers', () => ({ env: environment }));
import { GET, POST } from './route';

describe('portal estimate decision route', () => {
  beforeEach(async () => {
    const db = new FakeD1Database();
    db.portalSessions.push({ id: 'session-1', organization_id: 'org-1', customer_id: 'customer-1', secret_hash: await hashPortalSecret('portal-session-token'), expires_at: '2099-01-01T00:00:00.000Z', revoked_at: null });
    db.portalEstimates.push({ id: 'estimate-1', organization_id: 'org-1', customer_id: 'customer-1', status: 'sent', version: 1, expires_at: '2099-01-01T00:00:00.000Z', decided_at: null, decision_idempotency_key: null, decision_result_json: null });
    environment.DB = db as unknown as D1Database;
  });

  it('preserves the read-only collection route while allowing only the narrow decision POST', async () => {
    expect(GET().status).toBe(405);
    const response = await POST(new Request('https://fieldstead.test/api/portal/estimates/estimate-1/decision', { method: 'POST', headers: { authorization: 'Bearer portal-session-token', 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'approved', version: 1, confirmation: true, idempotencyKey: 'decision-route-1' }) }), { params: Promise.resolve({ estimateId: 'estimate-1' }) });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ estimateId: 'estimate-1', status: 'approved', version: 1 });
  });
});