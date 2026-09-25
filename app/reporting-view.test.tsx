import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ReportingView } from './reporting-view';
import type { OperationsReport } from '../packages/fieldstead-local-store/src/reporting';

const report: OperationsReport = {
  generatedAt: '2026-09-25T17:00:00.000Z', timezone: 'America/Chicago', filters: {},
  summary: { pipelineJobs: 3, convertedRequests: 1, eligibleRequests: 2, conversionPercent: 50, unscheduledJobs: 1, scheduledHours: 5, scheduleCapacityHours: null, scheduleUtilizationPercent: null, invoicedCents: 30000, outstandingCents: 20000, overdueCents: 10000, completedJobs: 2, fieldConfirmedCompletions: 1, fieldCompletionPercent: 50 },
  jobs: [], invoices: [], warnings: [{ code: 'MISSING_SCHEDULE_CAPACITY', message: 'Schedule capacity is unavailable.' }], rows: [],
};

describe('ReportingView', () => {
  it('renders accessible filters, explicit unavailable values, warnings, and local export', () => {
    const html = renderToStaticMarkup(<ReportingView report={report} loading={false} error={null} customers={[{ id: 'customer-a', name: 'Alpha' }]} assignees={[{ id: 'crew-a', name: 'Crew A' }]} filters={{}} onFiltersChange={vi.fn()} onExport={vi.fn()} />);
    expect(html).toContain('<h2>Operations reporting</h2>');
    expect(html).toContain('Date from');
    expect(html).toContain('Job status');
    expect(html).toContain('Customer');
    expect(html).toContain('Assignee');
    expect(html).toContain('Not available');
    expect(html).toContain('Schedule capacity is unavailable.');
    expect(html).toContain('Export visible CSV');
    expect(html).toContain('Generated Sep 25, 2026');
    expect(html).toContain('America/Chicago');
  });
});
