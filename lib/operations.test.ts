import { describe, expect, it } from 'vitest';
import { advanceJob, createJob, nextAction, searchJobs, seedState, setInvoiceStatus, setQuoteStatus, updateJob } from './operations';

describe('Fieldstead dogfood seed identity', () => {
  it('ships only clearly labeled synthetic Fieldstead records', () => {
    expect(seedState.customers.length).toBeGreaterThan(0);
    expect(seedState.jobs.length).toBeGreaterThan(0);
    expect(seedState.customers.every((customer) => customer.id.startsWith('demo-fs-cus-'))).toBe(true);
    expect(seedState.jobs.every((job) => job.id.startsWith('FS-DEMO-'))).toBe(true);
    expect(seedState.customers.every((customer) => customer.notes.includes('Synthetic dogfood record'))).toBe(true);
    expect(seedState.activity.every((event) => event.actor === 'Fieldstead owner' || event.actor === 'Demo system')).toBe(true);
  });
});

describe('central operations flows', () => {
  it('moves a job through field status and creates an invoice draft on completion', () => {
    let state = structuredClone(seedState);
    const scheduled = state.jobs.find((job) => job.status === 'Scheduled')!;
    state = advanceJob(state, scheduled.id, '2026-08-30T08:35:00-05:00');
    state = advanceJob(state, scheduled.id, '2026-08-30T08:50:00-05:00');
    state = advanceJob(state, scheduled.id, '2026-08-30T10:20:00-05:00');
    const job = state.jobs.find((item) => item.id === scheduled.id);
    expect(job).toMatchObject({ status:'Completed', invoiceStatus:'Draft' });
    expect(state.activity[0].action).toBe('Job moved to Completed');
  });

  it('approves a quote into scheduled work and records the handoff', () => {
    const estimate = seedState.jobs.find((job) => job.quoteStatus === 'Sent')!;
    let state = setQuoteStatus(structuredClone(seedState), estimate.id, 'Approved', '2026-08-30T10:00:00-05:00');
    state = updateJob(state, estimate.id, { scheduledFor:'2026-09-18T14:00:00-05:00', crew:'Fieldstead owner' }, 'Schedule confirmed', 'Synthetic visit added to the local schedule.', '2026-08-30T10:05:00-05:00');
    expect(state.jobs.find((job) => job.id === estimate.id)).toMatchObject({ quoteStatus:'Approved', status:'Scheduled', scheduledFor:'2026-09-18T14:00:00-05:00' });
    expect(state.activity.slice(0, 2).map((event) => event.action)).toEqual(['Schedule confirmed', 'Estimate approved']);
  });

  it('marks an invoice paid and clears the next action', () => {
    const overdue = seedState.jobs.find((job) => job.invoiceStatus === 'Overdue')!;
    const state = setInvoiceStatus(structuredClone(seedState), overdue.id, 'Paid', '2026-08-30T12:00:00-05:00');
    const job = state.jobs.find((item) => item.id === overdue.id)!;
    expect(job.paidAt).toBeTruthy();
    expect(nextAction(job).label).toBe('No action needed');
  });

  it('creates a uniquely numbered job with a draft quote and audit entry', () => {
    const state = createJob(structuredClone(seedState), { customerId:seedState.customers[0].id, service:'Workflow setup', quoteAmount:425 }, '2026-08-30T13:00:00-05:00');
    expect(state.jobs[0]).toMatchObject({ id:'FS-DEMO-1054', quoteStatus:'Draft', invoiceStatus:'Not created' });
    expect(state.activity[0]).toMatchObject({ jobId:'FS-DEMO-1054', actor:'Fieldstead owner' });
  });

  it('searches across customer, job and address fields while filtering status', () => {
    expect(searchJobs(seedState, 'northstar', 'All').length).toBeGreaterThan(0);
    expect(searchJobs(seedState, 'demo', 'All').length).toBeGreaterThan(0);
    expect(searchJobs(seedState, '', 'Completed')).toHaveLength(2);
  });

  it('appends owner activity without rewriting the existing audit trail', () => {
    const before = structuredClone(seedState.activity);
    const job = seedState.jobs.find((item) => item.status === 'Scheduled')!;
    const state = updateJob(structuredClone(seedState), job.id, { crew:'Fieldstead owner' }, 'Owner note added', 'Synthetic dogfood handoff confirmed.', '2026-09-15T09:00:00-05:00');

    expect(state.activity[0]).toMatchObject({ actor:'Fieldstead owner', action:'Owner note added' });
    expect(state.activity.slice(1)).toEqual(before);
  });
});
