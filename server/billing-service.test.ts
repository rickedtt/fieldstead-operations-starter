import { describe, expect, it, vi } from 'vitest';
import {
  BillingAccessError,
  generateInvoicePdf,
  requestInvoicePaymentLink,
  type InvoiceRepository,
  type PaymentLinkRepository,
} from './billing-service';
import type { AuthIdentity } from './types';

const owner: AuthIdentity = { user_id: 'owner-1', organization_id: 'org-a', role: 'owner_admin' };
const invoice = {
  id: 'invoice-1',
  organizationId: 'org-a',
  jobId: 'job-1',
  customerId: 'customer-1',
  number: 'HP-2026-0001',
  issuedAt: '2026-09-05T15:00:00.000Z',
  currency: 'usd' as const,
  customer: {
    name: 'Maya Thompson',
    email: 'maya@example.test',
    address: '1842 W Berteau Ave, Chicago, IL',
  },
  lineItems: [{ description: 'Gutter clean + guards', quantity: 1, unitAmountCents: 62000 }],
  amountDueCents: 62000,
};

function invoices(): InvoiceRepository {
  return { findForTenant: vi.fn(async () => invoice) };
}

describe('invoice PDF boundary', () => {
  it('passes the same normalized validated document to a deterministic renderer', async () => {
    const render = vi.fn(async (document) =>
      new TextEncoder().encode(JSON.stringify(document))
    );
    const dependencies = { invoices: invoices(), renderer: { render } };

    const first = await generateInvoicePdf(owner, { invoiceId: 'invoice-1' }, dependencies);
    const second = await generateInvoicePdf(owner, { invoiceId: 'invoice-1' }, dependencies);

    expect(first).toEqual(second);
    expect(render).toHaveBeenCalledTimes(2);
    expect(render.mock.calls[0][0]).toEqual(render.mock.calls[1][0]);
    expect(render.mock.calls[0][0]).toEqual(invoice);
  });

  it('rejects malformed invoice records before invoking the renderer', async () => {
    const render = vi.fn();
    const malformed = { ...invoice, amountDueCents: 1 };
    await expect(generateInvoicePdf(owner, { invoiceId: 'invoice-1' }, {
      invoices: { findForTenant: async () => malformed },
      renderer: { render },
    })).rejects.toThrow(/amountDueCents/);
    expect(render).not.toHaveBeenCalled();
  });
});

describe('payment-link request boundary', () => {
  it('records owner approval and returns UNCONFIGURED without calling a provider', async () => {
    const create = vi.fn(async (input) => input);
    const providerCreate = vi.fn();
    const repository: PaymentLinkRepository = {
      findByIdempotencyKey: vi.fn(async () => null),
      create,
      markProviderResult: vi.fn(),
    };

    const result = await requestInvoicePaymentLink(owner, {
      invoiceId: 'invoice-1', idempotencyKey: 'approve-invoice-1-v1',
    }, {
      invoices: invoices(),
      paymentLinks: repository,
      provider: { status: 'UNCONFIGURED', createPaymentLink: providerCreate },
      now: () => '2026-09-05T16:00:00.000Z',
      newId: () => 'request-1',
    });

    expect(result).toEqual({
      outcome: 'UNCONFIGURED', requestId: 'request-1', invoiceId: 'invoice-1',
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      id: 'request-1', organizationId: 'org-a', approvedByUserId: 'owner-1',
      status: 'UNCONFIGURED',
    }));
    expect(providerCreate).not.toHaveBeenCalled();
  });

  it('keeps payment-link approval owner-only', async () => {
    const dispatcher: AuthIdentity = { ...owner, role: 'dispatcher' };
    await expect(requestInvoicePaymentLink(dispatcher, {
      invoiceId: 'invoice-1', idempotencyKey: 'approval-1',
    }, {
      invoices: invoices(),
      paymentLinks: {} as PaymentLinkRepository,
      provider: { status: 'UNCONFIGURED', createPaymentLink: vi.fn() },
    })).rejects.toBeInstanceOf(BillingAccessError);
  });
});
