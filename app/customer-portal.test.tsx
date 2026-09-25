import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CustomerPortal, type CustomerPortalSnapshot } from './customer-portal';

const snapshot: CustomerPortalSnapshot = {
  jobs: [{ id: 'job-1', service: 'Gutter cleaning', description: 'Front and rear gutters', status: 'Scheduled', scheduledFor: '2026-09-28T14:00:00.000Z' }],
  estimates: [{ id: 'estimate-1', jobId: 'job-1', estimateNumber: 'EST-1001', status: 'sent', subtotalCents: 25000, issuedAt: '2026-09-24T00:00:00.000Z' }],
  invoices: [{ id: 'invoice-1', jobId: 'job-1', invoiceNumber: 'INV-1001', status: 'sent', currency: 'usd', amountDueCents: 25000, issuedAt: '2026-09-24T00:00:00.000Z', paidAt: null }],
};

describe('CustomerPortal', () => {
  it('renders an accessible read-only summary with no mutation controls', () => {
    const html = renderToStaticMarkup(<CustomerPortal snapshot={snapshot} />);
    expect(html).toContain('Customer portal');
    expect(html).toContain('aria-label="Customer portal sections"');
    expect(html).toContain('Read-only');
    expect(html).toContain('Gutter cleaning');
    expect(html).toContain('EST-1001');
    expect(html).toContain('INV-1001');
    expect(html).not.toMatch(/<button|<form|<input|<textarea|Pay now/i);
  });
});
