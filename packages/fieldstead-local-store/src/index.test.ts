import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { Customer, Job, ServiceRequest } from '../../fieldstead-domain/src';
import { createFieldsteadRepository, type FieldsteadRepository } from './index';

const databases: FieldsteadRepository[] = [];

function sampleJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'HP-2000',
    customerId: 'cus-1',
    service: 'Gutter cleaning',
    description: 'Clean gutters and downspouts.',
    quoteStatus: 'Approved',
    quoteAmount: 320,
    durationHours: 2,
    crew: 'Luis + Sam',
    status: 'Scheduled',
    invoiceStatus: 'Not created',
    invoiceAmount: 320,
    createdAt: '2026-09-04T10:00:00.000Z',
    updatedAt: '2026-09-04T10:00:00.000Z',
    ...overrides,
  };
}

async function repository() {
  const repo = createFieldsteadRepository(
    `fieldstead-test-${crypto.randomUUID()}`,
  );
  databases.push(repo);
  await repo.jobs.put(sampleJob());
  return repo;
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map((repo) => repo.delete()));
});

describe('optimistic local mutations', () => {
  it('makes the mutation locally readable and creates its outbox record', async () => {
    const repo = await repository();

    const updated = await repo.mutateJob({
      jobId: 'HP-2000',
      changes: { status: 'En route' },
      operationId: 'op-1',
      occurredAt: '2026-09-04T12:00:00.000Z',
    });

    expect(updated.status).toBe('En route');
    await expect(repo.getJob('HP-2000')).resolves.toMatchObject({
      status: 'En route',
    });
    await expect(repo.listPendingOperations()).resolves.toEqual([
      expect.objectContaining({
        id: 'op-1',
        entityId: 'HP-2000',
        kind: 'job.update',
        payload: { status: 'En route' },
      }),
    ]);
  });

  it('rolls back the job update when the outbox id is duplicated', async () => {
    const repo = await repository();
    await repo.mutateJob({
      jobId: 'HP-2000',
      changes: { status: 'En route' },
      operationId: 'same-operation',
      occurredAt: '2026-09-04T12:00:00.000Z',
    });

    await expect(
      repo.mutateJob({
        jobId: 'HP-2000',
        changes: { status: 'In progress' },
        operationId: 'same-operation',
        occurredAt: '2026-09-04T12:05:00.000Z',
      }),
    ).rejects.toThrow();

    await expect(repo.getJob('HP-2000')).resolves.toMatchObject({
      status: 'En route',
      updatedAt: '2026-09-04T12:00:00.000Z',
    });
    await expect(repo.outboxOperations.count()).resolves.toBe(1);
  });

  it('rejects an unsupported status transition without writing an operation', async () => {
    const repo = await repository();

    await expect(
      repo.mutateJob({
        jobId: 'HP-2000',
        changes: { status: 'Completed' },
        operationId: 'op-invalid',
        occurredAt: '2026-09-04T12:00:00.000Z',
      }),
    ).rejects.toThrow(/Unsupported job status transition/);

    await expect(repo.getJob('HP-2000')).resolves.toMatchObject({
      status: 'Scheduled',
    });
    await expect(repo.outboxOperations.count()).resolves.toBe(0);
  });
});

function sampleCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'customer-1', displayName: 'Jamie Rivera', primaryEmail: 'jamie@example.com',
    sourceEmail: {
      accountId: 'mailbox-1', messageId: '<request-1@example.com>', normalizedFrom: 'jamie@example.com',
    },
    audit: {
      createdAt: '2026-09-24T12:00:00.000Z', createdBy: 'owner-1',
      updatedAt: '2026-09-24T12:00:00.000Z', updatedBy: 'owner-1',
    },
    ...overrides,
  };
}

