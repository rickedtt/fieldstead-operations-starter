import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url);

async function source(path: string) {
  return readFile(new URL(path, root), 'utf8');
}

describe('operational attachment desktop bridge', () => {
  it('exposes narrow explicit IPC operations for upload, list, preview, export, delete, and backup manifest', async () => {
    const [preload, main] = await Promise.all([source('electron/preload.cjs'), source('electron/main.mjs')]);
    expect(preload).toContain("chooseOperationalAttachment: (ownerType, ownerId, actorId) => ipcRenderer.invoke('fieldstead:operational-attachment-choose'");
    expect(preload).toContain("listOperationalAttachments: (ownerType, ownerId) => ipcRenderer.invoke('fieldstead:operational-attachment-list'");
    expect(preload).toContain("previewOperationalAttachment: (attachmentId) => ipcRenderer.invoke('fieldstead:operational-attachment-preview'");
    expect(preload).toContain("exportOperationalAttachment: (attachmentId) => ipcRenderer.invoke('fieldstead:operational-attachment-export'");
    expect(preload).toContain("deleteOperationalAttachment: (attachmentId, actorId) => ipcRenderer.invoke('fieldstead:operational-attachment-delete'");
    expect(preload).toContain("getOperationalAttachmentBackupManifest: () => ipcRenderer.invoke('fieldstead:operational-attachment-backup-manifest')");
    expect(main).toContain("ipcMain.handle('fieldstead:operational-attachment-choose'");
    expect(main).toContain("ipcMain.handle('fieldstead:operational-attachment-delete'");
    expect(main).toContain("createOperationalAttachmentStore(path.join(app.getPath('userData'), 'operational-attachments'))");
  });

  it('uses owner-confirmed file dialogs and safe system preview instead of renderer paths', async () => {
    const main = await source('electron/main.mjs');
    expect(main).toContain("properties: ['openFile']");
    expect(main).toContain('OPERATIONAL_ATTACHMENT_MIME_TYPES');
    expect(main).toContain("properties: ['showOverwriteConfirmation', 'createDirectory']");
    expect(main).toContain('shell.openPath(preview.path)');
    expect(main).toContain("actorRole !== 'owner_admin'");
  });
});
