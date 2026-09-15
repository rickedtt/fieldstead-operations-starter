import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { APP_ID, PRODUCT_NAME } from '../electron/desktop-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const failures = [];

function requireValue(condition, message) {
  if (!condition) failures.push(message);
}

requireValue(packageJson.main === 'electron/main.mjs', 'package main must be electron/main.mjs');
requireValue(packageJson.build?.appId === APP_ID, `build.appId must be ${APP_ID}`);
requireValue(packageJson.build?.productName === PRODUCT_NAME, `build.productName must be ${PRODUCT_NAME}`);
requireValue(packageJson.build?.win?.icon === 'build/icon.ico', 'Windows icon must be build/icon.ico');

const targets = packageJson.build?.win?.target ?? [];
for (const name of ['nsis', 'portable']) {
  requireValue(
    targets.some((target) => target.target === name && target.arch?.includes('x64')),
    `Windows ${name} x64 target is required`,
  );
}

for (const relativePath of [
  'electron/main.mjs',
  'electron/preload.cjs',
  'build/icon.ico',
  'public/assets/fieldstead-systems-refined.svg',
]) {
  try {
    await access(path.join(root, relativePath));
  } catch {
    failures.push(`Required package file is missing: ${relativePath}`);
  }
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log('Desktop package metadata and required files are valid.');
