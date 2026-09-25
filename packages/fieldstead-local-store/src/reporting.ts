import { JOB_STATUSES, type Customer, type FieldEvent, type Invoice, type Job, type JobAssignment, type PaymentEntry, type ServiceRequest } from '../../fieldstead-domain/src';

export type OperationsReportFilters = {
  from?: string;
  through?: string;
  statuses?: Job['status'][];
  customerId?: string;
  assigneeId?: string;
};

export type OperationsReportInput = {
  generatedAt: string;
  timezone: string;
  filters: OperationsReportFilters;
};

export type OperationsReportSources = {
  jobs: Job[];
  customers: Customer[];
  serviceRequests: ServiceRequest[];
  assignments: JobAssignment[];
  fieldEvents: FieldEvent[];
  invoices: Invoice[];
  paymentEntries: PaymentEntry[];
};

export type OperationsReportWarning = {
  code: 'MISSING_CUSTOMER' | 'MISSING_SCHEDULE_CAPACITY' | 'MISSING_INVOICE_DUE_DATE' | 'MISSING_FIELD_COMPLETION';
  recordId?: string;
  message: string;
};

export type OperationsReportRow = {
  section: 'summary' | 'job' | 'invoice' | 'warning';
  metric: string;
  recordId: string;
  label: string;
  value: number | string | null;
  unit: 'count' | 'hours' | 'cents' | 'percent' | 'text';
  status: string;
};

export type OperationsReport = {
  generatedAt: string;
  timezone: string;
  filters: OperationsReportFilters;
  summary: {
    pipelineJobs: number;
    convertedRequests: number;
    eligibleRequests: number;
    conversionPercent: number | null;
    unscheduledJobs: number;
    scheduledHours: number;
    scheduleCapacityHours: null;
    scheduleUtilizationPercent: null;
    invoicedCents: number;
    outstandingCents: number;
    overdueCents: number;
    completedJobs: number;
    fieldConfirmedCompletions: number;
    fieldCompletionPercent: number | null;
  };
  jobs: Job[];
  invoices: Array<Invoice & { paidCents: number; balanceCents: number; agingDays: number | null }>;
  warnings: OperationsReportWarning[];
  rows: OperationsReportRow[];
};

function instant(value: string | undefined, label: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new TypeError(`${label} must be an ISO date-time`);
  return parsed;
}

function validateTimezone(timezone: string): void {
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(); }
  catch { throw new TypeError('Report timezone is not supported'); }
}

function matchesDate(job: Job, from?: number, through?: number): boolean {
  const timestamp = Date.parse(job.scheduledFor || job.updatedAt || job.createdAt);
  return Number.isFinite(timestamp) && (from === undefined || timestamp >= from) && (through === undefined || timestamp < through);
}

