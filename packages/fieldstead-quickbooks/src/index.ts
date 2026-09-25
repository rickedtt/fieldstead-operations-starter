export type QuickBooksReadinessConfig = {
  product: 'quickbooks-online';
  region: 'US';
  mode: 'fixture-only';
  companyLabel: string;
  mappings: {
    incomeAccount: string;
    accountsReceivable: string;
    defaultTaxCode: string;
    className?: string;
    locationName?: string;
  };
};

export type QuickBooksEntityType = 'account' | 'class' | 'credit' | 'customer' | 'invoice' | 'location' | 'payment' | 'serviceItem' | 'tax';

type FixtureRecord = { sourceId: string };
type AccountFixture = FixtureRecord & { name: string; accountType: 'income' | 'accounts-receivable' };
type ClassFixture = FixtureRecord & { name: string };
type LocationFixture = FixtureRecord & { name: string };
type CustomerFixture = FixtureRecord & { displayName: string; email: string };
type ServiceItemFixture = FixtureRecord & { name: string; unitPriceCents: number; incomeAccountSourceId: string };
type TaxFixture = FixtureRecord & { name: string; rateBasisPoints: number };
type InvoiceFixture = FixtureRecord & {
  customerSourceId: string;
  serviceItemSourceId: string;
  taxSourceId: string;
  accountSourceId: string;
  classSourceId?: string;
  locationSourceId?: string;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
};
type PaymentFixture = FixtureRecord & { invoiceSourceId: string; amountCents: number };
type CreditFixture = FixtureRecord & { customerSourceId: string; invoiceSourceId: string; amountCents: number };

export type QuickBooksFixture = {
  label: string;
  synthetic: true;
  records: {
    accounts: AccountFixture[];
    classes: ClassFixture[];
    credits: CreditFixture[];
    customers: CustomerFixture[];
    invoices: InvoiceFixture[];
    locations: LocationFixture[];
    payments: PaymentFixture[];
    serviceItems: ServiceItemFixture[];
    taxes: TaxFixture[];
  };
};

export type QuickBooksFinding = {
  code: 'missing-reference' | 'invoice-total-mismatch' | 'unsupported-currency' | 'unsupported-entity';
  severity: 'error' | 'warning';
  entityType: QuickBooksEntityType;
  sourceId: string;
  message: string;
};

export type QuickBooksPreviewOutcome = {
  entityType: QuickBooksEntityType;
  sourceId: string;
  status: 'ready' | 'unsupported';
  mapped?: Record<string, unknown>;
  provenance: { adapter: 'fieldstead-quickbooks-fixture'; fixtureLabel: string; sourceId: string };
};

const CREDENTIAL_KEY = /(?:access|refresh)?token|secret|password|passwd|authorization|credential|api[-_]?key|client[-_]?id|realm[-_]?id/i;

function assertNoCredentialKeys(value: unknown, path = 'config'): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoCredentialKeys(entry, `${path}[${index}]`));
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    if (CREDENTIAL_KEY.test(key)) throw new TypeError(`${path}.${key} is a credential-like key and is not allowed`);
    assertNoCredentialKeys(child, `${path}.${key}`);
  }
}

function object(value: unknown, owner: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError(`${owner} must be an object`);
  return value as Record<string, unknown>;
}

function strictKeys(value: Record<string, unknown>, allowed: readonly string[], owner: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) throw new TypeError(`${owner} has unknown field: ${unknown.sort()[0]}`);
}

function requiredString(value: Record<string, unknown>, key: string, owner: string): string {
  if (typeof value[key] !== 'string' || value[key].trim().length === 0) throw new TypeError(`${owner}.${key} must be a non-empty string`);
  return value[key];
}

function optionalString(value: Record<string, unknown>, key: string, owner: string): string | undefined {
  return value[key] === undefined ? undefined : requiredString(value, key, owner);
}

export function parseQuickBooksReadinessConfig(value: unknown): QuickBooksReadinessConfig {
  assertNoCredentialKeys(value);
  const config = object(value, 'QuickBooksReadinessConfig');
  strictKeys(config, ['product', 'region', 'mode', 'companyLabel', 'mappings'], 'QuickBooksReadinessConfig');
  if (config.product !== 'quickbooks-online') throw new TypeError('QuickBooksReadinessConfig.product is not supported');
  if (config.region !== 'US') throw new TypeError('QuickBooksReadinessConfig.region is not supported');
  if (config.mode !== 'fixture-only') throw new TypeError('QuickBooksReadinessConfig.mode must be fixture-only');
  const mappings = object(config.mappings, 'QuickBooksReadinessConfig.mappings');
  strictKeys(mappings, ['incomeAccount', 'accountsReceivable', 'defaultTaxCode', 'className', 'locationName'], 'QuickBooksReadinessConfig.mappings');
  return {
    product: 'quickbooks-online',
    region: 'US',
    mode: 'fixture-only',
    companyLabel: requiredString(config, 'companyLabel', 'QuickBooksReadinessConfig'),
    mappings: {
      incomeAccount: requiredString(mappings, 'incomeAccount', 'QuickBooksReadinessConfig.mappings'),
      accountsReceivable: requiredString(mappings, 'accountsReceivable', 'QuickBooksReadinessConfig.mappings'),
      defaultTaxCode: requiredString(mappings, 'defaultTaxCode', 'QuickBooksReadinessConfig.mappings'),
      className: optionalString(mappings, 'className', 'QuickBooksReadinessConfig.mappings'),
      locationName: optionalString(mappings, 'locationName', 'QuickBooksReadinessConfig.mappings'),
    },
  };
}

