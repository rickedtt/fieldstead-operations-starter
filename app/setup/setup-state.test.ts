import { describe, expect, it } from 'vitest';
import {
  SETUP_STORAGE_KEY,
  advanceSetup,
  createInitialSetupState,
  normalizeSetupState,
  setupProgress,
  validateSetupStep,
} from './setup-state';

describe('first-run setup state', () => {
  it('starts with the business workspace and reports progress', () => {
    const state = createInitialSetupState();
    expect(state).toMatchObject({
      schemaVersion: 1,
      status: 'in-progress',
      currentStep: 'workspace',
      skippedSteps: [],
    });
    expect(setupProgress(state)).toEqual({ current: 1, total: 5, percent: 20 });
    expect(SETUP_STORAGE_KEY).toBe('fieldstead-setup-v1');
  });

  it('requires business and workspace names before advancing', () => {
    const state = createInitialSetupState();
    expect(validateSetupStep('workspace', state.data.workspace)).toEqual({
      valid: false,
      errors: {
        businessName: 'Enter the business name.',
        workspaceName: 'Enter a workspace name.',
      },
    });
    expect(() => advanceSetup(state)).toThrow('business name');

    state.data.workspace = {
      businessName: 'Northwind Heating',
      workspaceName: 'Main office',
    };
    expect(advanceSetup(state).currentStep).toBe('email');
  });

  it('validates optional capability details when they are supplied', () => {
    expect(validateSetupStep('email', { address: 'not-email', provider: 'google' }).valid).toBe(false);
    expect(validateSetupStep('sync', { remoteWorkspaceUrl: 'ftp://example.test', workspaceId: '' }).valid).toBe(false);
    expect(validateSetupStep('backup', { exportFolder: '', reminder: 'weekly' }).valid).toBe(true);
  });

  it('can skip optional capabilities and reaches review before completion', () => {
    let state = createInitialSetupState();
    state.data.workspace = { businessName: 'Northwind Heating', workspaceName: 'Main office' };
    state = advanceSetup(state);
    state = advanceSetup(state, { skip: true });
    state = advanceSetup(state, { skip: true });
    state = advanceSetup(state, { skip: true });
    expect(state.currentStep).toBe('review');
    expect(state.skippedSteps).toEqual(['email', 'sync', 'backup']);
    expect(advanceSetup(state)).toMatchObject({ status: 'complete', currentStep: 'review' });
  });

  it('resumes safe persisted values and strips secrets and unknown fields', () => {
    const restored = normalizeSetupState({
      schemaVersion: 1,
      status: 'in-progress',
      currentStep: 'sync',
      skippedSteps: ['email'],
      password: 'top-level-secret',
      data: {
        workspace: { businessName: 'Northwind', workspaceName: 'Office', token: 'secret' },
        email: { address: 'owner@example.com', provider: 'other', password: 'secret' },
        sync: { remoteWorkspaceUrl: 'https://sync.example.com', workspaceId: 'northwind', apiKey: 'secret' },
        backup: { exportFolder: 'D:\\Backups', reminder: 'weekly' },
      },
    });

    expect(restored).toEqual({
      schemaVersion: 1,
      status: 'in-progress',
      currentStep: 'sync',
      skippedSteps: ['email'],
      data: {
        workspace: { businessName: 'Northwind', workspaceName: 'Office' },
        email: { address: 'owner@example.com', provider: 'other' },
        sync: { remoteWorkspaceUrl: 'https://sync.example.com', workspaceId: 'northwind' },
        backup: { exportFolder: 'D:\\Backups', reminder: 'weekly' },
      },
    });
    expect(JSON.stringify(restored)).not.toMatch(/password|token|apiKey|secret/i);
  });
});
