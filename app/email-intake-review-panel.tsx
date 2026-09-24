import { useEffect, useState } from 'react';
import type { EmailIntakeReviewProposal, ProposalEvidence } from '../lib/email-intake-review';

export type EmailIntakeReviewMode = 'review' | 'edit' | 'approved';

type Draft = {
  name: string;
  email: string;
  phone: string;
  summary: string;
  service: string;
  location: string;
};

const evidenceLabels: Record<ProposalEvidence, string> = {
  'from-header': 'From header',
  subject: 'Subject',
  'message-body': 'Message body',
};

function draftFromProposal(proposal: EmailIntakeReviewProposal): Draft {
  return {
    name: proposal.proposedContact.name?.value || '',
    email: proposal.proposedContact.email.value,
    phone: proposal.proposedContact.phone?.value || '',
    summary: proposal.proposedRequest.summary?.value || '',
    service: proposal.proposedRequest.service?.value || '',
    location: proposal.proposedRequest.location?.value || '',
  };
}

function Evidence({ source }: { source?: ProposalEvidence }) {
  return source ? <small className="email-intake-evidence">Evidence: {evidenceLabels[source]}</small> : <small className="email-intake-evidence missing">No evidence found</small>;
}

export function EmailIntakeReviewPanel({ proposal, mode, onDismiss, onEdit, onApprove }: {
  proposal: EmailIntakeReviewProposal;
  mode: EmailIntakeReviewMode;
  onDismiss: () => void;
  onEdit: (draft: Draft) => void;
  onApprove: (draft: Draft) => void;
}) {
  const [draft, setDraft] = useState(() => draftFromProposal(proposal));
  useEffect(() => setDraft(draftFromProposal(proposal)), [proposal]);
  const set = (field: keyof Draft, value: string) => setDraft((current) => ({ ...current, [field]: value }));
  const fields: Array<[keyof Draft, string, ProposalEvidence | undefined]> = [
    ['name', 'Contact name', proposal.proposedContact.name?.source],
    ['email', 'Email', proposal.proposedContact.email.source],
    ['phone', 'Phone', proposal.proposedContact.phone?.source],
    ['summary', 'Request summary', proposal.proposedRequest.summary?.source],
    ['service', 'Service', proposal.proposedRequest.service?.source],
    ['location', 'Service location', proposal.proposedRequest.location?.source],
  ];

  return <section className="email-intake-review" aria-label="Email intake review">
    <div className="email-intake-heading"><div><p className="eyebrow">REVIEW-ONLY INTAKE</p><h3>{mode === 'approved' ? 'Approved for manual entry' : mode === 'edit' ? 'Edit intake proposal' : 'Review intake proposal'}</h3></div><span className="safe-state">No automatic writes</span></div>
    {mode === 'approved' && <p className="email-intake-confirmation" role="status">✓ Proposal approved for manual entry. No customer or job record was created.</p>}
    <p className="email-intake-boundary">Deterministic suggestions from this email only. No external AI is called. No customer or job records will be written.</p>
    <div className="email-intake-fields">
      {fields.map(([field, label, source]) => <label key={field}>{label}{mode === 'edit' ? <input value={draft[field]} onChange={(event) => set(field, event.target.value)} /> : <strong>{draft[field] || 'Not found'}</strong>}<Evidence source={source}/></label>)}
    </div>
    {proposal.warnings.length > 0 && <div className="email-intake-warnings" role="note"><strong>Review warnings</strong><ul>{proposal.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
    <div className="email-intake-actions">
      <button className="secondary" type="button" onClick={onDismiss}>Dismiss</button>
      {mode === 'edit' ? <button className="secondary" type="button" onClick={() => onEdit(draft)}>Save proposal edits</button> : <button className="secondary" type="button" onClick={() => onEdit(draft)}>Edit proposal</button>}
      {mode !== 'approved' && <button className="primary" type="button" onClick={() => onApprove(draft)}>Approve for manual entry</button>}
    </div>
  </section>;
}
