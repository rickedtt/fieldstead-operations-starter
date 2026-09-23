import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export function expectedInstallerName(packageJson) {
  return `${packageJson.build.productName}-Setup-${packageJson.version}-x64.exe`;
}

export function validatePackagedRuntimeEntries(entries) {
  const normalized = new Set(entries.map((entry) => entry.replaceAll('\\', '/').replace(/^\/?/, '/')));
  const failures = [];
  for (const requiredEntry of [
    '/electron/main.mjs',
    '/electron/setup-store.mjs',
    '/lib/mail-provider-runtime.mjs',
  ]) {
    if (!normalized.has(requiredEntry)) failures.push(`Packaged app.asar is missing ${requiredEntry.slice(1)}.`);
  }
  return failures;
}

export async function validateWindowsInstallerArtifacts({ packageJson, releaseDirectory }) {
  const installerName = expectedInstallerName(packageJson);
  const failures = [];
  let installer;
  let metadata = '';

  try {
    installer = await readFile(path.join(releaseDirectory, installerName));
  } catch {
    failures.push(`Missing NSIS installer: ${installerName}`);
  }
  if (installer && (installer[0] !== 0x4d || installer[1] !== 0x5a)) {
    failures.push(`${installerName} is not a Windows PE executable (missing MZ header).`);
  } else if (installer) {
    const peOffset = installer.length >= 0x40 ? installer.readUInt32LE(0x3c) : -1;
    const hasPeSignature = peOffset >= 0 &&
      peOffset + 4 <= installer.length &&
      installer.subarray(peOffset, peOffset + 4).equals(Buffer.from([0x50, 0x45, 0, 0]));
    if (!hasPeSignature) failures.push(`${installerName} is missing its Windows PE signature.`);
  }
  try {
    metadata = await readFile(path.join(releaseDirectory, 'latest.yml'), 'utf8');
  } catch {
    failures.push('Missing electron-updater metadata: latest.yml');
  }
  if (metadata && !new RegExp(`^version:\\s*["']?${packageJson.version.replaceAll('.', '\\.')}`, 'm').test(metadata)) {
    failures.push(`latest.yml must declare package version ${packageJson.version}.`);
  }
  if (metadata && !metadata.includes(installerName) && !metadata.includes(installerName.replaceAll(' ', '%20'))) {
    failures.push(`latest.yml must reference the primary installer ${installerName}.`);
  }

  return { installerName, failures };
}

export async function validateWindowsExecutableVersion(installerPath, expectedVersion) {
  if (process.platform !== 'win32') return [];
  try {
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '(Get-Item -LiteralPath $env:FIELDSTEAD_INSTALLER_PATH).VersionInfo.ProductVersion',
    ], { env: { ...process.env, FIELDSTEAD_INSTALLER_PATH: installerPath } });
    const productVersion = stdout.trim();
    return productVersion === expectedVersion || productVersion.startsWith(`${expectedVersion}.`)
      ? []
      : [`Installer ProductVersion ${productVersion || '(empty)'} does not match ${expectedVersion}.`];
  } catch (error) {
    return [`Could not read installer ProductVersion: ${error instanceof Error ? error.message : String(error)}`];
  }
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const result = await validateWindowsInstallerArtifacts({
    packageJson,
    releaseDirectory: path.join(root, 'release'),
  });
  result.failures.push(...await validateWindowsExecutableVersion(
    path.join(root, 'release', result.installerName),
    packageJson.version,
  ));
  try {
    const { listPackage } = await import('@electron/asar');
    const entries = listPackage(path.join(root, 'release', 'win-unpacked', 'resources', 'app.asar'));
    result.failures.push(...validatePackagedRuntimeEntries(entries));
  } catch (error) {
    result.failures.push(`Could not inspect packaged app.asar: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (result.failures.length) {
    console.error(result.failures.map((failure) => `- ${failure}`).join('\n'));
    process.exitCode = 1;
    return;
  }
  console.log(`Verified primary Windows installer: ${result.installerName}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
