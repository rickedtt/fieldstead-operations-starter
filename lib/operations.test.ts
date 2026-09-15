import { describe, expect, it } from 'vitest';
import { advanceJob, createJob, nextAction, searchJobs, seedState, setInvoiceStatus, setQuoteStatus } from './operations';

describe('central operations flows', () => {
  it('moves a job through field status and creates an invoice draft on completion', () => {
    let state = structuredClone(seedState);
    state = advanceJob(state, 'HP-1048', '2026-08-30T08:35:00-05:00');
    state = advanceJob(state, 'HP-1048', '2026-08-30T08:50:00-05:00');
    state = advanceJob(state, 'HP-1048', '2026-08-30T10:20:00-05:00');
    const job = state.jobs.find((item) => item.id === 'HP-1048');
    expect(job).toMatchObject({ status:'Completed', invoiceStatus:'Draft' });
    expect(state.activity[0].action).toBe('Job moved to Completed');
  });

  it('approves a quote into scheduled work and records the handoff', () => {
    const state = setQuoteStatus(structuredClone(seedState), 'HP-1051', 'Approved', '2026-08-30T10:00:00-05:00');
    expect(state.jobs.find((job) => job.id === 'HP-1051')).toMatchObject({ quoteStatus:'Approved', status:'Scheduled' });
    expect(state.activity[0].action).toBe('Quote approved');
  });

  it('marks an invoice paid and clears the next action', () => {
    const state = setInvoiceStatus(structuredClone(seedState), 'HP-1044', 'Paid', '2026-08-30T12:00:00-05:00');
    const job = state.jobs.find((item) => item.id === 'HP-1044')!;
    expect(job.paidAt).toBeTruthy();
    expect(nextAction(job).label).toBe('No action needed');
  });

  it('creates a uniquely numbered job with a draft quote and audit entry', () => {
    const state = createJob(structuredClone(seedState), { customerId:'cus-ben', service:'Fence wash', quoteAmount:425 }, '2026-08-30T13:00:00-05:00');
    expect(state.jobs[0]).toMatchObject({ id:'HP-1054', quoteStatus:'Draft', invoiceStatus:'Not created' });
    expect(state.activity[0].jobId).toBe('HP-1054');
  });

  it('searches across customer, job and address fields while filtering status', () => {
    expect(searchJobs(seedState, 'maya', 'All')).toHaveLength(2);
    expect(searchJobs(seedState, 'lincoln', 'En route').map((job) => job.id)).toEqual(['HP-1049']);
    expect(searchJobs(seedState, '', 'Completed')).toHaveLength(2);
  });
});
