import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { APP_ID, PRODUCT_NAME } from '../electron/desktop-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const packageLock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
const failures = [];

function requireValue(condition, message) {
  if (!condition) failures.push(message);
}

requireValue(packageJson.main === 'electron/main.mjs', 'package main must be electron/main.mjs');
requireValue(packageJson.build?.appId === APP_ID, `build.appId must be ${APP_ID}`);
requireValue(packageJson.build?.productName === PRODUCT_NAME, `build.productName must be ${PRODUCT_NAME}`);
requireValue(packageJson.build?.win?.icon === 'build/icon.ico', 'Windows icon must be build/icon.ico');
requireValue(packageJson.build?.linux?.icon === 'build/icon.png', 'Linux icon must be build/icon.png');
requireValue(packageLock.version === packageJson.version, 'package-lock.json version must match package.json');
requireValue(packageLock.packages?.['']?.version === packageJson.version, 'package-lock root version must match package.json');
requireValue(
  packageJson.build?.files?.includes('lib/mail-provider-runtime.mjs'),
  'build.files must include lib/mail-provider-runtime.mjs',
);

const targets = packageJson.build?.win?.target ?? [];
requireValue(
  targets.length === 1 && targets[0]?.target === 'nsis' && targets[0]?.arch?.includes('x64'),
  'NSIS x64 must be the sole default Windows target',
);
requireValue(
  packageJson.scripts?.['desktop:dist:win']?.includes('--win nsis --x64') &&
    !packageJson.scripts?.['desktop:dist:win']?.includes('portable'),
  'desktop:dist:win must build NSIS only',
);
requireValue(
  packageJson.scripts?.['desktop:dist:portable']?.includes('--win portable --x64'),
  'desktop:dist:portable must retain the explicit diagnostic fallback',
);
requireValue(packageJson.build?.nsis?.deleteAppDataOnUninstall === false, 'NSIS uninstall must retain user data');

for (const relativePath of [
  'electron/main.mjs',
  'electron/email-service.mjs',
  'electron/preload.cjs',
  'electron/setup-store.mjs',
  'lib/mail-provider-runtime.mjs',
  'build/icon.ico',
  'build/icon.png',
  'public/assets/fieldstead-systems-refined.svg',
]) {
  try {
    await access(path.join(root, relativePath));
  } catch {
    failures.push(`Required package file is missing: ${relativePath}`);
  }
}

const emailService = await readFile(path.join(root, 'electron/email-service.mjs'), 'utf8');
requireValue(
  emailService.includes("from '../lib/mail-provider-runtime.mjs'"),
  'electron/email-service.mjs must import the packaged lib/mail-provider-runtime.mjs module',
);

const mailProviderSource = await readFile(path.join(root, 'lib/mail-provider.ts'), 'utf8');
const expectedMailProviderRuntime = mailProviderSource
  .replaceAll(/export function /g, 'function ')
  .replaceAll(/export const /g, 'const ')
  + '\nexport { detectMailProvider, getMailProviderProfile, normalizeMailProvider };\n';
const mailProviderRuntime = await readFile(path.join(root, 'lib/mail-provider-runtime.mjs'), 'utf8');
requireValue(
  mailProviderRuntime === expectedMailProviderRuntime,
  'lib/mail-provider-runtime.mjs is stale; run npm run desktop:prepare-server',
);

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log('Desktop package metadata and required files are valid.');
