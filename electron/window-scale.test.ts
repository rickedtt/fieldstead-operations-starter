import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const main = readFileSync(new URL('./main.mjs', import.meta.url), 'utf8');

describe('desktop window scale', () => {
  it('resets persisted renderer zoom without changing launch flags', () => {
    expect(main).toContain("app.commandLine.appendSwitch('ozone-platform', 'x11')");
    expect(main).toContain("app.commandLine.appendSwitch('password-store', 'gnome-libsecret')");
    expect(main).toMatch(/webContents\.on\('did-finish-load',[\s\S]*?setZoomFactor\(1\)/);
  });
});