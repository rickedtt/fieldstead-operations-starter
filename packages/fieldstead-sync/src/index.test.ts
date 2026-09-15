import { describe, expect, it } from 'vitest';
import {
  parseConflictRecord,
  parseOperationBatch,
  parseOperationResult,
  parseSyncCursor,
} from './index';

const operation = {
  id: 'op-100',
  entityType: 'job',
  entityId: 'HP-2000',
  kind: 'job.update',
  payload: { status: 'En route' },
  createdAt: '2026-09-04T12:00:00.000Z',
};

describe('operation batches', () => {
  it('parses a well-formed batch', () => {
    expect(
      parseOperationBatch({
        protocolVersion: 1,
        batchId: 'batch-1',
        clientId: 'dispatch-tablet-1',
        cursor: { version: 1, position: '41' },
        operations: [operation],
      }),
    ).toEqual({
      protocolVersion: 1,
      batchId: 'batch-1',
      clientId: 'dispatch-tablet-1',
      cursor: { version: 1, position: '41' },
      operations: [operation],
    });
  });

  it.each([
    null,
    {},
    { protocolVersion: 2, batchId: 'batch-1', clientId: 'client-1', operations: [] },
    { protocolVersion: 1, batchId: '', clientId: 'client-1', operations: [] },
    { protocolVersion: 1, batchId: 'batch-1', clientId: 'client-1', operations: 'nope' },
    {
      protocolVersion: 1,
      batchId: 'batch-1',
      clientId: 'client-1',
      operations: [{ ...operation, payload: null }],
    },
  ])('rejects malformed batches %#', (batch) => {
    expect(() => parseOperationBatch(batch)).toThrow(TypeError);
  });

  it('rejects duplicate operation IDs within one batch', () => {
    expect(() =>
      parseOperationBatch({
        protocolVersion: 1,
        batchId: 'batch-1',
        clientId: 'client-1',
        operations: [operation, { ...operation }],
      }),
    ).toThrow(/duplicate operation id: op-100/i);
  });
});

describe('sync cursors', () => {
  it('accepts only versioned, non-empty opaque positions', () => {
    expect(parseSyncCursor({ version: 1, position: 'next:42' })).toEqual({
      version: 1,
      position: 'next:42',
    });

    expect(() => parseSyncCursor('next:42')).toThrow(TypeError);
    expect(() => parseSyncCursor({ version: 2, position: 'next:42' })).toThrow(
      /version/,
    );
    expect(() => parseSyncCursor({ version: 1, position: '' })).toThrow(
      /position/,
    );
  });
});

describe('operation results', () => {
  it('parses explicit accepted and rejected operation IDs', () => {
    expect(
      parseOperationResult({
        protocolVersion: 1,
        batchId: 'batch-1',
        cursor: { version: 1, position: '42' },
        acceptedOperationIds: ['op-100'],
        rejectedOperations: [
          {
            operationId: 'op-101',
            code: 'forbidden',
            message: 'The actor cannot update this job.',
            retryable: false,
          },
        ],
        conflicts: [],
      }),
    ).toMatchObject({
      acceptedOperationIds: ['op-100'],
      rejectedOperations: [{ operationId: 'op-101', code: 'forbidden' }],
    });
  });

  it('rejects ambiguous or duplicate outcomes', () => {
    const base = {
      protocolVersion: 1,
      batchId: 'batch-1',
      cursor: { version: 1, position: '42' },
      acceptedOperationIds: ['op-100'],
      rejectedOperations: [],
      conflicts: [],
    };

    expect(() =>
      parseOperationResult({ ...base, acceptedOperationIds: ['op-100', 'op-100'] }),
    ).toThrow(/duplicate accepted operation id/i);
    expect(() =>
      parseOperationResult({
        ...base,
        rejectedOperations: [
          {
            operationId: 'op-100',
            code: 'forbidden',
            message: 'No access.',
            retryable: false,
          },
        ],
      }),
    ).toThrow(/both accepted and rejected/i);
  });

  it('rejects conflict records that are not tied to a conflict rejection', () => {
    expect(() =>
      parseOperationResult({
        protocolVersion: 1,
        batchId: 'batch-1',
        cursor: { version: 1, position: '42' },
        acceptedOperationIds: [],
        rejectedOperations: [
          {
            operationId: 'op-100',
            code: 'forbidden',
            message: 'No access.',
            retryable: false,
          },
        ],
        conflicts: [
          {
            operationId: 'op-100',
            entityType: 'job',
            entityId: 'HP-2000',
            reason: 'concurrent_update',
            clientVersion: 'job:7',
            serverVersion: 'job:8',
            message: 'The job changed.',
          },
        ],
      }),
    ).toThrow(/conflict rejection/i);
  });
});

describe('conflict records', () => {
  it('parses a version conflict tied to an operation', () => {
    expect(
      parseConflictRecord({
        operationId: 'op-100',
        entityType: 'job',
        entityId: 'HP-2000',
        reason: 'concurrent_update',
        clientVersion: 'job:7',
        serverVersion: 'job:8',
        message: 'The job changed after the client last synced.',
      }),
    ).toEqual({
      operationId: 'op-100',
      entityType: 'job',
      entityId: 'HP-2000',
      reason: 'concurrent_update',
      clientVersion: 'job:7',
      serverVersion: 'job:8',
      message: 'The job changed after the client last synced.',
    });
  });

  it('rejects unsupported conflict reasons and missing IDs', () => {
    expect(() =>
      parseConflictRecord({
        operationId: '',
        entityType: 'job',
        entityId: 'HP-2000',
        reason: 'last_write_wins',
        clientVersion: null,
        serverVersion: null,
        message: 'No.',
      }),
    ).toThrow(TypeError);
  });
});
