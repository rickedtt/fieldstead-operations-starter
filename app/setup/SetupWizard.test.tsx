import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SetupWizard } from './SetupWizard';
import { createInitialSetupState } from './setup-state';

describe('SetupWizard', () => {
  it('renders first-run progress and required workspace fields without secret inputs', () => {
    const html = renderToStaticMarkup(
      <SetupWizard
        state={createInitialSetupState()}
        onChange={vi.fn()}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(html).toContain('Step 1 of 5');
    expect(html).toContain('Business identity &amp; workspace');
    expect(html).toContain('name="businessName"');
    expect(html).toContain('name="workspaceName"');
    expect(html).not.toContain('type="password"');
    expect(html).not.toMatch(/name="(?:token|secret|apiKey)"/i);
  });

  it('offers skip on optional capabilities', () => {
    const state = createInitialSetupState();
    state.currentStep = 'email';
    const html = renderToStaticMarkup(
      <SetupWizard state={state} onChange={vi.fn()} onSave={vi.fn()} onClose={vi.fn()} />,
    );
    expect(html).toContain('Business email');
    expect(html).toContain('Skip for now');
  });

  it('reviews all four confirmed capabilities before completion', () => {
    const state = createInitialSetupState();
    state.currentStep = 'review';
    state.data.workspace = { businessName: 'Northwind', workspaceName: 'Main office' };
    const html = renderToStaticMarkup(
      <SetupWizard state={state} onChange={vi.fn()} onSave={vi.fn()} onClose={vi.fn()} />,
    );

    expect(html).toContain('Business identity &amp; workspace');
    expect(html).toContain('Business email');
    expect(html).toContain('Sync / remote workspace');
    expect(html).toContain('Backup / export');
    expect(html).toContain('Finish setup');
  });
});
