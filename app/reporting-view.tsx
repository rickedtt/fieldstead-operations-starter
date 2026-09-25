'use client';

import type { Job } from '../packages/fieldstead-domain/src';
import type { OperationsReport, OperationsReportFilters } from '../packages/fieldstead-local-store/src/reporting';

export type ReportingOption = { id: string; name: string };

type Props = {
  report?: OperationsReport;
  loading: boolean;
  error: Error | null;
  customers: ReportingOption[];
  assignees: ReportingOption[];
  filters: OperationsReportFilters;
  onFiltersChange: (filters: OperationsReportFilters) => void;
  onExport: () => void;
};

const statuses: Job['status'][] = ['Quoted', 'Scheduled', 'En route', 'In progress', 'Completed', 'Canceled'];
const percent = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const generated = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

function metric(value: number | null, suffix = ''): string {
  return value === null ? 'Not available' : `${percent.format(value)}${suffix}`;
}

export function ReportingView({ report, loading, error, customers, assignees, filters, onFiltersChange, onExport }: Props) {
  function update(changes: Partial<OperationsReportFilters>) { onFiltersChange({ ...filters, ...changes }); }
  return <div className="reporting-page">
    <section className="reporting-intro">
      <div><p className="eyebrow">LOCAL OPERATIONS</p><h2>Operations reporting</h2><p>Deterministic summaries from durable local records. Missing source data stays explicit; this is operational reporting, not accounting or tax guidance.</p></div>
      <button className="secondary" type="button" disabled={!report || loading} onClick={onExport}>Export visible CSV</button>
    </section>
    <section className="reporting-filters" aria-label="Reporting filters">
      <label>Date from<input aria-label="Date from" type="date" value={filters.from?.slice(0, 10) || ''} onChange={(event) => update({ from: event.target.value ? `${event.target.value}T00:00:00.000Z` : undefined })}/></label>
      <label>Date through<input aria-label="Date through" type="date" value={filters.through?.slice(0, 10) || ''} onChange={(event) => update({ through: event.target.value ? `${event.target.value}T00:00:00.000Z` : undefined })}/></label>
      <label>Job status<select aria-label="Job status" value={filters.statuses?.[0] || ''} onChange={(event) => update({ statuses: event.target.value ? [event.target.value as Job['status']] : undefined })}><option value="">All statuses</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
      <label>Customer<select aria-label="Customer" value={filters.customerId || ''} onChange={(event) => update({ customerId: event.target.value || undefined })}><option value="">All customers</option>{customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Assignee<select aria-label="Assignee" value={filters.assigneeId || ''} onChange={(event) => update({ assigneeId: event.target.value || undefined })}><option value="">All assignees</option>{assignees.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    </section>
    {loading && <p className="reporting-status" role="status">Building local report…</p>}
    {error && <p className="reporting-status reporting-error" role="alert">Reporting unavailable: {error.message}</p>}
    {report && <>
      <p className="reporting-meta">Generated {generated.format(new Date(report.generatedAt))} · Timezone {report.timezone}</p>
      <section className="reporting-metrics" aria-label="Operations report summary">
        <article><p>Pipeline</p><strong>{report.summary.pipelineJobs}</strong><small>Open filtered jobs</small></article>
        <article><p>Conversion</p><strong>{metric(report.summary.conversionPercent, '%')}</strong><small>{report.summary.convertedRequests} of {report.summary.eligibleRequests} requests</small></article>
        <article><p>Unscheduled</p><strong>{report.summary.unscheduledJobs}</strong><small>Open work without a date</small></article>
        <article><p>Scheduled hours</p><strong>{metric(report.summary.scheduledHours)}</strong><small>Utilization: {metric(report.summary.scheduleUtilizationPercent, '%')}</small></article>
        <article><p>Outstanding</p><strong>{money.format(report.summary.outstandingCents / 100)}</strong><small>Overdue {money.format(report.summary.overdueCents / 100)}</small></article>
        <article><p>Field completion</p><strong>{metric(report.summary.fieldCompletionPercent, '%')}</strong><small>{report.summary.fieldConfirmedCompletions} of {report.summary.completedJobs} completed jobs</small></article>
      </section>
      <section className="reporting-warnings" aria-labelledby="reporting-warnings-heading"><div className="section-title"><div><p className="eyebrow">DATA QUALITY</p><h2 id="reporting-warnings-heading">Warnings</h2></div><span className="pill">{report.warnings.length}</span></div>{report.warnings.length ? <ul>{report.warnings.map((warning, index) => <li key={`${warning.code}-${warning.recordId || index}`}><strong>{warning.code.replaceAll('_', ' ')}</strong><span>{warning.message}</span></li>)}</ul> : <p>No warnings for the visible filters.</p>}</section>
    </>}
  </div>;
}
