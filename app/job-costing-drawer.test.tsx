import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { JobCostingDrawer } from './job-costing-drawer';

describe('JobCostingDrawer', () => {
  it('renders an accessible local-only editor with explicit saves and no purchasing or accounting actions', () => {
    const html = renderToStaticMarkup(<JobCostingDrawer jobId="HP-2000" quotedRevenueCents={50000} invoicedRevenueCents={52000} entries={[]} onSave={vi.fn()} onDelete={vi.fn()} />);
    expect(html).toContain('Job costing for HP-2000');
    expect(html).toContain('Save cost entry');
    expect(html).toContain('Estimated margin');
    expect(html).not.toContain('Purchase');
    expect(html).not.toContain('QuickBooks');
  });
});
