import { describe, expect, it, vi } from 'vitest';
import { performEmailMessageAction } from './email-message-actions.mjs';

function createClient(overrides: Record<string, unknown> = {}) {
  return {
    messageFlagsAdd: vi.fn(),
    messageFlagsRemove: vi.fn(),
    messageDelete: vi.fn(),
    messageMove: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('performEmailMessageAction', () => {
  it('deletes by IMAP UID rather than treating the displayed UID as a sequence number', async () => {
    const client = createClient({ messageDelete: vi.fn().mockResolvedValue(true) });

    await expect(performEmailMessageAction(client, '9281', 'delete')).resolves.toEqual({
      ok: true,
      action: 'delete',
      uid: '9281',
    });

    expect(client.messageDelete).toHaveBeenCalledWith('9281', { uid: true });
  });

  it('does not report deletion success when the server cannot resolve the UID', async () => {
    const client = createClient({ messageDelete: vi.fn().mockResolvedValue(false) });

    await expect(performEmailMessageAction(client, '9281', 'delete')).rejects.toThrow(
      'The message was not found in the mailbox.',
    );
  });

  it('uses UID mode for the other server-backed message actions', async () => {
    const client = createClient({
      messageFlagsAdd: vi.fn().mockResolvedValue(true),
      messageFlagsRemove: vi.fn().mockResolvedValue(true),
      messageMove: vi.fn().mockResolvedValue(true),
      list: vi.fn().mockResolvedValue([{ path: 'Archive', specialUse: '\\All' }]),
    });

    await performEmailMessageAction(client, '9281', 'read');
    await performEmailMessageAction(client, '9281', 'unread');
    await performEmailMessageAction(client, '9281', 'star');
    await performEmailMessageAction(client, '9281', 'unstar');
    await performEmailMessageAction(client, '9281', 'archive');

    expect(client.messageFlagsAdd).toHaveBeenNthCalledWith(1, '9281', ['\\Seen'], { uid: true });
    expect(client.messageFlagsRemove).toHaveBeenNthCalledWith(1, '9281', ['\\Seen'], { uid: true });
    expect(client.messageFlagsAdd).toHaveBeenNthCalledWith(2, '9281', ['\\Flagged'], { uid: true });
    expect(client.messageFlagsRemove).toHaveBeenNthCalledWith(2, '9281', ['\\Flagged'], { uid: true });
    expect(client.messageMove).toHaveBeenCalledWith('9281', 'Archive', { uid: true });
  });
});
