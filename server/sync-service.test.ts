import { describe, expect, it } from 'vitest';
import { processSyncBatch } from './sync-service';
import { FakeD1Database } from './testing/fake-d1';
import type { AuthIdentity } from './types';

const dispatcher: AuthIdentity = { user_id: 'dispatch-1', organization_id: 'org-a', role: 'dispatcher' };
const crew: AuthIdentity = { user_id: 'crew-1', organization_id: 'org-a', role: 'field_crew' };
const createdAt = '2026-09-05T15:00:00.000Z';

function operation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'op-1', entityType: 'job', entityId: 'job-1', kind: 'job.update',
    payload: { baseVersion: 1, status: 'En route' }, createdAt, ...overrides,
  };
}

function batch(op = operation()) {
  return { protocolVersion: 1, batchId: 'batch-1', clientId: 'client-1', operations: [op] };
}

function database(): FakeD1Database {
  const db = new FakeD1Database();
  db.customers.push({ id: 'customer-1', organization_id: 'org-a' });
  db.jobs.push({
    id: 'job-1', organization_id: 'org-a', customer_id: 'customer-1',
    assigned_user_id: 'crew-1', service: 'Spring cleanup', description: 'Front beds',
    status: 'Scheduled', scheduled_for: null, quote_amount: 1200,
    quote_margin: 0.3, invoice_amount: 0, version: 1,
    created_at: createdAt, updated_at: createdAt,
  });
  db.jobs.push({
    id: 'job-1', organization_id: 'org-b', customer_id: 'customer-b',
    assigned_user_id: 'crew-b', service: 'Other tenant', description: 'Secret',
    status: 'Scheduled', scheduled_for: null, quote_amount: 9000,
    quote_margin: 0.7, invoice_amount: 0, version: 4,
    created_at: createdAt, updated_at: createdAt,
  });
  return db;
}

