export type EmailIntakeSource = {
  messageId: string;
  accountId: string;
  from: { name?: string; address: string };
  subject: string;
  text: string;
  receivedAt: string;
};

export type ProposalEvidence = 'from-header' | 'subject' | 'message-body';
export type ProposedValue = { value: string; source: ProposalEvidence };
export type EmailIntakeReviewAction = 'dismiss' | 'edit-proposal' | 'approve-for-manual-entry';

export type EmailIntakeReviewProposal = {
  source: {
    kind: 'email';
    messageId: string;
    accountId: string;
    receivedAt: string;
  };
  reviewStatus: 'needs-review';
  proposedContact: {
    name?: ProposedValue;
    email: ProposedValue;
    phone?: ProposedValue;
  };
  proposedRequest: {
    summary?: ProposedValue;
    service?: ProposedValue;
    location?: ProposedValue;
  };
  warnings: string[];
  allowedNextActions: EmailIntakeReviewAction[];
};

const PHONE_PATTERN = /(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}/;
const LOCATION_PATTERN = /(\d+[A-Za-z]?\s+[A-Za-z0-9][A-Za-z0-9 .'-]*?\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way))/i;

function proposed(value: string | undefined, source: ProposalEvidence): ProposedValue | undefined {
  const normalized = value?.trim();
  return normalized ? { value: normalized, source } : undefined;
}

function serviceFromSubject(subject: string, location?: string): string | undefined {
  if (!subject.trim()) return undefined;
  const withoutLocation = location ? subject.replace(location, '') : subject;
  return withoutLocation.replace(/\s+(?:at|for)\s*$/i, '').trim() || undefined;
}

export function proposeEmailIntakeReview(source: Readonly<EmailIntakeSource>): EmailIntakeReviewProposal {
  const phone = source.text.match(PHONE_PATTERN)?.[0];
  const location = source.subject.match(LOCATION_PATTERN)?.[1];
  const service = serviceFromSubject(source.subject, location);
  const warnings: string[] = [];

  if (!source.from.name?.trim()) warnings.push('Contact name was not found.');
  if (!phone) warnings.push('Phone number was not found.');
  if (!service) warnings.push('Service request was not found.');
  if (!location) warnings.push('Service location was not found.');

  return {
    source: {
      kind: 'email',
      messageId: source.messageId,
      accountId: source.accountId,
      receivedAt: source.receivedAt,
    },
    reviewStatus: 'needs-review',
    proposedContact: {
      name: proposed(source.from.name, 'from-header'),
      email: { value: source.from.address, source: 'from-header' },
      phone: proposed(phone, 'message-body'),
    },
    proposedRequest: {
      summary: proposed(source.subject, 'subject'),
      service: proposed(service, 'subject'),
      location: proposed(location, 'subject'),
    },
    warnings,
    allowedNextActions: ['dismiss', 'edit-proposal', 'approve-for-manual-entry'],
  };
}
