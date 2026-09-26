import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { InventoryEquipmentAdmin } from './inventory-equipment-admin';

const audit = { createdAt: '2026-09-26T12:00:00.000Z', createdBy: 'owner', updatedAt: '2026-09-26T12:00:00.000Z', updatedBy: 'owner' };

describe('InventoryEquipmentAdmin', () => {
  it('renders accessible catalog and equipment editors with explicit save boundaries', () => {
    const html = renderToStaticMarkup(<InventoryEquipmentAdmin catalogItems={[{ id: 'catalog-1', tenantId: 'local-owner', name: 'Mulch', unit: 'yard', quantity: 4, unitCostCents: 4200, active: true, audit }]} equipmentAssets={[{ id: 'asset-1', tenantId: 'local-owner', name: 'Mini skid steer', quantity: 1, hourlyCostCents: 6800, active: true, audit }]} onSaveCatalogItem={vi.fn()} onDeleteCatalogItem={vi.fn()} onSaveEquipmentAsset={vi.fn()} onDeleteEquipmentAsset={vi.fn()} />);
    expect(html).toContain('Inventory and equipment administration');
    expect(html).toContain('Save catalog item');
    expect(html).toContain('Save equipment asset');
    expect(html).toContain('Mulch');
    expect(html).toContain('Mini skid steer');
    expect(html).toContain('Explicit local save only');
    expect(html).not.toContain('Purchase');
  });
});