export const QUICKBOOKS_US_SYNTHETIC_FIXTURE: QuickBooksFixture = {
  label: 'SYNTHETIC QuickBooks Online US readiness fixture',
  synthetic: true,
  records: {
    accounts: [
      { sourceId: 'fixture:account:ar', name: 'Accounts Receivable', accountType: 'accounts-receivable' },
      { sourceId: 'fixture:account:income', name: 'Landscaping Services Income', accountType: 'income' },
    ],
    classes: [{ sourceId: 'fixture:class:maintenance', name: 'Maintenance' }],
    credits: [{ sourceId: 'fixture:credit:1001', customerSourceId: 'fixture:customer:rivera', invoiceSourceId: 'fixture:invoice:1001', amountCents: 2500 }],
    customers: [{ sourceId: 'fixture:customer:rivera', displayName: 'Synthetic Jamie Rivera', email: 'jamie@example.invalid' }],
    invoices: [{
      sourceId: 'fixture:invoice:1001', customerSourceId: 'fixture:customer:rivera', serviceItemSourceId: 'fixture:item:gutter-cleaning',
      taxSourceId: 'fixture:tax:standard', accountSourceId: 'fixture:account:income', classSourceId: 'fixture:class:maintenance',
      locationSourceId: 'fixture:location:north', quantity: 2, unitPriceCents: 12550, subtotalCents: 25100, taxCents: 2071,
      totalCents: 27171, currency: 'USD',
    }],
    locations: [{ sourceId: 'fixture:location:north', name: 'North District' }],
    payments: [{ sourceId: 'fixture:payment:1001', invoiceSourceId: 'fixture:invoice:1001', amountCents: 10000 }],
    serviceItems: [{ sourceId: 'fixture:item:gutter-cleaning', name: 'Gutter cleaning', unitPriceCents: 12550, incomeAccountSourceId: 'fixture:account:income' }],
    taxes: [{ sourceId: 'fixture:tax:standard', name: 'Standard synthetic tax', rateBasisPoints: 825 }],
  },
};

export function createFixtureQuickBooksAdapter() {
  return {
    capabilities: {
      connected: false as const,
      mode: 'fixture-only' as const,
      externalWrites: false as const,
      product: 'quickbooks-online' as const,
      region: 'US' as const,
    },
    preview(config: unknown, fixture: QuickBooksFixture = QUICKBOOKS_US_SYNTHETIC_FIXTURE) {
      return previewQuickBooksFixture(config, fixture);
    },
  };
}

const COLLECTIONS: Array<[keyof QuickBooksFixture['records'], QuickBooksEntityType]> = [
  ['accounts', 'account'], ['classes', 'class'], ['credits', 'credit'], ['customers', 'customer'], ['invoices', 'invoice'],
  ['locations', 'location'], ['payments', 'payment'], ['serviceItems', 'serviceItem'], ['taxes', 'tax'],
];

