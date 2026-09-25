import Dexie, { liveQuery, type EntityTable, type Observable } from 'dexie';
import {
  canTransitionJobStatus,
  parseActivityEvent,
  parseCustomer,
  parseEstimate,
  parseEstimateLineItem,
  parseJob,
  parseOperationalAttachment,
  parseOutboxOperation,
  parsePricebookItem,
  parseServiceRequest,
  type ActivityEvent,
  type Customer,
  type Estimate,
  type EstimateLineItem,
  type Job,
  type JobAssignment,
  type OutboxOperation,
  type OperationalAttachment,
  type PricebookItem,
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

export type CustomerCreation = {
  customer: Customer;
  operationId: string;
  occurredAt: string;
  activityEvent: ActivityEvent;
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

export type ServiceRequestJobConversion = {
  serviceRequestId: string;
  jobId: string;
  operationId: string;
  actorId: string;
  actorRole: 'owner_admin' | 'dispatcher' | 'field_crew';
  occurredAt: string;
  auditEventId: string;
};

export type EmailIntakeConversion = {
  operationId: string;
  approval: 'customer-only' | 'request-only' | 'customer-and-request';
  customer?: Customer;
  serviceRequest?: ServiceRequest;
  auditEvents: ActivityEvent[];
  outboxOperations: OutboxOperation[];
};

export type AttachmentAdd = {
  attachment: OperationalAttachment;
  actorId: string;
  actorRole: 'owner_admin' | 'dispatcher' | 'field_crew';
  auditEventId: string;
};

export type AttachmentDelete = {
  attachmentId: string;
  actorId: string;
  actorRole: 'owner_admin' | 'dispatcher' | 'field_crew';
  occurredAt: string;
  auditEventId: string;
};

export type EstimateSave = { operationId: string; actorId: string; actorRole: 'owner_admin' | 'dispatcher' | 'field_crew'; occurredAt: string; auditEventId: string; estimate: Estimate; lines: EstimateLineItem[] };

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
  attachments!: EntityTable<OperationalAttachment, 'id'>;
  pricebookItems!: EntityTable<PricebookItem, 'id'>;
  estimates!: EntityTable<Estimate, 'id'>;
  estimateLineItems!: EntityTable<EstimateLineItem, 'id'>;

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
    this.version(3).stores({
      jobs: 'id, customerId, status, updatedAt',
      assignments: 'id, jobId, assigneeId, assignedAt',
      activityEvents: 'id, jobId, customerId, at',
      outboxOperations: 'id, status, createdAt, [entityType+entityId]',
      metadata: 'key, updatedAt',
      customers: 'id, primaryEmail, primaryPhone, serviceAddress, audit.updatedAt, &[sourceEmail.accountId+sourceEmail.messageId]',
      serviceRequests: 'id, customerId, status, audit.updatedAt, &[sourceEmail.accountId+sourceEmail.messageId]',
    });
    this.version(4).stores({
      jobs: 'id, customerId, serviceRequestId, status, updatedAt',
      assignments: 'id, jobId, assigneeId, assignedAt',
      activityEvents: 'id, jobId, customerId, at',
      outboxOperations: 'id, status, createdAt, [entityType+entityId]',
      metadata: 'key, updatedAt',
      customers: 'id, primaryEmail, primaryPhone, serviceAddress, audit.updatedAt, &[sourceEmail.accountId+sourceEmail.messageId]',
      serviceRequests: 'id, customerId, status, convertedJobId, audit.updatedAt, &[sourceEmail.accountId+sourceEmail.messageId]',
    });
    this.version(5).stores({
      jobs: 'id, customerId, serviceRequestId, status, updatedAt',
      assignments: 'id, jobId, assigneeId, assignedAt',
      activityEvents: 'id, jobId, customerId, at',
      outboxOperations: 'id, status, createdAt, [entityType+entityId]',
      metadata: 'key, updatedAt',
      customers: 'id, primaryEmail, primaryPhone, serviceAddress, audit.updatedAt, &[sourceEmail.accountId+sourceEmail.messageId]',
      serviceRequests: 'id, customerId, status, convertedJobId, audit.updatedAt, &[sourceEmail.accountId+sourceEmail.messageId]',
      attachments: 'id, [ownerType+ownerId], createdAt, checksum',
    });
    this.version(6).stores({
      jobs: 'id, customerId, serviceRequestId, status, updatedAt',
      assignments: 'id, jobId, assigneeId, assignedAt',
      activityEvents: 'id, jobId, customerId, at',
      outboxOperations: 'id, status, createdAt, [entityType+entityId]',
      metadata: 'key, updatedAt',
      customers: 'id, primaryEmail, primaryPhone, serviceAddress, audit.updatedAt, &[sourceEmail.accountId+sourceEmail.messageId]',
      serviceRequests: 'id, customerId, status, convertedJobId, audit.updatedAt, &[sourceEmail.accountId+sourceEmail.messageId]',
      attachments: 'id, [ownerType+ownerId], createdAt, checksum',
      pricebookItems: 'id, name, active, audit.updatedAt',
      estimates: 'id, &jobId, status, audit.updatedAt',
      estimateLineItems: 'id, estimateId, [estimateId+position]',
    });
  }

  async listPricebookItems(): Promise<PricebookItem[]> { return this.pricebookItems.orderBy('name').toArray(); }

  async savePricebookItem(input: { item: PricebookItem; operationId: string; actorId: string; actorRole: 'owner_admin' | 'dispatcher' | 'field_crew'; occurredAt: string; auditEventId: string }): Promise<{ replayed: boolean; item: PricebookItem }> {
    if (input.actorRole !== 'owner_admin') throw new Error('Owner approval is required to save a pricebook item');
    const item = parsePricebookItem(input.item);
    const fingerprint = JSON.stringify({ actorId: input.actorId, item });
    const key = `pricebook-save:${input.operationId}`;
    return this.transaction('rw', this.pricebookItems, this.activityEvents, this.outboxOperations, this.metadata, async () => {
      const prior = await this.metadata.get(key);
      if (prior) {
        if (prior.value !== fingerprint) throw new Error('Pricebook idempotency key reused with different content');
        const saved = await this.pricebookItems.get(item.id);
        if (!saved) throw new Error('Pricebook replay is incomplete');
        return { replayed: true, item: saved };
      }
      const event = parseActivityEvent({ id: input.auditEventId, at: input.occurredAt, actor: input.actorId, action: 'Pricebook item saved', detail: `${item.name} saved at ${(item.unitPriceCents / 100).toFixed(2)} per ${item.unit}.` });
      const operation = parseOutboxOperation({ id: input.operationId, entityType: 'pricebookItem', entityId: item.id, kind: 'pricebookItem.save', payload: { ...item }, createdAt: input.occurredAt, status: 'pending' });
      await this.pricebookItems.put(item);
      await this.activityEvents.add(event);
      await this.outboxOperations.add(operation);
      await this.metadata.add({ key, value: fingerprint, updatedAt: input.occurredAt });
      return { replayed: false, item };
    });
  }

  async getEstimateForJob(jobId: string): Promise<{ estimate: Estimate; lines: EstimateLineItem[] } | undefined> {
    const estimate = await this.estimates.where('jobId').equals(jobId).first();
    if (!estimate) return undefined;
    return { estimate, lines: await this.estimateLineItems.where('estimateId').equals(estimate.id).sortBy('position') };
  }

  async saveEstimate(input: EstimateSave): Promise<{ replayed: boolean; estimate: Estimate; lines: EstimateLineItem[] }> {
    if (input.actorRole !== 'owner_admin') throw new Error('Owner approval is required to save an estimate');
    if (input.lines.length > 100) throw new Error('An estimate may contain at most 100 lines');
    const estimate = parseEstimate(input.estimate);
    const lines = input.lines.map(parseEstimateLineItem);
    const fingerprint = JSON.stringify({ actorId: input.actorId, estimate, lines });
    const key = `estimate-save:${input.operationId}`;
    const prior = await this.metadata.get(key);
    if (prior) {
      if (prior.value !== fingerprint) throw new Error('Estimate idempotency key reused with different content');
      const saved = await this.getEstimateForJob(estimate.jobId);
      if (!saved) throw new Error('Estimate replay is incomplete');
      return { replayed: true, ...saved };
    }
    if (lines.some((line) => line.estimateId !== estimate.id)) throw new Error('Estimate line belongs to a different estimate');
    const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
    if (!Number.isSafeInteger(subtotalCents) || subtotalCents !== estimate.subtotalCents) throw new Error('Estimate subtotal does not match its lines');
    return this.transaction('rw', [this.jobs, this.estimates, this.estimateLineItems, this.activityEvents, this.outboxOperations, this.metadata], async () => {
      const priorInTransaction = await this.metadata.get(key);
      if (priorInTransaction) {
        if (priorInTransaction.value !== fingerprint) throw new Error('Estimate idempotency key reused with different content');
        const saved = await this.getEstimateForJob(estimate.jobId);
        if (!saved) throw new Error('Estimate replay is incomplete');
        return { replayed: true, ...saved };
      }
      const job = await this.jobs.get(estimate.jobId);
      if (!job) throw new Error(`Job ${estimate.jobId} was not found`);
      const existing = await this.estimates.where('jobId').equals(estimate.jobId).first();
      if (existing && existing.id !== estimate.id) throw new Error('Job already has a different estimate');
      const event = parseActivityEvent({ id: input.auditEventId, at: input.occurredAt, jobId: job.id, customerId: job.customerId, actor: input.actorId, action: 'Estimate saved', detail: `${lines.length} line item(s), ${(subtotalCents / 100).toFixed(2)} subtotal. Draft only; nothing sent.` });
      const operation = parseOutboxOperation({ id: input.operationId, entityType: 'estimate', entityId: estimate.id, kind: 'estimate.save', payload: { estimate, lines }, createdAt: input.occurredAt, status: 'pending' });
      await this.estimates.put(estimate);
      await this.estimateLineItems.where('estimateId').equals(estimate.id).delete();
      if (lines.length) await this.estimateLineItems.bulkAdd(lines);
      await this.jobs.put(parseJob({ ...job, quoteAmount: subtotalCents / 100, quoteStatus: 'Draft', updatedAt: input.occurredAt }));
      await this.activityEvents.add(event);
      await this.outboxOperations.add(operation);
      await this.metadata.add({ key, value: fingerprint, updatedAt: input.occurredAt });
      return { replayed: false, estimate, lines };
    });
  }

  listAttachments(ownerType: OperationalAttachment['ownerType'], ownerId: string): Promise<OperationalAttachment[]> {
    return this.attachments.where('[ownerType+ownerId]').equals([ownerType, ownerId]).sortBy('createdAt');
  }

  async recordAttachmentAdded(input: AttachmentAdd): Promise<OperationalAttachment> {
    if (input.actorRole !== 'owner_admin') throw new Error('Owner approval is required to add an attachment');
    const attachment = parseOperationalAttachment(input.attachment);
    const event = parseActivityEvent({
      id: input.auditEventId, at: attachment.createdAt,
      jobId: attachment.ownerType === 'job' ? attachment.ownerId : undefined,
      actor: input.actorId, action: 'Attachment added',
      detail: `${attachment.filename} added to ${attachment.ownerType} ${attachment.ownerId}.`,
    });
    return this.transaction('rw', this.attachments, this.activityEvents, async () => {
      await this.attachments.add(attachment);
      await this.activityEvents.add(event);
      return attachment;
    });
  }

  async recordAttachmentDeleted(input: AttachmentDelete): Promise<OperationalAttachment> {
    if (input.actorRole !== 'owner_admin') throw new Error('Owner approval is required to delete an attachment');
    return this.transaction('rw', this.attachments, this.activityEvents, async () => {
      const attachment = await this.attachments.get(input.attachmentId);
      if (!attachment) throw new Error(`Attachment ${input.attachmentId} was not found`);
      const event = parseActivityEvent({
        id: input.auditEventId, at: input.occurredAt,
        jobId: attachment.ownerType === 'job' ? attachment.ownerId : undefined,
        actor: input.actorId, action: 'Attachment deleted',
        detail: `${attachment.filename} deleted from ${attachment.ownerType} ${attachment.ownerId}.`,
      });
      await this.attachments.delete(attachment.id);
      await this.activityEvents.add(event);
      return attachment;
    });
  }

  getCustomer(customerId: string): Promise<Customer | undefined> {
    return this.customers.get(customerId);
  }

  listCustomers(): Promise<Customer[]> {
    return this.customers.orderBy('audit.updatedAt').reverse().toArray();
  }

  observeCustomers(): Observable<Customer[]> {
    return liveQuery(() => this.listCustomers());
  }

  listActivityEvents(): Promise<ActivityEvent[]> {
    return this.activityEvents.orderBy('at').reverse().toArray();
  }

  observeActivityEvents(): Observable<ActivityEvent[]> {
    return liveQuery(() => this.listActivityEvents());
  }

  async convertEmailIntake(input: EmailIntakeConversion): Promise<{ replayed: boolean; customer?: Customer; serviceRequest?: ServiceRequest }> {
    const customer = input.customer ? parseCustomer(input.customer) : undefined;
    const serviceRequest = input.serviceRequest ? parseServiceRequest(input.serviceRequest) : undefined;
    const auditEvents = input.auditEvents.map(parseActivityEvent);
    const outboxOperations = input.outboxOperations.map(parseOutboxOperation);
    const fingerprint = JSON.stringify({ approval: input.approval, customer, serviceRequest, auditEvents, outboxOperations });
    const key = `email-intake-conversion:${input.operationId}`;
    return this.transaction('rw', this.customers, this.serviceRequests, this.activityEvents, this.outboxOperations, this.metadata, async () => {
      const prior = await this.metadata.get(key);
      if (prior) {
        if (prior.value !== fingerprint) throw new Error('Email intake idempotency key reused with different content');
        return { replayed: true, customer, serviceRequest };
      }
      if (customer) await this.customers.add(customer);
      if (serviceRequest) await this.serviceRequests.add(serviceRequest);
      if (auditEvents.length) await this.activityEvents.bulkAdd(auditEvents);
      if (outboxOperations.length) await this.outboxOperations.bulkAdd(outboxOperations);
      await this.metadata.add({ key, value: fingerprint, updatedAt: outboxOperations[0]?.createdAt ?? auditEvents[0]?.at ?? new Date().toISOString() });
      return { replayed: false, customer, serviceRequest };
    });
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

  async createCustomerRecord(creation: CustomerCreation): Promise<Customer> {
    const customer = parseCustomer(creation.customer);
    const event = parseActivityEvent(creation.activityEvent);
    const operation = parseOutboxOperation({
      id: creation.operationId,
      entityType: 'customer',
      entityId: customer.id,
      kind: 'customer.create',
      payload: { ...customer },
      createdAt: creation.occurredAt,
      status: 'pending',
    });
    return this.transaction(
      'rw',
      this.customers,
      this.activityEvents,
      this.outboxOperations,
      async () => {
        await this.customers.add(customer);
        await this.activityEvents.add(event);
        await this.outboxOperations.add(operation);
        return customer;
      },
    );
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

  async convertServiceRequestToJob(input: ServiceRequestJobConversion): Promise<{ replayed: boolean; job: Job; serviceRequest: ServiceRequest }> {
    if (input.actorRole !== 'owner_admin') throw new Error('Owner approval is required to convert a service request to a job');
    const key = `service-request-job-conversion:${input.operationId}`;
    const fingerprint = JSON.stringify(input);
    return this.transaction('rw', this.jobs, this.serviceRequests, this.activityEvents, this.outboxOperations, this.metadata, async () => {
      const prior = await this.metadata.get(key);
      if (prior) {
        if (prior.value !== fingerprint) throw new Error('Service request conversion idempotency key reused with different content');
        const priorJob = await this.jobs.get(input.jobId);
        const priorRequest = await this.serviceRequests.get(input.serviceRequestId);
        if (!priorJob || !priorRequest) throw new Error('Service request conversion replay is incomplete');
        return { replayed: true, job: priorJob, serviceRequest: priorRequest };
      }
      const request = await this.serviceRequests.get(input.serviceRequestId);
      if (!request) throw new Error(`Service request ${input.serviceRequestId} was not found`);
      if (request.convertedJobId || request.status === 'converted') throw new Error(`Service request ${input.serviceRequestId} was already converted`);
      const linkedJob = await this.jobs.where('serviceRequestId').equals(request.id).first();
      if (linkedJob) throw new Error(`Service request ${input.serviceRequestId} was already converted`);
      const job = parseJob({
        id: input.jobId, customerId: request.customerId, serviceRequestId: request.id,
        service: request.summary, description: request.details, quoteStatus: 'Draft', quoteAmount: 0,
        durationHours: 0, crew: 'Unassigned', status: 'Quoted', invoiceStatus: 'Not created',
        invoiceAmount: 0, createdAt: input.occurredAt, updatedAt: input.occurredAt,
      });
      const updatedRequest = parseServiceRequest({
        ...request, status: 'converted', convertedJobId: job.id,
        audit: { ...request.audit, updatedAt: input.occurredAt, updatedBy: input.actorId },
      });
      const event = parseActivityEvent({
        id: input.auditEventId, at: input.occurredAt, jobId: job.id,
        customerId: request.customerId, actor: input.actorId,
        action: 'Service request converted to job',
        detail: `Created ${job.id} from service request ${request.id}. No communication, schedule, estimate, or invoice was created.`,
      });
      const operation = parseOutboxOperation({
        id: input.operationId, entityType: 'job', entityId: job.id,
        kind: 'job.create-from-service-request', payload: { ...job, serviceRequestId: request.id },
        createdAt: input.occurredAt, status: 'pending',
      });
      await this.jobs.add(job);
      await this.serviceRequests.put(updatedRequest);
      await this.activityEvents.add(event);
      await this.outboxOperations.add(operation);
      await this.metadata.add({ key, value: fingerprint, updatedAt: input.occurredAt });
      return { replayed: false, job, serviceRequest: updatedRequest };
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
