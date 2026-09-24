import { useEffect, useMemo, useState } from 'react';
import type { Customer } from '../packages/fieldstead-domain/src';
import type { EmailIntakeReviewProposal, ProposalEvidence } from '../lib/email-intake-review';
import { findEmailIntakeDuplicateCandidates, type EmailIntakeApproval, type EmailIntakeDraft } from '../lib/email-intake-conversion';

export type EmailIntakeReviewMode = 'review' | 'edit' | 'approved' | 'converted';
export type EmailIntakeConversionResult = { customerId?: string; serviceRequestId?: string; replayed: boolean };

const evidenceLabels: Record<ProposalEvidence, string> = { 'from-header': 'From header', subject: 'Subject', 'message-body': 'Message body' };
function draftFromProposal(proposal: EmailIntakeReviewProposal): EmailIntakeDraft { return { name: proposal.proposedContact.name?.value || '', email: proposal.proposedContact.email.value, phone: proposal.proposedContact.phone?.value || '', summary: proposal.proposedRequest.summary?.value || '', service: proposal.proposedRequest.service?.value || '', location: proposal.proposedRequest.location?.value || '' }; }
function Evidence({ source }: { source?: ProposalEvidence }) { return source ? <small className="email-intake-evidence">Evidence: {evidenceLabels[source]}</small> : <small className="email-intake-evidence missing">No evidence found</small>; }

export function EmailIntakeReviewPanel({ proposal, mode, customers = [], selectedApproval = 'customer-and-request', conversionResult, onDismiss, onEdit, onApprove, onSelectApproval = () => undefined, onConfirmConversion = async () => undefined }: {
  proposal: EmailIntakeReviewProposal; mode: EmailIntakeReviewMode; customers?: Customer[]; selectedApproval?: EmailIntakeApproval; conversionResult?: EmailIntakeConversionResult;
  onDismiss: () => void; onEdit: (draft: EmailIntakeDraft) => void; onApprove: (draft: EmailIntakeDraft) => void;
  onSelectApproval?: (approval: EmailIntakeApproval) => void; onConfirmConversion?: (draft: EmailIntakeDraft, approval: EmailIntakeApproval, existingCustomerId?: string) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState(() => draftFromProposal(proposal));
  const [confirmed, setConfirmed] = useState(false);
  const [existingCustomerId, setExistingCustomerId] = useState('');
  useEffect(() => { setDraft(draftFromProposal(proposal)); setConfirmed(false); setExistingCustomerId(''); }, [proposal]);
  const duplicates = useMemo(() => findEmailIntakeDuplicateCandidates(draft, customers), [draft, customers]);
  const set = (field: keyof EmailIntakeDraft, value: string) => setDraft((current) => ({ ...current, [field]: value }));
  const fields: Array<[keyof EmailIntakeDraft, string, ProposalEvidence | undefined]> = [['name', 'Contact name', proposal.proposedContact.name?.source], ['email', 'Email', proposal.proposedContact.email.source], ['phone', 'Phone', proposal.proposedContact.phone?.source], ['summary', 'Request summary', proposal.proposedRequest.summary?.source], ['service', 'Service', proposal.proposedRequest.service?.source], ['location', 'Service location', proposal.proposedRequest.location?.source]];
  const requestOnlyReady = selectedApproval !== 'request-only' || Boolean(existingCustomerId);

  return <section className="email-intake-review" aria-label="Email intake review">
    <div className="email-intake-heading"><div><p className="eyebrow">OWNER-REVIEWED INTAKE</p><h3>{mode === 'converted' ? 'Durable conversion complete' : mode === 'approved' ? 'Choose what to create' : mode === 'edit' ? 'Edit intake proposal' : 'Review intake proposal'}</h3></div><span className="safe-state">Owner confirmation required</span></div>
    {mode === 'converted' && <p className="email-intake-confirmation" role="status">✓ Durable conversion saved{conversionResult?.replayed ? ' (idempotent replay)' : ''}. {conversionResult?.customerId ? `Customer ${conversionResult.customerId}. ` : ''}{conversionResult?.serviceRequestId ? `Service request ${conversionResult.serviceRequestId}.` : ''}</p>}
    <p className="email-intake-boundary">Deterministic suggestions from this email only. No external AI is called. Review, open, edit, and sync do not write Customer or ServiceRequest records. Only the final owner confirmation below writes; no Job is created.</p>
    <div className="email-intake-fields">{fields.map(([field, label, source]) => <label key={field}>{label}{mode === 'edit' ? <input value={draft[field]} onChange={(event) => set(field, event.target.value)} /> : <strong>{draft[field] || 'Not found'}</strong>}<Evidence source={source}/></label>)}</div>
    {proposal.warnings.length > 0 && <div className="email-intake-warnings" role="note"><strong>Review warnings</strong><ul>{proposal.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
    {mode === 'approved' && <div className="email-intake-conversion">
      <div className="email-intake-choice" role="radiogroup" aria-label="Conversion records">
        {([['customer-only', 'Customer only'], ['request-only', 'Service request only'], ['customer-and-request', 'Customer + service request']] as const).map(([value, label]) => <label key={value}><input type="radio" name="email-intake-approval" checked={selectedApproval === value} onChange={() => { onSelectApproval(value); setConfirmed(false); }}/><span>{label}</span></label>)}
      </div>
      {duplicates.length > 0 && <div className="email-intake-duplicates" role="note"><strong>Possible duplicate customer</strong>{duplicates.map((candidate) => <p key={candidate.customerId}>{candidate.displayName} · matches {candidate.matchedOn.join(', ')}. No merge or overwrite will occur.</p>)}</div>}
      {selectedApproval === 'request-only' && <label>Attach to existing customer<select value={existingCustomerId} onChange={(event) => { setExistingCustomerId(event.target.value); setConfirmed(false); }}><option value="">Choose an existing customer</option>{customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.displayName}</option>)}</select></label>}
      <label className="confirm-import"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)}/><span>I reviewed the proposed records and duplicate candidates. Create exactly the selected durable records without merging or overwriting.</span></label>
      <button className="primary full" type="button" disabled={!confirmed || !requestOnlyReady} onClick={() => void onConfirmConversion(draft, selectedApproval, existingCustomerId || undefined)}>Confirm durable conversion</button>
    </div>}
    <div className="email-intake-actions"><button className="secondary" type="button" onClick={onDismiss}>Dismiss</button>{mode !== 'converted' && (mode === 'edit' ? <button className="secondary" type="button" onClick={() => onEdit(draft)}>Save proposal edits</button> : <button className="secondary" type="button" onClick={() => onEdit(draft)}>Edit proposal</button>)}{mode === 'review' && <button className="primary" type="button" onClick={() => onApprove(draft)}>Continue to owner confirmation</button>}</div>
  </section>;
}
