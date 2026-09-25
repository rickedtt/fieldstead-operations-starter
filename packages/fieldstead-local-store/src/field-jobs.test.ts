import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { Job } from '../../fieldstead-domain/src';
import { createFieldsteadRepository, type FieldsteadRepository } from './index';

const databases: FieldsteadRepository[] = [];

function job(id: string, overrides: Partial<Job> = {}): Job {
  return {
    id, customerId: `customer-${id}`, service: 'Service visit', description: 'Complete the assigned work.',
    quoteStatus: 'Approved', quoteAmount: 200, scheduledFor: '2026-09-28T14:00:00.000Z', durationHours: 2,
    crew: 'Crew A', status: 'Scheduled', invoiceStatus: 'Not created', invoiceAmount: 200,
    createdAt: '2026-09-25T12:00:00.000Z', updatedAt: '2026-09-25T12:00:00.000Z', ...overrides,
  };
}

async function repository() {
  const repo = createFieldsteadRepository(`fieldstead-field-${crypto.randomUUID()}`);
  databases.push(repo);
  await repo.jobs.bulkAdd([job('JOB-1'), job('JOB-2')]);
  await repo.assignments.bulkAdd([
    { id: 'assignment-1', jobId: 'JOB-1', assigneeId: 'crew-a', assigneeName: 'Crew A', assignedAt: '2026-09-25T12:00:00.000Z' },
    { id: 'assignment-2', jobId: 'JOB-2', assigneeId: 'crew-b', assigneeName: 'Crew B', assignedAt: '2026-09-25T12:00:00.000Z' },
  ]);
  return repo;
}

afterEach(async () => Promise.all(databases.splice(0).map((repo) => repo.delete())));

describe('assigned field jobs', () => {
  it('lists only active jobs assigned to the authenticated crew member', async () => {
    const repo = await repository();
    await expect(repo.listAssignedJobs('crew-a')).resolves.toEqual([
      expect.objectContaining({ job: expect.objectContaining({ id: 'JOB-1' }) }),
    ]);
  });

  it('records append-only field transitions with audit, outbox, and idempotency', async () => {
    const repo = await repository();
    const input = { jobId: 'JOB-1', actorId: 'crew-a', actorRole: 'field_crew' as const, kind: 'arrive' as const, operationId: 'field-1', eventId: 'field-event-1', occurredAt: '2026-09-28T13:55:00.000Z' };
    expect((await repo.recordFieldEvent(input)).replayed).toBe(false);
    await expect(repo.getJob('JOB-1')).resolves.toMatchObject({ status: 'En route' });
    await expect(repo.fieldEvents.get('field-event-1')).resolves.toMatchObject({ kind: 'arrive', syncState: 'pending' });
    await expect(repo.outboxOperations.get('field-1')).resolves.toMatchObject({ kind: 'fieldEvent.append', entityType: 'fieldEvent' });
    expect((await repo.recordFieldEvent(input)).replayed).toBe(true);
    await expect(repo.fieldEvents.count()).resolves.toBe(1);
  });

  it('supports start, pause, resume, complete, and cancel while rejecting invalid transitions', async () => {
    const repo = await repository();
    const base = { jobId: 'JOB-1', actorId: 'crew-a', actorRole: 'field_crew' as const };
    await expect(repo.recordFieldEvent({ ...base, kind: 'complete', operationId: 'bad-1', eventId: 'bad-event-1', occurredAt: '2026-09-28T14:00:00.000Z' })).rejects.toThrow(/invalid field transition/i);
    for (const [index, kind] of (['arrive', 'start', 'pause', 'resume', 'complete'] as const).entries()) {
      await repo.recordFieldEvent({ ...base, kind, operationId: `field-${index}`, eventId: `event-${index}`, occurredAt: `2026-09-28T1${index}:00:00.000Z` });
    }
    await expect(repo.getJob('JOB-1')).resolves.toMatchObject({ status: 'Completed' });
    await expect(repo.listFieldEvents('JOB-1')).resolves.toHaveLength(5);
    await expect(repo.recordFieldEvent({ ...base, kind: 'cancel', operationId: 'late-cancel', eventId: 'late-cancel-event', occurredAt: '2026-09-28T19:00:00.000Z' })).rejects.toThrow(/invalid field transition/i);
  });

  it('enforces active assignment and crew role access', async () => {
    const repo = await repository();
    const action = { jobId: 'JOB-1', kind: 'arrive' as const, operationId: 'field-1', eventId: 'event-1', occurredAt: '2026-09-28T14:00:00.000Z' };
    await expect(repo.recordFieldEvent({ ...action, actorId: 'crew-b', actorRole: 'field_crew' })).rejects.toThrow(/assigned crew/i);
    await expect(repo.recordFieldEvent({ ...action, actorId: 'dispatcher-1', actorRole: 'dispatcher' })).rejects.toThrow(/field crew access/i);
  });

  it('appends notes and checklist changes and exposes conflicted records', async () => {
    const repo = await repository();
    const note = await repo.recordFieldEvent({ jobId: 'JOB-1', actorId: 'crew-a', actorRole: 'field_crew', kind: 'note', note: 'Gate code confirmed.', operationId: 'note-1', eventId: 'note-event-1', occurredAt: '2026-09-28T14:00:00.000Z' });
    expect(note.event.note).toBe('Gate code confirmed.');
    await repo.recordFieldEvent({ jobId: 'JOB-1', actorId: 'crew-a', actorRole: 'field_crew', kind: 'checklist', checklistItemId: 'protect-plants', checklistLabel: 'Protect plants', checklistCompleted: true, operationId: 'check-1', eventId: 'check-event-1', occurredAt: '2026-09-28T14:05:00.000Z' });
    await repo.markFieldEventConflicted('note-event-1', 'Remote event requires review.');
    await expect(repo.getFieldJobState('JOB-1', 'crew-a')).resolves.toMatchObject({
      checklist: [{ id: 'protect-plants', label: 'Protect plants', completed: true }],
      syncState: 'conflicted',
    });
  });
});
