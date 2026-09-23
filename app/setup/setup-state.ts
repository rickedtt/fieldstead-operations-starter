import {
  SETUP_STEPS,
  type BackupReminder,
  type SetupCapabilityStep,
  type SetupData,
  type SetupDesktopBridge,
  type SetupState,
  type SetupStep,
  type SetupValidation,
} from './setup-types';

export const SETUP_STORAGE_KEY = 'fieldstead-setup-v1';

const OPTIONAL_STEPS: SetupCapabilityStep[] = ['email', 'sync', 'backup'];

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

export function createInitialSetupState(): SetupState {
  return {
    schemaVersion: 1,
    status: 'in-progress',
    currentStep: 'workspace',
    skippedSteps: [],
    data: {
      workspace: { businessName: '', workspaceName: '' },
      email: { address: '', provider: '' },
      sync: { remoteWorkspaceUrl: '', workspaceId: '' },
      backup: { exportFolder: '', reminder: 'weekly' },
    },
  };
}

export function normalizeSetupState(value: unknown): SetupState {
  const fallback = createInitialSetupState();
  const source = record(value);
  const data = record(source.data);
  const workspace = record(data.workspace);
  const email = record(data.email);
  const sync = record(data.sync);
  const backup = record(data.backup);
  const currentStep = SETUP_STEPS.includes(source.currentStep as SetupStep)
    ? source.currentStep as SetupStep
    : fallback.currentStep;
  const skippedSteps = Array.isArray(source.skippedSteps)
    ? source.skippedSteps.filter((step): step is SetupCapabilityStep => OPTIONAL_STEPS.includes(step as SetupCapabilityStep))
    : [];
  const provider = ['google', 'microsoft', 'other'].includes(text(email.provider))
    ? text(email.provider) as 'google' | 'microsoft' | 'other'
    : '';
  const reminder = ['weekly', 'monthly', 'manual'].includes(text(backup.reminder))
    ? text(backup.reminder) as BackupReminder
    : 'weekly';

  return {
    schemaVersion: 1,
    status: source.status === 'complete' ? 'complete' : 'in-progress',
    currentStep,
    skippedSteps: [...new Set(skippedSteps)],
    data: {
      workspace: {
        businessName: text(workspace.businessName),
        workspaceName: text(workspace.workspaceName),
      },
      email: { address: text(email.address), provider },
      sync: {
        remoteWorkspaceUrl: text(sync.remoteWorkspaceUrl),
        workspaceId: text(sync.workspaceId),
      },
      backup: { exportFolder: text(backup.exportFolder), reminder },
    },
  };
}

export function setupProgress(state: SetupState) {
  const current = Math.max(0, SETUP_STEPS.indexOf(state.currentStep)) + 1;
  return { current, total: SETUP_STEPS.length, percent: current * 100 / SETUP_STEPS.length };
}

export function validateSetupStep(step: SetupStep, value: unknown): SetupValidation {
  const input = record(value);
  const errors: Record<string, string> = {};

  if (step === 'workspace') {
    if (!text(input.businessName)) errors.businessName = 'Enter the business name.';
    if (!text(input.workspaceName)) errors.workspaceName = 'Enter a workspace name.';
  }
  if (step === 'email') {
    const address = text(input.address);
    if (address && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      errors.address = 'Enter a valid email address or skip this step.';
    }
  }
  if (step === 'sync') {
    const remoteWorkspaceUrl = text(input.remoteWorkspaceUrl);
    if (remoteWorkspaceUrl) {
      try {
        const url = new URL(remoteWorkspaceUrl);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported protocol');
      } catch {
        errors.remoteWorkspaceUrl = 'Enter a valid HTTP or HTTPS workspace URL.';
      }
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function advanceSetup(state: SetupState, options: { skip?: boolean } = {}): SetupState {
  if (state.currentStep === 'review') return { ...state, status: 'complete' };
  const validation = validateSetupStep(state.currentStep, state.data[state.currentStep]);
  if (!options.skip && !validation.valid) {
    throw new Error(Object.values(validation.errors)[0] ?? 'Complete this setup step.');
  }
  if (options.skip && state.currentStep === 'workspace') {
    throw new Error('The business workspace cannot be skipped.');
  }
  const index = SETUP_STEPS.indexOf(state.currentStep);
  const skippedSteps = options.skip
    ? [...new Set([...state.skippedSteps, state.currentStep as SetupCapabilityStep])]
    : state.skippedSteps.filter((step) => step !== state.currentStep);
  return {
    ...state,
    currentStep: SETUP_STEPS[index + 1] ?? 'review',
    skippedSteps,
  };
}

export function previousSetupStep(state: SetupState): SetupState {
  const index = SETUP_STEPS.indexOf(state.currentStep);
  return { ...state, currentStep: SETUP_STEPS[Math.max(0, index - 1)] };
}

export function updateSetupData<K extends keyof SetupData>(
  state: SetupState,
  step: K,
  value: SetupData[K],
): SetupState {
  return { ...state, data: { ...state.data, [step]: value } };
}

export async function loadSetupState(
  desktop: SetupDesktopBridge | undefined,
  storage: Pick<Storage, 'getItem'> | undefined,
): Promise<SetupState> {
  try {
    const value = desktop?.getSetupState
      ? await desktop.getSetupState()
      : JSON.parse(storage?.getItem(SETUP_STORAGE_KEY) ?? 'null');
    return value ? normalizeSetupState(value) : createInitialSetupState();
  } catch {
    return createInitialSetupState();
  }
}

export async function persistSetupState(
  state: SetupState,
  desktop: SetupDesktopBridge | undefined,
  storage: Pick<Storage, 'setItem'> | undefined,
): Promise<SetupState> {
  const safeState = normalizeSetupState(state);
  if (desktop?.saveSetupState) {
    return normalizeSetupState(await desktop.saveSetupState(safeState));
  }
  storage?.setItem(SETUP_STORAGE_KEY, JSON.stringify(safeState));
  return safeState;
}