function integerCents(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${field} must be a non-negative safe integer`);
  return value;
}

export function previewQuickBooksFixture(configValue: unknown, fixture: QuickBooksFixture) {
  const config = parseQuickBooksReadinessConfig(configValue);
  const findings: QuickBooksFinding[] = [];
  const sourceIds = new Set<string>();
  for (const [collection] of COLLECTIONS) for (const record of fixture.records[collection]) sourceIds.add(record.sourceId);
  const provenance = (record: FixtureRecord) => ({ adapter: 'fieldstead-quickbooks-fixture' as const, fixtureLabel: fixture.label, sourceId: record.sourceId });
  const missingReference = (entityType: QuickBooksEntityType, record: FixtureRecord, reference: string) => {
    if (!sourceIds.has(reference)) findings.push({ code: 'missing-reference', severity: 'error', entityType, sourceId: record.sourceId, message: `Missing fixture reference: ${reference}` });
  };
  const outcomes: QuickBooksPreviewOutcome[] = [];

  for (const account of fixture.records.accounts) outcomes.push({ entityType: 'account', sourceId: account.sourceId, status: 'ready', mapped: { name: account.name, accountType: account.accountType }, provenance: provenance(account) });
  for (const entry of fixture.records.classes) outcomes.push({ entityType: 'class', sourceId: entry.sourceId, status: 'ready', mapped: { name: entry.name }, provenance: provenance(entry) });
  for (const credit of fixture.records.credits) {
    missingReference('credit', credit, credit.customerSourceId); missingReference('credit', credit, credit.invoiceSourceId);
    outcomes.push({ entityType: 'credit', sourceId: credit.sourceId, status: 'ready', mapped: { customerRef: credit.customerSourceId, invoiceRef: credit.invoiceSourceId, amountCents: integerCents(credit.amountCents, 'credit.amountCents') }, provenance: provenance(credit) });
  }
  for (const customer of fixture.records.customers) outcomes.push({ entityType: 'customer', sourceId: customer.sourceId, status: 'ready', mapped: { displayName: customer.displayName, email: customer.email }, provenance: provenance(customer) });
  for (const invoice of fixture.records.invoices) {
    for (const reference of [invoice.customerSourceId, invoice.serviceItemSourceId, invoice.taxSourceId, invoice.accountSourceId, invoice.classSourceId, invoice.locationSourceId]) if (reference) missingReference('invoice', invoice, reference);
    const expectedSubtotal = invoice.quantity * invoice.unitPriceCents;
    const validCents = [expectedSubtotal, invoice.subtotalCents, invoice.taxCents, invoice.totalCents].every(Number.isSafeInteger);
    if (!validCents || invoice.subtotalCents !== expectedSubtotal || invoice.totalCents !== invoice.subtotalCents + invoice.taxCents) findings.push({ code: 'invoice-total-mismatch', severity: 'error', entityType: 'invoice', sourceId: invoice.sourceId, message: 'Invoice integer-cent totals do not reconcile' });
    const supported = invoice.currency === 'USD';
    if (!supported) findings.push({ code: 'unsupported-currency', severity: 'error', entityType: 'invoice', sourceId: invoice.sourceId, message: `Only USD is supported; received ${invoice.currency}` });
    outcomes.push({ entityType: 'invoice', sourceId: invoice.sourceId, status: supported ? 'ready' : 'unsupported', mapped: supported ? { customerRef: invoice.customerSourceId, serviceItemRef: invoice.serviceItemSourceId, taxRef: invoice.taxSourceId, accountRef: invoice.accountSourceId, classRef: invoice.classSourceId, locationRef: invoice.locationSourceId, quantity: invoice.quantity, unitPriceCents: invoice.unitPriceCents, subtotalCents: invoice.subtotalCents, taxCents: invoice.taxCents, totalCents: invoice.totalCents, currency: invoice.currency } : undefined, provenance: provenance(invoice) });
  }
  for (const location of fixture.records.locations) outcomes.push({ entityType: 'location', sourceId: location.sourceId, status: 'ready', mapped: { name: location.name }, provenance: provenance(location) });
  for (const payment of fixture.records.payments) {
    missingReference('payment', payment, payment.invoiceSourceId);
    outcomes.push({ entityType: 'payment', sourceId: payment.sourceId, status: 'ready', mapped: { invoiceRef: payment.invoiceSourceId, amountCents: integerCents(payment.amountCents, 'payment.amountCents') }, provenance: provenance(payment) });
  }
  for (const item of fixture.records.serviceItems) {
    missingReference('serviceItem', item, item.incomeAccountSourceId);
    outcomes.push({ entityType: 'serviceItem', sourceId: item.sourceId, status: 'ready', mapped: { name: item.name, unitPriceCents: integerCents(item.unitPriceCents, 'serviceItem.unitPriceCents'), incomeAccountRef: item.incomeAccountSourceId }, provenance: provenance(item) });
  }
  for (const tax of fixture.records.taxes) outcomes.push({ entityType: 'tax', sourceId: tax.sourceId, status: 'ready', mapped: { name: tax.name, rateBasisPoints: integerCents(tax.rateBasisPoints, 'tax.rateBasisPoints'), configuredCode: config.mappings.defaultTaxCode }, provenance: provenance(tax) });

  outcomes.sort((left, right) => left.entityType.localeCompare(right.entityType) || left.sourceId.localeCompare(right.sourceId));
  findings.sort((left, right) => left.entityType.localeCompare(right.entityType) || left.sourceId.localeCompare(right.sourceId) || left.code.localeCompare(right.code));
  const invoiceSubtotalCents = fixture.records.invoices.reduce((sum, invoice) => sum + integerCents(invoice.subtotalCents, 'invoice.subtotalCents'), 0);
  const taxCents = fixture.records.invoices.reduce((sum, invoice) => sum + integerCents(invoice.taxCents, 'invoice.taxCents'), 0);
  const invoiceTotalCents = fixture.records.invoices.reduce((sum, invoice) => sum + integerCents(invoice.totalCents, 'invoice.totalCents'), 0);
  const paymentCents = fixture.records.payments.reduce((sum, payment) => sum + integerCents(payment.amountCents, 'payment.amountCents'), 0);
  const creditCents = fixture.records.credits.reduce((sum, credit) => sum + integerCents(credit.amountCents, 'credit.amountCents'), 0);
  return {
    adapter: createFixtureQuickBooksAdapter().capabilities,
    fixtureLabel: fixture.label,
    companyLabel: config.companyLabel,
    outcomes,
    findings,
    reconciliation: { invoiceSubtotalCents, taxCents, invoiceTotalCents, paymentCents, creditCents, openBalanceCents: invoiceTotalCents - paymentCents - creditCents },
  };
}
