import { execFile } from 'node:child_process';
import { access, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'build', 'icon-source.jpg');
const outputPath = path.join(root, 'build', 'icon.ico');
const sizes = '256,128,64,48,32,24,16';

async function imageMagickCommand() {
  for (const command of ['magick', 'convert']) {
    try {
      await execFileAsync(command, ['-version']);
      return command;
    } catch {
      // Try the legacy command name for Linux environments with ImageMagick 6.
    }
  }
  throw new Error('ImageMagick is required (expected `magick` or `convert` on PATH).');
}

await access(sourcePath);
const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'fieldstead-icon-'));
const squareSource = path.join(temporaryDirectory, 'icon-square.png');

try {
  const command = await imageMagickCommand();
  await execFileAsync(command, [
    sourcePath,
    '-background', '#111D29',
    '-gravity', 'center',
    '-extent', '282x282',
    squareSource,
  ]);
  await execFileAsync(command, [
    squareSource,
    '-define', `icon:auto-resize=${sizes}`,
    outputPath,
  ]);
  console.log(`Generated ${path.relative(root, outputPath)} with sizes ${sizes}.`);
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
