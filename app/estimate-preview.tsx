'use client';

import type { EstimateEditorLine } from './estimate-editor';

export type EstimatePreviewInput = {
  estimateId: string;
  jobId: string;
  customerName: string;
  service: string;
  lines: EstimateEditorLine[];
};

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function total(lines: EstimateEditorLine[]) {
  return lines.reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

export function buildEstimatePrintDocument(input: EstimatePreviewInput) {
  const rows = input.lines.map((line) => `<tr><td>${escapeHtml(line.description)}</td><td>${line.quantity} ${escapeHtml(line.unit)}</td><td>${money.format(line.unitPriceCents / 100)}</td><td>${money.format(line.quantity * line.unitPriceCents / 100)}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Estimate ${escapeHtml(input.estimateId)}</title><style>body{font:15px Arial,sans-serif;color:#18342c;margin:40px}header{border-bottom:2px solid #315f51;padding-bottom:18px;margin-bottom:24px}h1{margin:0 0 8px}small{color:#6a7772}table{width:100%;border-collapse:collapse;margin:24px 0}th,td{text-align:left;padding:10px;border-bottom:1px solid #dcddd6}th:nth-child(n+2),td:nth-child(n+2){text-align:right}.total{text-align:right;font-size:20px;font-weight:700}.boundary{margin-top:40px;padding:12px;border:1px solid #dcddd6;background:#f5f3ed}</style></head><body><header><h1>Estimate preview</h1><div>${escapeHtml(input.customerName)}</div><small>Job ${escapeHtml(input.jobId)} · ${escapeHtml(input.service)}</small></header><table><thead><tr><th>Description</th><th>Quantity</th><th>Unit price</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table><p class="total">Estimate total: ${money.format(total(input.lines) / 100)}</p><p class="boundary"><strong>Local preview only.</strong> Printing or saving this document does not send, approve, or publish the estimate.</p></body></html>`;
}

export function EstimatePreview(input: EstimatePreviewInput) {
  function print() {
    const preview = window.open('', '_blank', 'noopener,noreferrer');
    if (!preview) return;
    preview.document.write(buildEstimatePrintDocument(input));
    preview.document.close();
    preview.focus();
    preview.print();
  }
  return <section className="estimate-preview" aria-label={`Estimate preview for ${input.jobId}`}>
    <div className="detail-heading"><div><h3>Estimate preview</h3><small>{input.customerName} · {input.service}</small></div><strong>{money.format(total(input.lines) / 100)}</strong></div>
    <div className="estimate-preview-lines">{input.lines.map((line, index) => <div key={`${index}-${line.description}`}><span>{line.description || 'Untitled line'}<small>{line.quantity} {line.unit} × {money.format(line.unitPriceCents / 100)}</small></span><strong>{money.format(line.quantity * line.unitPriceCents / 100)}</strong></div>)}</div>
    <button type="button" className="secondary full" onClick={print}>Print / save PDF</button>
    <p className="helper">Opens a local print preview only. Nothing is sent, approved, or published.</p>
  </section>;
}
