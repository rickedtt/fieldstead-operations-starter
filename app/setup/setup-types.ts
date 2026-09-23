export const SETUP_STEPS = ['workspace', 'email', 'sync', 'backup', 'review'] as const;

export type SetupStep = typeof SETUP_STEPS[number];
export type SetupCapabilityStep = Exclude<SetupStep, 'review'>;
export type SetupStatus = 'in-progress' | 'complete';
export type EmailProvider = 'google' | 'microsoft' | 'other' | '';
export type BackupReminder = 'weekly' | 'monthly' | 'manual';

export type WorkspaceSetup = {
  businessName: string;
  workspaceName: string;
};

export type EmailSetup = {
  address: string;
  provider: EmailProvider;
};

export type SyncSetup = {
  remoteWorkspaceUrl: string;
  workspaceId: string;
};

export type BackupSetup = {
  exportFolder: string;
  reminder: BackupReminder;
};

export type SetupData = {
  workspace: WorkspaceSetup;
  email: EmailSetup;
  sync: SyncSetup;
  backup: BackupSetup;
};

export type SetupState = {
  schemaVersion: 1;
  status: SetupStatus;
  currentStep: SetupStep;
  skippedSteps: SetupCapabilityStep[];
  data: SetupData;
};

export type SetupValidation = {
  valid: boolean;
  errors: Record<string, string>;
};

export type SetupDesktopBridge = {
  getSetupState?: () => Promise<unknown>;
  saveSetupState?: (state: SetupState) => Promise<unknown>;
};
