import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const EXPECTED_ICON_SIZES = [256, 128, 64, 48, 32, 24, 16];
export const EXPECTED_SOURCE_SHA256 = '2d482e956315cef53c4fab534ae9f4a6c78aa816526c70a665da361974ef17e3';

export function parseIcoDirectory(buffer) {
  if (buffer.length < 6 || buffer.readUInt16LE(0) !== 0 || buffer.readUInt16LE(2) !== 1) {
    throw new Error('ICO header is invalid.');
  }
  const count = buffer.readUInt16LE(4);
  if (count === 0 || buffer.length < 6 + count * 16) throw new Error('ICO directory is truncated.');

  return Array.from({ length: count }, (_, index) => {
    const offset = 6 + index * 16;
    const width = buffer[offset] || 256;
    const height = buffer[offset + 1] || 256;
    const byteLength = buffer.readUInt32LE(offset + 8);
    const imageOffset = buffer.readUInt32LE(offset + 12);
    if (imageOffset + byteLength > buffer.length) throw new Error(`ICO image ${index} is truncated.`);
    return { width, height, bitDepth: buffer.readUInt16LE(offset + 6), byteLength, imageOffset };
  });
}

export function validateWindowsIcon({ icon, source }) {
  const failures = [];
  const sourceHash = createHash('sha256').update(source).digest('hex');
  if (sourceHash !== EXPECTED_SOURCE_SHA256) {
    failures.push(`build/icon-source.jpg must be the approved source image (${EXPECTED_SOURCE_SHA256}).`);
  }

  let entries = [];
  try {
    entries = parseIcoDirectory(icon);
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
    return failures;
  }

  const actualSizes = entries.map(({ width, height }) => `${width}x${height}`);
  const expectedSizes = EXPECTED_ICON_SIZES.map((size) => `${size}x${size}`);
  if (actualSizes.join(',') !== expectedSizes.join(',')) {
    failures.push(`ICO sizes must be ${expectedSizes.join(', ')}; found ${actualSizes.join(', ')}.`);
  }
  for (const entry of entries) {
    if (entry.width !== entry.height) failures.push(`ICO frame ${entry.width}x${entry.height} is not square.`);
    if (entry.bitDepth !== 32) failures.push(`ICO frame ${entry.width}x${entry.height} must be 32-bit.`);
    if (entry.byteLength === 0) failures.push(`ICO frame ${entry.width}x${entry.height} is empty.`);
  }
  return failures;
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const [icon, source] = await Promise.all([
    readFile(path.join(root, 'build', 'icon.ico')),
    readFile(path.join(root, 'build', 'icon-source.jpg')),
  ]);
  const failures = validateWindowsIcon({ icon, source });
  if (failures.length) {
    console.error(failures.map((failure) => `- ${failure}`).join('\n'));
    process.exitCode = 1;
    return;
  }
  console.log(`Validated Windows ICO sizes: ${EXPECTED_ICON_SIZES.join(', ')}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
