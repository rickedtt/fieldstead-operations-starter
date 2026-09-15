import { describe, expect, it } from 'vitest';
import {
  parseInvoiceDocument,
  parseInvoicePdfRequest,
  parsePaymentLinkRequest,
  parseStripeCheckoutCompleted,
} from './billing';

describe('billing contracts', () => {
  it('validates invoice requests and exact integer-cent totals', () => {
    expect(parseInvoicePdfRequest({ invoiceId: 'invoice-1' })).toEqual({ invoiceId: 'invoice-1' });
    expect(parsePaymentLinkRequest({
      invoiceId: 'invoice-1', idempotencyKey: 'approval-1',
    })).toEqual({ invoiceId: 'invoice-1', idempotencyKey: 'approval-1' });
    expect(() => parseInvoiceDocument({
      id: 'invoice-1', organizationId: 'org-a', jobId: 'job-1', customerId: 'customer-1',
      number: 'HP-1', issuedAt: '2026-09-05T15:00:00.000Z', currency: 'usd',
      customer: { name: 'Maya', email: 'maya@example.test', address: 'Chicago' },
      lineItems: [{ description: 'Service', quantity: 1, unitAmountCents: 62000 }],
      amountDueCents: 1,
    })).toThrow(/amountDueCents/);
  });

  it('accepts only a paid checkout completion with tenant and invoice metadata', () => {
    expect(parseStripeCheckoutCompleted({
      id: 'evt_1', type: 'checkout.session.completed', created: 1788624000,
      data: { object: {
        id: 'cs_1', payment_status: 'paid',
        metadata: { organization_id: 'org-a', invoice_id: 'invoice-1' },
      } },
    })).toMatchObject({ eventId: 'evt_1', organizationId: 'org-a', invoiceId: 'invoice-1' });
    expect(() => parseStripeCheckoutCompleted({ id: 'evt_1', type: 'charge.succeeded' }))
      .toThrow(/type/);
  });
});
