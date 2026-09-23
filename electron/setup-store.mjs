import fs from 'node:fs/promises';
import path from 'node:path';

const STEPS = ['workspace', 'email', 'sync', 'backup', 'review'];
const OPTIONAL_STEPS = ['email', 'sync', 'backup'];

function record(value) {
  return value && typeof value === 'object' ? value : {};
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function sanitizeSetupState(value) {
  const source = record(value);
  const data = record(source.data);
  const workspace = record(data.workspace);
  const email = record(data.email);
  const sync = record(data.sync);
  const backup = record(data.backup);
  return {
    schemaVersion: 1,
    status: source.status === 'complete' ? 'complete' : 'in-progress',
    currentStep: STEPS.includes(source.currentStep) ? source.currentStep : 'workspace',
    skippedSteps: Array.isArray(source.skippedSteps)
      ? [...new Set(source.skippedSteps.filter((step) => OPTIONAL_STEPS.includes(step)))]
      : [],
    data: {
      workspace: {
        businessName: text(workspace.businessName),
        workspaceName: text(workspace.workspaceName),
      },
      email: {
        address: text(email.address),
        provider: ['google', 'microsoft', 'other'].includes(email.provider) ? email.provider : '',
      },
      sync: {
        remoteWorkspaceUrl: text(sync.remoteWorkspaceUrl),
        workspaceId: text(sync.workspaceId),
      },
      backup: {
        exportFolder: text(backup.exportFolder),
        reminder: ['weekly', 'monthly', 'manual'].includes(backup.reminder) ? backup.reminder : 'weekly',
      },
    },
  };
}

export function createSetupStore(userDataDirectory) {
  const statePath = path.join(userDataDirectory, 'setup-state.json');
  return {
    async load() {
      try {
        return sanitizeSetupState(JSON.parse(await fs.readFile(statePath, 'utf8')));
      } catch {
        return null;
      }
    },
    async save(value) {
      const state = sanitizeSetupState(value);
      await fs.mkdir(userDataDirectory, { recursive: true });
      const temporaryPath = `${statePath}.tmp`;
      await fs.writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
      await fs.rename(temporaryPath, statePath);
      return state;
    },
  };
}
