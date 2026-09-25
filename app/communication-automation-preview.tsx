'use client';

import { FormEvent, useState } from 'react';
import type { AuthIdentity } from '../server/types';
import type { CommunicationDryRunInput, CommunicationDryRunResult } from '../server/communication-automation';

export type CommunicationDryRunClient = (input: CommunicationDryRunInput, authorization: string) => Promise<CommunicationDryRunResult>;

const reasonDetails: Record<string, { category: string; detail: string }> = {
  global_disabled: { category: 'Kill switch', detail: 'The global communication automation switch is disabled.' },
  tenant_disabled: { category: 'Kill switch', detail: 'Communication automation is disabled for this organization.' },
  channel_disabled: { category: 'Kill switch', detail: 'This communication channel is disabled.' },
  rule_disabled: { category: 'Kill switch', detail: 'This communication rule is disabled.' },
  consent_required: { category: 'Consent', detail: 'Explicit recipient consent is required.' },
  consent_expired: { category: 'Consent', detail: 'Recipient consent has expired.' },
  permanently_suppressed: { category: 'Suppression', detail: 'The recipient is permanently suppressed.' },
  temporarily_suppressed: { category: 'Suppression', detail: 'The recipient is temporarily suppressed.' },
  invalid_timezone: { category: 'Quiet hours', detail: 'The configured timezone is invalid, so the preview failed closed.' },
  quiet_hours: { category: 'Quiet hours', detail: 'The recipient is currently within configured quiet hours.' },
  recipient_limit: { category: 'Quota', detail: 'The recipient daily preview allowance is exhausted.' },
  tenant_limit: { category: 'Quota', detail: 'The organization daily preview allowance is exhausted.' },
  rule_limit: { category: 'Quota', detail: 'The rule daily preview allowance is exhausted.' },
};

export function describeCommunicationDecision(reason: string | null) {
  if (reason === null) return { category: 'Allowed', detail: 'All evaluated policy checks allowed this preview.', allowed: true };
  return { ...(reasonDetails[reason] ?? { category: 'Blocked', detail: 'The preview was blocked by policy.' }), allowed: false };
}

async function defaultDryRunClient(input: CommunicationDryRunInput, authorization: string) {
  const response = await fetch('/api/communications/dry-run', {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await response.json() as CommunicationDryRunResult | { error?: unknown };
  if (!response.ok) throw new Error(typeof ('error' in body && body.error) === 'string' ? body.error : 'Communication preview unavailable.');
  return body as CommunicationDryRunResult;
}

type Props = { identity: AuthIdentity; authorization?: string; client?: CommunicationDryRunClient };

export function CommunicationAutomationPreview({ identity, authorization, client = defaultDryRunClient }: Props) {
  const [result, setResult] = useState<CommunicationDryRunResult>();
  const [status, setStatus] = useState('Enter synthetic or approved test content to preview the policy decision.');
  const [busy, setBusy] = useState(false);

  if (identity.role !== 'owner_admin') return <section className="communication-preview"><h2>Communication automation preview</h2><p>Owner administrator access required.</p></section>;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authorization) { setStatus('Authenticated server access is required for this preview.'); return; }
    setBusy(true); setResult(undefined); setStatus('Evaluating preview policy…');
    const data = new FormData(event.currentTarget);
    try {
      const next = await client({
        idempotencyKey: String(data.get('idempotencyKey')),
        ruleId: String(data.get('ruleId')),
        channel: String(data.get('channel')) as CommunicationDryRunInput['channel'],
        recipient: String(data.get('recipient')),
        contentVersion: Number(data.get('contentVersion')),
        content: String(data.get('content')),
      }, authorization);
      setResult(next);
      const decision = describeCommunicationDecision(next.reason);
      setStatus(`${next.outcome === 'allowed' ? 'Allowed' : 'Blocked'}: ${decision.detail}`);
    } catch (error) {
      setStatus(error instanceof Error && ['Invalid request.', 'Forbidden.', 'Not found.', 'Idempotency or version conflict.', 'Communication dry-run unavailable.', 'Communication preview unavailable.'].includes(error.message) ? error.message : 'Communication preview unavailable.');
    } finally { setBusy(false); }
  }

  const decision = result ? describeCommunicationDecision(result.reason) : undefined;
  return <section className="attention-card settings-card communication-preview" aria-labelledby="communication-preview-heading">
    <div className="section-title"><div><p className="eyebrow">COMMUNICATION AUTOMATION</p><h2 id="communication-preview-heading">Policy dry-run</h2></div><span className="pill pill-pending">Preview only</span></div>
    <p className="settings-copy">Owner-only evaluation through the existing dry-run contract. No message is sent, scheduled, retried, or handed to a provider.</p>
    <form className="communication-preview-form" onSubmit={(event) => void submit(event)}>
      <div className="form-grid"><label>Rule ID<input name="ruleId" required pattern="[A-Za-z0-9_-]{1,128}" autoComplete="off" /></label><label>Channel<select name="channel" defaultValue="email"><option value="email">Email</option><option value="sms">SMS</option></select></label></div>
      <div className="form-grid"><label>Recipient<input name="recipient" required autoComplete="off" /></label><label>Content version<input name="contentVersion" type="number" min="1" step="1" defaultValue="1" required /></label></div>
      <label>Idempotency key<input name="idempotencyKey" required minLength={8} maxLength={128} pattern="[A-Za-z0-9_-]{8,128}" autoComplete="off" /></label>
      <label>Message content<textarea name="content" required maxLength={100000} rows={5} /></label>
      <button className="primary" type="submit" disabled={busy || !authorization}>{busy ? 'Evaluating…' : 'Evaluate policy preview'}</button>
    </form>
    <p className="settings-status" role="status" aria-live="polite">{status}</p>
    <dl className="communication-policy-status" aria-label="Dry-run policy status">
      {['Consent', 'Suppression', 'Quiet hours', 'Kill switch', 'Quota'].map((category) => <div key={category}><dt>{category}</dt><dd>{decision?.category === category ? decision.detail : result ? 'Passed before the final decision.' : 'Evaluated by the server dry-run.'}</dd></div>)}
      <div><dt>Content binding</dt><dd>{result ? <>Version {result.contentVersion} · <code>{result.contentHash}</code></> : 'Version and SHA-256 hash appear after evaluation.'}</dd></div>
      <div><dt>Decision</dt><dd><strong>{result ? result.outcome : 'Not evaluated'}</strong>{result && <small>{decision?.category} · {result.evaluatedAt}</small>}</dd></div>
    </dl>
  </section>;
}
