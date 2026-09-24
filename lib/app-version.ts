import { version as packageVersion } from '../package.json';

export { packageVersion };

export function normalizeAppVersion(version: unknown): string {
  return typeof version === 'string' && version.trim() ? version.trim() : packageVersion;
}
