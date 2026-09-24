import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('email external-link IPC contract', () => {
  it('exposes a narrow renderer bridge and validates before shell.openExternal', async () => {
    const [preload, main] = await Promise.all([
      readFile(new URL('./preload.cjs', import.meta.url), 'utf8'),
      readFile(new URL('./main.mjs', import.meta.url), 'utf8'),
    ]);
    expect(preload).toContain("openEmailExternalLink: (url) => ipcRenderer.invoke('fieldstead:email-open-external-link', url)");
    expect(main).toContain("ipcMain.handle('fieldstead:email-open-external-link'");
    expect(main).toContain('openSafeExternalLink(shell.openExternal, url)');
  });
});
