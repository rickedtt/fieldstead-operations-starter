import type { AuthIdentity } from '../server/types';

export type PortalInvitationSummary = {
  id: string;
  customerId: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  expiresAt: string;
  createdAt: string;
};

type Props = {
  identity: AuthIdentity;
  customerId: string;
  invitations: PortalInvitationSummary[];
  onCreate: (customerId: string, expiresInHours: number) => void;
  onResend: (invitationId: string) => void;
  onRevoke: (invitationId: string) => void;
  onExpire: (invitationId: string) => void;
};

export function PortalInvitationAdmin({ identity, customerId, invitations, onCreate, onResend, onRevoke, onExpire }: Props) {
  if (identity.role !== 'owner_admin') {
    return <section className="portal-invitation-admin"><h2>Portal invitations</h2><p>Owner administrator access required.</p></section>;
  }
  return <section className="portal-invitation-admin" aria-labelledby="portal-invitation-heading">
    <header><div><p className="eyebrow">CUSTOMER PORTAL</p><h2 id="portal-invitation-heading">Portal invitations</h2></div><span className="safe-state">Manual delivery only</span></header>
    <p>Create a short-lived, single-use invitation. Copy the returned token through an approved local channel; Fieldstead does not send it.</p>
    <form onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); onCreate(customerId, Number(data.get('expiresInHours'))); }}>
      <label>Expires in<select name="expiresInHours" defaultValue="24"><option value="1">1 hour</option><option value="24">24 hours</option><option value="72">3 days</option><option value="168">7 days</option></select></label>
      <button type="submit">Create invitation</button>
    </form>
    <div className="portal-invitation-list">{invitations.map((invitation) => <article key={invitation.id}>
      <div><strong>{invitation.status}</strong><small>Expires {new Date(invitation.expiresAt).toLocaleString('en-US')}</small></div>
      <div>{invitation.status === 'pending' && <><button type="button" onClick={() => onResend(invitation.id)}>Resend</button><button type="button" onClick={() => onRevoke(invitation.id)}>Revoke</button><button type="button" onClick={() => onExpire(invitation.id)}>Expire</button></>}</div>
    </article>)}</div>
    <footer>Read-only access only. No approvals, uploads, payments, messaging, or customer self-registration.</footer>
  </section>;
}
