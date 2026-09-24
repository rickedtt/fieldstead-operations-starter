import { describe, expect, it } from 'vitest';
import { buildFinanceSnapshot } from './finance';
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
