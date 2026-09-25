import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('./globals.css', import.meta.url), 'utf8');

describe('assigned jobs field view', () => {
  it('adds a dedicated accessible assigned-jobs route without replacing desktop navigation', () => {
    expect(page).toContain("'Assigned Jobs'");
    expect(page).toContain("view === 'Assigned Jobs' && <AssignedJobsView");
    expect(page).toContain('aria-label="Assigned job actions"');
    expect(page).toContain('Offline-ready local queue');
  });

  it('renders visible sync states and field action controls', () => {
    for (const label of ['Pending', 'Synced', 'Conflicted', 'Arrived', 'Start work', 'Pause', 'Resume', 'Complete', 'Cancel job', 'Add note', 'Checklist']) {
      expect(page).toContain(label);
    }
  });

  it('includes responsive field cards and large touch targets', () => {
    expect(css).toContain('.assigned-jobs-page');
    expect(css).toContain('.field-action-grid');
    expect(css).toMatch(/\.field-action-grid button\{[^}]*min-height:44px/);
    expect(css).toContain('@media(max-width:680px)');
  });
});
