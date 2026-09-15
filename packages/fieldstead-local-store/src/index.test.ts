import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { Job } from '../../fieldstead-domain/src';
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
