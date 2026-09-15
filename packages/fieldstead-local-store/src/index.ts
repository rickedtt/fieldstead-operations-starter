import Dexie, { liveQuery, type EntityTable, type Observable } from 'dexie';
import {
  canTransitionJobStatus,
  parseActivityEvent,
  parseJob,
  parseOutboxOperation,
  type ActivityEvent,
  type Job,
  type JobAssignment,
  type OutboxOperation,
} from '../../fieldstead-domain/src';

export type StoreMetadata = {
  key: string;
  value: unknown;
  updatedAt: string;
};

export type JobMutation = {
  jobId: string;
  changes: Partial<Omit<Job, 'id' | 'createdAt'>>;
  operationId: string;
  occurredAt?: string;
  activityEvent?: ActivityEvent;
};

export type JobCreation = {
  job: Job;
  operationId: string;
  occurredAt?: string;
  activityEvent?: ActivityEvent;
};

export class FieldsteadRepository extends Dexie {
  jobs!: EntityTable<Job, 'id'>;
  assignments!: EntityTable<JobAssignment, 'id'>;
  activityEvents!: EntityTable<ActivityEvent, 'id'>;
  outboxOperations!: EntityTable<OutboxOperation, 'id'>;
  metadata!: EntityTable<StoreMetadata, 'key'>;

  constructor(databaseName = 'fieldstead') {
    super(databaseName);

    this.version(1).stores({
      jobs: 'id, customerId, status, updatedAt',
      assignments: 'id, jobId, assigneeId, assignedAt',
      activityEvents: 'id, jobId, customerId, at',
      outboxOperations: 'id, status, createdAt, [entityType+entityId]',
      metadata: 'key, updatedAt',
    });
  }

  getJob(jobId: string): Promise<Job | undefined> {
    return this.jobs.get(jobId);
  }

  listJobs(): Promise<Job[]> {
    return this.jobs.orderBy('updatedAt').reverse().toArray();
  }

  observeJobs(): Observable<Job[]> {
    return liveQuery(() => this.listJobs());
  }

  listPendingOperations(): Promise<OutboxOperation[]> {
    return this.outboxOperations.where('status').equals('pending').sortBy('createdAt');
  }

  async seedJobsIfEmpty(jobs: Job[]): Promise<boolean> {
    return this.transaction('rw', this.jobs, async () => {
      if ((await this.jobs.count()) > 0) return false;
      await this.jobs.bulkAdd(jobs.map(parseJob));
      return true;
    });
  }

  async restoreSeedJobs(jobs: Job[]): Promise<void> {
    await this.transaction('rw', this.jobs, async () => {
      await this.jobs.clear();
      await this.jobs.bulkAdd(jobs.map(parseJob));
    });
  }

  async createJob(creation: JobCreation): Promise<Job> {
    const occurredAt = creation.occurredAt ?? new Date().toISOString();
    const job = parseJob(creation.job);
    const operation = parseOutboxOperation({
      id: creation.operationId,
      entityType: 'job',
      entityId: job.id,
      kind: 'job.create',
      payload: { ...job },
      createdAt: occurredAt,
      status: 'pending',
    });

    return this.transaction(
      'rw',
      this.jobs,
      this.activityEvents,
      this.outboxOperations,
      async () => {
        await this.jobs.add(job);
        await this.outboxOperations.add(operation);
        if (creation.activityEvent) {
          await this.activityEvents.add(parseActivityEvent(creation.activityEvent));
        }
        return job;
      },
    );
  }

  async mutateJob(mutation: JobMutation): Promise<Job> {
    const occurredAt = mutation.occurredAt ?? new Date().toISOString();

    return this.transaction(
      'rw',
      this.jobs,
      this.activityEvents,
      this.outboxOperations,
      async () => {
        const current = await this.jobs.get(mutation.jobId);
        if (!current) throw new Error(`Job ${mutation.jobId} was not found`);

        const nextStatus = mutation.changes.status;
        if (
          nextStatus !== undefined &&
          nextStatus !== current.status &&
          !canTransitionJobStatus(current.status, nextStatus)
        ) {
          throw new Error(
            `Unsupported job status transition: ${current.status} -> ${nextStatus}`,
          );
        }

        const updated = parseJob({
          ...current,
          ...mutation.changes,
          id: current.id,
          createdAt: current.createdAt,
          updatedAt: occurredAt,
        });
        const operation = parseOutboxOperation({
          id: mutation.operationId,
          entityType: 'job',
          entityId: current.id,
          kind: 'job.update',
          payload: mutation.changes,
          createdAt: occurredAt,
          status: 'pending',
        });

        await this.jobs.put(updated);
        await this.outboxOperations.add(operation);
        if (mutation.activityEvent) {
          await this.activityEvents.add(parseActivityEvent(mutation.activityEvent));
        }

        return updated;
      },
    );
  }
}

export function createFieldsteadRepository(
  databaseName?: string,
): FieldsteadRepository {
  return new FieldsteadRepository(databaseName);
}
