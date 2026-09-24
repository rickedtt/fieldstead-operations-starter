import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
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
    expect(html).toContain('Approve for manual entry');
    expect(html).toContain('No customer or job records will be written');
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

  it('shows approval as manual-entry readiness rather than a completed write', () => {
    const html = renderToStaticMarkup(<EmailIntakeReviewPanel
      proposal={proposal}
      mode="approved"
      onDismiss={vi.fn()}
      onEdit={vi.fn()}
      onApprove={vi.fn()}
    />);

    expect(html).toContain('Approved for manual entry');
    expect(html).toContain('No customer or job record was created');
    expect(html).toContain('Edit proposal');
    expect(html).toContain('Dismiss');
  });
});
