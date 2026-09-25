import { describe, expect, it } from 'vitest';
import {
  createFixtureQuickBooksAdapter,
  parseQuickBooksReadinessConfig,
  previewQuickBooksFixture,
  QUICKBOOKS_US_SYNTHETIC_FIXTURE,
} from './index';

describe('QuickBooks readiness configuration', () => {
  it('parses a strict non-secret disconnected US fixture configuration', () => {
    expect(parseQuickBooksReadinessConfig({
      product: 'quickbooks-online',
      region: 'US',
      mode: 'fixture-only',
      companyLabel: 'Synthetic Landscaping Company',
      mappings: {
        incomeAccount: 'Landscaping Services Income',
        accountsReceivable: 'Accounts Receivable',
        defaultTaxCode: 'TAX',
        className: 'Maintenance',
        locationName: 'North District',
      },
    })).toEqual({
      product: 'quickbooks-online',
      region: 'US',
      mode: 'fixture-only',
      companyLabel: 'Synthetic Landscaping Company',
      mappings: {
        incomeAccount: 'Landscaping Services Income',
        accountsReceivable: 'Accounts Receivable',
        defaultTaxCode: 'TAX',
        className: 'Maintenance',
        locationName: 'North District',
      },
    });
  });

  it.each(['accessToken', 'client_secret', 'refresh-token', 'authorization', 'password'])('rejects credential-like key %s recursively', (key) => {
    expect(() => parseQuickBooksReadinessConfig({
      product: 'quickbooks-online',
      region: 'US',
      mode: 'fixture-only',
      companyLabel: 'Synthetic Company',
      mappings: { incomeAccount: 'Income', accountsReceivable: 'A/R', defaultTaxCode: 'TAX' },
      nested: { deeper: [{ [key]: 'synthetic-but-forbidden' }] },
    })).toThrow(/credential-like key/i);
  });

  it('rejects unknown fields and connected modes', () => {
    expect(() => parseQuickBooksReadinessConfig({
      product: 'quickbooks-online', region: 'US', mode: 'connected', companyLabel: 'Synthetic Company',
      mappings: { incomeAccount: 'Income', accountsReceivable: 'A/R', defaultTaxCode: 'TAX' },
    })).toThrow(/mode/);
    expect(() => parseQuickBooksReadinessConfig({
      product: 'quickbooks-online', region: 'US', mode: 'fixture-only', companyLabel: 'Synthetic Company', enabled: true,
      mappings: { incomeAccount: 'Income', accountsReceivable: 'A/R', defaultTaxCode: 'TAX' },
    })).toThrow(/unknown field/i);
  });
});

describe('QuickBooks fixture adapter', () => {
  it('advertises a disconnected fixture-only no-write boundary', () => {
    expect(createFixtureQuickBooksAdapter().capabilities).toEqual({
      connected: false,
      mode: 'fixture-only',
      externalWrites: false,
      product: 'quickbooks-online',
      region: 'US',
    });
  });

  it('provides only labeled synthetic identifiers', () => {
    expect(QUICKBOOKS_US_SYNTHETIC_FIXTURE.label).toMatch(/synthetic/i);
    expect(JSON.stringify(QUICKBOOKS_US_SYNTHETIC_FIXTURE)).not.toMatch(/realmId|accessToken|refreshToken|clientSecret/);
    for (const collection of Object.values(QUICKBOOKS_US_SYNTHETIC_FIXTURE.records)) {
      for (const record of collection) expect(record.sourceId).toMatch(/^fixture:/);
    }
  });
});

describe('QuickBooks staged mapping preview', () => {
  const config = {
    product: 'quickbooks-online' as const,
    region: 'US' as const,
    mode: 'fixture-only' as const,
    companyLabel: 'Synthetic Landscaping Company',
    mappings: {
      incomeAccount: 'Landscaping Services Income',
      accountsReceivable: 'Accounts Receivable',
      defaultTaxCode: 'TAX',
      className: 'Maintenance',
      locationName: 'North District',
    },
  };

  it('maps all supported record kinds deterministically with stable provenance', () => {
    const first = previewQuickBooksFixture(config, QUICKBOOKS_US_SYNTHETIC_FIXTURE);
    const second = previewQuickBooksFixture(config, QUICKBOOKS_US_SYNTHETIC_FIXTURE);
    expect(first).toEqual(second);
    expect(first.outcomes.map((outcome) => outcome.entityType)).toEqual([
      'account', 'account', 'class', 'credit', 'customer', 'invoice', 'location', 'payment', 'serviceItem', 'tax',
    ]);
    expect(first.outcomes.every((outcome) => outcome.provenance.fixtureLabel === QUICKBOOKS_US_SYNTHETIC_FIXTURE.label)).toBe(true);
    expect(first.outcomes.every((outcome) => outcome.provenance.sourceId.startsWith('fixture:'))).toBe(true);
    expect(first.outcomes.find((outcome) => outcome.entityType === 'invoice')?.mapped).toMatchObject({
      customerRef: 'fixture:customer:rivera',
      serviceItemRef: 'fixture:item:gutter-cleaning',
      taxRef: 'fixture:tax:standard',
      accountRef: 'fixture:account:income',
      classRef: 'fixture:class:maintenance',
      locationRef: 'fixture:location:north',
    });
  });

  it('reconciles invoices, payments, and credits in integer cents', () => {
    const preview = previewQuickBooksFixture(config, QUICKBOOKS_US_SYNTHETIC_FIXTURE);
    expect(preview.reconciliation).toEqual({
      invoiceSubtotalCents: 25100,
      taxCents: 2071,
      invoiceTotalCents: 27171,
      paymentCents: 10000,
      creditCents: 2500,
      openBalanceCents: 14671,
    });
  });

  it('returns explicit unsupported findings rather than inventing mappings', () => {
    const fixture = structuredClone(QUICKBOOKS_US_SYNTHETIC_FIXTURE);
    fixture.records.invoices[0].currency = 'CAD';
    const preview = previewQuickBooksFixture(config, fixture);
    expect(preview.outcomes.find((outcome) => outcome.entityType === 'invoice')).toMatchObject({ status: 'unsupported' });
    expect(preview.findings).toContainEqual(expect.objectContaining({
      code: 'unsupported-currency', severity: 'error', entityType: 'invoice', sourceId: 'fixture:invoice:1001',
    }));
  });

  it('flags broken references and cent reconciliation mismatches', () => {
    const fixture = structuredClone(QUICKBOOKS_US_SYNTHETIC_FIXTURE);
    fixture.records.invoices[0].customerSourceId = 'fixture:customer:missing';
    fixture.records.invoices[0].totalCents += 1;
    const preview = previewQuickBooksFixture(config, fixture);
    expect(preview.findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      'missing-reference', 'invoice-total-mismatch',
    ]));
  });
});
