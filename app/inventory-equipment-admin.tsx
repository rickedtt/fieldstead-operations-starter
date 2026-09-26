import { useState } from 'react';
import type { CatalogItem, EquipmentAsset } from '../packages/fieldstead-domain/src';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
type CatalogForm = { id?: string; name: string; unit: string; quantity: string; unitCost: string; active: boolean };
type EquipmentForm = { id?: string; name: string; quantity: string; hourlyCost: string; active: boolean };
const blankCatalog: CatalogForm = { id: undefined, name: '', unit: '', quantity: '0', unitCost: '0.00', active: true };
const blankEquipment: EquipmentForm = { id: undefined, name: '', quantity: '1', hourlyCost: '0.00', active: true };

function validWholeNumber(value: string) { const number = Number(value); return Number.isSafeInteger(number) && number >= 0; }
function validMoney(value: string) { const cents = Number(value) * 100; return Number.isFinite(cents) && Number.isSafeInteger(Math.round(cents)) && cents >= 0 && Math.abs(cents - Math.round(cents)) < 0.000001; }
export function toCatalogSaveInput(catalog: CatalogForm) { if (!catalog.name.trim() || !catalog.unit.trim() || !validWholeNumber(catalog.quantity) || !validMoney(catalog.unitCost)) return undefined; return { id: catalog.id, name: catalog.name.trim(), unit: catalog.unit.trim(), quantity: Number(catalog.quantity), unitCostCents: Math.round(Number(catalog.unitCost) * 100), active: catalog.active }; }
export function toEquipmentSaveInput(equipment: EquipmentForm) { if (!equipment.name.trim() || !validWholeNumber(equipment.quantity) || !validMoney(equipment.hourlyCost)) return undefined; return { id: equipment.id, name: equipment.name.trim(), quantity: Number(equipment.quantity), hourlyCostCents: Math.round(Number(equipment.hourlyCost) * 100), active: equipment.active }; }

type Props = {
  catalogItems: CatalogItem[];
  equipmentAssets: EquipmentAsset[];
  onSaveCatalogItem: (item: Omit<CatalogItem, 'id' | 'tenantId' | 'audit'> & { id?: string }) => void | Promise<void>;
  onDeleteCatalogItem: (id: string) => void | Promise<void>;
  onSaveEquipmentAsset: (asset: Omit<EquipmentAsset, 'id' | 'tenantId' | 'audit'> & { id?: string }) => void | Promise<void>;
  onDeleteEquipmentAsset: (id: string) => void | Promise<void>;
};