function sampleServiceRequest(overrides: Partial<ServiceRequest> = {}): ServiceRequest {
  return {
    id: 'request-1', customerId: 'customer-1', summary: 'Gutter cleaning request',
    details: 'Please clean the gutters before October.', status: 'new',
    sourceEmail: {
      accountId: 'mailbox-1', messageId: '<request-1@example.com>', normalizedFrom: 'jamie@example.com',
    },
    audit: {
      createdAt: '2026-09-24T12:00:00.000Z', createdBy: 'owner-1',
      updatedAt: '2026-09-24T12:00:00.000Z', updatedBy: 'owner-1',
    },
    ...overrides,
  };
}

describe('durable customer and service request records', () => {
  it('persists and queries records without changing version 1 jobs', async () => {
    const name = `fieldstead-v2-${crypto.randomUUID()}`;
    const legacy = createFieldsteadRepository(name);
    databases.push(legacy);
    await legacy.jobs.put(sampleJob());
    legacy.close();

    const repo = createFieldsteadRepository(name);
    databases.push(repo);
    await repo.createCustomer(sampleCustomer());
    await repo.createServiceRequest(sampleServiceRequest());

    await expect(repo.getCustomer('customer-1')).resolves.toEqual(sampleCustomer());
    await expect(repo.findCustomerBySourceEmail('mailbox-1', '<request-1@example.com>'))
      .resolves.toEqual(sampleCustomer());
    await expect(repo.listServiceRequestsForCustomer('customer-1'))
      .resolves.toEqual([sampleServiceRequest()]);
    await expect(repo.getJob('HP-2000')).resolves.toEqual(sampleJob());
  });

  it('replays identical source-email creates and rejects conflicting reuse', async () => {
    const repo = await repository();

    await expect(repo.createCustomer(sampleCustomer())).resolves.toEqual(sampleCustomer());
    await expect(repo.createCustomer(sampleCustomer())).resolves.toEqual(sampleCustomer());
    await expect(repo.customers.count()).resolves.toBe(1);
    await expect(repo.createCustomer(sampleCustomer({ id: 'customer-2' })))
      .rejects.toThrow(/source email identity/i);

    await expect(repo.createServiceRequest(sampleServiceRequest())).resolves.toEqual(sampleServiceRequest());
    await expect(repo.createServiceRequest(sampleServiceRequest())).resolves.toEqual(sampleServiceRequest());
    await expect(repo.serviceRequests.count()).resolves.toBe(1);
    await expect(repo.createServiceRequest(sampleServiceRequest({ id: 'request-2' })))
      .rejects.toThrow(/source email identity/i);
  });

  it('updates audit metadata while preserving immutable creation and source identity', async () => {
    const repo = await repository();
    await repo.createCustomer(sampleCustomer());

    const updated = await repo.updateCustomer({
      customerId: 'customer-1', changes: { displayName: 'Jamie R.' },
      updatedAt: '2026-09-24T13:00:00.000Z', updatedBy: 'dispatcher-1',
    });

    expect(updated).toMatchObject({
      displayName: 'Jamie R.', sourceEmail: sampleCustomer().sourceEmail,
      audit: {
        createdAt: '2026-09-24T12:00:00.000Z', createdBy: 'owner-1',
        updatedAt: '2026-09-24T13:00:00.000Z', updatedBy: 'dispatcher-1',
      },
    });
  });

  it('updates service request status and audit metadata without changing source identity', async () => {
    const repo = await repository();
    await repo.createServiceRequest(sampleServiceRequest());

    const updated = await repo.updateServiceRequest({
      serviceRequestId: 'request-1', changes: { status: 'reviewed' },
      updatedAt: '2026-09-24T13:30:00.000Z', updatedBy: 'dispatcher-1',
    });

    expect(updated).toMatchObject({
      status: 'reviewed', sourceEmail: sampleServiceRequest().sourceEmail,
      audit: {
        createdAt: '2026-09-24T12:00:00.000Z', createdBy: 'owner-1',
        updatedAt: '2026-09-24T13:30:00.000Z', updatedBy: 'dispatcher-1',
      },
    });
  });
});
