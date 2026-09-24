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

  it('atomically commits an owner-approved combined email conversion with audit and outbox writes', async () => {
    const repo = await repository();
    const input = {
      operationId: 'email-op-1', approval: 'customer-and-request' as const,
      customer: sampleCustomer(), serviceRequest: sampleServiceRequest(),
      auditEvents: [
        { id: 'audit-customer', at: '2026-09-24T12:00:00.000Z', customerId: 'customer-1', actor: 'owner-1', action: 'Email intake customer created', detail: 'Created from mailbox-1 / <request-1@example.com>.' },
        { id: 'audit-request', at: '2026-09-24T12:00:00.000Z', customerId: 'customer-1', actor: 'owner-1', action: 'Email intake service request created', detail: 'Created request-1 from mailbox-1 / <request-1@example.com>.' },
      ],
      outboxOperations: [
        { id: 'email-op-1:customer', entityType: 'customer' as const, entityId: 'customer-1', kind: 'customer.create-from-email', payload: sampleCustomer(), createdAt: '2026-09-24T12:00:00.000Z', status: 'pending' as const },
        { id: 'email-op-1:request', entityType: 'serviceRequest' as const, entityId: 'request-1', kind: 'serviceRequest.create-from-email', payload: sampleServiceRequest(), createdAt: '2026-09-24T12:00:00.000Z', status: 'pending' as const },
      ],
    };

    expect((await repo.convertEmailIntake(input)).replayed).toBe(false);
    await expect(repo.customers.count()).resolves.toBe(1);
    await expect(repo.serviceRequests.count()).resolves.toBe(1);
    await expect(repo.activityEvents.count()).resolves.toBe(2);
    await expect(repo.outboxOperations.count()).resolves.toBe(2);
    expect((await repo.convertEmailIntake(input)).replayed).toBe(true);
    await expect(repo.customers.count()).resolves.toBe(1);
    await expect(repo.activityEvents.count()).resolves.toBe(2);
  });

  it('rejects conflicting idempotency reuse without changing prior writes', async () => {
    const repo = await repository();
    const input = {
      operationId: 'email-op-conflict', approval: 'customer-and-request' as const,
      customer: sampleCustomer(), serviceRequest: sampleServiceRequest(),
      auditEvents: [{ id: 'audit-customer', at: '2026-09-24T12:00:00.000Z', customerId: 'customer-1', actor: 'owner-1', action: 'Email intake converted', detail: 'Approved.' }],
      outboxOperations: [{ id: 'email-op-conflict:customer', entityType: 'customer' as const, entityId: 'customer-1', kind: 'customer.create-from-email', payload: sampleCustomer(), createdAt: '2026-09-24T12:00:00.000Z', status: 'pending' as const }],
    };
    await repo.convertEmailIntake(input);

    await expect(repo.convertEmailIntake({ ...input, customer: sampleCustomer({ displayName: 'Changed' }) }))
      .rejects.toThrow(/idempotency key reused/i);
    await expect(repo.getCustomer('customer-1')).resolves.toMatchObject({ displayName: 'Jamie Rivera' });
    await expect(repo.customers.count()).resolves.toBe(1);
    await expect(repo.activityEvents.count()).resolves.toBe(1);
    await expect(repo.outboxOperations.count()).resolves.toBe(1);
  });

  it('atomically converts an approved request to one linked draft job and replays duplicate confirmation', async () => {
    const repo = await repository();
    await repo.createCustomer(sampleCustomer());
    await repo.createServiceRequest(sampleServiceRequest({ status: 'reviewed' }));
    const input = {
      serviceRequestId: 'request-1', jobId: 'HP-2001', operationId: 'request-to-job-1',
      actorId: 'owner-1', actorRole: 'owner_admin' as const,
      occurredAt: '2026-09-24T14:00:00.000Z', auditEventId: 'audit-request-to-job-1',
    };

    const first = await repo.convertServiceRequestToJob(input);
    expect(first.replayed).toBe(false);
    expect(first.job).toMatchObject({
      id: 'HP-2001', customerId: 'customer-1', serviceRequestId: 'request-1',
      service: 'Gutter cleaning request', quoteStatus: 'Draft', quoteAmount: 0,
      status: 'Quoted', invoiceStatus: 'Not created', invoiceAmount: 0,
    });
    await expect(repo.getServiceRequest('request-1')).resolves.toMatchObject({
      status: 'converted', convertedJobId: 'HP-2001',
      audit: { updatedAt: input.occurredAt, updatedBy: 'owner-1' },
    });
    await expect(repo.activityEvents.get(input.auditEventId)).resolves.toMatchObject({
      jobId: 'HP-2001', customerId: 'customer-1', actor: 'owner-1',
      action: 'Service request converted to job',
    });
    await expect(repo.outboxOperations.get(input.operationId)).resolves.toMatchObject({
      entityType: 'job', entityId: 'HP-2001', kind: 'job.create-from-service-request',
    });

    const replay = await repo.convertServiceRequestToJob(input);
    expect(replay).toMatchObject({ replayed: true, job: { id: 'HP-2001' } });
    await expect(repo.jobs.where('serviceRequestId').equals('request-1').count()).resolves.toBe(1);
    await expect(repo.activityEvents.where('jobId').equals('HP-2001').count()).resolves.toBe(1);
  });

  it('requires owner approval and prevents a second job for the converted request', async () => {
    const repo = await repository();
    await repo.createCustomer(sampleCustomer());
    await repo.createServiceRequest(sampleServiceRequest({ status: 'reviewed' }));
    const base = {
      serviceRequestId: 'request-1', operationId: 'request-to-job-1', actorId: 'owner-1',
      occurredAt: '2026-09-24T14:00:00.000Z', auditEventId: 'audit-request-to-job-1',
    };

    await expect(repo.convertServiceRequestToJob({ ...base, jobId: 'HP-2001', actorRole: 'dispatcher' }))
      .rejects.toThrow(/owner approval/i);
    await expect(repo.jobs.get('HP-2001')).resolves.toBeUndefined();

    await repo.convertServiceRequestToJob({ ...base, jobId: 'HP-2001', actorRole: 'owner_admin' });
    await expect(repo.convertServiceRequestToJob({
      ...base, jobId: 'HP-2002', operationId: 'request-to-job-2',
      auditEventId: 'audit-request-to-job-2', actorRole: 'owner_admin',
    })).rejects.toThrow(/already converted/i);
    await expect(repo.jobs.where('serviceRequestId').equals('request-1').count()).resolves.toBe(1);
  });
});
