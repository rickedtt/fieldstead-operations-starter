import Dexie, { liveQuery, type EntityTable, type Observable } from 'dexie';
import {
  canTransitionJobStatus,
  parseActivityEvent,
  parseCustomer,
  parseEstimate,
  parseEstimateLineItem,
  parseFieldEvent,
  parseInvoice,
  parseInvoiceLineItem,
  parseJob,
  parseOperationalAttachment,
  parseOutboxOperation,
  parsePaymentEntry,
  parsePricebookItem,
  parseServiceRequest,
  schedulesOverlap,
  type ActivityEvent,
  type CalendarEntry,
  type Customer,
  type DispatchActorRole,
  type Estimate,
  type EstimateLineItem,
  type FieldEvent,
  type FieldEventKind,
  type FieldJobState,
  type Invoice,
  type InvoiceLineItem,
  type Job,
  type JobAssignment,
  type OutboxOperation,
  type OperationalAttachment,
  type PaymentEntry,
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
export type InvoiceCreation = { jobId: string; invoiceId: string; operationId: string; actorId: string; actorRole: DispatchActorRole; occurredAt: string; auditEventId: string; dueAt?: string };
export type PaymentEntryPost = { invoiceId: string; entryId: string; kind: PaymentEntry['kind']; amountCents: number; operationId: string; actorId: string; actorRole: DispatchActorRole; occurredAt: string; auditEventId: string; correctsEntryId?: string; note?: string };

export type ScheduleJobInput = {
  jobId: string; scheduledFor: string; durationHours: number; assigneeId?: string; assigneeName?: string;
  actorId: string; actorRole: DispatchActorRole; operationId: string; auditEventId: string; occurredAt: string;
  conflictOverrideReason?: string;
};

export type DispatchRemovalInput = {
  jobId: string; actorId: string; actorRole: DispatchActorRole; operationId: string; auditEventId: string; occurredAt: string;
};

export type FieldEventInput = Omit<FieldEvent, 'id' | 'syncState' | 'conflictReason'> & { eventId: string; actorRole: DispatchActorRole };

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
  fieldEvents!: EntityTable<FieldEvent, 'id'>;
  invoices!: EntityTable<Invoice, 'id'>;
  invoiceLineItems!: EntityTable<InvoiceLineItem, 'id'>;
  paymentEntries!: EntityTable<PaymentEntry, 'id'>;

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
    this.version(7).stores({
      jobs: 'id, customerId, serviceRequestId, status, scheduledFor, updatedAt',
      assignments: 'id, jobId, assigneeId, assignedAt, unassignedAt',
      activityEvents: 'id, jobId, customerId, at',
      outboxOperations: 'id, status, createdAt, [entityType+entityId]', metadata: 'key, updatedAt',
      customers: 'id, primaryEmail, primaryPhone, serviceAddress, audit.updatedAt, &[sourceEmail.accountId+sourceEmail.messageId]',
      serviceRequests: 'id, customerId, status, convertedJobId, audit.updatedAt, &[sourceEmail.accountId+sourceEmail.messageId]',
      attachments: 'id, [ownerType+ownerId], createdAt, checksum', pricebookItems: 'id, name, active, audit.updatedAt',
      estimates: 'id, &jobId, status, audit.updatedAt', estimateLineItems: 'id, estimateId, [estimateId+position]',
    });
    this.version(8).stores({
      jobs: 'id, customerId, serviceRequestId, status, scheduledFor, updatedAt', assignments: 'id, jobId, assigneeId, assignedAt, unassignedAt',
      activityEvents: 'id, jobId, customerId, at', outboxOperations: 'id, status, createdAt, [entityType+entityId]', metadata: 'key, updatedAt',
      customers: 'id, primaryEmail, primaryPhone, serviceAddress, audit.updatedAt, &[sourceEmail.accountId+sourceEmail.messageId]', serviceRequests: 'id, customerId, status, convertedJobId, audit.updatedAt, &[sourceEmail.accountId+sourceEmail.messageId]',
      attachments: 'id, [ownerType+ownerId], createdAt, checksum', pricebookItems: 'id, name, active, audit.updatedAt', estimates: 'id, &jobId, status, audit.updatedAt', estimateLineItems: 'id, estimateId, [estimateId+position]',
      fieldEvents: 'id, &operationId, jobId, actorId, occurredAt, syncState',
    });
    this.version(9).stores({
      jobs: 'id, customerId, serviceRequestId, status, scheduledFor, updatedAt', assignments: 'id, jobId, assigneeId, assignedAt, unassignedAt',
      activityEvents: 'id, jobId, customerId, at', outboxOperations: 'id, status, createdAt, [entityType+entityId]', metadata: 'key, updatedAt',
      customers: 'id, primaryEmail, primaryPhone, serviceAddress, audit.updatedAt, &[sourceEmail.accountId+sourceEmail.messageId]', serviceRequests: 'id, customerId, status, convertedJobId, audit.updatedAt, &[sourceEmail.accountId+sourceEmail.messageId]',
      attachments: 'id, [ownerType+ownerId], createdAt, checksum', pricebookItems: 'id, name, active, audit.updatedAt', estimates: 'id, &jobId, status, audit.updatedAt', estimateLineItems: 'id, estimateId, [estimateId+position]',
      fieldEvents: 'id, &operationId, jobId, actorId, occurredAt, syncState', invoices: 'id, &jobId, customerId, status, issuedAt, dueAt', invoiceLineItems: 'id, invoiceId, [invoiceId+position]', paymentEntries: 'id, invoiceId, kind, occurredAt, correctsEntryId',
    });
  }

  private requireDispatcher(role: DispatchActorRole): void {
    if (role !== 'owner_admin' && role !== 'dispatcher') throw new Error('Owner or dispatcher access is required');
  }

  async listAssignedJobs(assigneeId: string) {
    const assignments = (await this.listActiveAssignments()).filter((item) => item.assigneeId === assigneeId);
    const entries = await Promise.all(assignments.map(async (assignment) => ({ assignment, job: await this.jobs.get(assignment.jobId) })));
    return entries.filter((entry): entry is { assignment: JobAssignment; job: Job } => Boolean(entry.job)).sort((left, right) => (left.job.scheduledFor || '').localeCompare(right.job.scheduledFor || '') || left.job.id.localeCompare(right.job.id));
  }

  listFieldEvents(jobId: string): Promise<FieldEvent[]> { return this.fieldEvents.where('jobId').equals(jobId).sortBy('occurredAt'); }

  async getFieldJobState(jobId: string, actorId: string): Promise<FieldJobState> {
    if (!(await this.listActiveAssignments(jobId)).some((item) => item.assigneeId === actorId)) throw new Error('Assigned crew access is required');
    const events = await this.listFieldEvents(jobId);
    const phases: Partial<Record<FieldEventKind, FieldJobState['phase']>> = { arrive: 'arrived', start: 'active', pause: 'paused', resume: 'active', complete: 'completed', cancel: 'canceled' };
    const phase = events.reduce<FieldJobState['phase']>((current, event) => phases[event.kind] || current, 'scheduled');
    const checklist = new Map<string, { id: string; label: string; completed: boolean }>();
    for (const event of events) if (event.kind === 'checklist') checklist.set(event.checklistItemId!, { id: event.checklistItemId!, label: event.checklistLabel!, completed: event.checklistCompleted! });
    return { phase, checklist: [...checklist.values()], syncState: events.some((event) => event.syncState === 'conflicted') ? 'conflicted' : events.some((event) => event.syncState === 'pending') ? 'pending' : 'synced' };
  }

  async recordFieldEvent(input: FieldEventInput): Promise<{ replayed: boolean; event: FieldEvent; job: Job }> {
    if (input.actorRole !== 'field_crew') throw new Error('Field crew access is required');
    const fingerprint = JSON.stringify(input); const key = `field-event:${input.operationId}`;
    return this.transaction('rw', [this.jobs, this.assignments, this.fieldEvents, this.activityEvents, this.outboxOperations, this.metadata], async () => {
      const prior = await this.metadata.get(key);
      if (prior) { if (prior.value !== fingerprint) throw new Error('Field event idempotency key reused with different content'); const event = await this.fieldEvents.where('operationId').equals(input.operationId).first(); const job = await this.jobs.get(input.jobId); if (!event || !job) throw new Error('Field event replay is incomplete'); return { replayed: true, event, job }; }
      if (!(await this.listActiveAssignments(input.jobId)).some((item) => item.assigneeId === input.actorId)) throw new Error('Assigned crew access is required');
      const current = await this.jobs.get(input.jobId); if (!current) throw new Error(`Job ${input.jobId} was not found`);
      const state = await this.getFieldJobState(input.jobId, input.actorId);
      const allowed: Record<FieldJobState['phase'], readonly FieldEventKind[]> = { scheduled: ['arrive', 'cancel', 'note', 'checklist'], arrived: ['start', 'cancel', 'note', 'checklist'], active: ['pause', 'complete', 'cancel', 'note', 'checklist'], paused: ['resume', 'cancel', 'note', 'checklist'], completed: ['note', 'checklist'], canceled: ['note', 'checklist'] };
      if (!allowed[state.phase].includes(input.kind)) throw new Error(`Invalid field transition: ${state.phase} -> ${input.kind}`);
      const event = parseFieldEvent({ ...input, id: input.eventId, syncState: 'pending' });
      const statuses: Partial<Record<FieldEventKind, Job['status']>> = { arrive: 'En route', start: 'In progress', resume: 'In progress', complete: 'Completed', cancel: 'Canceled' };
      const job = statuses[input.kind] ? parseJob({ ...current, status: statuses[input.kind], updatedAt: input.occurredAt }) : current;
      const audit = parseActivityEvent({ id: `activity:${input.eventId}`, at: input.occurredAt, jobId: input.jobId, customerId: current.customerId, actor: input.actorId, action: `Field ${input.kind}`, detail: input.note || input.checklistLabel || `Field crew recorded ${input.kind}.` });
      const operation = parseOutboxOperation({ id: input.operationId, entityType: 'fieldEvent', entityId: event.id, kind: 'fieldEvent.append', payload: { ...event }, createdAt: input.occurredAt, status: 'pending' });
      await this.fieldEvents.add(event); await this.jobs.put(job); await this.activityEvents.add(audit); await this.outboxOperations.add(operation); await this.metadata.add({ key, value: fingerprint, updatedAt: input.occurredAt });
      return { replayed: false, event, job };
    });
  }

  async markFieldEventConflicted(eventId: string, reason: string): Promise<FieldEvent> {
    const event = await this.fieldEvents.get(eventId); if (!event) throw new Error(`Field event ${eventId} was not found`);
    const updated = parseFieldEvent({ ...event, syncState: 'conflicted', conflictReason: reason }); await this.fieldEvents.put(updated); return updated;
  }

  async listActiveAssignments(jobId?: string): Promise<JobAssignment[]> {
    const assignments = jobId ? await this.assignments.where('jobId').equals(jobId).toArray() : await this.assignments.toArray();
    return assignments.filter((assignment) => !assignment.unassignedAt).sort((left, right) => left.assigneeId.localeCompare(right.assigneeId) || left.id.localeCompare(right.id));
  }

  async listUnscheduledJobs(): Promise<Job[]> {
    return (await this.jobs.toArray()).filter((job) => !job.scheduledFor && !['Completed', 'Canceled'].includes(job.status)).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id));
  }

  async listCalendarEntries(rangeStart: string, rangeEnd: string): Promise<CalendarEntry[]> {
    const start = Date.parse(rangeStart); const end = Date.parse(rangeEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) throw new Error('Calendar range must have valid increasing ISO boundaries');
    const jobs = (await this.jobs.toArray()).filter((job) => { const scheduled = job.scheduledFor ? Date.parse(job.scheduledFor) : Number.NaN; return Number.isFinite(scheduled) && scheduled >= start && scheduled < end; }).sort((left, right) => left.scheduledFor!.localeCompare(right.scheduledFor!) || left.id.localeCompare(right.id));
    return Promise.all(jobs.map(async (job) => ({ job, assignments: await this.listActiveAssignments(job.id) })));
  }

  async scheduleJob(input: ScheduleJobInput): Promise<{ replayed: boolean; job: Job; assignment?: JobAssignment }> {
    this.requireDispatcher(input.actorRole);
    if (!input.assigneeId && input.assigneeName) throw new Error('An assignee id is required with an assignee name');
    schedulesOverlap(input.scheduledFor, input.durationHours, input.scheduledFor, input.durationHours);
    const overrideReason = input.conflictOverrideReason?.trim();
    const fingerprint = JSON.stringify({ ...input, conflictOverrideReason: overrideReason }); const key = `job-schedule:${input.operationId}`;
    return this.transaction('rw', [this.jobs, this.assignments, this.activityEvents, this.outboxOperations, this.metadata], async () => {
      const prior = await this.metadata.get(key);
      if (prior) { if (prior.value !== fingerprint) throw new Error('Schedule idempotency key reused with different content'); const job = await this.jobs.get(input.jobId); if (!job) throw new Error('Schedule replay is incomplete'); return { replayed: true, job, assignment: (await this.listActiveAssignments(job.id))[0] }; }
      const current = await this.jobs.get(input.jobId); if (!current) throw new Error(`Job ${input.jobId} was not found`);
      const active = await this.listActiveAssignments(); const conflicts: string[] = [];
      if (input.assigneeId) for (const assignment of active) { if (assignment.assigneeId !== input.assigneeId || assignment.jobId === input.jobId) continue; const other = await this.jobs.get(assignment.jobId); if (other?.scheduledFor && schedulesOverlap(input.scheduledFor, input.durationHours, other.scheduledFor, other.durationHours)) conflicts.push(other.id); }
      if (conflicts.length && !overrideReason) throw new Error(`Schedule conflicts with ${conflicts.sort().join(', ')}`);
      for (const assignment of active.filter((item) => item.jobId === input.jobId)) await this.assignments.put({ ...assignment, unassignedAt: input.occurredAt });
      const assignment = input.assigneeId ? { id: `${input.operationId}:assignment`, jobId: input.jobId, assigneeId: input.assigneeId, assigneeName: input.assigneeName, assignedAt: input.occurredAt } satisfies JobAssignment : undefined;
      if (assignment) await this.assignments.add(assignment);
      const job = parseJob({ ...current, scheduledFor: input.scheduledFor, durationHours: input.durationHours, crew: input.assigneeName || 'Unassigned', status: current.status === 'Quoted' ? 'Scheduled' : current.status, updatedAt: input.occurredAt });
      const event = parseActivityEvent({ id: input.auditEventId, at: input.occurredAt, jobId: job.id, customerId: job.customerId, actor: input.actorId, action: current.scheduledFor ? 'Job rescheduled' : 'Job scheduled', detail: `${job.scheduledFor} for ${job.durationHours} hour(s); ${job.crew}.${conflicts.length ? ` Conflict override: ${overrideReason}` : ''}` });
      const operation = parseOutboxOperation({ id: input.operationId, entityType: 'job', entityId: job.id, kind: 'job.schedule', payload: { scheduledFor: job.scheduledFor, durationHours: job.durationHours, assigneeId: input.assigneeId, assigneeName: input.assigneeName, conflictOverrideReason: overrideReason }, createdAt: input.occurredAt, status: 'pending' });
      await this.jobs.put(job); await this.activityEvents.add(event); await this.outboxOperations.add(operation); await this.metadata.add({ key, value: fingerprint, updatedAt: input.occurredAt });
      return { replayed: false, job, assignment };
    });
  }

  async unassignJob(input: DispatchRemovalInput): Promise<{ replayed: boolean; job: Job }> { return this.removeDispatchValue(input, 'unassign'); }
  async unscheduleJob(input: DispatchRemovalInput): Promise<{ replayed: boolean; job: Job }> { return this.removeDispatchValue(input, 'unschedule'); }

  private async removeDispatchValue(input: DispatchRemovalInput, kind: 'unassign' | 'unschedule'): Promise<{ replayed: boolean; job: Job }> {
    this.requireDispatcher(input.actorRole); const key = `job-${kind}:${input.operationId}`; const fingerprint = JSON.stringify(input);
    return this.transaction('rw', [this.jobs, this.assignments, this.activityEvents, this.outboxOperations, this.metadata], async () => {
      const prior = await this.metadata.get(key); if (prior) { if (prior.value !== fingerprint) throw new Error(`${kind} idempotency key reused with different content`); const job = await this.jobs.get(input.jobId); if (!job) throw new Error(`${kind} replay is incomplete`); return { replayed: true, job }; }
      const current = await this.jobs.get(input.jobId); if (!current) throw new Error(`Job ${input.jobId} was not found`);
      for (const assignment of await this.listActiveAssignments(input.jobId)) await this.assignments.put({ ...assignment, unassignedAt: input.occurredAt });
      const changes = kind === 'unschedule' ? { scheduledFor: undefined, crew: 'Unassigned' } : { crew: 'Unassigned' }; const job = parseJob({ ...current, ...changes, updatedAt: input.occurredAt });
      const event = parseActivityEvent({ id: input.auditEventId, at: input.occurredAt, jobId: job.id, customerId: job.customerId, actor: input.actorId, action: kind === 'unschedule' ? 'Job unscheduled' : 'Job unassigned', detail: kind === 'unschedule' ? 'Schedule and active assignment cleared. Job status was preserved.' : 'Active assignment cleared. Schedule was preserved.' });
      const operation = parseOutboxOperation({ id: input.operationId, entityType: 'job', entityId: job.id, kind: `job.${kind}`, payload: changes, createdAt: input.occurredAt, status: 'pending' });
      await this.jobs.put(job); await this.activityEvents.add(event); await this.outboxOperations.add(operation); await this.metadata.add({ key, value: fingerprint, updatedAt: input.occurredAt }); return { replayed: false, job };
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

  async getInvoiceForJob(jobId: string): Promise<{ invoice: Invoice; lines: InvoiceLineItem[] } | undefined> {
    const invoice = await this.invoices.where('jobId').equals(jobId).first();
    if (!invoice) return undefined;
    return { invoice, lines: await this.invoiceLineItems.where('invoiceId').equals(invoice.id).sortBy('position') };
  }

  async getInvoiceLedger(invoiceId: string): Promise<{ invoice: Invoice; lines: InvoiceLineItem[]; entries: PaymentEntry[]; paidCents: number; balanceCents: number }> {
    const invoice = await this.invoices.get(invoiceId);
    if (!invoice) throw new Error(`Invoice ${invoiceId} was not found`);
    const lines = await this.invoiceLineItems.where('invoiceId').equals(invoiceId).sortBy('position');
    const entries = (await this.paymentEntries.where('invoiceId').equals(invoiceId).toArray()).sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id));
    const paidCents = entries.reduce((sum, entry) => sum + (entry.kind === 'payment' ? entry.amountCents : -entry.amountCents), 0);
    return { invoice, lines, entries, paidCents, balanceCents: invoice.subtotalCents - paidCents };
  }

  async createInvoiceFromJob(input: InvoiceCreation): Promise<{ replayed: boolean; invoice: Invoice; lines: InvoiceLineItem[] }> {
    if (input.actorRole !== 'owner_admin') throw new Error('Owner approval is required to create an invoice');
    const fingerprint = JSON.stringify(input);
    const key = `invoice-create:${input.operationId}`;
    return this.transaction('rw', [this.jobs, this.estimates, this.estimateLineItems, this.invoices, this.invoiceLineItems, this.activityEvents, this.outboxOperations, this.metadata], async () => {
      const prior = await this.metadata.get(key);
      if (prior) {
        if (prior.value !== fingerprint) throw new Error('Invoice idempotency key reused with different content');
        const saved = await this.getInvoiceForJob(input.jobId);
        if (!saved || saved.invoice.id !== input.invoiceId) throw new Error('Invoice replay is incomplete');
        return { replayed: true, ...saved };
      }
      const job = await this.jobs.get(input.jobId);
      if (!job) throw new Error(`Job ${input.jobId} was not found`);
      if (await this.invoices.where('jobId').equals(job.id).first()) throw new Error('Job already has an invoice');
      const estimate = await this.getEstimateForJob(job.id);
      const sourceLines = estimate?.lines || [];
      const subtotalCents = estimate?.estimate.subtotalCents ?? Math.round((job.quoteAmount || 0) * 100);
      if (!Number.isSafeInteger(subtotalCents) || subtotalCents < 0) throw new Error('Invoice subtotal must be valid integer cents');
      const invoice = parseInvoice({ id: input.invoiceId, jobId: job.id, customerId: job.customerId, estimateId: estimate?.estimate.id, status: 'Draft', subtotalCents, issuedAt: input.occurredAt, dueAt: input.dueAt, audit: { createdAt: input.occurredAt, createdBy: input.actorId, updatedAt: input.occurredAt, updatedBy: input.actorId } });
      const lines = sourceLines.map((line) => parseInvoiceLineItem({ id: `${input.invoiceId}:${line.id}`, invoiceId: input.invoiceId, position: line.position, description: line.description, quantity: line.quantity, unit: line.unit, unitPriceCents: line.unitPriceCents, lineTotalCents: line.lineTotalCents, sourceEstimateLineItemId: line.id, pricebookItemId: line.pricebookItemId, pricebookItemName: line.pricebookItemName }));
      if (lines.reduce((sum, line) => sum + line.lineTotalCents, 0) !== subtotalCents && lines.length) throw new Error('Invoice subtotal does not match its lines');
      const event = parseActivityEvent({ id: input.auditEventId, at: input.occurredAt, jobId: job.id, customerId: job.customerId, actor: input.actorId, action: 'Invoice created', detail: `${lines.length} line item(s), ${(subtotalCents / 100).toFixed(2)} subtotal. Draft only; nothing sent.` });
      const operation = parseOutboxOperation({ id: input.operationId, entityType: 'invoice', entityId: invoice.id, kind: 'invoice.create', payload: { invoice, lines }, createdAt: input.occurredAt, status: 'pending' });
      await this.invoices.add(invoice);
      if (lines.length) await this.invoiceLineItems.bulkAdd(lines);
      await this.jobs.put(parseJob({ ...job, invoiceStatus: 'Draft', invoiceAmount: subtotalCents / 100, updatedAt: input.occurredAt }));
      await this.activityEvents.add(event);
      await this.outboxOperations.add(operation);
      await this.metadata.add({ key, value: fingerprint, updatedAt: input.occurredAt });
      return { replayed: false, invoice, lines };
    });
  }

  async postPaymentEntry(input: PaymentEntryPost): Promise<{ replayed: boolean; entry: PaymentEntry; paidCents: number; balanceCents: number }> {
    if (input.actorRole !== 'owner_admin') throw new Error('Owner approval is required to post a payment entry');
    const fingerprint = JSON.stringify(input);
    const key = `payment-entry:${input.operationId}`;
    return this.transaction('rw', [this.jobs, this.invoices, this.invoiceLineItems, this.paymentEntries, this.activityEvents, this.outboxOperations, this.metadata], async () => {
      const prior = await this.metadata.get(key);
      if (prior) {
        if (prior.value !== fingerprint) throw new Error('Payment idempotency key reused with different content');
        const entry = await this.paymentEntries.get(input.entryId);
        if (!entry) throw new Error('Payment replay is incomplete');
        const ledger = await this.getInvoiceLedger(input.invoiceId);
        return { replayed: true, entry, paidCents: ledger.paidCents, balanceCents: ledger.balanceCents };
      }
      const ledger = await this.getInvoiceLedger(input.invoiceId);
      if (input.kind === 'payment' && input.amountCents > ledger.balanceCents) throw new Error('Payment exceeds collectible balance');
      if (input.kind !== 'payment') {
        const corrected = ledger.entries.find((entry) => entry.id === input.correctsEntryId && entry.kind === 'payment');
        if (!corrected) throw new Error('Correction must reference a payment on this invoice');
        const correctedAmount = ledger.entries.filter((entry) => entry.correctsEntryId === corrected.id).reduce((sum, entry) => sum + entry.amountCents, 0);
        if (input.amountCents > corrected.amountCents - correctedAmount) throw new Error('Correction exceeds the uncorrected payment amount');
      }
      const entry = parsePaymentEntry({ id: input.entryId, invoiceId: input.invoiceId, kind: input.kind, amountCents: input.amountCents, occurredAt: input.occurredAt, actorId: input.actorId, correctsEntryId: input.correctsEntryId, note: input.note });
      const nextPaidCents = ledger.paidCents + (entry.kind === 'payment' ? entry.amountCents : -entry.amountCents);
      const balanceCents = ledger.invoice.subtotalCents - nextPaidCents;
      const status: Invoice['status'] = balanceCents === 0 ? 'Paid' : ledger.invoice.status === 'Paid' ? 'Sent' : ledger.invoice.status;
      const invoice = parseInvoice({ ...ledger.invoice, status, audit: { ...ledger.invoice.audit, updatedAt: input.occurredAt, updatedBy: input.actorId } });
      const job = await this.jobs.get(invoice.jobId);
      if (!job) throw new Error(`Job ${invoice.jobId} was not found`);
      const event = parseActivityEvent({ id: input.auditEventId, at: input.occurredAt, jobId: invoice.jobId, customerId: invoice.customerId, actor: input.actorId, action: entry.kind === 'payment' ? 'Payment posted' : `Payment ${entry.kind} posted`, detail: `${(entry.amountCents / 100).toFixed(2)} ${entry.kind} entry recorded locally.` });
      const operation = parseOutboxOperation({ id: input.operationId, entityType: 'paymentEntry', entityId: entry.id, kind: `paymentEntry.${entry.kind}`, payload: { entry }, createdAt: input.occurredAt, status: 'pending' });
      await this.paymentEntries.add(entry);
      await this.invoices.put(invoice);
      await this.jobs.put(parseJob({ ...job, invoiceStatus: status, invoiceAmount: invoice.subtotalCents / 100, updatedAt: input.occurredAt }));
      await this.activityEvents.add(event);
      await this.outboxOperations.add(operation);
      await this.metadata.add({ key, value: fingerprint, updatedAt: input.occurredAt });
      return { replayed: false, entry, paidCents: nextPaidCents, balanceCents };
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
