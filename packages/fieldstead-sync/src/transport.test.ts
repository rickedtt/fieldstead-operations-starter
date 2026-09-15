import { describe, expect, it, vi } from 'vitest';
import { InMemorySyncTransport } from './transport';

const batch = {
  protocolVersion: 1 as const,
  batchId: 'batch-1',
  clientId: 'client-1',
  operations: [
    {
      id: 'op-1',
      entityType: 'job',
      entityId: 'HP-2000',
      kind: 'job.update',
      payload: { status: 'En route' },
      createdAt: '2026-09-04T12:00:00.000Z',
    },
  ],
};

describe('in-memory sync transport test double', () => {
  it('replays the original outcome for an identical operation ID and content', async () => {
    const decide = vi.fn(() => ({ status: 'accepted' as const }));
    const transport = new InMemorySyncTransport(decide);

    const first = await transport.submit(batch);
    const replay = await transport.submit({ ...batch, batchId: 'batch-2' });

    expect(first.acceptedOperationIds).toEqual(['op-1']);
    expect(replay.acceptedOperationIds).toEqual(['op-1']);
    expect(decide).toHaveBeenCalledTimes(1);
  });

  it('rejects reuse of an operation ID with different content', async () => {
    const transport = new InMemorySyncTransport(() => ({ status: 'accepted' }));
    await transport.submit(batch);

    const result = await transport.submit({
      ...batch,
      batchId: 'batch-2',
      operations: [
        { ...batch.operations[0], payload: { status: 'In progress' } },
      ],
    });

    expect(result.acceptedOperationIds).toEqual([]);
    expect(result.rejectedOperations).toEqual([
      expect.objectContaining({
        operationId: 'op-1',
        code: 'idempotency_key_reused',
        retryable: false,
      }),
    ]);
  });

  it('coalesces concurrent retries of the same operation', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const decide = vi.fn(async () => {
      await gate;
      return { status: 'accepted' as const };
    });
    const transport = new InMemorySyncTransport(decide);

    const first = transport.submit(batch);
    const retry = transport.submit({ ...batch, batchId: 'batch-2' });
    release();

    await expect(first).resolves.toMatchObject({ acceptedOperationIds: ['op-1'] });
    await expect(retry).resolves.toMatchObject({ acceptedOperationIds: ['op-1'] });
    expect(decide).toHaveBeenCalledTimes(1);
  });
});