export function buildOperationsReport(input: OperationsReportInput, sources: OperationsReportSources): OperationsReport {
  validateTimezone(input.timezone);
  const generatedAtMs = instant(input.generatedAt, 'generatedAt');
  if (generatedAtMs === undefined) throw new TypeError('generatedAt is required');
  const from = instant(input.filters.from, 'filters.from');
  const through = instant(input.filters.through, 'filters.through');
  if (from !== undefined && through !== undefined && from >= through) throw new TypeError('Report range must have increasing boundaries');
  const statuses = input.filters.statuses;
  if (statuses?.some((status) => !JOB_STATUSES.includes(status))) throw new TypeError('Report status is not supported');

  const activeAssignments = sources.assignments.filter((assignment) => !assignment.unassignedAt);
  const jobs = sources.jobs.filter((job) =>
    matchesDate(job, from, through)
    && (!statuses?.length || statuses.includes(job.status))
    && (!input.filters.customerId || job.customerId === input.filters.customerId)
    && (!input.filters.assigneeId || activeAssignments.some((assignment) => assignment.jobId === job.id && assignment.assigneeId === input.filters.assigneeId)),
  ).sort((left, right) => left.id.localeCompare(right.id));
  const jobIds = new Set(jobs.map((job) => job.id));
  const filteredRequests = sources.serviceRequests.filter((request) =>
    (!input.filters.customerId || request.customerId === input.filters.customerId)
    && (!input.filters.assigneeId || jobs.some((job) => job.serviceRequestId === request.id))
    && (!from || Date.parse(request.audit.updatedAt) >= from)
    && (!through || Date.parse(request.audit.updatedAt) < through),
  );
  const filteredInvoices = sources.invoices.filter((invoice) => jobIds.has(invoice.jobId));
  const invoiceRows = filteredInvoices.map((invoice) => {
    const paidCents = sources.paymentEntries.filter((entry) => entry.invoiceId === invoice.id).reduce((sum, entry) => sum + (entry.kind === 'payment' ? entry.amountCents : -entry.amountCents), 0);
    const balanceCents = invoice.subtotalCents - paidCents;
    const due = invoice.dueAt ? Date.parse(invoice.dueAt) : Number.NaN;
    const agingDays = balanceCents > 0 && Number.isFinite(due) ? Math.max(0, Math.floor((generatedAtMs - due) / 86400000)) : null;
    return { ...invoice, paidCents, balanceCents, agingDays };
  }).sort((left, right) => left.id.localeCompare(right.id));

  const warnings: OperationsReportWarning[] = [];
  const knownCustomers = new Set(sources.customers.map((customer) => customer.id));
  for (const job of jobs) if (!knownCustomers.has(job.customerId)) warnings.push({ code: 'MISSING_CUSTOMER', recordId: job.id, message: `Job ${job.id} references missing customer ${job.customerId}.` });
  for (const request of filteredRequests) if (!knownCustomers.has(request.customerId)) warnings.push({ code: 'MISSING_CUSTOMER', recordId: request.id, message: `Service request ${request.id} references missing customer ${request.customerId}.` });
  warnings.push({ code: 'MISSING_SCHEDULE_CAPACITY', message: 'Schedule capacity is not stored, so utilization is unavailable rather than reported as zero.' });
  for (const invoice of invoiceRows) if (invoice.balanceCents > 0 && !invoice.dueAt) warnings.push({ code: 'MISSING_INVOICE_DUE_DATE', recordId: invoice.id, message: `Invoice ${invoice.id} has an outstanding balance without a due date.` });
  const completedJobs = jobs.filter((job) => job.status === 'Completed');
  const confirmedJobIds = new Set(sources.fieldEvents.filter((event) => event.kind === 'complete').map((event) => event.jobId));
  for (const job of completedJobs) if (!confirmedJobIds.has(job.id)) warnings.push({ code: 'MISSING_FIELD_COMPLETION', recordId: job.id, message: `Completed job ${job.id} has no field completion event.` });

  const convertedRequests = filteredRequests.filter((request) => request.status === 'converted' && request.convertedJobId).length;
  const eligibleRequests = filteredRequests.length;
  const scheduledHours = jobs.filter((job) => job.scheduledFor).reduce((sum, job) => sum + job.durationHours, 0);
  const fieldConfirmedCompletions = completedJobs.filter((job) => confirmedJobIds.has(job.id)).length;
  const summary = {
    pipelineJobs: jobs.filter((job) => !['Completed', 'Canceled'].includes(job.status)).length,
    convertedRequests,
    eligibleRequests,
    conversionPercent: eligibleRequests ? Math.round((convertedRequests / eligibleRequests) * 10000) / 100 : null,
    unscheduledJobs: jobs.filter((job) => !job.scheduledFor && !['Completed', 'Canceled'].includes(job.status)).length,
    scheduledHours,
    scheduleCapacityHours: null,
    scheduleUtilizationPercent: null,
    invoicedCents: invoiceRows.reduce((sum, invoice) => sum + invoice.subtotalCents, 0),
    outstandingCents: invoiceRows.reduce((sum, invoice) => sum + invoice.balanceCents, 0),
    overdueCents: invoiceRows.filter((invoice) => invoice.balanceCents > 0 && invoice.dueAt && Date.parse(invoice.dueAt) < generatedAtMs).reduce((sum, invoice) => sum + invoice.balanceCents, 0),
    completedJobs: completedJobs.length,
    fieldConfirmedCompletions,
    fieldCompletionPercent: completedJobs.length ? Math.round((fieldConfirmedCompletions / completedJobs.length) * 10000) / 100 : null,
  } as const;

  const rows: OperationsReportRow[] = [
    { section: 'summary', metric: 'pipeline', recordId: '', label: 'Open pipeline jobs', value: summary.pipelineJobs, unit: 'count', status: '' },
    { section: 'summary', metric: 'conversion', recordId: '', label: 'Request conversion', value: summary.conversionPercent, unit: 'percent', status: '' },
    { section: 'summary', metric: 'unscheduled_work', recordId: '', label: 'Unscheduled work', value: summary.unscheduledJobs, unit: 'count', status: '' },
    { section: 'summary', metric: 'scheduled_hours', recordId: '', label: 'Scheduled hours', value: summary.scheduledHours, unit: 'hours', status: '' },
    { section: 'summary', metric: 'schedule_utilization', recordId: '', label: 'Schedule utilization', value: null, unit: 'percent', status: 'unavailable' },
    { section: 'summary', metric: 'outstanding_invoices', recordId: '', label: 'Outstanding invoice balance', value: summary.outstandingCents, unit: 'cents', status: '' },
    { section: 'summary', metric: 'overdue_invoices', recordId: '', label: 'Overdue invoice balance', value: summary.overdueCents, unit: 'cents', status: '' },
    { section: 'summary', metric: 'field_completion', recordId: '', label: 'Field-confirmed completions', value: summary.fieldCompletionPercent, unit: 'percent', status: '' },
    ...jobs.map((job): OperationsReportRow => ({ section: 'job', metric: 'job', recordId: job.id, label: job.service, value: job.durationHours, unit: 'hours', status: job.status })),
    ...invoiceRows.map((invoice): OperationsReportRow => ({ section: 'invoice', metric: 'invoice_aging', recordId: invoice.id, label: `Invoice ${invoice.id}`, value: invoice.balanceCents, unit: 'cents', status: invoice.agingDays === null ? invoice.status : `${invoice.agingDays} days` })),
    ...warnings.map((warning): OperationsReportRow => ({ section: 'warning', metric: warning.code, recordId: warning.recordId || '', label: warning.message, value: null, unit: 'text', status: 'warning' })),
  ];
  return { generatedAt: input.generatedAt, timezone: input.timezone, filters: structuredClone(input.filters), summary, jobs, invoices: invoiceRows, warnings, rows };
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : Array.isArray(value) ? value.join('|') : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function exportOperationsReportCsv(report: OperationsReport): string {
  const header = ['generatedAt', 'timezone', 'from', 'through', 'statuses', 'customerId', 'assigneeId', 'section', 'metric', 'recordId', 'label', 'value', 'unit', 'status'];
  const prefix = [report.generatedAt, report.timezone, report.filters.from, report.filters.through, report.filters.statuses, report.filters.customerId, report.filters.assigneeId];
  return [header, ...report.rows.map((row) => [...prefix, row.section, row.metric, row.recordId, row.label, row.value, row.unit, row.status])].map((line) => line.map(csvCell).join(',')).join('\r\n');
}
