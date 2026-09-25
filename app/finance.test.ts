import { describe, expect, it } from 'vitest';
import { buildFinanceLedgerSnapshot, buildFinanceSnapshot } from './finance';
import { syntheticDemoState } from '../lib/operations';

describe('read-only finance snapshot', () => {
  it('summarizes existing invoice and payment fields without mutating operations state', () => {
    const state = structuredClone(syntheticDemoState);
    const before = structuredClone(state);

    const snapshot = buildFinanceSnapshot(state);

    expect(snapshot.totals).toEqual({ invoiced: 1100, outstanding: 860, overdue: 380, paid: 240 });
    expect(snapshot.invoices.map((invoice) => invoice.status)).toEqual(['Overdue', 'Draft', 'Paid']);
    expect(snapshot.invoices[0]).toMatchObject({ jobId: 'FS-DEMO-1044', customerName: 'Ember Home Services (Demo)', amount: 380 });
    expect(state).toEqual(before);
  });

  it('returns zero totals and no rows for an empty workspace', () => {
    expect(buildFinanceSnapshot({ customers: [], jobs: [], activity: [] })).toEqual({
      totals: { invoiced: 0, outstanding: 0, overdue: 0, paid: 0 },
      invoices: [],
    });
  });
});

describe('repository-backed finance ledger snapshot', () => {
  it('reconciles invoice totals and payment history in integer cents', () => {
    const snapshot = buildFinanceLedgerSnapshot(
      [{ id: 'invoice-1', jobId: 'HP-1', customerId: 'cus-1', status: 'Sent', subtotalCents: 32000, issuedAt: '2026-09-25T12:00:00.000Z', dueAt: '2026-09-20T12:00:00.000Z', audit: { createdAt: '2026-09-25T12:00:00.000Z', createdBy: 'owner-1', updatedAt: '2026-09-25T12:00:00.000Z', updatedBy: 'owner-1' } }],
      [{ id: 'payment-1', invoiceId: 'invoice-1', kind: 'payment', amountCents: 20000, occurredAt: '2026-09-25T13:00:00.000Z', actorId: 'owner-1' }, { id: 'refund-1', invoiceId: 'invoice-1', kind: 'refund', amountCents: 3000, occurredAt: '2026-09-25T14:00:00.000Z', actorId: 'owner-1', correctsEntryId: 'payment-1' }],
      new Map([['cus-1', 'Jamie Rivera']]), new Map([['HP-1', 'Gutter cleaning']]), '2026-09-25T15:00:00.000Z',
    );
    expect(snapshot.totals).toEqual({ invoicedCents: 32000, outstandingCents: 15000, overdueCents: 15000, paidCents: 17000 });
    expect(snapshot.invoices[0]).toMatchObject({ balanceCents: 15000, payments: [{ kind: 'payment' }, { kind: 'refund' }] });
  });
});
