import type { ReactNode } from 'react';
import {
  QUICKBOOKS_US_SYNTHETIC_FIXTURE,
  createFixtureQuickBooksAdapter,
  type QuickBooksPreviewOutcome,
} from '../packages/fieldstead-quickbooks/src';

const readinessConfig = {
  product: 'quickbooks-online',
  region: 'US',
  mode: 'fixture-only',
  companyLabel: 'Synthetic Fieldstead Services',
  mappings: {
    incomeAccount: 'Landscaping Services Income',
    accountsReceivable: 'Accounts Receivable',
    defaultTaxCode: 'Standard synthetic tax',
    className: 'Maintenance',
    locationName: 'North District',
  },
} as const;

const mappingRows = [
  ['Customers', 'Customer', 'Display name and email'],
  ['Services', 'Service item', 'Unit price and income account'],
  ['Invoices', 'Invoice', 'USD lines, tax, class, and location'],
  ['Payments', 'Payment', 'Invoice reference and integer-cent amount'],
  ['Credits', 'Credit', 'Customer and invoice references'],
] as const;

const cents = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function buildQuickBooksReadinessPreview() {
  return createFixtureQuickBooksAdapter().preview(readinessConfig, QUICKBOOKS_US_SYNTHETIC_FIXTURE);
}

function readableEntity(entityType: QuickBooksPreviewOutcome['entityType']) {
  return entityType === 'serviceItem' ? 'Service item' : entityType[0].toUpperCase() + entityType.slice(1);
}

function describeOutcome(outcome: QuickBooksPreviewOutcome) {
  if (!outcome.mapped) return 'Excluded from staging';
  if (outcome.entityType === 'invoice') return `${cents.format(Number(outcome.mapped.totalCents) / 100)} · ${outcome.mapped.currency}`;
  if (outcome.entityType === 'payment' || outcome.entityType === 'credit') return cents.format(Number(outcome.mapped.amountCents) / 100);
  return String(outcome.mapped.displayName ?? outcome.mapped.name ?? 'Mapped fixture record');
}

function Finding({ label, count, children }: { label: string; count: number; children: ReactNode }) {
  return <article className="quickbooks-finding"><span className={count ? 'finding-alert' : 'finding-clear'}>{count}</span><div><strong>{label}</strong><p>{children}</p></div></article>;
}

export function QuickBooksReadinessPanel() {
  const preview = buildQuickBooksReadinessPreview();
  const sourceIds = preview.outcomes.map((outcome) => outcome.sourceId);
  const duplicateCount = sourceIds.length - new Set(sourceIds).size;
  const unmappedCount = preview.findings.filter((finding) => finding.code === 'missing-reference').length;
  const unsupportedCount = preview.outcomes.filter((outcome) => outcome.status === 'unsupported').length;
  const reconciliation = preview.reconciliation;

  return <section className="finance-card quickbooks-readiness" aria-label="QuickBooks readiness preview">
    <div className="section-title"><div><p className="eyebrow">QUICKBOOKS READINESS</p><h2>QuickBooks Online US</h2></div><span className="pill pill-pending">Disconnected fixture preview</span></div>
    <p className="quickbooks-disclaimer"><strong>Synthetic data only.</strong> This read-only surface uses the local fixture adapter. No credentials are requested, no network or storage is accessed, and nothing is sent to QuickBooks or imported into Fieldstead.</p>

    <div className="quickbooks-grid">
      <section aria-labelledby="quickbooks-mappings-heading">
        <div className="quickbooks-heading"><h3 id="quickbooks-mappings-heading">Supported mappings</h3><span>{mappingRows.length} groups</span></div>
        <dl className="quickbooks-mappings">{mappingRows.map(([source, target, detail]) => <div key={source}><dt>{source}</dt><dd><strong>{target}</strong><small>{detail}</small></dd></div>)}</dl>
      </section>
      <section aria-labelledby="quickbooks-reconciliation-heading">
        <div className="quickbooks-heading"><h3 id="quickbooks-reconciliation-heading">Reconciliation totals</h3><span>Integer cents</span></div>
        <dl className="quickbooks-reconciliation">
          <div><dt>Invoice subtotal</dt><dd>{cents.format(reconciliation.invoiceSubtotalCents / 100)}</dd></div>
          <div><dt>Tax</dt><dd>{cents.format(reconciliation.taxCents / 100)}</dd></div>
          <div><dt>Invoice total</dt><dd>{cents.format(reconciliation.invoiceTotalCents / 100)}</dd></div>
          <div><dt>Payments</dt><dd>−{cents.format(reconciliation.paymentCents / 100)}</dd></div>
          <div><dt>Credits</dt><dd>−{cents.format(reconciliation.creditCents / 100)}</dd></div>
          <div className="quickbooks-balance"><dt>Open balance</dt><dd>{cents.format(reconciliation.openBalanceCents / 100)}</dd></div>
        </dl>
      </section>
    </div>

    <section className="quickbooks-staging" aria-labelledby="quickbooks-staging-heading">
      <div className="quickbooks-heading"><div><p className="eyebrow">FIXTURE STAGING</p><h3 id="quickbooks-staging-heading">Synthetic staging rows</h3></div><span>{preview.outcomes.length} rows</span></div>
      <div className="quickbooks-table" role="table" aria-label="Synthetic QuickBooks staging rows">
        <div className="quickbooks-table-head" role="row"><span role="columnheader">Entity</span><span role="columnheader">Synthetic source</span><span role="columnheader">Preview</span><span role="columnheader">Status</span></div>
        {preview.outcomes.map((outcome) => <div className="quickbooks-row" role="row" key={outcome.sourceId}><span role="cell"><strong>{readableEntity(outcome.entityType)}</strong></span><code role="cell">{outcome.sourceId}</code><span role="cell">{describeOutcome(outcome)}</span><span role="cell" className={outcome.status === 'ready' ? 'finding-clear' : 'finding-alert'}>{outcome.status}</span></div>)}
      </div>
    </section>

    <section className="quickbooks-findings" aria-labelledby="quickbooks-findings-heading">
      <div className="quickbooks-heading"><h3 id="quickbooks-findings-heading">Duplicate, unmapped, and unsupported findings</h3><span>{preview.findings.length} adapter findings</span></div>
      <div className="quickbooks-finding-grid">
        <Finding label="No duplicate source IDs" count={duplicateCount}>Every synthetic source ID is unique in this fixture.</Finding>
        <Finding label="No unmapped references" count={unmappedCount}>All customer, invoice, item, account, class, location, and tax references resolve.</Finding>
        <Finding label="No unsupported records" count={unsupportedCount}>All staged invoices use the supported US dollar fixture path.</Finding>
      </div>
    </section>
  </section>;
}
