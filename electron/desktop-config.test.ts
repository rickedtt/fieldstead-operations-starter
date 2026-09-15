import { describe, expect, it } from 'vitest';
import packageJson from '../package.json';
import {
  APP_ID,
  isAllowedDesktopUrl,
  isAllowedNavigationUrl,
  localServerUrl,
  LOOPBACK_HOST,
  PRODUCT_NAME,
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
  it('defines the requested identity and both Windows x64 targets', () => {
    expect(packageJson.build.appId).toBe(APP_ID);
    expect(packageJson.build.productName).toBe(PRODUCT_NAME);
    expect(packageJson.build.win.icon).toBe('build/icon.ico');
    expect(packageJson.build.win.target).toEqual([
      { target: 'nsis', arch: ['x64'] },
      { target: 'portable', arch: ['x64'] },
    ]);
  });

  it('packages the standalone server beside the Electron application', () => {
    expect(packageJson.main).toBe('electron/main.mjs');
    expect(packageJson.build.extraResources).toContainEqual({
      from: 'dist/standalone',
      to: 'server',
      filter: ['**/*'],
    });
  });
});
