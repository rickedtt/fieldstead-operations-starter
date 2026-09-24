import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import packageJson from '../package.json';
import { normalizeAppVersion, packageVersion } from '../lib/app-version';

describe('application version display contract', () => {
  it('uses package metadata as the safe browser fallback', () => {
    expect(packageVersion).toBe(packageJson.version);
    expect(normalizeAppVersion(undefined)).toBe(packageJson.version);
    expect(normalizeAppVersion(' 1.2.3 ')).toBe('1.2.3');
  });

  it('exposes Electron runtime version metadata through the narrow preload bridge', async () => {
    const [preload, main, page] = await Promise.all([
      readFile(new URL('./preload.cjs', import.meta.url), 'utf8'),
      readFile(new URL('./main.mjs', import.meta.url), 'utf8'),
      readFile(new URL('../app/page.tsx', import.meta.url), 'utf8'),
    ]);

    expect(preload).toContain("getAppVersion: () => ipcRenderer.invoke('fieldstead:app-version')");
    expect(main).toContain("ipcMain.handle('fieldstead:app-version', () => app.getVersion())");
    expect(page).toContain('Installed version <strong>v{appVersion}</strong>');
  });
});
