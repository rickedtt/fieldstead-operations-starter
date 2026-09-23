import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import packageJson from '../package.json';
import {
  expectedInstallerName,
  validatePackagedRuntimeEntries,
  validateWindowsInstallerArtifacts,
} from '../scripts/verify-windows-installer.mjs';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true }),
  ));
});

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'fieldstead-installer-'));
  temporaryDirectories.push(directory);
  const installerName = expectedInstallerName(packageJson);
  const executable = Buffer.alloc(132);
  executable.write('MZ');
  executable.writeUInt32LE(128, 0x3c);
  executable.write('PE\0\0', 128, 'binary');
  await writeFile(path.join(directory, installerName), executable);
  await writeFile(path.join(directory, 'latest.yml'), [
    `version: ${packageJson.version}`,
    `path: ${installerName}`,
    `sha512: fixture-checksum`,
    'files:',
    `  - url: ${installerName.replaceAll(' ', '-')}`,
    '    sha512: fixture-checksum',
    '    size: 4',
  ].join('\n'));
  return { directory, installerName };
}

describe('Windows installer artifact contract', () => {
  it('requires the packaged mail runtime at Electron\'s import path', () => {
    expect(validatePackagedRuntimeEntries([
      '/electron/main.mjs',
      '/electron/setup-store.mjs',
      '/lib/mail-provider-runtime.mjs',
    ])).toEqual([]);
    expect(validatePackagedRuntimeEntries(['/electron/main.mjs'])).toContainEqual(
      expect.stringContaining('lib/mail-provider-runtime.mjs'),
    );
  });

  it('accepts a versioned NSIS PE and matching updater metadata', async () => {
    const { directory, installerName } = await fixture();

    await expect(validateWindowsInstallerArtifacts({
      packageJson,
      releaseDirectory: directory,
    })).resolves.toEqual({ installerName, failures: [] });
  });

  it('rejects non-PE installers and stale update metadata', async () => {
    const { directory, installerName } = await fixture();
    await writeFile(path.join(directory, installerName), 'not a PE');
    await writeFile(path.join(directory, 'latest.yml'), 'version: 0.0.1\npath: portable.exe\n');

    const result = await validateWindowsInstallerArtifacts({
      packageJson,
      releaseDirectory: directory,
    });

    expect(result.failures).toEqual(expect.arrayContaining([
      expect.stringContaining('Windows PE'),
      expect.stringContaining(packageJson.version),
      expect.stringContaining(installerName),
    ]));
  });

  it('rejects an MZ stub without a PE signature', async () => {
    const { directory, installerName } = await fixture();
    await writeFile(path.join(directory, installerName), Buffer.from('MZ incomplete installer'));

    const result = await validateWindowsInstallerArtifacts({ packageJson, releaseDirectory: directory });

    expect(result.failures).toContainEqual(expect.stringContaining('PE signature'));
  });

  it('documents the complete Windows acceptance matrix', async () => {
    const documentation = await readFile(
      new URL('../docs/deployable-product-acceptance.md', import.meta.url),
      'utf8',
    );

    for (const criterion of [
      'Clean install',
      'Uninstall',
      'Version metadata',
      'Shortcuts',
      'Retained local data',
      'Offline launch',
      'Upgrade',
      'Runtime packaging',
    ]) {
      expect(documentation).toContain(criterion);
    }
    expect(documentation).toContain('lib/mail-provider-runtime.mjs');
  });

  it('publishes Setup as the dashboard primary and portable as a labeled fallback', async () => {
    const publisher = await readFile(
      new URL('../scripts/publish-windows-demo-to-hq.mjs', import.meta.url),
      'utf8',
    );
    expect(packageJson.scripts['desktop:publish:hq']).toContain('desktop:dist:win');
    expect(publisher).toContain('-Setup-${version}-x64.exe');
    expect(publisher).toContain("role: 'primary'");
    expect(publisher).toContain("role: 'diagnostic-fallback'");
    expect(publisher).toContain('/windows/fieldstead-operations-starter-setup.exe');
    expect(publisher).toContain('NSIS installer (primary)');
    expect(publisher).toContain('Portable diagnostic fallback');
  });

  it('runs package and installer validation in Windows workflows', async () => {
    for (const workflow of ['windows-build.yml', 'windows-release-direct.yml']) {
      const source = await readFile(new URL(`../.github/workflows/${workflow}`, import.meta.url), 'utf8');
      expect(source).toContain('npm run package:validate');
      expect(source).toContain('npm run installer:verify');
      expect(source).toContain('release/*Setup*.exe');
    }
  });
});
