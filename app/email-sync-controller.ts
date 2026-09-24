export type EmailSyncResult = { ok: boolean; message?: string; messages?: unknown[]; syncedAt?: string };

export function createEmailSyncController<T extends EmailSyncResult>(syncEmail: (accountId: string) => Promise<T>) {
  const pending = new Map<string, Promise<T>>();

  return {
    sync(accountId: string | null | undefined): Promise<T | undefined> {
      if (!accountId) return Promise.resolve(undefined);
      const active = pending.get(accountId);
      if (active) return active;
      const request = syncEmail(accountId).finally(() => pending.delete(accountId));
      pending.set(accountId, request);
      return request;
    },
  };
}
