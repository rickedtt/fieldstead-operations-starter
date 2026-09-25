import { describe, expect, it } from 'vitest';
import { deriveSyncStatus } from './sync-status';

describe('persisted sync status', () => {
  it('prioritizes disconnected, syncing, conflicts, retry, pending, and success', () => {
    expect(deriveSyncStatus({ connected: false, syncing: false, pending: 2, retryable: 0, conflicted: 0 })).toBe('disconnected');
    expect(deriveSyncStatus({ connected: true, syncing: true, pending: 2, retryable: 0, conflicted: 0 })).toBe('syncing');
    expect(deriveSyncStatus({ connected: true, syncing: false, pending: 0, retryable: 0, conflicted: 1 })).toBe('conflicted');
    expect(deriveSyncStatus({ connected: true, syncing: false, pending: 0, retryable: 1, conflicted: 0 })).toBe('retry');
    expect(deriveSyncStatus({ connected: true, syncing: false, pending: 1, retryable: 0, conflicted: 0 })).toBe('pending');
    expect(deriveSyncStatus({ connected: true, syncing: false, pending: 0, retryable: 0, conflicted: 0, lastSuccessAt: '2026-09-25T12:00:00Z' })).toBe('last-success');
  });
});