export function InventoryEquipmentAdmin({ catalogItems, equipmentAssets, onSaveCatalogItem, onDeleteCatalogItem, onSaveEquipmentAsset, onDeleteEquipmentAsset }: Props) {
  const [catalog, setCatalog] = useState(blankCatalog);
  const [equipment, setEquipment] = useState(blankEquipment);
  const catalogInput = toCatalogSaveInput(catalog);
  const equipmentInput = toEquipmentSaveInput(equipment);
  function editCatalogItem(item: CatalogItem) { setCatalog({ id: item.id, name: item.name, unit: item.unit, quantity: String(item.quantity), unitCost: (item.unitCostCents / 100).toFixed(2), active: item.active }); }
  function editEquipmentAsset(asset: EquipmentAsset) { setEquipment({ id: asset.id, name: asset.name, quantity: String(asset.quantity), hourlyCost: (asset.hourlyCostCents / 100).toFixed(2), active: asset.active }); }
  async function saveCatalogItem() { if (!catalogInput) return; await onSaveCatalogItem(catalogInput); setCatalog(blankCatalog); }
  async function saveEquipmentAsset() { if (!equipmentInput) return; await onSaveEquipmentAsset(equipmentInput); setEquipment(blankEquipment); }
  return <div className="inventory-admin" aria-label="Inventory and equipment administration">
    <section className="inventory-admin-card">
      <div className="detail-heading"><div><p className="eyebrow">CATALOG</p><h2>Inventory catalog</h2></div><span className="safe-state">Owner admin</span></div>
      <div className="inventory-admin-list">{catalogItems.map((item) => <div key={item.id}><span><strong>{item.name}</strong><small>{item.quantity} {item.unit} · {money.format(item.unitCostCents / 100)} each · {item.active ? 'active' : 'inactive'}</small></span><span className="inventory-admin-actions"><button type="button" className="secondary" aria-label={`Edit catalog item ${item.name}`} onClick={() => editCatalogItem(item)}>Edit</button><button type="button" className="danger" onClick={() => void onDeleteCatalogItem(item.id)}>Delete</button></span></div>)}</div>
      <div className="form-grid inventory-admin-fields inventory-admin-catalog-fields"><label>Name<input value={catalog.name} onChange={(event) => setCatalog({ ...catalog, name: event.target.value })}/></label><label>Unit<input value={catalog.unit} onChange={(event) => setCatalog({ ...catalog, unit: event.target.value })} placeholder="yard, bag, each"/></label><label>Quantity<input type="number" min="0" step="1" value={catalog.quantity} onChange={(event) => setCatalog({ ...catalog, quantity: event.target.value })}/></label><label>Unit cost<input type="number" min="0" step="0.01" value={catalog.unitCost} onChange={(event) => setCatalog({ ...catalog, unitCost: event.target.value })}/></label></div>
      <label className="confirm-import inventory-admin-checkbox"><input type="checkbox" checked={catalog.active} onChange={(event) => setCatalog({ ...catalog, active: event.target.checked })}/><span>Available for cost-entry selection</span></label>
      <div className="inventory-admin-form-actions"><button type="button" className="primary full" disabled={!catalogInput} aria-describedby="inventory-save-boundary" onClick={() => void saveCatalogItem()}>{catalog.id ? 'Save catalog changes' : 'Save catalog item'}</button>{catalog.id && <button type="button" className="secondary full" onClick={() => setCatalog(blankCatalog)}>Cancel catalog edit</button>}</div>
    </section>
    <section className="inventory-admin-card">
      <div className="detail-heading"><div><p className="eyebrow">EQUIPMENT</p><h2>Equipment assets</h2></div><span className="safe-state">Owner admin</span></div>
      <div className="inventory-admin-list">{equipmentAssets.map((asset) => <div key={asset.id}><span><strong>{asset.name}</strong><small>{asset.quantity} available · {money.format(asset.hourlyCostCents / 100)} hourly · {asset.active ? 'active' : 'inactive'}</small></span><span className="inventory-admin-actions"><button type="button" className="secondary" aria-label={`Edit equipment asset ${asset.name}`} onClick={() => editEquipmentAsset(asset)}>Edit</button><button type="button" className="danger" onClick={() => void onDeleteEquipmentAsset(asset.id)}>Delete</button></span></div>)}</div>
      <div className="form-grid inventory-admin-fields inventory-admin-equipment-fields"><label>Name<input value={equipment.name} onChange={(event) => setEquipment({ ...equipment, name: event.target.value })}/></label><label>Quantity<input type="number" min="0" step="1" value={equipment.quantity} onChange={(event) => setEquipment({ ...equipment, quantity: event.target.value })}/></label><label>Hourly cost<input type="number" min="0" step="0.01" value={equipment.hourlyCost} onChange={(event) => setEquipment({ ...equipment, hourlyCost: event.target.value })}/></label></div>
      <label className="confirm-import inventory-admin-checkbox"><input type="checkbox" checked={equipment.active} onChange={(event) => setEquipment({ ...equipment, active: event.target.checked })}/><span>Available for cost-entry selection</span></label>
      <div className="inventory-admin-form-actions"><button type="button" className="primary full" disabled={!equipmentInput} aria-describedby="inventory-save-boundary" onClick={() => void saveEquipmentAsset()}>{equipment.id ? 'Save equipment changes' : 'Save equipment asset'}</button>{equipment.id && <button type="button" className="secondary full" onClick={() => setEquipment(blankEquipment)}>Cancel equipment edit</button>}</div>
    </section>
    <p className="helper" id="inventory-save-boundary">Explicit local save only. Quantities are administrative reference values; job costs do not decrement stock. No purchasing, payroll, accounting sync, or external provider action.</p>
  </div>;
}
