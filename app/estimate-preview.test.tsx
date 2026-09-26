import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EstimatePreview, buildEstimatePrintDocument } from './estimate-preview';

const lines = [
  { description: 'Spring cleanup', quantity: 2, unit: 'hour', unitPriceCents: 7500 },
  { description: 'Mulch', quantity: 3, unit: 'yard', unitPriceCents: 4200 },
];

describe('EstimatePreview', () => {
  it('renders a read-only printable estimate with totals and no send or approval actions', () => {
    const html = renderToStaticMarkup(<EstimatePreview estimateId="estimate:HP-2000" jobId="HP-2000" customerName="Taylor Farm" service="Spring cleanup" lines={lines} />);
    expect(html).toContain('Estimate preview');
    expect(html).toContain('Taylor Farm');
    expect(html).toContain('Spring cleanup');
    expect(html).toContain('$276.00');
    expect(html).toContain('Print / save PDF');
    expect(html).not.toContain('Send estimate');
    expect(html).not.toContain('Approve estimate');
  });

  it('builds a standalone print document that escapes owner-entered content and states the local-only boundary', () => {
    const document = buildEstimatePrintDocument({ estimateId: 'estimate:<unsafe>', jobId: 'HP-2000', customerName: '<script>alert(1)</script>', service: 'Cleanup & repair', lines });
    expect(document).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(document).toContain('Cleanup &amp; repair');
    expect(document).not.toContain('<script>alert(1)</script>');
    expect(document).toContain('Local preview only');
    expect(document).toContain('$276.00');
  });
});
