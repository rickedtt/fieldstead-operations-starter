import { describe, expect, it } from 'vitest';
import {
  ROLE_CAPABILITIES,
  canTransitionJobStatus,
  parseCustomer,
  parseJob,
  parseOutboxOperation,
  parseServiceRequest,
} from './index';

describe('Fieldstead job status rules', () => {
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
