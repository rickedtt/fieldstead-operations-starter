'use client';

import { useState } from 'react';
import {
  advanceSetup,
  previousSetupStep,
  setupProgress,
  updateSetupData,
  validateSetupStep,
} from './setup-state';
import type { SetupCapabilityStep, SetupState } from './setup-types';

type SetupWizardProps = {
  state: SetupState;
  onChange: (state: SetupState) => void;
  onSave: (state: SetupState) => void | Promise<void>;
  onClose: () => void;
};

const TITLES = {
  workspace: 'Business identity & workspace',
  email: 'Business email',
  sync: 'Sync / remote workspace',
  backup: 'Backup / export',
  review: 'Review setup',
} as const;

const CAPABILITIES: SetupCapabilityStep[] = ['workspace', 'email', 'sync', 'backup'];

export function SetupWizard({ state, onChange, onSave, onClose }: SetupWizardProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const progress = setupProgress(state);

  async function save(next: SetupState) {
    setSaving(true);
    try {
      onChange(next);
      await onSave(next);
    } finally {
      setSaving(false);
    }
  }

  async function next(skip = false) {
    const validation = state.currentStep === 'review'
      ? { valid: true, errors: {} }
      : validateSetupStep(state.currentStep, state.data[state.currentStep]);
    if (!skip && !validation.valid) {
      setErrors(validation.errors);
      return;
    }
    setErrors({});
    const nextState = advanceSetup(state, { skip });
    await save(nextState);
    if (nextState.status === 'complete') onClose();
  }

  function edit(step: SetupCapabilityStep) {
    const nextState = { ...state, status: 'in-progress' as const, currentStep: step };
    setErrors({});
    onChange(nextState);
    void onSave(nextState);
  }

  const workspace = state.data.workspace;
  const email = state.data.email;
  const sync = state.data.sync;
  const backup = state.data.backup;

  return (
    <div className="setup-overlay" role="dialog" aria-modal="true" aria-labelledby="setup-title">
      <section className="setup-wizard">
        <header className="setup-header">
          <div>
            <p className="eyebrow">FIRST-RUN SETUP</p>
            <h1 id="setup-title">{TITLES[state.currentStep]}</h1>
            <p>Step {progress.current} of {progress.total}</p>
          </div>
          {state.status === 'complete' && <button className="close" onClick={onClose} aria-label="Close setup">×</button>}
        </header>
        <div className="setup-progress" aria-label={`${progress.percent}% complete`}>
          <span style={{ width: `${progress.percent}%` }} />
        </div>
        <ol className="setup-step-list" aria-label="Setup steps">
          {Object.entries(TITLES).map(([step, title], index) => (
            <li key={step} className={state.currentStep === step ? 'active' : index < progress.current - 1 ? 'done' : ''}>
              <span>{index + 1}</span>{title}
            </li>
          ))}
        </ol>

        <div className="setup-body">
          {state.currentStep === 'workspace' && <>
            <p className="setup-copy">Name the business and this local workspace. These labels identify the records on this device.</p>
            <div className="form-grid">
              <label>Business name<input name="businessName" autoFocus value={workspace.businessName} onChange={(event) => onChange(updateSetupData(state, 'workspace', { ...workspace, businessName: event.target.value }))} />{errors.businessName && <small className="field-error">{errors.businessName}</small>}</label>
              <label>Workspace name<input name="workspaceName" value={workspace.workspaceName} placeholder="Main office" onChange={(event) => onChange(updateSetupData(state, 'workspace', { ...workspace, workspaceName: event.target.value }))} />{errors.workspaceName && <small className="field-error">{errors.workspaceName}</small>}</label>
            </div>
          </>}

          {state.currentStep === 'email' && <>
            <p className="setup-copy">Record the mailbox you plan to connect. Secure sign-in is handled separately by the desktop email connection.</p>
            <div className="form-grid">
              <label>Business email<input name="emailAddress" type="email" value={email.address} placeholder="office@example.com" onChange={(event) => onChange(updateSetupData(state, 'email', { ...email, address: event.target.value }))} />{errors.address && <small className="field-error">{errors.address}</small>}</label>
              <label>Provider<select name="emailProvider" value={email.provider} onChange={(event) => onChange(updateSetupData(state, 'email', { ...email, provider: event.target.value as typeof email.provider }))}><option value="">Choose later</option><option value="google">Google Workspace / Gmail</option><option value="microsoft">Microsoft 365 / Outlook</option><option value="other">Other provider</option></select></label>
            </div>
          </>}

          {state.currentStep === 'sync' && <>
            <p className="setup-copy">Identify the approved remote workspace for future cross-system sync. Local records remain available offline.</p>
            <div className="form-grid">
              <label>Remote workspace URL<input name="remoteWorkspaceUrl" type="url" value={sync.remoteWorkspaceUrl} placeholder="https://workspace.example.com" onChange={(event) => onChange(updateSetupData(state, 'sync', { ...sync, remoteWorkspaceUrl: event.target.value }))} />{errors.remoteWorkspaceUrl && <small className="field-error">{errors.remoteWorkspaceUrl}</small>}</label>
              <label>Workspace ID<input name="workspaceId" value={sync.workspaceId} placeholder="main-office" onChange={(event) => onChange(updateSetupData(state, 'sync', { ...sync, workspaceId: event.target.value }))} /></label>
            </div>
          </>}

          {state.currentStep === 'backup' && <>
            <p className="setup-copy">Choose how often to be reminded to export a versioned local backup. You can select the actual destination when exporting.</p>
            <div className="form-grid">
              <label>Preferred export folder<input name="exportFolder" value={backup.exportFolder} placeholder="Documents\\Fieldstead Backups" onChange={(event) => onChange(updateSetupData(state, 'backup', { ...backup, exportFolder: event.target.value }))} /></label>
              <label>Backup reminder<select name="backupReminder" value={backup.reminder} onChange={(event) => onChange(updateSetupData(state, 'backup', { ...backup, reminder: event.target.value as typeof backup.reminder }))}><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="manual">Only when I choose</option></select></label>
            </div>
          </>}

          {state.currentStep === 'review' && <>
            <p className="setup-copy">Confirm the non-secret setup details saved on this device. You can reopen this wizard from Settings.</p>
            <div className="setup-review">
              {CAPABILITIES.map((step) => {
                const detail = step === 'workspace'
                  ? `${workspace.businessName} · ${workspace.workspaceName}`
                  : step === 'email'
                    ? email.address || 'Not configured'
                    : step === 'sync'
                      ? sync.remoteWorkspaceUrl || 'Not configured'
                      : `${backup.reminder} reminder${backup.exportFolder ? ` · ${backup.exportFolder}` : ''}`;
                return <article key={step}><div><h2>{TITLES[step]}</h2><p>{state.skippedSteps.includes(step) ? 'Skipped for now' : detail}</p></div><button className="text-button" onClick={() => edit(step)}>Edit</button></article>;
              })}
            </div>
          </>}
        </div>

        <footer className="setup-actions">
          <div>{state.currentStep !== 'workspace' && <button className="secondary" disabled={saving} onClick={() => void save(previousSetupStep(state))}>Back</button>}</div>
          <div>
            {['email', 'sync', 'backup'].includes(state.currentStep) && <button className="text-button" disabled={saving} onClick={() => void next(true)}>Skip for now</button>}
            <button className="primary" disabled={saving} onClick={() => void next()}>{state.currentStep === 'review' ? 'Finish setup' : 'Save and continue'}</button>
          </div>
        </footer>
      </section>
    </div>
  );
}
