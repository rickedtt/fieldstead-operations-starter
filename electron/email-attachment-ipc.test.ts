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
    expect(main).not.toContain('showOpenDialog');
  });

  it('packages the attachment parser and store for Linux and Windows builds', () => {
    expect(packageJson.build.files).toContain('electron/**/*');
    expect(packageJson.scripts['desktop:dist:all']).toContain('--linux AppImage');
    expect(packageJson.scripts['desktop:dist:all']).toContain('--win nsis --x64');
  });
});
