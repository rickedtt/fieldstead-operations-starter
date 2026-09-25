import { describe, expect, it } from 'vitest';
import { previewEstimateDelivery } from './estimate-delivery';
import { FakeD1Database } from './testing/fake-d1';

const owner = { user_id: 'owner-1', organization_id: 'org-1', role: 'owner_admin' as const };
const dispatcher = { ...owner, role: 'dispatcher' as const };

function fixture() {
  const db = new FakeD1Database();
  db.customers.push({ id: 'customer-1', organization_id: 'org-1', name: 'Ada Customer', email: 'ada@example.test' });
  db.portalEstimates.push({ id: 'estimate-1', organization_id: 'org-1', customer_id: 'customer-1', job_id: 'job-1', estimate_number: 'EST-1001', status: 'sent', subtotal_cents: 25000, issued_at: '2026-09-24T00:00:00.000Z', expires_at: '2026-10-01T00:00:00.000Z', version: 2, decided_at: null, updated_at: '2026-09-24T00:00:00.000Z' });
  return db;
}

describe('estimate delivery preview boundary', () => {
  it('allows only an owner to preview exact tenant-scoped estimate content without sending', async () => {
    const db = fixture();
    const preview = await previewEstimateDelivery(db as unknown as D1Database, owner, { estimateId: 'estimate-1', version: 2 });
    expect(preview.recipient).toBe('ada@example.test');
    expect(preview.subject).toContain('EST-1001');
    expect(preview.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(db.activities).toHaveLength(0);
    await expect(previewEstimateDelivery(db as unknown as D1Database, dispatcher, { estimateId: 'estimate-1', version: 2 })).rejects.toMatchObject({ status: 403 });
    await expect(previewEstimateDelivery(db as unknown as D1Database, owner, { estimateId: 'estimate-1', version: 1 })).rejects.toMatchObject({ status: 409 });
  });
});