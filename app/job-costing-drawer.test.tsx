import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { JobCostingDrawer } from './job-costing-drawer';

const audit = { createdAt: '2026-09-26T12:00:00.000Z', createdBy: 'owner', updatedAt: '2026-09-26T12:00:00.000Z', updatedBy: 'owner' };

describe('JobCostingDrawer', () => {
  it('renders an accessible local-only editor with explicit saves and no purchasing or accounting actions', () => {
    const html = renderToStaticMarkup(<JobCostingDrawer jobId="HP-2000" quotedRevenueCents={50000} invoicedRevenueCents={52000} entries={[]} catalogItems={[{ id: 'catalog-1', tenantId: 'local-owner', name: 'Mulch', unit: 'yard', quantity: 4, unitCostCents: 4200, active: true, audit }]} equipmentAssets={[{ id: 'asset-1', tenantId: 'local-owner', name: 'Mini skid steer', quantity: 1, hourlyCostCents: 6800, active: true, audit }]} onSave={vi.fn()} onDelete={vi.fn()} />);
    expect(html).toContain('Job costing for HP-2000');
    expect(html).toContain('Save cost entry');
    expect(html).toContain('Estimated margin');
    expect(html).toContain('Catalog item');
    expect(html).toContain('Mulch');
    expect(html).toContain('Equipment asset');
    expect(html).toContain('Mini skid steer');
    expect(html).not.toContain('Purchase');
    expect(html).not.toContain('QuickBooks');
  });
});
