import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import packageJson from '../package.json';
import {
  APP_ID,
  isAllowedDesktopUrl,
  isAllowedNavigationUrl,
  localServerUrl,
  LOOPBACK_HOST,
  PRODUCT_NAME,
  WINDOW_BACKGROUND_COLOR,
} from './desktop-config.mjs';

describe('desktop loopback policy', () => {
  const serverUrl = localServerUrl(43127);

  it('builds an explicit IPv4 loopback URL', () => {
    expect(serverUrl).toBe('http://127.0.0.1:43127');
    expect(LOOPBACK_HOST).toBe('127.0.0.1');
  });

  it('allows only the selected local origin plus data and blob resources', () => {
    expect(isAllowedDesktopUrl(`${serverUrl}/jobs`, serverUrl)).toBe(true);
    expect(isAllowedDesktopUrl('data:text/plain,ok', serverUrl)).toBe(true);
    expect(isAllowedDesktopUrl('blob:http://127.0.0.1:43127/id', serverUrl)).toBe(true);
    expect(isAllowedDesktopUrl('blob:https://example.com/id', serverUrl)).toBe(false);
    expect(isAllowedDesktopUrl('http://localhost:43127/', serverUrl)).toBe(false);
    expect(isAllowedDesktopUrl('http://127.0.0.1:3000/', serverUrl)).toBe(false);
    expect(isAllowedDesktopUrl('https://example.com/', serverUrl)).toBe(false);
    expect(isAllowedDesktopUrl('file:///C:/secret.txt', serverUrl)).toBe(false);
  });

  it('allows top-level navigation only within the selected loopback origin', () => {
    expect(isAllowedNavigationUrl(`${serverUrl}/customers`, serverUrl)).toBe(true);
    expect(isAllowedNavigationUrl('data:text/html,blocked', serverUrl)).toBe(false);
    expect(isAllowedNavigationUrl('blob:http://127.0.0.1:43127/id', serverUrl)).toBe(false);
    expect(isAllowedNavigationUrl('https://example.com/', serverUrl)).toBe(false);
  });

  it('rejects invalid ports', () => {
    expect(() => localServerUrl(0)).toThrow();
    expect(() => localServerUrl(65536)).toThrow();
    expect(() => localServerUrl(12.5)).toThrow();
  });
});

describe('electron-builder metadata', () => {
  it('defines the requested identity and makes NSIS the primary Windows target', () => {
    expect(packageJson.build.appId).toBe(APP_ID);
    expect(packageJson.build.productName).toBe(PRODUCT_NAME);
    expect(packageJson.build.win.icon).toBe('build/icon.ico');
    expect(packageJson.build.win.target).toEqual([
      { target: 'nsis', arch: ['x64'] },
    ]);
    expect(packageJson.scripts['desktop:dist:win']).toContain('--win nsis --x64');
    expect(packageJson.scripts['desktop:dist:win']).not.toContain('portable');
    expect(packageJson.scripts['desktop:dist:portable']).toContain('--win portable --x64');
  });

  it('defines an assisted per-user installer that retains application data', () => {
    expect(packageJson.build.nsis).toMatchObject({
      artifactName: 'Fieldstead.Systems.Operations.Starter-Setup-${version}-${arch}.${ext}',
      oneClick: false,
      perMachine: false,
      allowToChangeInstallationDirectory: true,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      deleteAppDataOnUninstall: false,
    });
  });

  it('packages the standalone server beside the Electron application', () => {
    expect(packageJson.main).toBe('electron/main.mjs');
    expect(packageJson.build.extraResources).toContainEqual({
      from: 'dist/standalone',
      to: 'server',
      filter: ['**/*'],
    });
  });

  it('packages the mail provider runtime at the path imported by Electron', () => {
    expect(packageJson.build.files).toContain('lib/mail-provider-runtime.mjs');
  });
});


describe('desktop window appearance', () => {
  it('uses the renderer dark surface while resizing', () => {
    expect(WINDOW_BACKGROUND_COLOR).toBe('#101714');
    const mainSource = readFileSync(new URL('./main.mjs', import.meta.url), 'utf8');
    expect(mainSource).toContain('backgroundColor: WINDOW_BACKGROUND_COLOR');
  });
});
