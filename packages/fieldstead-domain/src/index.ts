export const JOB_STATUSES = [
  'Quoted',
  'Scheduled',
  'En route',
  'In progress',
  'Completed',
  'Canceled',
] as const;

export const QUOTE_STATUSES = ['Draft', 'Sent', 'Approved', 'Declined'] as const;
export const INVOICE_STATUSES = [
  'Not created',
  'Draft',
  'Sent',
  'Paid',
  'Overdue',
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export type Job = {
  id: string;
  customerId: string;
  service: string;
  description: string;
  quoteStatus: QuoteStatus;
  quoteAmount: number;
  quoteSentAt?: string;
  scheduledFor?: string;
  durationHours: number;
  crew: string;
  status: JobStatus;
  invoiceStatus: InvoiceStatus;
  invoiceAmount: number;
  invoiceDueAt?: string;
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type JobAssignment = {
  id: string;
  jobId: string;
  assigneeId: string;
  assigneeName?: string;
  assignedAt: string;
  unassignedAt?: string;
};

export type ActivityEvent = {
  id: string;
  at: string;
  jobId?: string;
  customerId?: string;
  actor: string;
  action: string;
  detail: string;
};

export type AuditMetadata = {
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
};

export type SourceEmailIdentity = {
  accountId: string;
  messageId: string;
  normalizedFrom: string;
};

export type Customer = {
  id: string;
  displayName: string;
  primaryEmail?: string;
  sourceEmail: SourceEmailIdentity;
  audit: AuditMetadata;
};

export const SERVICE_REQUEST_STATUSES = ['new', 'reviewed', 'converted', 'closed'] as const;
export type ServiceRequestStatus = (typeof SERVICE_REQUEST_STATUSES)[number];

export type ServiceRequest = {
  id: string;
  customerId: string;
  summary: string;
  details: string;
  status: ServiceRequestStatus;
  sourceEmail: SourceEmailIdentity;
  audit: AuditMetadata;
};

export type OutboxOperation = {
  id: string;
  entityType: 'job' | 'jobAssignment' | 'activityEvent';
  entityId: string;
  kind: string;
  payload: Record<string, unknown>;
  createdAt: string;
  status: 'pending';
};

export const JOB_STATUS_TRANSITIONS = {
  Quoted: ['Scheduled', 'Canceled'],
  Scheduled: ['En route', 'Canceled'],
  'En route': ['In progress', 'Canceled'],
  'In progress': ['Completed', 'Canceled'],
  Completed: [],
  Canceled: [],
} as const satisfies Record<JobStatus, readonly JobStatus[]>;

export function canTransitionJobStatus(from: JobStatus, to: JobStatus): boolean {
  return (JOB_STATUS_TRANSITIONS[from] as readonly JobStatus[]).includes(to);
}

export const CAPABILITIES = [
  'view_all_jobs',
  'create_jobs',
  'edit_jobs',
  'schedule_jobs',
  'assign_crew',
  'view_assigned_jobs',
  'update_assigned_job_status',
  'record_activity',
  'manage_roles',
] as const;

export type Capability = (typeof CAPABILITIES)[number];
export type Role = 'owner_admin' | 'dispatcher' | 'field_crew';

export const ROLE_CAPABILITIES = {
  owner_admin: [...CAPABILITIES],
  dispatcher: [
    'view_all_jobs',
    'create_jobs',
    'edit_jobs',
    'schedule_jobs',
    'assign_crew',
    'record_activity',
  ],
  field_crew: [
    'view_assigned_jobs',
    'update_assigned_job_status',
    'record_activity',
  ],
} as const satisfies Record<Role, readonly Capability[]>;

type UnknownRecord = Record<string, unknown>;

function record(value: unknown, name: string): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value as UnknownRecord;
}

function stringField(value: UnknownRecord, field: string, owner: string): string {
  if (typeof value[field] !== 'string' || value[field].length === 0) {
    throw new TypeError(`${owner}.${field} must be a non-empty string`);
  }
  return value[field];
}

function optionalStringField(
  value: UnknownRecord,
  field: string,
  owner: string,
): string | undefined {
  if (value[field] === undefined) return undefined;
  return stringField(value, field, owner);
}

function numberField(value: UnknownRecord, field: string, owner: string): number {
  const number = value[field];
  if (typeof number !== 'number' || !Number.isFinite(number)) {
    throw new TypeError(`${owner}.${field} must be a finite number`);
  }
  return number;
}

function enumField<const Values extends readonly string[]>(
  value: UnknownRecord,
  field: string,
  owner: string,
  values: Values,
): Values[number] {
  const candidate = stringField(value, field, owner);
  if (!(values as readonly string[]).includes(candidate)) {
    throw new TypeError(`${owner}.${field} is not supported`);
  }
  return candidate as Values[number];
}

function parseAuditMetadata(value: unknown): AuditMetadata {
  const audit = record(value, 'AuditMetadata');
  return {
    createdAt: stringField(audit, 'createdAt', 'AuditMetadata'),
    createdBy: stringField(audit, 'createdBy', 'AuditMetadata'),
    updatedAt: stringField(audit, 'updatedAt', 'AuditMetadata'),
    updatedBy: stringField(audit, 'updatedBy', 'AuditMetadata'),
  };
}

function parseSourceEmailIdentity(value: unknown): SourceEmailIdentity {
  const source = record(value, 'SourceEmailIdentity');
  return {
    accountId: stringField(source, 'accountId', 'SourceEmailIdentity'),
    messageId: stringField(source, 'messageId', 'SourceEmailIdentity'),
    normalizedFrom: stringField(source, 'normalizedFrom', 'SourceEmailIdentity'),
  };
}

export function parseCustomer(value: unknown): Customer {
  const customer = record(value, 'Customer');
  return {
    id: stringField(customer, 'id', 'Customer'),
    displayName: stringField(customer, 'displayName', 'Customer'),
    primaryEmail: optionalStringField(customer, 'primaryEmail', 'Customer'),
    sourceEmail: parseSourceEmailIdentity(customer.sourceEmail),
    audit: parseAuditMetadata(customer.audit),
  };
}

export function parseServiceRequest(value: unknown): ServiceRequest {
  const request = record(value, 'ServiceRequest');
  return {
    id: stringField(request, 'id', 'ServiceRequest'),
    customerId: stringField(request, 'customerId', 'ServiceRequest'),
    summary: stringField(request, 'summary', 'ServiceRequest'),
    details: stringField(request, 'details', 'ServiceRequest'),
    status: enumField(request, 'status', 'ServiceRequest', SERVICE_REQUEST_STATUSES),
    sourceEmail: parseSourceEmailIdentity(request.sourceEmail),
    audit: parseAuditMetadata(request.audit),
  };
}

export function parseJob(value: unknown): Job {
  const job = record(value, 'Job');
  return {
    id: stringField(job, 'id', 'Job'),
    customerId: stringField(job, 'customerId', 'Job'),
    service: stringField(job, 'service', 'Job'),
    description: stringField(job, 'description', 'Job'),
    quoteStatus: enumField(job, 'quoteStatus', 'Job', QUOTE_STATUSES),
    quoteAmount: numberField(job, 'quoteAmount', 'Job'),
    quoteSentAt: optionalStringField(job, 'quoteSentAt', 'Job'),
    scheduledFor: optionalStringField(job, 'scheduledFor', 'Job'),
    durationHours: numberField(job, 'durationHours', 'Job'),
    crew: stringField(job, 'crew', 'Job'),
    status: enumField(job, 'status', 'Job', JOB_STATUSES),
    invoiceStatus: enumField(job, 'invoiceStatus', 'Job', INVOICE_STATUSES),
    invoiceAmount: numberField(job, 'invoiceAmount', 'Job'),
    invoiceDueAt: optionalStringField(job, 'invoiceDueAt', 'Job'),
    paidAt: optionalStringField(job, 'paidAt', 'Job'),
    createdAt: stringField(job, 'createdAt', 'Job'),
    updatedAt: stringField(job, 'updatedAt', 'Job'),
  };
}

export function parseJobAssignment(value: unknown): JobAssignment {
  const assignment = record(value, 'JobAssignment');
  return {
    id: stringField(assignment, 'id', 'JobAssignment'),
    jobId: stringField(assignment, 'jobId', 'JobAssignment'),
    assigneeId: stringField(assignment, 'assigneeId', 'JobAssignment'),
    assigneeName: optionalStringField(assignment, 'assigneeName', 'JobAssignment'),
    assignedAt: stringField(assignment, 'assignedAt', 'JobAssignment'),
    unassignedAt: optionalStringField(assignment, 'unassignedAt', 'JobAssignment'),
  };
}

export function parseActivityEvent(value: unknown): ActivityEvent {
  const event = record(value, 'ActivityEvent');
  return {
    id: stringField(event, 'id', 'ActivityEvent'),
    at: stringField(event, 'at', 'ActivityEvent'),
    jobId: optionalStringField(event, 'jobId', 'ActivityEvent'),
    customerId: optionalStringField(event, 'customerId', 'ActivityEvent'),
    actor: stringField(event, 'actor', 'ActivityEvent'),
    action: stringField(event, 'action', 'ActivityEvent'),
    detail: stringField(event, 'detail', 'ActivityEvent'),
  };
}

export function parseOutboxOperation(value: unknown): OutboxOperation {
  const operation = record(value, 'OutboxOperation');
  const payload = record(operation.payload, 'OutboxOperation.payload');
  return {
    id: stringField(operation, 'id', 'OutboxOperation'),
    entityType: enumField(operation, 'entityType', 'OutboxOperation', [
      'job',
      'jobAssignment',
      'activityEvent',
    ] as const),
    entityId: stringField(operation, 'entityId', 'OutboxOperation'),
    kind: stringField(operation, 'kind', 'OutboxOperation'),
    payload,
    createdAt: stringField(operation, 'createdAt', 'OutboxOperation'),
    status: enumField(operation, 'status', 'OutboxOperation', ['pending'] as const),
  };
}
