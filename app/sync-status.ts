export type SyncStatus = 'disconnected' | 'pending' | 'syncing' | 'retry' | 'conflicted' | 'last-success';
export type SyncStatusInput = { connected: boolean; syncing: boolean; pending: number; retryable: number; conflicted: number; lastSuccessAt?: string };

export function deriveSyncStatus(input: SyncStatusInput): SyncStatus {
  if (!input.connected) return 'disconnected';
  if (input.syncing) return 'syncing';
  if (input.conflicted > 0) return 'conflicted';
  if (input.retryable > 0) return 'retry';
  if (input.pending > 0) return 'pending';
  return 'last-success';
}

export function syncStatusLabel(input: SyncStatusInput): string {
  const status = deriveSyncStatus(input);
  if (status === 'disconnected') return `Disconnected · ${input.pending + input.retryable} pending`;
  if (status === 'syncing') return 'Syncing…';
  if (status === 'conflicted') return `${input.conflicted} sync conflict${input.conflicted === 1 ? '' : 's'}`;
  if (status === 'retry') return `${input.retryable} waiting to retry`;
  if (status === 'pending') return `${input.pending} pending`;
  return input.lastSuccessAt ? `Last synced ${input.lastSuccessAt}` : 'Ready to sync';
}