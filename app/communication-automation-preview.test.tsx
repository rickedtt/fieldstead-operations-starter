import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AuthIdentity } from '../server/types';
import { CommunicationAutomationPreview, describeCommunicationDecision, type CommunicationDryRunClient } from './communication-automation-preview';

const owner: AuthIdentity = { user_id: 'owner-1', organization_id: 'org-1', role: 'owner_admin' };
const dispatcher: AuthIdentity = { user_id: 'dispatcher-1', organization_id: 'org-1', role: 'dispatcher' };

function render(identity: AuthIdentity, client: CommunicationDryRunClient = vi.fn()) {
  return renderToStaticMarkup(<CommunicationAutomationPreview identity={identity} authorization="Bearer test-token" client={client} />);
}

describe('CommunicationAutomationPreview', () => {
  it('gates the preview form and controls to owner administrators', () => {
    const html = render(dispatcher);
    expect(html).toContain('Owner administrator access required');
    expect(html).not.toMatch(/<form|<button|<input|<select|<textarea/);
  });

  it('renders an accessible preview-only owner form with no send or execute control', () => {
    const html = render(owner);
    expect(html).toContain('aria-labelledby="communication-preview-heading"');
    expect(html).toContain('<form');
    expect(html).toContain('Rule ID');
    expect(html).toContain('Recipient');
    expect(html).toContain('Content version');
    expect(html).toContain('Message content');
    expect(html).toContain('Evaluate policy preview');
    expect(html).toContain('role="status"');
    expect(html).toContain('Preview only');
    expect(html).toContain('No message is sent');
    expect(html).not.toMatch(/>\s*(Send|Execute|Schedule|Retry)\b/i);
    expect(html).not.toMatch(/type="password"|name="token"|name="secret"|name="credential"|name="provider"/i);
  });

  it('explains every policy category and preserves safe public errors', () => {
    for (const [reason, category] of [
      ['consent_required', 'Consent'],
      ['permanently_suppressed', 'Suppression'],
      ['quiet_hours', 'Quiet hours'],
      ['global_disabled', 'Kill switch'],
      ['recipient_limit', 'Quota'],
    ] as const) expect(describeCommunicationDecision(reason).category).toBe(category);
    expect(describeCommunicationDecision(null)).toMatchObject({ category: 'Allowed', allowed: true });
    expect(describeCommunicationDecision('unknown_internal_reason')).toMatchObject({ category: 'Blocked', detail: 'The preview was blocked by policy.' });
  });

  it('uses only the injected dry-run client and exposes no secret fields', () => {
    const client = vi.fn();
    const html = render(owner, client);
    expect(client).not.toHaveBeenCalled();
    expect(html).not.toMatch(/type="password"|name="token"|name="secret"|name="credential"/i);
  });
});
