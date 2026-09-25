import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { Customer, FieldEvent, Invoice, Job, JobAssignment, PaymentEntry, ServiceRequest } from '../../fieldstead-domain/src';
import { createFieldsteadRepository, type FieldsteadRepository } from './index';

const databases: FieldsteadRepository[] = [];
const generatedAt = '2026-09-25T17:00:00.000Z';
const timezone = 'America/Chicago';

function customer(id: string, name: string): Customer {
  return { id, displayName: name, primaryEmail: `${id}@example.test`, sourceEmail: { accountId: 'fixture', messageId: id, normalizedFrom: `${id}@example.test` }, audit: { createdAt: '2026-09-01T12:00:00.000Z', createdBy: 'owner', updatedAt: '2026-09-01T12:00:00.000Z', updatedBy: 'owner' } };
}
function job(id: string, overrides: Partial<Job> = {}): Job {
  return { id, customerId: 'customer-a', service: 'Service visit', description: 'Work', quoteStatus: 'Approved', quoteAmount: 250, durationHours: 2, crew: 'Unassigned', status: 'Quoted', invoiceStatus: 'Not created', invoiceAmount: 0, createdAt: '2026-09-01T12:00:00.000Z', updatedAt: '2026-09-10T12:00:00.000Z', ...overrides };
}
function request(id: string, overrides: Partial<ServiceRequest> = {}): ServiceRequest {
  return { id, customerId: 'customer-a', summary: 'Request', details: 'Details', status: 'new', sourceEmail: { accountId: 'fixture', messageId: id, normalizedFrom: `${id}@example.test` }, audit: { createdAt: '2026-09-02T12:00:00.000Z', createdBy: 'owner', updatedAt: '2026-09-02T12:00:00.000Z', updatedBy: 'owner' }, ...overrides };
}
function invoice(id: string, overrides: Partial<Invoice> = {}): Invoice {
  return { id, jobId: 'job-complete', customerId: 'customer-a', status: 'Sent', subtotalCents: 25000, issuedAt: '2026-09-05T12:00:00.000Z', dueAt: '2026-09-20T12:00:00.000Z', audit: { createdAt: '2026-09-05T12:00:00.000Z', createdBy: 'owner', updatedAt: '2026-09-05T12:00:00.000Z', updatedBy: 'owner' }, ...overrides };
}

async function repository() {
  const repo = createFieldsteadRepository(`fieldstead-reporting-${crypto.randomUUID()}`);
  databases.push(repo);
  await repo.open();
  await repo.customers.bulkAdd([customer('customer-a', 'Alpha Co'), customer('customer-b', 'Beta Co')]);
  await repo.serviceRequests.bulkAdd([request('request-new'), request('request-converted', { status: 'converted', convertedJobId: 'job-complete' }), request('request-broken', { customerId: 'missing-customer' })]);
  await repo.jobs.bulkAdd([
    job('job-unscheduled'),
    job('job-scheduled', { customerId: 'customer-b', status: 'Scheduled', scheduledFor: '2026-09-25T14:00:00.000Z', durationHours: 3, crew: 'Crew B', updatedAt: '2026-09-20T12:00:00.000Z' }),
    job('job-complete', { status: 'Completed', scheduledFor: '2026-09-24T14:00:00.000Z', durationHours: 2, crew: 'Crew A', updatedAt: '2026-09-24T17:00:00.000Z', invoiceStatus: 'Sent', invoiceAmount: 250 }),
    job('job-orphan', { customerId: 'missing-customer' }),
  ]);
  const assignments: JobAssignment[] = [
    { id: 'assignment-b', jobId: 'job-scheduled', assigneeId: 'crew-b', assigneeName: 'Crew B', assignedAt: '2026-09-20T12:00:00.000Z' },
    { id: 'assignment-a', jobId: 'job-complete', assigneeId: 'crew-a', assigneeName: 'Crew A', assignedAt: '2026-09-20T12:00:00.000Z' },
  ];
  await repo.assignments.bulkAdd(assignments);
  const events: FieldEvent[] = [
    { id: 'field-complete', operationId: 'op-complete', jobId: 'job-complete', actorId: 'crew-a', kind: 'complete', occurredAt: '2026-09-24T16:30:00.000Z', syncState: 'synced' },
  ];
  await repo.fieldEvents.bulkAdd(events);
  await repo.invoices.bulkAdd([invoice('invoice-overdue'), invoice('invoice-paid', { jobId: 'job-scheduled', customerId: 'customer-b', status: 'Paid', subtotalCents: 10000, dueAt: '2026-09-15T12:00:00.000Z' })]);
  const payments: PaymentEntry[] = [{ id: 'payment-1', invoiceId: 'invoice-paid', kind: 'payment', amountCents: 10000, occurredAt: '2026-09-15T12:00:00.000Z', actorId: 'owner' }];
  await repo.paymentEntries.bulkAdd(payments);
  return repo;
}

afterEach(async () => { await Promise.all(databases.splice(0).map((repo) => repo.delete())); });

describe('local operations reporting', () => {
  it('builds deterministic report contracts without treating unavailable facts as zero', async () => {
    const report = await (await repository()).buildOperationsReport({ generatedAt, timezone, filters: {} });
    expect(report.generatedAt).toBe(generatedAt);
    expect(report.timezone).toBe(timezone);
    expect(report.summary).toMatchObject({ pipelineJobs: 3, convertedRequests: 1, eligibleRequests: 3, unscheduledJobs: 2, scheduledHours: 5, outstandingCents: 25000, overdueCents: 25000, completedJobs: 1, fieldConfirmedCompletions: 1 });
    expect(report.summary.scheduleCapacityHours).toBeNull();
    expect(report.summary.scheduleUtilizationPercent).toBeNull();
    expect(report.warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining(['MISSING_CUSTOMER', 'MISSING_SCHEDULE_CAPACITY']));
    expect(report.rows.some((row) => row.metric === 'schedule_utilization' && row.value === null)).toBe(true);
  });

  it('applies date, status, customer, and assignee filters consistently to report rows and csv', async () => {
    const repo = await repository();
    const filters = { from: '2026-09-20T00:00:00.000Z', through: '2026-09-26T00:00:00.000Z', statuses: ['Scheduled'] as Job['status'][], customerId: 'customer-b', assigneeId: 'crew-b' };
    const report = await repo.buildOperationsReport({ generatedAt, timezone, filters });
    expect(report.filters).toEqual(filters);
    expect(report.jobs.map((item) => item.id)).toEqual(['job-scheduled']);
    expect(report.summary).toMatchObject({ pipelineJobs: 1, scheduledHours: 3, outstandingCents: 0 });
    const csv = repo.exportOperationsReportCsv(report);
    expect(csv).toContain('generatedAt,timezone,from,through,statuses,customerId,assigneeId,section,metric,recordId,label,value,unit,status');
    expect(csv).toContain('2026-09-25T17:00:00.000Z,America/Chicago,2026-09-20T00:00:00.000Z,2026-09-26T00:00:00.000Z,Scheduled,customer-b,crew-b');
    expect(csv).toContain('job-scheduled');
    expect(csv).not.toContain('job-complete');
  });

  it('rejects invalid timezones and ranges before querying', async () => {
    const repo = await repository();
    await expect(repo.buildOperationsReport({ generatedAt, timezone: 'not/a-zone', filters: {} })).rejects.toThrow(/timezone/i);
    await expect(repo.buildOperationsReport({ generatedAt, timezone, filters: { from: '2026-09-26T00:00:00.000Z', through: '2026-09-20T00:00:00.000Z' } })).rejects.toThrow(/range/i);
  });
});
