import Dexie, { liveQuery, type EntityTable, type Observable } from 'dexie';
import {
  canTransitionJobStatus,
  parseActivityEvent,
  parseCustomer,
  parseJob,
  parseOutboxOperation,
  parseServiceRequest,
  type ActivityEvent,
  type Customer,
  type Job,
  type JobAssignment,
  type OutboxOperation,
  type ServiceRequest,
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

export type CustomerUpdate = {
  customerId: string;
  changes: Partial<Pick<Customer, 'displayName' | 'primaryEmail'>>;
  updatedAt: string;
  updatedBy: string;
};

export type ServiceRequestUpdate = {
  serviceRequestId: string;
  changes: Partial<Pick<ServiceRequest, 'customerId' | 'summary' | 'details' | 'status'>>;
  updatedAt: string;
  updatedBy: string;
};

function sourceEmailKey(record: Customer | ServiceRequest): [string, string] {
  return [record.sourceEmail.accountId, record.sourceEmail.messageId];
}

function sameRecord(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export class FieldsteadRepository extends Dexie {
  jobs!: EntityTable<Job, 'id'>;
  assignments!: EntityTable<JobAssignment, 'id'>;
  activityEvents!: EntityTable<ActivityEvent, 'id'>;
  outboxOperations!: EntityTable<OutboxOperation, 'id'>;
  metadata!: EntityTable<StoreMetadata, 'key'>;
  customers!: EntityTable<Customer, 'id'>;
  serviceRequests!: EntityTable<ServiceRequest, 'id'>;

  constructor(databaseName = 'fieldstead') {
    super(databaseName);

    this.version(1).stores({
      jobs: 'id, customerId, status, updatedAt',
      assignments: 'id, jobId, assigneeId, assignedAt',
      activityEvents: 'id, jobId, customerId, at',
      outboxOperations: 'id, status, createdAt, [entityType+entityId]',
      metadata: 'key, updatedAt',
    });

    this.version(2).stores({
      jobs: 'id, customerId, status, updatedAt',
      assignments: 'id, jobId, assigneeId, assignedAt',
      activityEvents: 'id, jobId, customerId, at',
      outboxOperations: 'id, status, createdAt, [entityType+entityId]',
      metadata: 'key, updatedAt',
      customers: 'id, primaryEmail, audit.updatedAt, &[sourceEmail.accountId+sourceEmail.messageId]',
      serviceRequests: 'id, customerId, status, audit.updatedAt, &[sourceEmail.accountId+sourceEmail.messageId]',
    });
  }

  getCustomer(customerId: string): Promise<Customer | undefined> {
    return this.customers.get(customerId);
  }

  listCustomers(): Promise<Customer[]> {
    return this.customers.orderBy('audit.updatedAt').reverse().toArray();
  }

  findCustomerBySourceEmail(accountId: string, messageId: string): Promise<Customer | undefined> {
    return this.customers.where('[sourceEmail.accountId+sourceEmail.messageId]')
      .equals([accountId, messageId]).first();
  }

  getServiceRequest(requestId: string): Promise<ServiceRequest | undefined> {
    return this.serviceRequests.get(requestId);
  }

  listServiceRequestsForCustomer(customerId: string): Promise<ServiceRequest[]> {
    return this.serviceRequests.where('customerId').equals(customerId).sortBy('audit.updatedAt');
  }

  async createCustomer(value: Customer): Promise<Customer> {
    const customer = parseCustomer(value);
    return this.transaction('rw', this.customers, async () => {
      const existing = await this.findCustomerBySourceEmail(...sourceEmailKey(customer));
      if (existing) {
        if (sameRecord(existing, customer)) return existing;
        throw new Error('Customer source email identity was already used');
      }
      await this.customers.add(customer);
      return customer;
    });
  }

  async createServiceRequest(value: ServiceRequest): Promise<ServiceRequest> {
    const request = parseServiceRequest(value);
    return this.transaction('rw', this.serviceRequests, async () => {
      const existing = await this.serviceRequests
        .where('[sourceEmail.accountId+sourceEmail.messageId]')
        .equals(sourceEmailKey(request)).first();
      if (existing) {
        if (sameRecord(existing, request)) return existing;
        throw new Error('Service request source email identity was already used');
      }
      await this.serviceRequests.add(request);
      return request;
    });
  }

  async updateCustomer(update: CustomerUpdate): Promise<Customer> {
    return this.transaction('rw', this.customers, async () => {
      const current = await this.customers.get(update.customerId);
      if (!current) throw new Error(`Customer ${update.customerId} was not found`);
      const updated = parseCustomer({
        ...current,
        ...update.changes,
        id: current.id,
        sourceEmail: current.sourceEmail,
        audit: {
          ...current.audit,
          updatedAt: update.updatedAt,
          updatedBy: update.updatedBy,
        },
      });
      await this.customers.put(updated);
      return updated;
    });
  }

  async updateServiceRequest(update: ServiceRequestUpdate): Promise<ServiceRequest> {
    return this.transaction('rw', this.serviceRequests, async () => {
      const current = await this.serviceRequests.get(update.serviceRequestId);
      if (!current) throw new Error(`Service request ${update.serviceRequestId} was not found`);
      const updated = parseServiceRequest({
        ...current,
        ...update.changes,
        id: current.id,
        sourceEmail: current.sourceEmail,
        audit: {
          ...current.audit,
          updatedAt: update.updatedAt,
          updatedBy: update.updatedBy,
        },
      });
      await this.serviceRequests.put(updated);
      return updated;
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
