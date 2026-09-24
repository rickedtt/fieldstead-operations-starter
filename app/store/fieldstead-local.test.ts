import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActivityEvent, Customer, Job, ServiceRequest } from '../../packages/fieldstead-domain/src';
import {
  createFieldsteadRepository,
  type FieldsteadRepository,
} from '../../packages/fieldstead-local-store/src';
import { HARBOR_PINE_V1_STORAGE_KEY } from '../../packages/fieldstead-local-store/src/migration';
import { LocalJobsStore } from './fieldstead-local';

const repositories: FieldsteadRepository[] = [];

function job(overrides: Partial<Job> = {}): Job {
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

function customer(): Customer {
  return {
    id: 'customer-1', displayName: 'Jamie Rivera', primaryEmail: 'jamie@example.com',
    primaryPhone: '3125550142', serviceAddress: '42 Oak Street',
    sourceEmail: { accountId: 'mailbox-1', messageId: '<request-1@example.com>', normalizedFrom: 'jamie@example.com' },
    audit: { createdAt: '2026-09-24T12:00:00.000Z', createdBy: 'owner-1', updatedAt: '2026-09-24T12:00:00.000Z', updatedBy: 'owner-1' },
  };
}

function serviceRequest(): ServiceRequest {
  return {
    id: 'request-1', customerId: 'customer-1', summary: 'Gutter cleaning request',
    details: 'Please clean the gutters before October.', status: 'reviewed',
    sourceEmail: { accountId: 'mailbox-1', messageId: '<request-1@example.com>', normalizedFrom: 'jamie@example.com' },
    audit: { createdAt: '2026-09-24T12:00:00.000Z', createdBy: 'owner-1', updatedAt: '2026-09-24T12:00:00.000Z', updatedBy: 'owner-1' },
  };
}

function setup(fallbackJobs = [job()]) {
  const repository = createFieldsteadRepository(
    `fieldstead-adapter-${crypto.randomUUID()}`,
  );
  repositories.push(repository);
  const store = new LocalJobsStore({
    fallbackJobs,
    createRepository: () => repository,
    createOperationId: () => 'operation-1',
    now: () => '2026-09-04T12:00:00.000Z',
  });
  return { repository, store };
}

async function waitFor(
  assertion: () => void,
  timeoutMilliseconds = 1_000,
): Promise<void> {
  const startedAt = Date.now();
  while (true) {
    try {
      assertion();
      return;
    } catch (error) {
      if (Date.now() - startedAt >= timeoutMilliseconds) throw error;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
}

afterEach(async () => {
  await Promise.all(repositories.splice(0).map((repository) => repository.delete()));
});

describe('LocalJobsStore', () => {
  it('hydrates customers and activity alongside jobs without erasing existing durable records', async () => {
    const { repository, store } = setup([]);
    const existingCustomer = customer();
    const existingActivity: ActivityEvent = {
      id: 'activity-existing', at: '2026-09-24T12:30:00.000Z', customerId: existingCustomer.id,
      actor: 'Fieldstead owner', action: 'Customer reviewed', detail: 'Existing durable activity.',
    };
    await repository.open();
    await repository.createCustomer(existingCustomer);
    await repository.activityEvents.add(existingActivity);

    await store.start();
    await waitFor(() => expect(store.getSnapshot().loading).toBe(false));

    expect(store.getSnapshot()).toMatchObject({
      customers: [existingCustomer],
      activity: [existingActivity],
    });
    await expect(repository.customers.count()).resolves.toBe(1);
    await expect(repository.activityEvents.count()).resolves.toBe(1);
    store.stop();
  });

  it('creates a durable customer and activity event with a pending local outbox operation', async () => {
    const { repository, store } = setup([]);
    await store.start();
    const created = customer();
    const activity: ActivityEvent = {
      id: 'activity-customer-create', at: '2026-09-24T12:00:00.000Z', customerId: created.id,
      actor: 'Fieldstead owner', action: 'Customer added', detail: 'Jamie Rivera was added to the local customer list.',
    };

    await store.createCustomer(created, activity);

    expect(store.getSnapshot().customers).toEqual([created]);
    expect(store.getSnapshot().activity).toEqual([activity]);
    await expect(repository.getCustomer(created.id)).resolves.toEqual(created);
    await expect(repository.listPendingOperations()).resolves.toContainEqual(expect.objectContaining({
      entityType: 'customer', entityId: created.id, kind: 'customer.create',
    }));
    store.stop();
  });

  it('uses synthetic jobs until repository hydration and seeds an empty database', async () => {
    const { repository, store } = setup();

    expect(store.getSnapshot()).toMatchObject({
      jobs: [expect.objectContaining({ id: 'HP-2000' })],
      loading: true,
      error: null,
    });

    await store.start();
    await waitFor(() => expect(store.getSnapshot().loading).toBe(false));

    await expect(repository.listJobs()).resolves.toEqual([
      expect.objectContaining({ id: 'HP-2000' }),
    ]);
    store.stop();
  });

  it('reopens the same IndexedDB database with the saved Fieldstead job intact', async () => {
    const databaseName = `fieldstead-reopen-${crypto.randomUUID()}`;
    const firstRepository = createFieldsteadRepository(databaseName);
    repositories.push(firstRepository);
    const firstStore = new LocalJobsStore({
      fallbackJobs: [job({ id:'FS-DEMO-2000' })],
      createRepository: () => firstRepository,
      createOperationId: () => 'operation-reopen',
      now: () => '2026-09-15T12:00:00.000Z',
    });
    await firstStore.start();
    await waitFor(() => expect(firstStore.getSnapshot().loading).toBe(false));
    await firstStore.mutateJob('FS-DEMO-2000', { status:'En route' });
    firstStore.stop();
    firstRepository.close();

    const reopenedRepository = createFieldsteadRepository(databaseName);
    repositories.push(reopenedRepository);
    const reopenedStore = new LocalJobsStore({
      fallbackJobs: [job({ id:'FS-DEMO-2000' })],
      createRepository: () => reopenedRepository,
    });
    await reopenedStore.start();
    await waitFor(() => expect(reopenedStore.getSnapshot().loading).toBe(false));

    expect(reopenedStore.getSnapshot().jobs[0]).toMatchObject({ id:'FS-DEMO-2000', status:'En route' });
    reopenedStore.stop();
  });

  it('makes a job action visible immediately and creates a pending outbox operation', async () => {
    const { repository, store } = setup();
    await store.start();
    await waitFor(() => expect(store.getSnapshot().loading).toBe(false));

    const persisted = store.mutateJob('HP-2000', { status: 'En route' });

    expect(store.getSnapshot().jobs[0]?.status).toBe('En route');
    await persisted;
    await expect(repository.listPendingOperations()).resolves.toEqual([
      expect.objectContaining({
        id: 'operation-1',
        entityId: 'HP-2000',
        kind: 'job.update',
        payload: { status: 'En route' },
      }),
    ]);
    store.stop();
  });

  it('persists a newly created job and its pending outbox operation', async () => {
    const { repository, store } = setup();
    await store.start();
    await waitFor(() => expect(store.getSnapshot().loading).toBe(false));
    const created = job({ id: 'HP-2001', service: 'Fence wash', status: 'Quoted' });

    const persisted = store.createJob(created);

    expect(store.getSnapshot().jobs[0]).toMatchObject({
      id: 'HP-2001',
      service: 'Fence wash',
    });
    await persisted;
    await expect(repository.getJob('HP-2001')).resolves.toMatchObject({
      service: 'Fence wash',
    });
    await expect(repository.listPendingOperations()).resolves.toContainEqual(
      expect.objectContaining({
        entityId: 'HP-2001',
        kind: 'job.create',
      }),
    );
    store.stop();
  });

  it('refreshes visible jobs after an owner-approved service-request handoff', async () => {
    const { repository, store } = setup([]);
    await store.start();
    await repository.createCustomer(customer());
    await repository.createServiceRequest(serviceRequest());

    const result = await store.convertServiceRequestToJob({
      serviceRequestId: 'request-1', jobId: 'HP-2001', operationId: 'handoff-1',
      actorId: 'Fieldstead owner', actorRole: 'owner_admin',
      occurredAt: '2026-09-24T14:00:00.000Z', auditEventId: 'activity-handoff-1',
    });

    expect(result).toMatchObject({ replayed: false, job: { id: 'HP-2001', serviceRequestId: 'request-1' } });
    await waitFor(() => expect(store.getSnapshot().jobs).toContainEqual(expect.objectContaining({ id: 'HP-2001' })));
    store.stop();
  });

  it('reads legacy localStorage only after explicit migration is requested', async () => {
    const { store } = setup();
    const legacy = {
      customers: [],
      jobs: [job({ service: 'Imported gutter cleaning' })],
      activity: [],
    };
    const storage = {
      getItem: vi.fn((key: string) =>
        key === HARBOR_PINE_V1_STORAGE_KEY ? JSON.stringify(legacy) : null,
      ),
    };

    await store.start();
    expect(storage.getItem).not.toHaveBeenCalled();

    await expect(store.migrateLocalStorage(storage)).resolves.toMatchObject({
      imported: true,
      jobs: 1,
    });
    expect(storage.getItem).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(store.getSnapshot().jobs[0]?.service).toBe(
        'Imported gutter cleaning',
      ),
    );
    store.stop();
  });

  it('exposes save failures and restores the repository-backed value', async () => {
    const { repository, store } = setup();
    await store.start();
    await waitFor(() => expect(store.getSnapshot().loading).toBe(false));
    vi.spyOn(repository, 'mutateJob').mockRejectedValueOnce(
      new Error('IndexedDB write failed'),
    );

    await expect(
      store.mutateJob('HP-2000', { status: 'En route' }),
    ).rejects.toThrow('IndexedDB write failed');

    expect(store.getSnapshot()).toMatchObject({
      jobs: [expect.objectContaining({ status: 'Scheduled' })],
      error: expect.objectContaining({ message: 'IndexedDB write failed' }),
    });
    store.stop();
  });
});