describe('D1 sync service', () => {
  it('rejects malformed batches before database work', async () => {
    const db = database();
    await expect(processSyncBatch(db as unknown as D1Database, dispatcher, { operations: 'bad' }))
      .rejects.toMatchObject({ status: 400 });
    expect(db.mutations).toHaveLength(0);
  });

  it('scopes reads and updates to the authenticated tenant', async () => {
    const db = database();
    const result = await processSyncBatch(db as unknown as D1Database, dispatcher, batch());
    expect(result.acceptedOperationIds).toEqual(['op-1']);
    expect(db.jobs.find((job) => job.organization_id === 'org-a')).toMatchObject({ status: 'En route', version: 2 });
    expect(db.jobs.find((job) => job.organization_id === 'org-b')).toMatchObject({ status: 'Scheduled', version: 4 });
  });

  it('forbids field crew financial updates', async () => {
    const db = database();
    const result = await processSyncBatch(db as unknown as D1Database, crew, batch(operation({
      payload: { baseVersion: 1, quoteAmount: 1, quoteMargin: 0.99 },
    })));
    expect(result.rejectedOperations).toEqual([
      expect.objectContaining({ operationId: 'op-1', code: 'forbidden', retryable: false }),
    ]);
    expect(db.jobs[0]).toMatchObject({ quote_amount: 1200, quote_margin: 0.3, version: 1 });
  });

  it('accepts an assigned field crew operational update', async () => {
    const db = database();
    const result = await processSyncBatch(db as unknown as D1Database, crew, batch());
    expect(result.acceptedOperationIds).toEqual(['op-1']);
    expect(db.jobs[0]).toMatchObject({ status: 'En route', version: 2 });
  });

  it('replays the stored result for an identical retry', async () => {
    const db = database();
    const first = await processSyncBatch(db as unknown as D1Database, dispatcher, batch());
    const replay = await processSyncBatch(db as unknown as D1Database, dispatcher, { ...batch(), batchId: 'batch-2' });
    expect(replay.acceptedOperationIds).toEqual(first.acceptedOperationIds);
    expect(db.jobs[0]).toMatchObject({ version: 2 });
    expect(db.mutations).toHaveLength(1);
  });

  it('rejects an idempotency key reused with changed content', async () => {
    const db = database();
    await processSyncBatch(db as unknown as D1Database, dispatcher, batch());
    const changed = await processSyncBatch(db as unknown as D1Database, dispatcher, {
      ...batch(), batchId: 'batch-2', operations: [operation({ payload: { baseVersion: 2, status: 'Completed' } })],
    });
    expect(changed.rejectedOperations).toEqual([
      expect.objectContaining({ code: 'idempotency_key_reused', retryable: false }),
    ]);
    expect(db.jobs[0]).toMatchObject({ status: 'En route', version: 2 });
  });

  it('returns and durably replays a server-wins conflict record', async () => {
    const db = database();
    db.jobs[0].version = 3;
    db.jobs[0].status = 'In progress';
    const result = await processSyncBatch(db as unknown as D1Database, dispatcher, batch());
    expect(result.rejectedOperations).toEqual([expect.objectContaining({ code: 'conflict', retryable: false })]);
    expect(result.conflicts).toEqual([expect.objectContaining({
      operationId: 'op-1', serverVersion: '3', clientVersion: '1',
      serverRecord: expect.objectContaining({ id: 'job-1', status: 'In progress', version: 3 }),
    })]);
    expect(db.mutations).toHaveLength(1);
  });

  it('returns a retryable rejection when D1 fails', async () => {
    const db = database();
    db.failNextBatch = true;
    const result = await processSyncBatch(db as unknown as D1Database, dispatcher, batch());
    expect(result.rejectedOperations).toEqual([
      expect.objectContaining({ operationId: 'op-1', code: 'server_error', retryable: true }),
    ]);
    expect(db.jobs[0]).toMatchObject({ status: 'Scheduled', version: 1 });
  });

  it('creates a tenant-scoped job for a dispatcher', async () => {
    const db = database();
    const result = await processSyncBatch(db as unknown as D1Database, dispatcher, batch(operation({
      id: 'op-create', entityId: 'job-2', kind: 'job.create',
      payload: { customerId: 'customer-1', service: 'Fall cleanup', description: 'Back garden' },
    })));
    expect(result.acceptedOperationIds).toEqual(['op-create']);
    expect(db.jobs).toContainEqual(expect.objectContaining({
      id: 'job-2', organization_id: 'org-a', customer_id: 'customer-1', version: 1,
    }));
  });

  it('records a manual check-in only against an assigned tenant job', async () => {
    const db = database();
    const result = await processSyncBatch(db as unknown as D1Database, crew, batch(operation({
      id: 'op-checkin', entityType: 'activityEvent', entityId: 'event-1', kind: 'checkin.manual',
      payload: { jobId: 'job-1', detail: { note: 'Arrived at property' } },
    })));
    expect(result.acceptedOperationIds).toEqual(['op-checkin']);
    expect(db.activities).toContainEqual(expect.objectContaining({
      id: 'event-1', organization_id: 'org-a', job_id: 'job-1', actor_user_id: 'crew-1',
    }));
  });

  it('creates one tenant-scoped draft invoice when a completed job is synced more than once', async () => {
    const db = database();
    const completed = operation({
      id: 'op-complete-1',
      payload: { baseVersion: 1, status: 'Completed' },
    });
    const first = await processSyncBatch(db as unknown as D1Database, dispatcher, batch(completed));
    const second = await processSyncBatch(db as unknown as D1Database, dispatcher, batch(operation({
      id: 'op-complete-2',
      payload: { baseVersion: 2, status: 'Completed' },
    })));

    expect(first.acceptedOperationIds).toEqual(['op-complete-1']);
    expect(second.acceptedOperationIds).toEqual(['op-complete-2']);
    expect(db.invoices).toEqual([expect.objectContaining({
      organization_id: 'org-a',
      job_id: 'job-1',
      customer_id: 'customer-1',
      status: 'draft',
      amount_due_cents: 0,
    })]);
  });
});
