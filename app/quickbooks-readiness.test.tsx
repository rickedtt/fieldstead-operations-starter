import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { QuickBooksReadinessPanel, buildQuickBooksReadinessPreview } from './quickbooks-readiness';

vi.mock('../packages/fieldstead-quickbooks/src', async () => {
  const actual = await vi.importActual<typeof import('../packages/fieldstead-quickbooks/src')>('../packages/fieldstead-quickbooks/src');
  return { ...actual, createFixtureQuickBooksAdapter: vi.fn(actual.createFixtureQuickBooksAdapter) };
});

import { createFixtureQuickBooksAdapter } from '../packages/fieldstead-quickbooks/src';

describe('QuickBooks fixture-only readiness surface', () => {
  it('uses the package adapter to create a synthetic, disconnected staging preview', () => {
    const preview = buildQuickBooksReadinessPreview();

    expect(createFixtureQuickBooksAdapter).toHaveBeenCalledTimes(1);
    expect(preview.adapter).toEqual({
      connected: false,
      mode: 'fixture-only',
      externalWrites: false,
      product: 'quickbooks-online',
      region: 'US',
    });
    expect(preview.fixtureLabel).toContain('SYNTHETIC');
    expect(preview.outcomes).toHaveLength(10);
    expect(preview.reconciliation).toEqual({
      invoiceSubtotalCents: 25100,
      taxCents: 2071,
      invoiceTotalCents: 27171,
      paymentCents: 10000,
      creditCents: 2500,
      openBalanceCents: 14671,
    });
  });

  it('renders accessible mappings, staging rows, reconciliation, and findings without actions', () => {
    const html = renderToStaticMarkup(<QuickBooksReadinessPanel />);

    expect(html).toContain('QuickBooks Online US');
    expect(html).toContain('Disconnected fixture preview');
    expect(html).toContain('Synthetic data only');
    expect(html).toContain('Supported mappings');
    expect(html).toContain('Synthetic staging rows');
    expect(html).toContain('Reconciliation totals');
    expect(html).toContain('Duplicate, unmapped, and unsupported findings');
    expect(html).toContain('No duplicate source IDs');
    expect(html).toContain('No unmapped references');
    expect(html).toContain('No unsupported records');
    expect(html).toContain('aria-label="QuickBooks readiness preview"');
    expect(html).toContain('aria-label="Synthetic QuickBooks staging rows"');
    expect(html).not.toMatch(/<button|<input|<select|<form/);
    expect(html).not.toMatch(/href=|onClick=|type="password"/);
  });

  it('does not access fetch, storage, or Fieldstead persistence while building the preview', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const storageGet = vi.spyOn(Storage.prototype, 'getItem');
    const storageSet = vi.spyOn(Storage.prototype, 'setItem');

    buildQuickBooksReadinessPreview();
    renderToStaticMarkup(<QuickBooksReadinessPanel />);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(storageGet).not.toHaveBeenCalled();
    expect(storageSet).not.toHaveBeenCalled();
  });
});
