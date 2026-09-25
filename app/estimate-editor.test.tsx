import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { EstimateEditor } from './estimate-editor';

describe('EstimateEditor', () => {
  it('renders editable lines with one explicit save boundary and no send or approval actions', () => {
    const html = renderToStaticMarkup(<EstimateEditor jobId="HP-2000" initialLines={[{ description: 'Labor', quantity: 2, unit: 'hour', unitPriceCents: 5000 }]} pricebookItems={[]} onSave={vi.fn()} />);
    expect(html).toContain('Save estimate');
    expect(html).toContain('Labor');
    expect(html).not.toContain('Send estimate');
    expect(html).not.toContain('Approve estimate');
  });
});
