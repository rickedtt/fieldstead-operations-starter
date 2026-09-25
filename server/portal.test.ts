import { describe, expect, it } from 'vitest';
import { authenticatePortalSession, hashPortalSecret } from './portal-auth';
import { decidePortalEstimate, getPortalResource, listPortalResource } from './portal-service';
import { FakeD1Database } from './testing/fake-d1';

const now = new Date('2026-09-25T15:00:00.000Z');

async function fixture() {
  const db = new FakeD1Database();
  const secret = 'portal_session_qvK4Uj1Yw6Et8Ab9Nx2Z';
  db.portalSessions.push({
    id: 'session-1', organization_id: 'org-1', customer_id: 'customer-1',
    secret_hash: await hashPortalSecret(secret), expires_at: '2026-09-26T15:00:00.000Z', revoked_at: null,
  });
  db.portalSessions.push({
    id: 'session-sibling', organization_id: 'org-1', customer_id: 'customer-2',
    secret_hash: await hashPortalSecret('sibling-secret'), expires_at: '2026-09-26T15:00:00.000Z', revoked_at: null,
  });
  db.jobs.push({ id: 'job-1', organization_id: 'org-1', customer_id: 'customer-1', assigned_user_id: 'private-user', service: 'Gutter cleaning', description: 'Front and rear gutters', status: 'Scheduled', scheduled_for: '2026-09-28T14:00:00.000Z', quote_amount: 250, quote_margin: 0.42, invoice_amount: 250, version: 3, created_at: '2026-09-20T00:00:00.000Z', updated_at: '2026-09-24T00:00:00.000Z' });
  db.jobs.push({ id: 'job-sibling', organization_id: 'org-1', customer_id: 'customer-2', service: 'Private sibling job', description: 'hidden', status: 'Scheduled', scheduled_for: null, quote_amount: 10, quote_margin: 0.9, invoice_amount: 10, version: 1, created_at: '', updated_at: '' });
  db.jobs.push({ id: 'job-other-org', organization_id: 'org-2', customer_id: 'customer-1', service: 'Other tenant job', description: 'hidden', status: 'Scheduled', scheduled_for: null, quote_amount: 10, quote_margin: 0.9, invoice_amount: 10, version: 1, created_at: '', updated_at: '' });
  db.portalEstimates.push({ id: 'estimate-1', organization_id: 'org-1', customer_id: 'customer-1', job_id: 'job-1', estimate_number: 'EST-1001', status: 'sent', subtotal_cents: 25000, issued_at: '2026-09-24T00:00:00.000Z', expires_at: '2026-10-01T00:00:00.000Z', version: 2, decided_at: null, internal_notes: 'margin target 42%', created_by_user_id: 'private-user', updated_at: '2026-09-24T00:00:00.000Z' });
  db.invoices.push({ id: 'invoice-1', organization_id: 'org-1', customer_id: 'customer-1', job_id: 'job-1', created_by_user_id: 'private-user', invoice_number: 'INV-1001', status: 'sent', currency: 'usd', amount_due_cents: 25000, issued_at: '2026-09-24T00:00:00.000Z', paid_at: null, paid_provider: 'stripe', paid_provider_event_id: 'secret-event', checkout_session_id: 'secret-checkout', version: 1, created_at: '', updated_at: '' });
  return { db, secret };
}

