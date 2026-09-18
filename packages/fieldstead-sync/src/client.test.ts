import { describe, expect, it } from 'vitest';
import { SyncClient, type SyncOutbox } from './client';
import { InMemorySyncTransport } from './transport';
import type {
  OperationResult,
  RejectedOperation,
  SyncCursor,
  SyncOperation,
} from './index';

class TestOutbox implements SyncOutbox {
  cursor?: SyncCursor;
  readonly outcomes = new Map<string, RejectedOperation | 'accepted'>();
  readonly operations: SyncOperation[] = [
    {
      id: 'operation-1',
      entityType: 'job',
      entityId: 'HP-2000',
      kind: 'job.update',
      payload: { status: 'En route' },
      createdAt: '2026-09-04T12:00:00.000Z',
    },
  ];

  async getCursor() { return this.cursor; }
  async listPendingOperations() { return structuredClone(this.operations); }
  async applyResult(result: OperationResult) {
    this.cursor = result.cursor;
    for (const id of result.acceptedOperationIds) {
      this.outcomes.set(id, 'accepted');
      const index = this.operations.findIndex((operation) => operation.id === id);
      if (index >= 0) this.operations.splice(index, 1);
    }
    for (const rejection of result.rejectedOperations) {
      this.outcomes.set(rejection.operationId, rejection);
      if (!rejection.retryable) {
        const index = this.operations.findIndex(
          (operation) => operation.id === rejection.operationId,
        );
        if (index >= 0) this.operations.splice(index, 1);
      }
    }
  }
}

describe('SyncClient', () => {
  it('submits a pending operation and durably applies the accepted result', async () => {
    const outbox = new TestOutbox();
    const client = new SyncClient({
      clientId: 'client-1',
      createBatchId: () => 'batch-1',
      outbox,
      transport: new InMemorySyncTransport(() => ({ status: 'accepted' })),
    });

    await expect(client.syncPending()).resolves.toMatchObject({
      acceptedOperationIds: ['operation-1'],
      cursor: { version: 1, position: '1' },
    });
    expect(outbox.operations).toEqual([]);
    expect(outbox.cursor).toEqual({ version: 1, position: '1' });
  });

  it('retains a retryable rejection with the same durable operation ID', async () => {
    const outbox = new TestOutbox();
    const client = new SyncClient({
      clientId: 'client-1',
      createBatchId: () => 'batch-retry',
      outbox,
      transport: new InMemorySyncTransport(() => ({
        status: 'rejected',
        code: 'server_error',
        message: 'Try later.',
        retryable: true,
      })),
    });

    await client.syncPending();

    expect(outbox.operations).toHaveLength(1);
    expect(outbox.operations[0]?.id).toBe('operation-1');
    expect(outbox.outcomes.get('operation-1')).toMatchObject({
      code: 'server_error',
      retryable: true,
    });
  });

  it('coalesces concurrent drains so an operation is not submitted twice', async () => {
    const outbox = new TestOutbox();
    let submissions = 0;
    const transport = new InMemorySyncTransport(async () => {
      submissions += 1;
      await Promise.resolve();
      return { status: 'accepted' };
    });
    const client = new SyncClient({
      clientId: 'client-1',
      createBatchId: () => 'batch-coalesced',
      outbox,
      transport,
    });

    const first = client.syncPending();
    const duplicate = client.syncPending();

    expect(duplicate).toBe(first);
    await Promise.all([first, duplicate]);
    expect(submissions).toBe(1);
  });

  it('records a terminal conflict and removes it from the pending queue', async () => {
    const outbox = new TestOutbox();
    const client = new SyncClient({
      clientId: 'client-1',
      createBatchId: () => 'batch-conflict',
      outbox,
      transport: new InMemorySyncTransport((operation) => ({
        status: 'rejected',
        code: 'conflict',
        message: 'The server record changed.',
        retryable: false,
        conflict: {
          operationId: operation.id,
          entityType: operation.entityType,
          entityId: operation.entityId,
          reason: 'concurrent_update',
          clientVersion: '1',
          serverVersion: '2',
          serverRecord: { status: 'In progress' },
          message: 'The server record changed.',
        },
      })),
    });

    const result = await client.syncPending();

    expect(result?.conflicts).toEqual([
      expect.objectContaining({ operationId: 'operation-1' }),
    ]);
    expect(outbox.operations).toEqual([]);
    expect(outbox.outcomes.get('operation-1')).toMatchObject({
      code: 'conflict',
      retryable: false,
    });
  });
});
