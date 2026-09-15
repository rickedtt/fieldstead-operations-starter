import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Job } from '../../packages/fieldstead-domain/src';
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