describe('customer portal boundaries', () => {
  it('authenticates only active hashed opaque sessions', async () => {
    const { db, secret } = await fixture();
    await expect(authenticatePortalSession(`Bearer ${secret}`, db as unknown as D1Database, now)).resolves.toEqual({ organizationId: 'org-1', customerId: 'customer-1', sessionId: 'session-1' });
    expect(JSON.stringify(db.portalSessions)).not.toContain(secret);
    await expect(authenticatePortalSession('Bearer wrong', db as unknown as D1Database, now)).rejects.toMatchObject({ status: 401, message: 'Unauthorized.' });
    db.portalSessions[0].expires_at = '2026-09-25T14:59:59.000Z';
    await expect(authenticatePortalSession(`Bearer ${secret}`, db as unknown as D1Database, now)).rejects.toMatchObject({ status: 401, message: 'Unauthorized.' });
    db.portalSessions[0].expires_at = '2026-09-26T15:00:00.000Z';
    db.portalSessions[0].revoked_at = '2026-09-25T14:00:00.000Z';
    await expect(authenticatePortalSession(`Bearer ${secret}`, db as unknown as D1Database, now)).rejects.toMatchObject({ status: 401, message: 'Unauthorized.' });
  });

  it('returns explicit portal-safe projections without secrets or internal fields', async () => {
    const { db, secret } = await fixture();
    const identity = await authenticatePortalSession(`Bearer ${secret}`, db as unknown as D1Database, now);
    const jobs = await listPortalResource(db as unknown as D1Database, identity, 'jobs');
    const estimates = await listPortalResource(db as unknown as D1Database, identity, 'estimates');
    const invoices = await listPortalResource(db as unknown as D1Database, identity, 'invoices');
    expect(jobs).toEqual([{ id: 'job-1', service: 'Gutter cleaning', description: 'Front and rear gutters', status: 'Scheduled', scheduledFor: '2026-09-28T14:00:00.000Z' }]);
    expect(estimates).toEqual([{ id: 'estimate-1', jobId: 'job-1', estimateNumber: 'EST-1001', status: 'sent', subtotalCents: 25000, issuedAt: '2026-09-24T00:00:00.000Z' }]);
    expect(invoices).toEqual([{ id: 'invoice-1', jobId: 'job-1', invoiceNumber: 'INV-1001', status: 'sent', currency: 'usd', amountDueCents: 25000, issuedAt: '2026-09-24T00:00:00.000Z', paidAt: null }]);
    expect(JSON.stringify({ jobs, estimates, invoices })).not.toMatch(/organization|customerId|assigned|margin|createdBy|provider|checkout|secret/i);
  });

  it('hides sibling-customer and cross-tenant resources behind generic not found', async () => {
    const { db, secret } = await fixture();
    const identity = await authenticatePortalSession(`Bearer ${secret}`, db as unknown as D1Database, now);
    await expect(getPortalResource(db as unknown as D1Database, identity, 'jobs', 'job-sibling')).rejects.toMatchObject({ status: 404, message: 'Not found.' });
    await expect(getPortalResource(db as unknown as D1Database, identity, 'jobs', 'job-other-org')).rejects.toMatchObject({ status: 404, message: 'Not found.' });
  });

  it('records one explicitly confirmed decision for the current sent estimate version and audits it', async () => {
    const { db, secret } = await fixture();
    const identity = await authenticatePortalSession(`Bearer ${secret}`, db as unknown as D1Database, now);
    const result = await decidePortalEstimate(db as unknown as D1Database, identity, 'estimate-1', { decision: 'approved', version: 2, confirmation: true, idempotencyKey: 'decision-1' }, { now, newId: () => 'audit-decision-1' });
    expect(result).toEqual({ estimateId: 'estimate-1', status: 'approved', version: 2, decidedAt: now.toISOString() });
    expect(db.activities).toContainEqual(expect.objectContaining({ event_type: 'portal.estimate.approved', customer_id: 'customer-1', actor_user_id: null }));
    await expect(decidePortalEstimate(db as unknown as D1Database, identity, 'estimate-1', { decision: 'approved', version: 2, confirmation: true, idempotencyKey: 'decision-1' }, { now })).resolves.toEqual(result);
    expect(db.activities.filter((row) => row.event_type === 'portal.estimate.approved')).toHaveLength(1);
    await expect(decidePortalEstimate(db as unknown as D1Database, identity, 'estimate-1', { decision: 'declined', version: 2, confirmation: true, idempotencyKey: 'decision-1' }, { now })).rejects.toMatchObject({ status: 409 });
  });

  it('rejects unconfirmed, stale, expired, immutable, and cross-customer estimate decisions', async () => {
    const { db, secret } = await fixture();
    const identity = await authenticatePortalSession(`Bearer ${secret}`, db as unknown as D1Database, now);
    await expect(decidePortalEstimate(db as unknown as D1Database, identity, 'estimate-1', { decision: 'approved', version: 2, confirmation: false, idempotencyKey: 'decision-2' }, { now })).rejects.toMatchObject({ status: 400 });
    await expect(decidePortalEstimate(db as unknown as D1Database, identity, 'estimate-1', { decision: 'approved', version: 1, confirmation: true, idempotencyKey: 'decision-3' }, { now })).rejects.toMatchObject({ status: 409 });
    db.portalEstimates[0].expires_at = '2026-09-25T14:59:59.000Z';
    await expect(decidePortalEstimate(db as unknown as D1Database, identity, 'estimate-1', { decision: 'declined', version: 2, confirmation: true, idempotencyKey: 'decision-4' }, { now })).rejects.toMatchObject({ status: 409 });
    db.portalEstimates[0].expires_at = '2026-10-01T00:00:00.000Z';
    db.portalEstimates[0].status = 'approved';
    await expect(decidePortalEstimate(db as unknown as D1Database, identity, 'estimate-1', { decision: 'declined', version: 2, confirmation: true, idempotencyKey: 'decision-5' }, { now })).rejects.toMatchObject({ status: 409 });
    db.portalEstimates.push({ ...db.portalEstimates[0], id: 'estimate-sibling', customer_id: 'customer-2', status: 'sent' });
    await expect(decidePortalEstimate(db as unknown as D1Database, identity, 'estimate-sibling', { decision: 'approved', version: 2, confirmation: true, idempotencyKey: 'decision-6' }, { now })).rejects.toMatchObject({ status: 404 });
  });
});
