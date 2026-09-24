import { describe, expect, it, vi } from 'vitest';
import { createEmailSyncController } from './email-sync-controller';

describe('email sync controller', () => {
  it('deduplicates concurrent synchronization for the same account', async () => {
    let resolveSync!: (value: { ok: boolean }) => void;
    const sync = vi.fn(() => new Promise<{ ok: boolean }>((resolve) => { resolveSync = resolve; }));
    const controller = createEmailSyncController(sync);

    const first = controller.sync('account-1');
    const second = controller.sync('account-1');

    expect(sync).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    resolveSync({ ok: true });
    await first;
  });

  it('allows a later synchronization after the prior request settles', async () => {
    const sync = vi.fn().mockResolvedValue({ ok: true });
    const controller = createEmailSyncController(sync);

    await controller.sync('account-1');
    await controller.sync('account-1');

    expect(sync).toHaveBeenCalledTimes(2);
  });

  it('does not call the service without an account id', async () => {
    const sync = vi.fn().mockResolvedValue({ ok: true });
    const controller = createEmailSyncController(sync);

    await expect(controller.sync(null)).resolves.toBeUndefined();
    expect(sync).not.toHaveBeenCalled();
  });
});
