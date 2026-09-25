'use client';

import { useMemo, useState } from 'react';
import type { PricebookItem } from '../packages/fieldstead-domain/src';

export type EstimateEditorLine = { description: string; quantity: number; unit: string; unitPriceCents: number; pricebookItemId?: string; pricebookItemName?: string };

export function EstimateEditor({ jobId, initialLines, pricebookItems, onSave }: { jobId: string; initialLines: EstimateEditorLine[]; pricebookItems: PricebookItem[]; onSave: (lines: EstimateEditorLine[]) => void | Promise<void> }) {
  const [lines, setLines] = useState(initialLines);
  const subtotalCents = useMemo(() => lines.reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0), [lines]);
  function update(index: number, changes: Partial<EstimateEditorLine>) { setLines((current) => current.map((line, position) => position === index ? { ...line, ...changes } : line)); }
  function addPricebookItem(id: string) { const item = pricebookItems.find((candidate) => candidate.id === id); if (item && lines.length < 100) setLines((current) => [...current, { description: item.description || item.name, quantity: 1, unit: item.unit, unitPriceCents: item.unitPriceCents, pricebookItemId: item.id, pricebookItemName: item.name }]); }
  return <section className="estimate-editor" aria-label={`Draft estimate for ${jobId}`}>
    <div className="detail-heading"><h3>Draft line items</h3><strong>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(subtotalCents / 100)}</strong></div>
    {pricebookItems.length > 0 && <label>Add from pricebook<select defaultValue="" onChange={(event) => { addPricebookItem(event.target.value); event.target.value = ''; }}><option value="">Choose an item</option>{pricebookItems.filter((item) => item.active).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}
    {lines.map((line, index) => <div className="estimate-line" key={`${index}-${line.pricebookItemId || 'custom'}`}><input aria-label={`Line ${index + 1} description`} value={line.description} onChange={(event) => update(index, { description: event.target.value })}/><input aria-label={`Line ${index + 1} quantity`} type="number" min="0.01" step="0.01" value={line.quantity} onChange={(event) => update(index, { quantity: Number(event.target.value) })}/><input aria-label={`Line ${index + 1} unit`} value={line.unit} onChange={(event) => update(index, { unit: event.target.value })}/><input aria-label={`Line ${index + 1} unit price`} type="number" min="0" step="0.01" value={(line.unitPriceCents / 100).toFixed(2)} onChange={(event) => update(index, { unitPriceCents: Math.round(Number(event.target.value) * 100) })}/><button type="button" onClick={() => setLines((current) => current.filter((_, position) => position !== index))}>Remove</button></div>)}
    <button type="button" className="secondary" disabled={lines.length >= 100} onClick={() => setLines((current) => [...current, { description: '', quantity: 1, unit: 'each', unitPriceCents: 0 }])}>Add line</button>
    <button type="button" className="primary full" onClick={() => void onSave(lines)}>Save estimate</button>
    <p className="helper">Explicit local draft save only. Nothing is sent or approved.</p>
  </section>;
}
