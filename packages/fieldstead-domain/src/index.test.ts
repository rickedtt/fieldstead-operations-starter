import { describe, expect, it } from 'vitest';
import {
  ROLE_CAPABILITIES,
  canTransitionJobStatus,
  parseJob,
  parseOutboxOperation,
} from './index';

describe('Harbor & Pine job status rules', () => {
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
