import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAttachmentStore } from './attachment-store.mjs';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('local email attachment storage', () => {
  it('caches bytes locally and saves only a known opaque attachment id', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'fieldstead-attachments-'));
    temporaryDirectories.push(root);
    const store = createAttachmentStore(root);
    const metadata = await store.cacheMessage('account-a', '42', [{
      id: 'attachment-1', filename: 'estimate.pdf', contentType: 'application/pdf', content: Buffer.from('local bytes'),
    }]);
    const destination = path.join(root, 'saved estimate.pdf');

    expect(metadata).toEqual([expect.objectContaining({ id: 'attachment-1', filename: 'estimate.pdf', size: 11, available: true })]);
    await expect(store.save('account-a', '42', 'attachment-1', destination)).resolves.toEqual(expect.objectContaining({ bytes: 11 }));
    await expect(readFile(destination, 'utf8')).resolves.toBe('local bytes');
    await expect(store.save('../account-a', '42', 'attachment-1', destination)).rejects.toThrow('Invalid attachment reference');
    await expect(store.save('account-a', '../42', 'attachment-1', destination)).rejects.toThrow('Invalid attachment reference');
    await expect(store.save('account-a', '42', '../secret', destination)).rejects.toThrow('Invalid attachment reference');
  });

  it('marks missing attachment content unavailable and refuses to save it', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'fieldstead-attachments-'));
    temporaryDirectories.push(root);
    const store = createAttachmentStore(root);
    const metadata = await store.cacheMessage('account-a', '43', [{
      id: 'attachment-1', filename: 'missing.dat', contentType: 'application/octet-stream', content: null,
    }]);
    expect(metadata[0].available).toBe(false);
    await expect(store.save('account-a', '43', 'attachment-1', path.join(root, 'missing.dat'))).rejects.toThrow('not available');
  });
});
