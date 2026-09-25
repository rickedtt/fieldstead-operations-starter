import { describe, expect, it } from 'vitest';
import {
  ROLE_CAPABILITIES,
  canTransitionJobStatus,
  parseCustomer,
  parseEstimate,
  parseEstimateLineItem,
  parseJob,
  parseOutboxOperation,
  parsePricebookItem,
  parseServiceRequest,
  scheduleEnd,
  schedulesOverlap,
} from './index';

describe('Fieldstead job status rules', () => {
  it('uses half-open time intervals for assignment conflict detection', () => {
    expect(scheduleEnd('2026-09-28T14:00:00.000Z', 2)).toBe('2026-09-28T16:00:00.000Z');
    expect(schedulesOverlap('2026-09-28T14:00:00.000Z', 2, '2026-09-28T15:59:00.000Z', 1)).toBe(true);
    expect(schedulesOverlap('2026-09-28T14:00:00.000Z', 2, '2026-09-28T16:00:00.000Z', 1)).toBe(false);
  });

  it('allows only supported forward and cancellation transitions', () => {
    expect(canTransitionJobStatus('Quoted', 'Scheduled')).toBe(true);
    expect(canTransitionJobStatus('Scheduled', 'En route')).toBe(true);
    expect(canTransitionJobStatus('En route', 'In progress')).toBe(true);
    expect(canTransitionJobStatus('In progress', 'Completed')).toBe(true);
    expect(canTransitionJobStatus('Scheduled', 'Canceled')).toBe(true);

    expect(canTransitionJobStatus('Quoted', 'Completed')).toBe(false);
    expect(canTransitionJobStatus('Completed', 'In progress')).toBe(false);
    expect(canTransitionJobStatus('Canceled', 'Scheduled')).toBe(false);
  });

  it('rejects malformed jobs at runtime', () => {
    expect(() => parseJob({ id: 'HP-2000', status: 'Unknown' })).toThrow(
      /Job\.customerId/,
    );
  });
});

describe('role capabilities', () => {
  it('keeps field crew permissions narrower than dispatch and ownership', () => {
    expect(ROLE_CAPABILITIES.owner_admin).toContain('manage_roles');
    expect(ROLE_CAPABILITIES.dispatcher).toContain('schedule_jobs');
    expect(ROLE_CAPABILITIES.dispatcher).not.toContain('manage_roles');
    expect(ROLE_CAPABILITIES.field_crew).toEqual([
      'view_assigned_jobs',
      'update_assigned_job_status',
      'record_activity',
    ]);
  });

  it('rejects outbox records without an operation id', () => {
    expect(() =>
      parseOutboxOperation({
        entityType: 'job',
        entityId: 'HP-2000',
        kind: 'job.update',
        payload: {},
        createdAt: '2026-09-04T12:00:00.000Z',
      }),
    ).toThrow(/OutboxOperation\.id/);
  });
});

describe('customer and service request records', () => {
  const audit = {
    createdAt: '2026-09-24T12:00:00.000Z', createdBy: 'owner-1',
    updatedAt: '2026-09-24T12:00:00.000Z', updatedBy: 'owner-1',
  };
  const sourceEmail = {
    accountId: 'mailbox-1', messageId: '<request-1@example.com>', normalizedFrom: 'jamie@example.com',
  };

  it('parses source email identity and audit metadata', () => {
    expect(parseCustomer({
      id: 'customer-1', displayName: 'Jamie Rivera', primaryEmail: 'jamie@example.com',
      sourceEmail, audit,
    })).toMatchObject({ id: 'customer-1', primaryEmail: 'jamie@example.com' });
    expect(parseServiceRequest({
      id: 'request-1', customerId: 'customer-1', summary: 'Gutter cleaning request',
      details: 'Please clean the gutters before October.', status: 'new', sourceEmail, audit,
    })).toMatchObject({ id: 'request-1', customerId: 'customer-1', status: 'new' });
  });

  it('rejects incomplete source email identity', () => {
    expect(() => parseCustomer({
      id: 'customer-1', displayName: 'Jamie Rivera',
      sourceEmail: { accountId: 'mailbox-1' }, audit,
    })).toThrow(/SourceEmailIdentity\.messageId/);
  });

  it('parses durable service-request linkage on converted requests and jobs', () => {
    expect(parseServiceRequest({
      id: 'request-1', customerId: 'customer-1', summary: 'Gutter cleaning request',
      details: 'Please clean the gutters before October.', status: 'converted',
      convertedJobId: 'HP-2001', sourceEmail, audit,
    })).toMatchObject({ status: 'converted', convertedJobId: 'HP-2001' });

    expect(parseJob({
      id: 'HP-2001', customerId: 'customer-1', serviceRequestId: 'request-1',
      service: 'Gutter cleaning request', description: 'Please clean the gutters before October.',
      quoteStatus: 'Draft', quoteAmount: 0, durationHours: 0, crew: 'Unassigned',
      status: 'Quoted', invoiceStatus: 'Not created', invoiceAmount: 0,
      createdAt: audit.createdAt, updatedAt: audit.updatedAt,
    })).toMatchObject({ serviceRequestId: 'request-1' });
  });
});

describe('pricebook and estimate records', () => {
  const audit = { createdAt: '2026-09-24T12:00:00.000Z', createdBy: 'owner-1', updatedAt: '2026-09-24T12:00:00.000Z', updatedBy: 'owner-1' };

  it('strictly parses integer-cent pricebook items and draft estimates', () => {
    expect(parsePricebookItem({ id: 'pb-1', name: 'Gutter cleaning', description: 'Per visit', unit: 'visit', unitPriceCents: 12550, active: true, audit })).toMatchObject({ unitPriceCents: 12550 });
    expect(parseEstimate({ id: 'est-1', jobId: 'HP-2000', status: 'Draft', subtotalCents: 25100, audit })).toMatchObject({ status: 'Draft', subtotalCents: 25100 });
    expect(parseEstimateLineItem({ id: 'line-1', estimateId: 'est-1', position: 0, description: 'Gutter cleaning', quantity: 2, unit: 'visit', unitPriceCents: 12550, lineTotalCents: 25100, pricebookItemId: 'pb-1', pricebookItemName: 'Gutter cleaning' })).toMatchObject({ lineTotalCents: 25100, pricebookItemName: 'Gutter cleaning' });
  });

  it('rejects fractional cents and inconsistent line totals', () => {
    expect(() => parsePricebookItem({ id: 'pb-1', name: 'Gutter cleaning', unit: 'visit', unitPriceCents: 12.5, active: true, audit })).toThrow(/integer/);
    expect(() => parseEstimateLineItem({ id: 'line-1', estimateId: 'est-1', position: 0, description: 'Gutter cleaning', quantity: 2, unit: 'visit', unitPriceCents: 12550, lineTotalCents: 1 })).toThrow(/lineTotalCents/);
  });
});
