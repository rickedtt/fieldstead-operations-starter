import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createSetupStore } from './setup-store.mjs';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true }),
  ));
});

describe('desktop setup store', () => {
  it('round-trips allowlisted setup fields in the user-data directory', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'fieldstead-setup-'));
    temporaryDirectories.push(directory);
    const store = createSetupStore(directory);

    const saved = await store.save({
      schemaVersion: 1,
      status: 'in-progress',
      currentStep: 'email',
      skippedSteps: [],
      password: 'never-save-me',
      data: {
        workspace: { businessName: 'Northwind', workspaceName: 'Office' },
        email: { address: 'owner@example.com', provider: 'google', password: 'never-save-me' },
        sync: { remoteWorkspaceUrl: '', workspaceId: '' },
        backup: { exportFolder: '', reminder: 'weekly' },
      },
    });

    await expect(store.load()).resolves.toEqual(saved);
    const persisted = await readFile(path.join(directory, 'setup-state.json'), 'utf8');
    expect(persisted).not.toContain('never-save-me');
    expect(persisted).not.toContain('password');
  });

  it('returns null for missing or malformed state', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'fieldstead-setup-'));
    temporaryDirectories.push(directory);
    const store = createSetupStore(directory);
    await expect(store.load()).resolves.toBeNull();
  });
});
