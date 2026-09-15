import { describe, expect, it, vi } from 'vitest';
import { D1StripeWebhookRepository } from './billing-database';
import { handleStripeWebhook } from './stripe-webhook';
import { FakeD1Database } from './testing/fake-d1';

describe('D1 Stripe reconciliation', () => {
  it('atomically records one receipt, paid invoice, and activity across a replay', async () => {
    const db = new FakeD1Database();
    db.invoices.push({
      id: 'invoice-1', organization_id: 'org-a', job_id: 'job-1', customer_id: 'customer-1',
      created_by_user_id: 'owner-1', status: 'sent', version: 1,
    });
    const event = {
      id: 'evt_checkout_1', type: 'checkout.session.completed', created: 1788624000,
      data: { object: {
        id: 'cs_test_1', payment_status: 'paid',
        metadata: { organization_id: 'org-a', invoice_id: 'invoice-1' },
      } },
    };
    const dependencies = {
      verifier: { verifyAndParse: vi.fn(async () => event) },
      repository: new D1StripeWebhookRepository(db as unknown as D1Database),
    };

    expect(await handleStripeWebhook({ rawBody: '{}', signature: 'sig' }, dependencies))
      .toEqual({ outcome: 'APPLIED', eventId: 'evt_checkout_1' });
    expect(await handleStripeWebhook({ rawBody: '{}', signature: 'sig' }, dependencies))
      .toEqual({ outcome: 'DUPLICATE', eventId: 'evt_checkout_1' });
    expect(db.invoices[0]).toMatchObject({
      organization_id: 'org-a', status: 'paid', paid_provider_event_id: 'evt_checkout_1', version: 2,
    });
    expect(db.paymentWebhookEvents).toHaveLength(1);
    expect(db.activities).toEqual([expect.objectContaining({
      organization_id: 'org-a', job_id: 'job-1', event_type: 'invoice.paid',
    })]);
  });
});
