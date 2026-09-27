import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const main = readFileSync(new URL('./main.mjs', import.meta.url), 'utf8');

describe('desktop window scale', () => {
  it('resets persisted renderer zoom while keeping the safe desktop launch flags', () => {
    expect(main).toContain("app.commandLine.appendSwitch('ozone-platform', 'x11')");
    expect(main).toContain("app.commandLine.appendSwitch('disable-gpu')");
    expect(main).toContain("app.commandLine.appendSwitch('disable-gpu-compositing')");
    expect(main).toContain("app.commandLine.appendSwitch('password-store', 'gnome-libsecret')");
    expect(main).not.toContain("app.commandLine.appendSwitch('disable-software-rasterizer')");
    expect(main).toMatch(/webContents\.on\('did-finish-load',[\s\S]*?setZoomFactor\(1\)/);
  });

  it('does not invoke the AppImage updater from an extracted Linux package', () => {
    expect(main).toContain("process.platform !== 'linux' || Boolean(process.env.APPIMAGE)");
    expect(main).toContain("if (canUsePackagedUpdater()) void Promise.resolve(autoUpdater.checkForUpdates())");
    expect(main).toContain('Linux updates require launching the packaged AppImage.');
  });
});
