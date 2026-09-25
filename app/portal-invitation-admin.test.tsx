import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AuthIdentity } from '../server/types';
import { PortalInvitationAdmin, type PortalInvitationSummary } from './portal-invitation-admin';

const owner: AuthIdentity = { user_id: 'owner-1', organization_id: 'org-1', role: 'owner_admin' };
const dispatcher: AuthIdentity = { user_id: 'dispatcher-1', organization_id: 'org-1', role: 'dispatcher' };
const invitations: PortalInvitationSummary[] = [{
  id: 'invite-1', customerId: 'customer-1', status: 'pending',
  expiresAt: '2026-09-26T15:00:00.000Z', createdAt: '2026-09-25T15:00:00.000Z',
}];

describe('PortalInvitationAdmin', () => {
  it('renders owner-only manual invitation administration with no delivery or registration claims', () => {
    const html = renderToStaticMarkup(<PortalInvitationAdmin identity={owner} customerId="customer-1" invitations={invitations} onCreate={vi.fn()} onResend={vi.fn()} onRevoke={vi.fn()} onExpire={vi.fn()} />);
    expect(html).toContain('Portal invitations');
    expect(html).toContain('Manual delivery only');
    expect(html).toContain('Create invitation');
    expect(html).toContain('Resend');
    expect(html).toContain('Revoke');
    expect(html).toContain('Expire');
    expect(html).not.toMatch(/Send email|Send SMS|Pay now|Upload file|Create account/i);
    expect(html).toContain('No approvals, uploads, payments, messaging, or customer self-registration.');
  });

  it('does not expose administration controls to non-owners', () => {
    const html = renderToStaticMarkup(<PortalInvitationAdmin identity={dispatcher} customerId="customer-1" invitations={invitations} onCreate={vi.fn()} onResend={vi.fn()} onRevoke={vi.fn()} onExpire={vi.fn()} />);
    expect(html).toContain('Owner administrator access required');
    expect(html).not.toMatch(/<button|<form|<input/);
  });
});
