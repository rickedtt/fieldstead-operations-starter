import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import packageJson from '../package.json';

describe('email attachment IPC contract', () => {
  it('exposes a narrow save action through preload and handles it in the main process', async () => {
    const [preload, main] = await Promise.all([
      readFile(new URL('./preload.cjs', import.meta.url), 'utf8'),
      readFile(new URL('./main.mjs', import.meta.url), 'utf8'),
    ]);
    expect(preload).toContain("saveEmailAttachment: (accountId, messageId, attachmentId)");
    expect(preload).toContain("ipcRenderer.invoke('fieldstead:email-attachment-save'");
    expect(main).toContain("ipcMain.handle('fieldstead:email-attachment-save'");
    expect(main).toContain('dialog.showSaveDialog');
    const emailSaveHandler = main.slice(main.indexOf("ipcMain.handle('fieldstead:email-attachment-save'"), main.indexOf("ipcMain.handle('fieldstead:email-open-external-link'"));
    expect(emailSaveHandler).not.toContain('showOpenDialog');
  });

  it('previews allowlisted attachments through a narrow main-process IPC path', async () => {
    const [preload, main, preview] = await Promise.all([
      readFile(new URL('./preload.cjs', import.meta.url), 'utf8'),
      readFile(new URL('./main.mjs', import.meta.url), 'utf8'),
      import('./attachment-preview.mjs'),
    ]);
    expect(preload).toContain("previewEmailAttachment: (accountId, messageId, attachmentId)");
    expect(preload).toContain("ipcRenderer.invoke('fieldstead:email-attachment-preview'");
    expect(main).toContain("ipcMain.handle('fieldstead:email-attachment-preview'");
    expect(main).toContain('previewEmailAttachment(accountId, messageId, attachmentId)');
    expect(main).toContain('shell.openPath(preview.path)');
    expect(preview.isPreviewableAttachment({ filename: 'photo.png', contentType: 'image/png' })).toBe(true);
    expect(preview.isPreviewableAttachment({ filename: 'quote.pdf', contentType: 'application/pdf' })).toBe(true);
    expect(preview.isPreviewableAttachment({ filename: 'attack.html', contentType: 'text/html' })).toBe(false);
    expect(preview.isPreviewableAttachment({ filename: 'script.svg', contentType: 'image/svg+xml' })).toBe(false);
  });

  it('packages the attachment parser and store for Linux and Windows builds', () => {
    expect(packageJson.build.files).toContain('electron/**/*');
    expect(packageJson.scripts['desktop:dist:all']).toContain('--linux AppImage');
    expect(packageJson.scripts['desktop:dist:all']).toContain('--win nsis --x64');
  });
});
