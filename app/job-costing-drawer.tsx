import { useMemo, useState } from 'react';
import { summarizeJobCosting, type CatalogItem, type EquipmentAsset, type JobCostEntry, type JobCostCategory } from '../packages/fieldstead-domain/src';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const categories: JobCostCategory[] = ['labor', 'material', 'equipment', 'other'];

export function JobCostingDrawer({ jobId, quotedRevenueCents, invoicedRevenueCents, entries, catalogItems = [], equipmentAssets = [], onSave, onDelete }: { jobId: string; quotedRevenueCents: number; invoicedRevenueCents: number; entries: JobCostEntry[]; catalogItems?: CatalogItem[]; equipmentAssets?: EquipmentAsset[]; onSave: (entry: { id?: string; category: JobCostCategory; description: string; estimatedCents: number; actualCents?: number }) => void | Promise<void>; onDelete: (id: string) => void | Promise<void> }) {
  const [category, setCategory] = useState<JobCostCategory>('labor');
  const [description, setDescription] = useState('');
  const [estimated, setEstimated] = useState('0.00');
  const [actual, setActual] = useState('');
  const summary = useMemo(() => summarizeJobCosting({ quotedRevenueCents, invoicedRevenueCents, entries }), [entries, invoicedRevenueCents, quotedRevenueCents]);
  const activeCatalog = catalogItems.filter((item) => item.active);
  const activeEquipment = equipmentAssets.filter((asset) => asset.active);
  function selectCatalog(id: string) { const item = activeCatalog.find((candidate) => candidate.id === id); if (!item) return; setCategory('material'); setDescription(item.name); setEstimated((item.unitCostCents / 100).toFixed(2)); }
  function selectEquipment(id: string) { const asset = activeEquipment.find((candidate) => candidate.id === id); if (!asset) return; setCategory('equipment'); setDescription(asset.name); setEstimated((asset.hourlyCostCents / 100).toFixed(2)); }
  return <section className="job-costing" aria-label={`Job costing for ${jobId}`}>
    <div className="detail-heading"><h3>Job costing</h3><span className="safe-state">Local only</span></div>
    <div className="job-cost-summary">
      <div><small>Quoted revenue</small><strong>{money.format(summary.quotedRevenueCents / 100)}</strong></div>
      <div><small>Invoiced revenue</small><strong>{money.format(summary.invoicedRevenueCents / 100)}</strong></div>
      <div><small>Estimated margin</small><strong>{money.format(summary.estimatedMarginCents / 100)}</strong></div>
      <div><small>Actual margin</small><strong>{money.format(summary.actualMarginCents / 100)}</strong></div>
      <div><small>Cost variance</small><strong>{money.format(summary.costVarianceCents / 100)}</strong></div>
    </div>
    {summary.warnings.length > 0 && <ul className="job-cost-warnings" aria-label="Incomplete cost data">{summary.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
    <div className="job-cost-list">{entries.map((entry) => <div key={entry.id}><span><strong>{entry.description}</strong><small>{entry.category} · estimate {money.format(entry.estimatedCents / 100)} · actual {entry.actualCents === undefined ? 'not entered' : money.format(entry.actualCents / 100)}</small></span><button type="button" className="secondary" onClick={() => void onDelete(entry.id)}>Delete</button></div>)}</div>
    <div className="form-grid">
      <label>Catalog item<select defaultValue="" onChange={(event) => selectCatalog(event.target.value)}><option value="">Choose material…</option>{activeCatalog.map((item) => <option key={item.id} value={item.id}>{item.name} · {money.format(item.unitCostCents / 100)}/{item.unit}</option>)}</select></label>
      <label>Equipment asset<select defaultValue="" onChange={(event) => selectEquipment(event.target.value)}><option value="">Choose equipment…</option>{activeEquipment.map((asset) => <option key={asset.id} value={asset.id}>{asset.name} · {money.format(asset.hourlyCostCents / 100)}/hour</option>)}</select></label>
      <label>Cost category<select value={category} onChange={(event) => setCategory(event.target.value as JobCostCategory)}>{categories.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Description<input value={description} onChange={(event) => setDescription(event.target.value)}/></label>
      <label>Estimated cost<input type="number" min="0" step="0.01" value={estimated} onChange={(event) => setEstimated(event.target.value)}/></label>
      <label>Actual cost (optional)<input type="number" min="0" step="0.01" value={actual} onChange={(event) => setActual(event.target.value)}/></label>
    </div>
    <button type="button" className="primary full" disabled={!description.trim()} onClick={() => void onSave({ category, description: description.trim(), estimatedCents: Math.round(Number(estimated) * 100), actualCents: actual === '' ? undefined : Math.round(Number(actual) * 100) })}>Save cost entry</button>
    <p className="helper">Explicit local save only. Catalog and equipment selections copy reference costs; no inventory decrement, purchasing, payroll, accounting sync, or external provider action.</p>
  </section>;
}
