import { describe, expect, it } from 'vitest';
import { advanceJob, createJob, nextAction, searchJobs, seedState, syntheticDemoState, setInvoiceStatus, setQuoteStatus, updateJob } from './operations';

describe('Fieldstead live workspace seed', () => {
  it('opens with no customer records or invented operational records', () => {
    expect(seedState.customers).toEqual([]);
    expect(seedState.jobs).toEqual([]);
    expect(seedState.activity).toEqual([]);
  });

  it('keeps synthetic workflow fixtures separate from the live dogfood seed', () => {
    expect(syntheticDemoState.jobs.length).toBeGreaterThan(0);
    expect(syntheticDemoState.customers.every((customer) => customer.notes.includes('Synthetic dogfood record'))).toBe(true);
  });
});

describe('central operations flows', () => {
  it('moves a job through field status and creates an invoice draft on completion', () => {
    let state = structuredClone(syntheticDemoState);
    const scheduled = state.jobs.find((job) => job.status === 'Scheduled')!;
    state = advanceJob(state, scheduled.id, '2026-08-30T08:35:00-05:00');
    state = advanceJob(state, scheduled.id, '2026-08-30T08:50:00-05:00');
    state = advanceJob(state, scheduled.id, '2026-08-30T10:20:00-05:00');
    const job = state.jobs.find((item) => item.id === scheduled.id);
    expect(job).toMatchObject({ status:'Completed', invoiceStatus:'Draft' });
    expect(state.activity[0].action).toBe('Job moved to Completed');
  });

  it('approves a quote into scheduled work and records the handoff', () => {
    const estimate = syntheticDemoState.jobs.find((job) => job.quoteStatus === 'Sent')!;
    let state = setQuoteStatus(structuredClone(syntheticDemoState), estimate.id, 'Approved', '2026-08-30T10:00:00-05:00');
    state = updateJob(state, estimate.id, { scheduledFor:'2026-09-18T14:00:00-05:00', crew:'Fieldstead owner' }, 'Schedule confirmed', 'Synthetic visit added to the local schedule.', '2026-08-30T10:05:00-05:00');
    expect(state.jobs.find((job) => job.id === estimate.id)).toMatchObject({ quoteStatus:'Approved', status:'Scheduled', scheduledFor:'2026-09-18T14:00:00-05:00' });
    expect(state.activity.slice(0, 2).map((event) => event.action)).toEqual(['Schedule confirmed', 'Estimate approved']);
  });

  it('flags approved work without a date for scheduling', () => {
    const estimate = syntheticDemoState.jobs.find((job) => job.quoteStatus === 'Sent')!;
    const approved = setQuoteStatus(structuredClone(syntheticDemoState), estimate.id, 'Approved', '2026-08-30T10:00:00-05:00').jobs.find((job) => job.id === estimate.id)!;
    expect(nextAction(approved)).toMatchObject({ label:'Schedule job', priority:'high' });
  });

  it('marks an invoice paid and clears the next action', () => {
    const overdue = syntheticDemoState.jobs.find((job) => job.invoiceStatus === 'Overdue')!;
    const state = setInvoiceStatus(structuredClone(syntheticDemoState), overdue.id, 'Paid', '2026-08-30T12:00:00-05:00');
    const job = state.jobs.find((item) => item.id === overdue.id)!;
    expect(job.paidAt).toBeTruthy();
    expect(nextAction(job).label).toBe('No action needed');
  });

  it('creates a uniquely numbered job with a draft quote and audit entry', () => {
    const state = createJob(structuredClone(syntheticDemoState), { customerId:syntheticDemoState.customers[0].id, service:'Workflow setup', quoteAmount:425 }, '2026-08-30T13:00:00-05:00');
    expect(state.jobs[0]).toMatchObject({ id:'FS-OPS-1054', quoteStatus:'Draft', invoiceStatus:'Not created' });
    expect(state.activity[0]).toMatchObject({ jobId:'FS-OPS-1054', actor:'Fieldstead owner' });
  });

  it('searches across customer, job and address fields while filtering status', () => {
    expect(searchJobs(syntheticDemoState, 'northstar', 'All').length).toBeGreaterThan(0);
    expect(searchJobs(syntheticDemoState, 'demo', 'All').length).toBeGreaterThan(0);
    expect(searchJobs(syntheticDemoState, '', 'Completed')).toHaveLength(2);
  });

  it('appends owner activity without rewriting the existing audit trail', () => {
    const before = structuredClone(syntheticDemoState.activity);
    const job = syntheticDemoState.jobs.find((item) => item.status === 'Scheduled')!;
    const state = updateJob(structuredClone(syntheticDemoState), job.id, { crew:'Fieldstead owner' }, 'Owner note added', 'Synthetic dogfood handoff confirmed.', '2026-09-15T09:00:00-05:00');

    expect(state.activity[0]).toMatchObject({ actor:'Fieldstead owner', action:'Owner note added' });
    expect(state.activity.slice(1)).toEqual(before);
  });
});
