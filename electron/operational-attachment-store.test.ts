import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createOperationalAttachmentStore } from './operational-attachment-store.mjs';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fieldstead-operational-attachments-'));
  temporaryDirectories.push(root);
  const source = path.join(root, 'source.png');
  await writeFile(source, Buffer.from('safe image bytes'));
  return { root, source, store: createOperationalAttachmentStore(path.join(root, 'store')) };
}

describe('operational attachment content storage', () => {
  it('imports approved content with sanitized metadata, checksum, provenance, and restart persistence', async () => {
    const { root, source, store } = await fixture();
    const created = await store.importFile({
      id: 'attachment-1', ownerType: 'job', ownerId: 'HP-2000', sourcePath: source,
      originalFilename: '../before photo.png', contentType: 'image/png', actorId: 'Fieldstead owner',
      createdAt: '2026-09-24T15:00:00.000Z', source: { kind: 'desktop-upload' },
    });

    expect(created).toMatchObject({
      id: 'attachment-1', ownerType: 'job', ownerId: 'HP-2000', filename: 'before photo.png',
      contentType: 'image/png', size: 16, checksum: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      createdBy: 'Fieldstead owner', source: { kind: 'desktop-upload' },
    });
    expect(await store.list('job', 'HP-2000')).toEqual([created]);
    expect(await createOperationalAttachmentStore(path.join(root, 'store')).list('job', 'HP-2000')).toEqual([created]);
    expect(await readFile((await store.contentPath('attachment-1')).path, 'utf8')).toBe('safe image bytes');
  });

  it('rejects traversal references, active content, MIME mismatches, and files over the limit', async () => {
    const { root, source, store } = await fixture();
    await expect(store.importFile({ id: '../secret', ownerType: 'job', ownerId: 'HP-2000', sourcePath: source, originalFilename: 'photo.png', contentType: 'image/png', actorId: 'owner', createdAt: '2026-09-24T15:00:00.000Z', source: { kind: 'desktop-upload' } })).rejects.toThrow('Invalid attachment reference');
    await expect(store.importFile({ id: 'attachment-2', ownerType: 'job', ownerId: '../HP-2000', sourcePath: source, originalFilename: 'photo.png', contentType: 'image/png', actorId: 'owner', createdAt: '2026-09-24T15:00:00.000Z', source: { kind: 'desktop-upload' } })).rejects.toThrow('Invalid attachment reference');
    await expect(store.importFile({ id: 'attachment-3', ownerType: 'job', ownerId: 'HP-2000', sourcePath: source, originalFilename: 'payload.html', contentType: 'text/html', actorId: 'owner', createdAt: '2026-09-24T15:00:00.000Z', source: { kind: 'desktop-upload' } })).rejects.toThrow('not allowed');
    await expect(store.importFile({ id: 'attachment-4', ownerType: 'job', ownerId: 'HP-2000', sourcePath: source, originalFilename: 'photo.jpg', contentType: 'image/png', actorId: 'owner', createdAt: '2026-09-24T15:00:00.000Z', source: { kind: 'desktop-upload' } })).rejects.toThrow('does not match');
    const oversized = path.join(root, 'large.pdf');
    await writeFile(oversized, Buffer.alloc(10));
    const limited = createOperationalAttachmentStore(path.join(root, 'limited'), { maxBytes: 9 });
    await expect(limited.importFile({ id: 'attachment-5', ownerType: 'serviceRequest', ownerId: 'request-1', sourcePath: oversized, originalFilename: 'estimate.pdf', contentType: 'application/pdf', actorId: 'owner', createdAt: '2026-09-24T15:00:00.000Z', source: { kind: 'desktop-upload' } })).rejects.toThrow('size limit');
  });

  it('uses the exact MIME allowlist and permits at most one file per chooser batch', async () => {
    const { source, store } = await fixture();
    await expect(store.importFile({ id: 'attachment-csv', ownerType: 'job', ownerId: 'HP-2000', sourcePath: source, originalFilename: 'data.csv', contentType: 'text/csv', actorId: 'owner', createdAt: '2026-09-24T15:00:00.000Z', source: { kind: 'desktop-upload' } })).rejects.toThrow('not allowed');
    const main = await readFile(new URL('./main.mjs', import.meta.url), 'utf8');
    expect(main).toContain("properties: ['openFile']");
    expect(main).not.toContain("properties: ['openFile', 'multiSelections']");
  });

  it('exports known content, previews only passive types, deletes content and records an audit tombstone', async () => {
    const { root, source, store } = await fixture();
    await store.importFile({ id: 'attachment-1', ownerType: 'serviceRequest', ownerId: 'request-1', sourcePath: source, originalFilename: 'before.png', contentType: 'image/png', actorId: 'owner', createdAt: '2026-09-24T15:00:00.000Z', source: { kind: 'desktop-upload' } });
    const destination = path.join(root, 'exported.png');
    await expect(store.exportFile('attachment-1', destination)).resolves.toMatchObject({ bytes: 16, filename: 'before.png' });
    await expect(readFile(destination, 'utf8')).resolves.toBe('safe image bytes');
    await expect(store.preview('attachment-1')).resolves.toMatchObject({ path: expect.stringMatching(/preview\.png$/) });

    const deleted = await store.delete('attachment-1', { actorId: 'owner', deletedAt: '2026-09-24T16:00:00.000Z' });
    expect(deleted).toMatchObject({ id: 'attachment-1', deletedBy: 'owner', deletedAt: '2026-09-24T16:00:00.000Z' });
    await expect(store.list('serviceRequest', 'request-1')).resolves.toEqual([]);
    await expect(stat((await store.auditPath()).path)).resolves.toBeDefined();
    await expect(store.contentPath('attachment-1')).rejects.toThrow('not found');
  });

  it('reports a backup manifest warning while preserving managed content paths', async () => {
    const { source, store } = await fixture();
    await store.importFile({ id: 'attachment-1', ownerType: 'job', ownerId: 'HP-2000', sourcePath: source, originalFilename: 'before.png', contentType: 'image/png', actorId: 'owner', createdAt: '2026-09-24T15:00:00.000Z', source: { kind: 'desktop-upload' } });
    const manifest = await store.backupManifest();
    expect(manifest).toMatchObject({ version: 1, attachmentCount: 1, contentIncluded: false, warning: expect.stringMatching(/not included/i) });
    expect(manifest.attachments[0]).toMatchObject({ id: 'attachment-1', checksum: expect.stringMatching(/^sha256:/) });
  });
});
