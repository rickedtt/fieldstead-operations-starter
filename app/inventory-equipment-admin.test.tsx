import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { InventoryEquipmentAdmin, toCatalogSaveInput, toEquipmentSaveInput } from './inventory-equipment-admin';

const audit = { createdAt: '2026-09-26T12:00:00.000Z', createdBy: 'owner', updatedAt: '2026-09-26T12:00:00.000Z', updatedBy: 'owner' };

describe('InventoryEquipmentAdmin', () => {
  it('renders accessible catalog and equipment editors with explicit save boundaries', () => {
    const html = renderToStaticMarkup(<InventoryEquipmentAdmin catalogItems={[{ id: 'catalog-1', tenantId: 'local-owner', name: 'Mulch', unit: 'yard', quantity: 4, unitCostCents: 4200, active: true, audit }]} equipmentAssets={[{ id: 'asset-1', tenantId: 'local-owner', name: 'Mini skid steer', quantity: 1, hourlyCostCents: 6800, active: true, audit }]} onSaveCatalogItem={vi.fn()} onDeleteCatalogItem={vi.fn()} onSaveEquipmentAsset={vi.fn()} onDeleteEquipmentAsset={vi.fn()} />);
    expect(html).toContain('Inventory and equipment administration');
    expect(html).toContain('Save catalog item');
    expect(html).toContain('Save equipment asset');
    expect(html).toContain('Mulch');
    expect(html).toContain('Mini skid steer');
    expect(html).toContain('Edit catalog item Mulch');
    expect(html).toContain('Edit equipment asset Mini skid steer');
    expect(html).toContain('Explicit local save only');
    expect(html).not.toContain('Purchase');
  });

  it('builds validated update payloads that preserve existing ids', () => {
    expect(toCatalogSaveInput({ id: 'catalog-1', name: ' Mulch ', unit: ' yard ', quantity: '5', unitCost: '43.25', active: false })).toEqual({ id: 'catalog-1', name: 'Mulch', unit: 'yard', quantity: 5, unitCostCents: 4325, active: false });
    expect(toEquipmentSaveInput({ id: 'asset-1', name: ' Mini skid steer ', quantity: '2', hourlyCost: '70.00', active: true })).toEqual({ id: 'asset-1', name: 'Mini skid steer', quantity: 2, hourlyCostCents: 7000, active: true });
  });

  it('rejects fractional quantities and invalid money before saving', () => {
    expect(toCatalogSaveInput({ id: 'catalog-1', name: 'Mulch', unit: 'yard', quantity: '1.5', unitCost: '42.00', active: true })).toBeUndefined();
    expect(toCatalogSaveInput({ id: 'catalog-1', name: 'Mulch', unit: 'yard', quantity: '1', unitCost: '42.001', active: true })).toBeUndefined();
    expect(toEquipmentSaveInput({ id: 'asset-1', name: 'Skid', quantity: '-1', hourlyCost: '68.00', active: true })).toBeUndefined();
  });
});
