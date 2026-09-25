import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { Job } from '../../fieldstead-domain/src';
import { createFieldsteadRepository, type FieldsteadRepository } from './index';

const databases: FieldsteadRepository[] = [];

function job(id: string, overrides: Partial<Job> = {}): Job {
  return {
    id, customerId: `customer-${id}`, service: 'Service visit', description: 'Scheduled work.',
    quoteStatus: 'Approved', quoteAmount: 200, durationHours: 2, crew: 'Unassigned',
    status: 'Quoted', invoiceStatus: 'Not created', invoiceAmount: 200,
    createdAt: '2026-09-25T12:00:00.000Z', updatedAt: '2026-09-25T12:00:00.000Z',
    ...overrides,
  };
}

async function repository() {
  const repo = createFieldsteadRepository(`fieldstead-dispatch-${crypto.randomUUID()}`);
  databases.push(repo);
  await repo.jobs.bulkAdd([job('JOB-1'), job('JOB-2'), job('JOB-3')]);
  return repo;
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map((repo) => repo.delete()));
});

describe('dispatch scheduling transactions', () => {
  it('schedules and assigns atomically with audit, outbox, idempotency, and legacy fields', async () => {
    const repo = await repository();
    const input = {
      jobId: 'JOB-1', scheduledFor: '2026-09-28T14:00:00.000Z', durationHours: 2,
      assigneeId: 'crew-a', assigneeName: 'Crew A', actorId: 'dispatcher-1', actorRole: 'dispatcher' as const,
      operationId: 'dispatch-1', auditEventId: 'audit-dispatch-1', occurredAt: '2026-09-25T15:00:00.000Z',
    };

    expect((await repo.scheduleJob(input)).replayed).toBe(false);
    await expect(repo.getJob('JOB-1')).resolves.toMatchObject({
      scheduledFor: input.scheduledFor, durationHours: 2, crew: 'Crew A', status: 'Scheduled',
    });
    await expect(repo.listActiveAssignments('JOB-1')).resolves.toEqual([
      expect.objectContaining({ jobId: 'JOB-1', assigneeId: 'crew-a', assigneeName: 'Crew A' }),
    ]);
    await expect(repo.activityEvents.get('audit-dispatch-1')).resolves.toMatchObject({ action: 'Job scheduled' });
    await expect(repo.outboxOperations.get('dispatch-1')).resolves.toMatchObject({ kind: 'job.schedule' });
    expect((await repo.scheduleJob(input)).replayed).toBe(true);
    await expect(repo.assignments.count()).resolves.toBe(1);
    await expect(repo.activityEvents.count()).resolves.toBe(1);
  });

  it('rejects overlapping active assignments unless owner or dispatcher records an override reason', async () => {
    const repo = await repository();
    await repo.scheduleJob({
      jobId: 'JOB-1', scheduledFor: '2026-09-28T14:00:00.000Z', durationHours: 2,
      assigneeId: 'crew-a', assigneeName: 'Crew A', actorId: 'dispatcher-1', actorRole: 'dispatcher',
      operationId: 'dispatch-1', auditEventId: 'audit-1', occurredAt: '2026-09-25T15:00:00.000Z',
    });
    const conflicting = {
      jobId: 'JOB-2', scheduledFor: '2026-09-28T15:00:00.000Z', durationHours: 2,
      assigneeId: 'crew-a', assigneeName: 'Crew A', actorId: 'dispatcher-1', actorRole: 'dispatcher' as const,
      operationId: 'dispatch-2', auditEventId: 'audit-2', occurredAt: '2026-09-25T15:05:00.000Z',
    };

    await expect(repo.scheduleJob(conflicting)).rejects.toThrow(/conflicts with JOB-1/i);
    const rejectedJob = await repo.getJob('JOB-2');
    expect(rejectedJob?.scheduledFor).toBeUndefined();
    expect(rejectedJob?.crew).toBe('Unassigned');
    expect((await repo.scheduleJob({ ...conflicting, conflictOverrideReason: 'Customer emergency approved by dispatch.' })).replayed).toBe(false);
    await expect(repo.activityEvents.get('audit-2')).resolves.toMatchObject({ detail: expect.stringMatching(/override.*Customer emergency/i) });
    await expect(repo.outboxOperations.get('dispatch-2')).resolves.toMatchObject({ payload: expect.objectContaining({ conflictOverrideReason: 'Customer emergency approved by dispatch.' }) });
  });

  it('does not treat adjacent visits or the same job reschedule as conflicts', async () => {
    const repo = await repository();
    await repo.scheduleJob({ jobId: 'JOB-1', scheduledFor: '2026-09-28T14:00:00.000Z', durationHours: 2, assigneeId: 'crew-a', assigneeName: 'Crew A', actorId: 'dispatcher-1', actorRole: 'dispatcher', operationId: 'dispatch-1', auditEventId: 'audit-1', occurredAt: '2026-09-25T15:00:00.000Z' });
    await expect(repo.scheduleJob({ jobId: 'JOB-2', scheduledFor: '2026-09-28T16:00:00.000Z', durationHours: 1, assigneeId: 'crew-a', assigneeName: 'Crew A', actorId: 'dispatcher-1', actorRole: 'dispatcher', operationId: 'dispatch-2', auditEventId: 'audit-2', occurredAt: '2026-09-25T15:05:00.000Z' })).resolves.toMatchObject({ replayed: false });
    await expect(repo.scheduleJob({ jobId: 'JOB-1', scheduledFor: '2026-09-28T13:00:00.000Z', durationHours: 1, assigneeId: 'crew-a', assigneeName: 'Crew A', actorId: 'dispatcher-1', actorRole: 'dispatcher', operationId: 'dispatch-3', auditEventId: 'audit-3', occurredAt: '2026-09-25T15:10:00.000Z' })).resolves.toMatchObject({ replayed: false });
    await expect(repo.listActiveAssignments('JOB-1')).resolves.toHaveLength(1);
  });

  it('unassigns without clearing the schedule and unschedules without changing job status backward', async () => {
    const repo = await repository();
    await repo.scheduleJob({ jobId: 'JOB-1', scheduledFor: '2026-09-28T14:00:00.000Z', durationHours: 2, assigneeId: 'crew-a', assigneeName: 'Crew A', actorId: 'dispatcher-1', actorRole: 'dispatcher', operationId: 'dispatch-1', auditEventId: 'audit-1', occurredAt: '2026-09-25T15:00:00.000Z' });
    await repo.unassignJob({ jobId: 'JOB-1', actorId: 'dispatcher-1', actorRole: 'dispatcher', operationId: 'unassign-1', auditEventId: 'audit-unassign-1', occurredAt: '2026-09-25T16:00:00.000Z' });
    await expect(repo.getJob('JOB-1')).resolves.toMatchObject({ scheduledFor: '2026-09-28T14:00:00.000Z', crew: 'Unassigned', status: 'Scheduled' });
    await expect(repo.listActiveAssignments('JOB-1')).resolves.toEqual([]);
    await repo.unscheduleJob({ jobId: 'JOB-1', actorId: 'dispatcher-1', actorRole: 'dispatcher', operationId: 'unschedule-1', auditEventId: 'audit-unschedule-1', occurredAt: '2026-09-25T17:00:00.000Z' });
    const saved = await repo.getJob('JOB-1');
    expect(saved?.scheduledFor).toBeUndefined();
    expect(saved?.status).toBe('Scheduled');
  });

  it('lists unscheduled work and deterministic day/week calendar entries using UTC boundaries', async () => {
    const repo = await repository();
    await repo.jobs.put(job('JOB-A', { updatedAt: '2026-09-25T13:00:00.000Z' }));
    await repo.scheduleJob({ jobId: 'JOB-2', scheduledFor: '2026-09-28T23:00:00.000Z', durationHours: 1, assigneeId: 'crew-b', assigneeName: 'Crew B', actorId: 'dispatcher-1', actorRole: 'dispatcher', operationId: 'dispatch-2', auditEventId: 'audit-2', occurredAt: '2026-09-25T15:00:00.000Z' });
    await repo.scheduleJob({ jobId: 'JOB-1', scheduledFor: '2026-09-28T14:00:00.000Z', durationHours: 2, assigneeId: 'crew-a', assigneeName: 'Crew A', actorId: 'dispatcher-1', actorRole: 'dispatcher', operationId: 'dispatch-1', auditEventId: 'audit-1', occurredAt: '2026-09-25T15:00:00.000Z' });

    await expect(repo.listUnscheduledJobs()).resolves.toEqual([
      expect.objectContaining({ id: 'JOB-A' }), expect.objectContaining({ id: 'JOB-3' }),
    ]);
    await expect(repo.listCalendarEntries('2026-09-28T00:00:00.000Z', '2026-09-29T00:00:00.000Z')).resolves.toEqual([
      expect.objectContaining({ job: expect.objectContaining({ id: 'JOB-1' }) }),
      expect.objectContaining({ job: expect.objectContaining({ id: 'JOB-2' }) }),
    ]);
  });

  it('requires scheduling capability and a non-empty override reason', async () => {
    const repo = await repository();
    await expect(repo.scheduleJob({ jobId: 'JOB-1', scheduledFor: '2026-09-28T14:00:00.000Z', durationHours: 2, assigneeId: 'crew-a', assigneeName: 'Crew A', actorId: 'crew-1', actorRole: 'field_crew', operationId: 'dispatch-1', auditEventId: 'audit-1', occurredAt: '2026-09-25T15:00:00.000Z' })).rejects.toThrow(/owner or dispatcher/i);
    await expect(repo.scheduleJob({ jobId: 'JOB-1', scheduledFor: '2026-09-28T14:00:00.000Z', durationHours: 0, assigneeId: 'crew-a', assigneeName: 'Crew A', actorId: 'dispatcher-1', actorRole: 'dispatcher', operationId: 'dispatch-2', auditEventId: 'audit-2', occurredAt: '2026-09-25T15:00:00.000Z' })).rejects.toThrow(/duration/i);
  });
});
