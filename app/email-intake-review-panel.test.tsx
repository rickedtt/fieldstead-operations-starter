import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Customer } from '../packages/fieldstead-domain/src';
import { proposeEmailIntakeReview } from '../lib/email-intake-review';
import { EmailIntakeReviewPanel } from './email-intake-review-panel';

const proposal = proposeEmailIntakeReview({
  messageId: 'msg-1042',
  accountId: 'account-primary',
  from: { name: 'Jamie Rivera', address: 'jamie@example.com' },
  subject: 'Fence repair at 42 Oak Street',
  text: 'Please call me at (312) 555-0142.',
  receivedAt: '2026-09-24T14:30:00-05:00',
});

describe('email intake review panel', () => {
  it('renders deterministic proposal fields, evidence, warnings, and review-only controls', () => {
    const html = renderToStaticMarkup(<EmailIntakeReviewPanel
      proposal={{ ...proposal, warnings: ['Confirm the service location before entry.'] }}
      mode="review"
      onDismiss={vi.fn()}
      onEdit={vi.fn()}
      onApprove={vi.fn()}
    />);

    expect(html).toContain('Review intake proposal');
    expect(html).toContain('Jamie Rivera');
    expect(html).toContain('jamie@example.com');
    expect(html).toContain('(312) 555-0142');
    expect(html).toContain('Fence repair');
    expect(html).toContain('42 Oak Street');
    expect(html).toContain('From header');
    expect(html).toContain('Subject');
    expect(html).toContain('Message body');
    expect(html).toContain('Confirm the service location before entry.');
    expect(html).toContain('Dismiss');
    expect(html).toContain('Edit proposal');
    expect(html).toContain('Continue to owner confirmation');
    expect(html).toContain('Review, open, edit, and sync do not write Customer or ServiceRequest records');
  });

  it('renders editable fields without adding any record-writing action', () => {
    const html = renderToStaticMarkup(<EmailIntakeReviewPanel
      proposal={proposal}
      mode="edit"
      onDismiss={vi.fn()}
      onEdit={vi.fn()}
      onApprove={vi.fn()}
    />);

    expect(html).toContain('value="Jamie Rivera"');
    expect(html).toContain('value="Fence repair"');
    expect(html).toContain('Save proposal edits');
    expect(html).not.toContain('Create customer');
    expect(html).not.toContain('Create job');
  });

  it('shows explicit durable conversion choices, duplicate candidates, and final-confirmation boundary', () => {
    const duplicate: Customer = {
      id: 'customer-existing', displayName: 'Jamie R.', primaryEmail: 'jamie@example.com',
      primaryPhone: '3125550142', serviceAddress: '42 Oak Street',
      sourceEmail: { accountId: 'old', messageId: 'old-message', normalizedFrom: 'jamie@example.com' },
      audit: { createdAt: '2026-09-01T12:00:00.000Z', createdBy: 'owner-1', updatedAt: '2026-09-01T12:00:00.000Z', updatedBy: 'owner-1' },
    };
    const html = renderToStaticMarkup(<EmailIntakeReviewPanel
      proposal={proposal}
      mode="approved"
      customers={[duplicate]}
      selectedApproval="customer-and-request"
      onSelectApproval={vi.fn()}
      onDismiss={vi.fn()}
      onEdit={vi.fn()}
      onApprove={vi.fn()}
      onConfirmConversion={vi.fn()}
    />);

    expect(html).toContain('Choose what to create');
    expect(html).toContain('Customer only');
    expect(html).toContain('Service request only');
    expect(html).toContain('Customer + service request');
    expect(html).toContain('Possible duplicate customer');
    expect(html).toContain('email, phone, address');
    expect(html).toContain('I reviewed the proposed records and duplicate candidates');
    expect(html).toContain('Confirm durable conversion');
    expect(html).toContain('disabled');
    expect(html).not.toContain('Create job');
  });

  it('offers an explicit owner-confirmed job handoff only after durable conversion', () => {
    const html = renderToStaticMarkup(<EmailIntakeReviewPanel
      proposal={proposal}
      mode="converted"
      conversionResult={{ customerId: 'customer-1', serviceRequestId: 'request-1', replayed: false }}
      onDismiss={vi.fn()}
      onEdit={vi.fn()}
      onApprove={vi.fn()}
      onConfirmJobHandoff={vi.fn()}
    />);

    expect(html).toContain('Create draft job from this service request');
    expect(html).toContain('I reviewed this service request and approve creating one linked draft job');
    expect(html).toContain('Confirm job handoff');
    expect(html).toContain('disabled');
    expect(html).toContain('No message, schedule, estimate, invoice, or payment action will occur');
  });
});
