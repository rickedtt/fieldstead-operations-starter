import { useState } from 'react';
import type { CatalogItem, EquipmentAsset } from '../packages/fieldstead-domain/src';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

type Props = {
  catalogItems: CatalogItem[];
  equipmentAssets: EquipmentAsset[];
  onSaveCatalogItem: (item: Omit<CatalogItem, 'id' | 'tenantId' | 'audit'> & { id?: string }) => void | Promise<void>;
  onDeleteCatalogItem: (id: string) => void | Promise<void>;
  onSaveEquipmentAsset: (asset: Omit<EquipmentAsset, 'id' | 'tenantId' | 'audit'> & { id?: string }) => void | Promise<void>;
  onDeleteEquipmentAsset: (id: string) => void | Promise<void>;
};

export function InventoryEquipmentAdmin({ catalogItems, equipmentAssets, onSaveCatalogItem, onDeleteCatalogItem, onSaveEquipmentAsset, onDeleteEquipmentAsset }: Props) {
  const [catalog, setCatalog] = useState({ name: '', unit: '', quantity: '0', unitCost: '0.00', active: true });
  const [equipment, setEquipment] = useState({ name: '', quantity: '1', hourlyCost: '0.00', active: true });
  return <div className="inventory-admin" aria-label="Inventory and equipment administration">
    <section className="inventory-admin-card">
      <div className="detail-heading"><div><p className="eyebrow">CATALOG</p><h2>Inventory catalog</h2></div><span className="safe-state">Owner admin</span></div>
      <div className="inventory-admin-list">{catalogItems.map((item) => <div key={item.id}><span><strong>{item.name}</strong><small>{item.quantity} {item.unit} · {money.format(item.unitCostCents / 100)} each · {item.active ? 'active' : 'inactive'}</small></span><button type="button" className="danger" onClick={() => void onDeleteCatalogItem(item.id)}>Delete</button></div>)}</div>
      <div className="form-grid"><label>Name<input value={catalog.name} onChange={(event) => setCatalog({ ...catalog, name: event.target.value })}/></label><label>Unit<input value={catalog.unit} onChange={(event) => setCatalog({ ...catalog, unit: event.target.value })} placeholder="yard, bag, each"/></label><label>Quantity<input type="number" min="0" step="1" value={catalog.quantity} onChange={(event) => setCatalog({ ...catalog, quantity: event.target.value })}/></label><label>Unit cost<input type="number" min="0" step="0.01" value={catalog.unitCost} onChange={(event) => setCatalog({ ...catalog, unitCost: event.target.value })}/></label></div>
      <label className="confirm-import"><input type="checkbox" checked={catalog.active} onChange={(event) => setCatalog({ ...catalog, active: event.target.checked })}/><span>Available for cost-entry selection</span></label>
      <button type="button" className="primary full" disabled={!catalog.name.trim() || !catalog.unit.trim()} onClick={() => void onSaveCatalogItem({ name: catalog.name.trim(), unit: catalog.unit.trim(), quantity: Number(catalog.quantity), unitCostCents: Math.round(Number(catalog.unitCost) * 100), active: catalog.active })}>Save catalog item</button>
    </section>
    <section className="inventory-admin-card">
      <div className="detail-heading"><div><p className="eyebrow">EQUIPMENT</p><h2>Equipment assets</h2></div><span className="safe-state">Owner admin</span></div>
      <div className="inventory-admin-list">{equipmentAssets.map((asset) => <div key={asset.id}><span><strong>{asset.name}</strong><small>{asset.quantity} available · {money.format(asset.hourlyCostCents / 100)} hourly · {asset.active ? 'active' : 'inactive'}</small></span><button type="button" className="danger" onClick={() => void onDeleteEquipmentAsset(asset.id)}>Delete</button></div>)}</div>
      <div className="form-grid"><label>Name<input value={equipment.name} onChange={(event) => setEquipment({ ...equipment, name: event.target.value })}/></label><label>Quantity<input type="number" min="0" step="1" value={equipment.quantity} onChange={(event) => setEquipment({ ...equipment, quantity: event.target.value })}/></label><label>Hourly cost<input type="number" min="0" step="0.01" value={equipment.hourlyCost} onChange={(event) => setEquipment({ ...equipment, hourlyCost: event.target.value })}/></label></div>
      <label className="confirm-import"><input type="checkbox" checked={equipment.active} onChange={(event) => setEquipment({ ...equipment, active: event.target.checked })}/><span>Available for cost-entry selection</span></label>
      <button type="button" className="primary full" disabled={!equipment.name.trim()} onClick={() => void onSaveEquipmentAsset({ name: equipment.name.trim(), quantity: Number(equipment.quantity), hourlyCostCents: Math.round(Number(equipment.hourlyCost) * 100), active: equipment.active })}>Save equipment asset</button>
    </section>
    <p className="helper">Explicit local save only. Quantities are administrative reference values; job costs do not decrement stock. No purchasing, payroll, accounting sync, or external provider action.</p>
  </div>;
}
