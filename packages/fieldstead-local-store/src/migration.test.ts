import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFieldsteadRepository, type FieldsteadRepository } from './index';
import { importHarborPineOperationsV1 } from './migration';

const databases: FieldsteadRepository[] = [];

function legacyState() {
  return {
    customers: [],
    jobs: [
      {
        id: 'HP-1051',
        customerId: 'cus-ben',
        service: 'Gutter cleaning',
        description: 'Clean gutters and downspouts.',
        quoteStatus: 'Sent',
        quoteAmount: 290,
        durationHours: 1.5,
        crew: 'Unassigned',
        status: 'Quoted',
        invoiceStatus: 'Not created',
        invoiceAmount: 290,
        createdAt: '2026-08-26T14:30:00-05:00',
        updatedAt: '2026-08-26T15:00:00-05:00',
      },
    ],
    activity: [
      {
        id: 'act-5',
        at: '2026-08-26T15:00:00-05:00',
        jobId: 'HP-1051',
        customerId: 'cus-ben',
        actor: 'Jordan',
        action: 'Quote sent',
        detail: 'Estimate marked sent.',
      },
    ],
  };
}

function storageWith(value: string) {
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  };
}

async function repository() {
  const repo = createFieldsteadRepository(
    `fieldstead-migration-${crypto.randomUUID()}`,
  );
  databases.push(repo);
  return repo;
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map((repo) => repo.delete()));
});

describe('harbor-pine-operations-v1 import', () => {
  it('is opt-in and does not read storage while opening the repository', async () => {
    const storage = storageWith(JSON.stringify(legacyState()));
    const repo = await repository();

    await repo.open();

    expect(storage.getItem).not.toHaveBeenCalled();
    await expect(repo.jobs.count()).resolves.toBe(0);
  });

  it('imports once, remains idempotent, and preserves localStorage', async () => {
    const serialized = JSON.stringify(legacyState());
    const storage = storageWith(serialized);
    const repo = await repository();

    await expect(importHarborPineOperationsV1(repo, storage)).resolves.toEqual({
      imported: true,
      jobs: 1,
      activityEvents: 1,
    });
    await expect(importHarborPineOperationsV1(repo, storage)).resolves.toEqual({
      imported: false,
      reason: 'already-imported',
    });

    await expect(repo.jobs.count()).resolves.toBe(1);
    await expect(repo.activityEvents.count()).resolves.toBe(1);
    expect(storage.getItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(storage.clear).not.toHaveBeenCalled();
    expect(storage.getItem.mock.results[0]?.value).toBe(serialized);
  });
});
