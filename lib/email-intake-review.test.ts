import { describe, expect, it } from 'vitest';
import { proposeEmailIntakeReview, type EmailIntakeSource } from './email-intake-review';

const source: EmailIntakeSource = {
  messageId: 'msg-1042',
  accountId: 'account-primary',
  from: { name: 'Jamie Rivera', address: 'jamie@example.com' },
  subject: 'Fence repair at 42 Oak Street',
  text: [
    'Hi, this is Jamie Rivera.',
    'Could I get an estimate to repair the back fence at 42 Oak Street?',
    'You can call me at (312) 555-0142.',
  ].join('\n'),
  receivedAt: '2026-09-24T14:30:00-05:00',
};

describe('email intake review proposals', () => {
  it('extracts conservative contact and service-request candidates for owner review', () => {
    expect(proposeEmailIntakeReview(source)).toEqual({
      source: {
        kind: 'email',
        messageId: 'msg-1042',
        accountId: 'account-primary',
        receivedAt: '2026-09-24T14:30:00-05:00',
      },
      reviewStatus: 'needs-review',
      proposedContact: {
        name: { value: 'Jamie Rivera', source: 'from-header' },
        email: { value: 'jamie@example.com', source: 'from-header' },
        phone: { value: '(312) 555-0142', source: 'message-body' },
      },
      proposedRequest: {
        summary: { value: 'Fence repair at 42 Oak Street', source: 'subject' },
        service: { value: 'Fence repair', source: 'subject' },
        location: { value: '42 Oak Street', source: 'subject' },
      },
      warnings: [],
      allowedNextActions: ['dismiss', 'edit-proposal', 'approve-for-manual-entry'],
    });
  });

  it('keeps uncertain fields empty and reports review warnings instead of inventing values', () => {
    const proposal = proposeEmailIntakeReview({
      ...source,
      from: { address: 'unknown@example.com' },
      subject: '',
      text: 'Please call when you can.',
    });

    expect(proposal.proposedContact.name).toBeUndefined();
    expect(proposal.proposedContact.phone).toBeUndefined();
    expect(proposal.proposedRequest.service).toBeUndefined();
    expect(proposal.proposedRequest.location).toBeUndefined();
    expect(proposal.warnings).toEqual([
      'Contact name was not found.',
      'Phone number was not found.',
      'Service request was not found.',
      'Service location was not found.',
    ]);
  });

  it('returns a detached proposal and never mutates the source message', () => {
    const frozenSource = Object.freeze({
      ...source,
      from: Object.freeze({ ...source.from }),
    });

    const proposal = proposeEmailIntakeReview(frozenSource);
    proposal.proposedContact.email.value = 'edited@example.com';

    expect(frozenSource.from.address).toBe('jamie@example.com');
    expect(proposal).not.toHaveProperty('customerId');
    expect(proposal).not.toHaveProperty('jobId');
  });
});
