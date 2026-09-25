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
  serviceRequestId?: string;
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

export const FIELD_EVENT_KINDS = ['arrive', 'start', 'pause', 'resume', 'complete', 'cancel', 'note', 'checklist'] as const;
export type FieldEventKind = (typeof FIELD_EVENT_KINDS)[number];
export type FieldSyncState = 'pending' | 'synced' | 'conflicted';
export type FieldEvent = { id: string; operationId: string; jobId: string; actorId: string; kind: FieldEventKind; occurredAt: string; note?: string; checklistItemId?: string; checklistLabel?: string; checklistCompleted?: boolean; syncState: FieldSyncState; conflictReason?: string };
export type AssignedJob = { job: Job; assignment: JobAssignment };
export type FieldJobState = { phase: 'scheduled' | 'arrived' | 'active' | 'paused' | 'completed' | 'canceled'; checklist: Array<{ id: string; label: string; completed: boolean }>; syncState: 'synced' | 'pending' | 'conflicted' };

export type DispatchActorRole = 'owner_admin' | 'dispatcher' | 'field_crew';

export type CalendarEntry = {
  job: Job;
  assignments: JobAssignment[];
};

export function scheduleEnd(scheduledFor: string, durationHours: number): string {
  const start = Date.parse(scheduledFor);
  if (!Number.isFinite(start)) throw new TypeError('scheduledFor must be an ISO date-time');
  if (!Number.isFinite(durationHours) || durationHours <= 0) throw new TypeError('durationHours must be greater than zero');
  return new Date(start + durationHours * 60 * 60 * 1000).toISOString();
}

export function schedulesOverlap(leftStart: string, leftDurationHours: number, rightStart: string, rightDurationHours: number): boolean {
  const leftStartMs = Date.parse(leftStart);
  const rightStartMs = Date.parse(rightStart);
  const leftEndMs = Date.parse(scheduleEnd(leftStart, leftDurationHours));
  const rightEndMs = Date.parse(scheduleEnd(rightStart, rightDurationHours));
  return leftStartMs < rightEndMs && rightStartMs < leftEndMs;
}

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
  primaryPhone?: string;
  serviceAddress?: string;
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
  convertedJobId?: string;
  sourceEmail: SourceEmailIdentity;
  audit: AuditMetadata;
};

export type OperationalAttachment = {
  id: string;
  ownerType: 'job' | 'serviceRequest';
  ownerId: string;
  filename: string;
  contentType: string;
  size: number;
  checksum: string;
  createdAt: string;
  createdBy: string;
  source: { kind: 'desktop-upload' };
};

export type PricebookItem = { id: string; version: number; name: string; description?: string; unit: string; unitPriceCents: number; active: boolean; audit: AuditMetadata };
export type Estimate = { id: string; jobId: string; status: 'Draft'; subtotalCents: number; audit: AuditMetadata };
export type EstimateLineItem = { id: string; estimateId: string; position: number; description: string; quantity: number; unit: string; unitPriceCents: number; lineTotalCents: number; pricebookItemId?: string; pricebookItemName?: string };
export type RecurringCadence = { frequency: 'daily'; interval: number; localTime: string } | { frequency: 'weekly'; interval: number; weekdays: number[]; localTime: string };
export type RecurringServiceAgreement = { id: string; version?: number; customerId: string; name: string; status: 'draft' | 'active' | 'paused' | 'ended'; cadence: RecurringCadence; timezone: string; startsOn: string; endsOn?: string; serviceSummary: string; serviceDetails: string; pricebookItemId?: string; pricebookItemVersion?: number; generationTarget: 'serviceRequest' | 'job'; audit: AuditMetadata };
export type RecurringServiceOccurrence = { id: string; agreementId: string; agreementVersion: number; scheduledFor: string; localDate: string; status: 'preview' | 'generated'; generationTarget: 'serviceRequest' | 'job'; provenanceKey: string; generatedEntityId?: string; generatedAt?: string; generatedBy?: string };
export type Invoice = { id: string; jobId: string; customerId: string; estimateId?: string; status: 'Draft' | 'Sent' | 'Paid' | 'Overdue'; subtotalCents: number; issuedAt: string; dueAt?: string; audit: AuditMetadata };
export type InvoiceLineItem = { id: string; invoiceId: string; position: number; description: string; quantity: number; unit: string; unitPriceCents: number; lineTotalCents: number; sourceEstimateLineItemId?: string; pricebookItemId?: string; pricebookItemName?: string };
export type PaymentEntryKind = 'payment' | 'void' | 'refund';
export type PaymentEntry = { id: string; invoiceId: string; kind: PaymentEntryKind; amountCents: number; occurredAt: string; actorId: string; correctsEntryId?: string; note?: string };

export type OutboxOperation = {
  id: string;
  entityType: 'job' | 'jobAssignment' | 'activityEvent' | 'customer' | 'serviceRequest' | 'estimate' | 'pricebookItem' | 'fieldEvent' | 'invoice' | 'paymentEntry' | 'recurringServiceAgreement' | 'recurringServiceOccurrence';
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

function integerField(value: UnknownRecord, field: string, owner: string, minimum = 0): number {
  const number = numberField(value, field, owner);
  if (!Number.isInteger(number) || number < minimum) throw new TypeError(`${owner}.${field} must be an integer of at least ${minimum}`);
  return number;
}

function booleanField(value: UnknownRecord, field: string, owner: string): boolean {
  if (typeof value[field] !== 'boolean') throw new TypeError(`${owner}.${field} must be a boolean`);
  return value[field];
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
    primaryPhone: optionalStringField(customer, 'primaryPhone', 'Customer'),
    serviceAddress: optionalStringField(customer, 'serviceAddress', 'Customer'),
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
    convertedJobId: optionalStringField(request, 'convertedJobId', 'ServiceRequest'),
    sourceEmail: parseSourceEmailIdentity(request.sourceEmail),
    audit: parseAuditMetadata(request.audit),
  };
}

export function parseOperationalAttachment(value: unknown): OperationalAttachment {
  const attachment = record(value, 'OperationalAttachment');
  const source = record(attachment.source, 'OperationalAttachment.source');
  const checksum = stringField(attachment, 'checksum', 'OperationalAttachment');
  if (!/^sha256:[a-f0-9]{64}$/.test(checksum)) throw new TypeError('OperationalAttachment.checksum is not supported');
  return {
    id: stringField(attachment, 'id', 'OperationalAttachment'),
    ownerType: enumField(attachment, 'ownerType', 'OperationalAttachment', ['job', 'serviceRequest'] as const),
    ownerId: stringField(attachment, 'ownerId', 'OperationalAttachment'),
    filename: stringField(attachment, 'filename', 'OperationalAttachment'),
    contentType: stringField(attachment, 'contentType', 'OperationalAttachment'),
    size: numberField(attachment, 'size', 'OperationalAttachment'),
    checksum,
    createdAt: stringField(attachment, 'createdAt', 'OperationalAttachment'),
    createdBy: stringField(attachment, 'createdBy', 'OperationalAttachment'),
    source: { kind: enumField(source, 'kind', 'OperationalAttachment.source', ['desktop-upload'] as const) },
  };
}

export function parsePricebookItem(value: unknown): PricebookItem {
  const item = record(value, 'PricebookItem');
  return { id: stringField(item, 'id', 'PricebookItem'), version: integerField(item, 'version', 'PricebookItem', 1), name: stringField(item, 'name', 'PricebookItem'), description: optionalStringField(item, 'description', 'PricebookItem'), unit: stringField(item, 'unit', 'PricebookItem'), unitPriceCents: integerField(item, 'unitPriceCents', 'PricebookItem'), active: booleanField(item, 'active', 'PricebookItem'), audit: parseAuditMetadata(item.audit) };
}

function validIsoDate(value: string, owner: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new TypeError(`${owner} must be an ISO date`);
  return value;
}

function validTimezone(value: string): string {
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }).format(); } catch { throw new TypeError('RecurringServiceAgreement.timezone is not supported'); }
  return value;
}

export function parseRecurringServiceAgreement(value: unknown): RecurringServiceAgreement {
  const agreement = record(value, 'RecurringServiceAgreement');
  const cadence = record(agreement.cadence, 'RecurringServiceAgreement.cadence');
  const frequency = enumField(cadence, 'frequency', 'RecurringServiceAgreement.cadence', ['daily', 'weekly'] as const);
  const interval = integerField(cadence, 'interval', 'RecurringServiceAgreement.cadence', 1);
  const localTime = stringField(cadence, 'localTime', 'RecurringServiceAgreement.cadence');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(localTime)) throw new TypeError('RecurringServiceAgreement.cadence.localTime is not supported');
  let parsedCadence: RecurringCadence = { frequency: 'daily', interval, localTime };
  if (frequency === 'weekly') {
    if (!Array.isArray(cadence.weekdays) || cadence.weekdays.length === 0 || cadence.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) throw new TypeError('RecurringServiceAgreement.cadence.weekdays is not supported');
    parsedCadence = { frequency, interval, weekdays: [...new Set(cadence.weekdays as number[])].sort(), localTime };
  }
  const pricebookItemId = optionalStringField(agreement, 'pricebookItemId', 'RecurringServiceAgreement');
  const pricebookItemVersion = agreement.pricebookItemVersion === undefined ? undefined : integerField(agreement, 'pricebookItemVersion', 'RecurringServiceAgreement', 1);
  if ((pricebookItemId === undefined) !== (pricebookItemVersion === undefined)) throw new TypeError('RecurringServiceAgreement pricebook provenance must include id and version');
  const startsOn = validIsoDate(stringField(agreement, 'startsOn', 'RecurringServiceAgreement'), 'RecurringServiceAgreement.startsOn');
  const endsOn = optionalStringField(agreement, 'endsOn', 'RecurringServiceAgreement');
  if (endsOn && validIsoDate(endsOn, 'RecurringServiceAgreement.endsOn') < startsOn) throw new TypeError('RecurringServiceAgreement.endsOn must not precede startsOn');
  return { id: stringField(agreement, 'id', 'RecurringServiceAgreement'), version: agreement.version === undefined ? undefined : integerField(agreement, 'version', 'RecurringServiceAgreement', 1), customerId: stringField(agreement, 'customerId', 'RecurringServiceAgreement'), name: stringField(agreement, 'name', 'RecurringServiceAgreement'), status: enumField(agreement, 'status', 'RecurringServiceAgreement', ['draft', 'active', 'paused', 'ended'] as const), cadence: parsedCadence, timezone: validTimezone(stringField(agreement, 'timezone', 'RecurringServiceAgreement')), startsOn, endsOn, serviceSummary: stringField(agreement, 'serviceSummary', 'RecurringServiceAgreement'), serviceDetails: stringField(agreement, 'serviceDetails', 'RecurringServiceAgreement'), pricebookItemId, pricebookItemVersion, generationTarget: enumField(agreement, 'generationTarget', 'RecurringServiceAgreement', ['serviceRequest', 'job'] as const), audit: parseAuditMetadata(agreement.audit) };
}

export function parseRecurringServiceOccurrence(value: unknown): RecurringServiceOccurrence {
  const occurrence = record(value, 'RecurringServiceOccurrence');
  const status = enumField(occurrence, 'status', 'RecurringServiceOccurrence', ['preview', 'generated'] as const);
  const generatedEntityId = optionalStringField(occurrence, 'generatedEntityId', 'RecurringServiceOccurrence');
  const generatedAt = optionalStringField(occurrence, 'generatedAt', 'RecurringServiceOccurrence');
  const generatedBy = optionalStringField(occurrence, 'generatedBy', 'RecurringServiceOccurrence');
  if (status === 'generated' && (!generatedEntityId || !generatedAt || !generatedBy)) throw new TypeError('RecurringServiceOccurrence generated provenance is required');
  return { id: stringField(occurrence, 'id', 'RecurringServiceOccurrence'), agreementId: stringField(occurrence, 'agreementId', 'RecurringServiceOccurrence'), agreementVersion: integerField(occurrence, 'agreementVersion', 'RecurringServiceOccurrence', 1), scheduledFor: stringField(occurrence, 'scheduledFor', 'RecurringServiceOccurrence'), localDate: validIsoDate(stringField(occurrence, 'localDate', 'RecurringServiceOccurrence'), 'RecurringServiceOccurrence.localDate'), status, generationTarget: enumField(occurrence, 'generationTarget', 'RecurringServiceOccurrence', ['serviceRequest', 'job'] as const), provenanceKey: stringField(occurrence, 'provenanceKey', 'RecurringServiceOccurrence'), generatedEntityId, generatedAt, generatedBy };
}

function zonedDateTimeToUtc(localDate: string, localTime: string, timezone: string): string {
  const [year, month, day] = localDate.split('-').map(Number); const [hour, minute] = localTime.split(':').map(Number);
  let guess = Date.UTC(year, month - 1, day, hour, minute);
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    const delta = Date.UTC(year, month - 1, day, hour, minute) - represented;
    if (delta === 0) return new Date(guess).toISOString();
    guess += delta;
  }
  throw new TypeError('Recurring local time does not exist in the configured timezone');
}

export function previewRecurringServiceOccurrences(value: RecurringServiceAgreement, range: { from: string; through: string; maxOccurrences?: number }): RecurringServiceOccurrence[] {
  const agreement = parseRecurringServiceAgreement(value); const from = validIsoDate(range.from, 'Recurring preview from'); const through = validIsoDate(range.through, 'Recurring preview through');
  const fromMs = Date.parse(`${from}T00:00:00Z`); const throughMs = Date.parse(`${through}T00:00:00Z`); const days = Math.floor((throughMs - fromMs) / 86400000) + 1;
  if (days < 1) throw new TypeError('Recurring preview range must be increasing');
  if (days > 90) throw new TypeError('Recurring preview is limited to 90 days');
  const limit = Math.min(range.maxOccurrences ?? 100, 100); if (!Number.isInteger(limit) || limit < 1) throw new TypeError('Recurring preview occurrence limit must be positive');
  const startMs = Date.parse(`${agreement.startsOn}T00:00:00Z`); const endMs = agreement.endsOn ? Date.parse(`${agreement.endsOn}T00:00:00Z`) : Number.POSITIVE_INFINITY;
  const results: RecurringServiceOccurrence[] = [];
  for (let cursor = fromMs; cursor <= throughMs; cursor += 86400000) {
    if (cursor < startMs || cursor > endMs) continue;
    const dayOffset = Math.floor((cursor - startMs) / 86400000); const weekday = new Date(cursor).getUTCDay();
    const matches = agreement.cadence.frequency === 'daily' ? dayOffset % agreement.cadence.interval === 0 : Math.floor(dayOffset / 7) % agreement.cadence.interval === 0 && agreement.cadence.weekdays.includes(weekday);
    if (!matches) continue;
    if (results.length >= limit) throw new TypeError('Recurring preview occurrence limit exceeded');
    const localDate = new Date(cursor).toISOString().slice(0, 10); const scheduledFor = zonedDateTimeToUtc(localDate, agreement.cadence.localTime, agreement.timezone); const provenanceKey = `${agreement.id}:${scheduledFor}`;
    results.push({ id: `preview:${provenanceKey}`, agreementId: agreement.id, agreementVersion: agreement.version ?? 1, scheduledFor, localDate, status: 'preview', generationTarget: agreement.generationTarget, provenanceKey });
  }
  return results;
}

export function parseEstimate(value: unknown): Estimate {
  const estimate = record(value, 'Estimate');
  return { id: stringField(estimate, 'id', 'Estimate'), jobId: stringField(estimate, 'jobId', 'Estimate'), status: enumField(estimate, 'status', 'Estimate', ['Draft'] as const), subtotalCents: integerField(estimate, 'subtotalCents', 'Estimate'), audit: parseAuditMetadata(estimate.audit) };
}

export function parseEstimateLineItem(value: unknown): EstimateLineItem {
  const line = record(value, 'EstimateLineItem');
  const quantity = numberField(line, 'quantity', 'EstimateLineItem');
  if (quantity <= 0) throw new TypeError('EstimateLineItem.quantity must be greater than zero');
  const unitPriceCents = integerField(line, 'unitPriceCents', 'EstimateLineItem');
  const lineTotalCents = integerField(line, 'lineTotalCents', 'EstimateLineItem');
  if (!Number.isSafeInteger(quantity * unitPriceCents) || lineTotalCents !== quantity * unitPriceCents) throw new TypeError('EstimateLineItem.lineTotalCents must equal quantity times unitPriceCents');
  return { id: stringField(line, 'id', 'EstimateLineItem'), estimateId: stringField(line, 'estimateId', 'EstimateLineItem'), position: integerField(line, 'position', 'EstimateLineItem'), description: stringField(line, 'description', 'EstimateLineItem'), quantity, unit: stringField(line, 'unit', 'EstimateLineItem'), unitPriceCents, lineTotalCents, pricebookItemId: optionalStringField(line, 'pricebookItemId', 'EstimateLineItem'), pricebookItemName: optionalStringField(line, 'pricebookItemName', 'EstimateLineItem') };
}

export function parseInvoice(value: unknown): Invoice {
  const invoice = record(value, 'Invoice');
  return { id: stringField(invoice, 'id', 'Invoice'), jobId: stringField(invoice, 'jobId', 'Invoice'), customerId: stringField(invoice, 'customerId', 'Invoice'), estimateId: optionalStringField(invoice, 'estimateId', 'Invoice'), status: enumField(invoice, 'status', 'Invoice', ['Draft', 'Sent', 'Paid', 'Overdue'] as const), subtotalCents: integerField(invoice, 'subtotalCents', 'Invoice'), issuedAt: stringField(invoice, 'issuedAt', 'Invoice'), dueAt: optionalStringField(invoice, 'dueAt', 'Invoice'), audit: parseAuditMetadata(invoice.audit) };
}

export function parseInvoiceLineItem(value: unknown): InvoiceLineItem {
  const line = record(value, 'InvoiceLineItem');
  const quantity = numberField(line, 'quantity', 'InvoiceLineItem');
  if (quantity <= 0) throw new TypeError('InvoiceLineItem.quantity must be greater than zero');
  const unitPriceCents = integerField(line, 'unitPriceCents', 'InvoiceLineItem');
  const lineTotalCents = integerField(line, 'lineTotalCents', 'InvoiceLineItem');
  if (!Number.isSafeInteger(quantity * unitPriceCents) || lineTotalCents !== quantity * unitPriceCents) throw new TypeError('InvoiceLineItem.lineTotalCents must equal quantity times unitPriceCents');
  return { id: stringField(line, 'id', 'InvoiceLineItem'), invoiceId: stringField(line, 'invoiceId', 'InvoiceLineItem'), position: integerField(line, 'position', 'InvoiceLineItem'), description: stringField(line, 'description', 'InvoiceLineItem'), quantity, unit: stringField(line, 'unit', 'InvoiceLineItem'), unitPriceCents, lineTotalCents, sourceEstimateLineItemId: optionalStringField(line, 'sourceEstimateLineItemId', 'InvoiceLineItem'), pricebookItemId: optionalStringField(line, 'pricebookItemId', 'InvoiceLineItem'), pricebookItemName: optionalStringField(line, 'pricebookItemName', 'InvoiceLineItem') };
}

export function parsePaymentEntry(value: unknown): PaymentEntry {
  const entry = record(value, 'PaymentEntry');
  const kind = enumField(entry, 'kind', 'PaymentEntry', ['payment', 'void', 'refund'] as const);
  const correctsEntryId = optionalStringField(entry, 'correctsEntryId', 'PaymentEntry');
  if (kind !== 'payment' && !correctsEntryId) throw new TypeError('PaymentEntry.correctsEntryId is required for corrections');
  if (kind === 'payment' && correctsEntryId) throw new TypeError('PaymentEntry.correctsEntryId is not allowed for payments');
  return { id: stringField(entry, 'id', 'PaymentEntry'), invoiceId: stringField(entry, 'invoiceId', 'PaymentEntry'), kind, amountCents: integerField(entry, 'amountCents', 'PaymentEntry', 1), occurredAt: stringField(entry, 'occurredAt', 'PaymentEntry'), actorId: stringField(entry, 'actorId', 'PaymentEntry'), correctsEntryId, note: optionalStringField(entry, 'note', 'PaymentEntry') };
}

export function parseJob(value: unknown): Job {
  const job = record(value, 'Job');
  return {
    id: stringField(job, 'id', 'Job'),
    customerId: stringField(job, 'customerId', 'Job'),
    serviceRequestId: optionalStringField(job, 'serviceRequestId', 'Job'),
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

export function parseFieldEvent(value: unknown): FieldEvent {
  const event = record(value, 'FieldEvent');
  const kind = enumField(event, 'kind', 'FieldEvent', FIELD_EVENT_KINDS);
  const checklistCompleted = event.checklistCompleted === undefined ? undefined : booleanField(event, 'checklistCompleted', 'FieldEvent');
  const note = optionalStringField(event, 'note', 'FieldEvent');
  const checklistItemId = optionalStringField(event, 'checklistItemId', 'FieldEvent');
  const checklistLabel = optionalStringField(event, 'checklistLabel', 'FieldEvent');
  if (kind === 'note' && !note?.trim()) throw new TypeError('FieldEvent.note must be a non-empty string');
  if (kind === 'checklist' && (!checklistItemId || !checklistLabel || checklistCompleted === undefined)) throw new TypeError('FieldEvent checklist fields are required');
  return { id: stringField(event, 'id', 'FieldEvent'), operationId: stringField(event, 'operationId', 'FieldEvent'), jobId: stringField(event, 'jobId', 'FieldEvent'), actorId: stringField(event, 'actorId', 'FieldEvent'), kind, occurredAt: stringField(event, 'occurredAt', 'FieldEvent'), note, checklistItemId, checklistLabel, checklistCompleted, syncState: enumField(event, 'syncState', 'FieldEvent', ['pending', 'synced', 'conflicted'] as const), conflictReason: optionalStringField(event, 'conflictReason', 'FieldEvent') };
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
      'customer',
      'serviceRequest',
      'estimate',
      'pricebookItem',
      'fieldEvent',
      'invoice',
      'paymentEntry',
      'recurringServiceAgreement',
      'recurringServiceOccurrence',
    ] as const),
    entityId: stringField(operation, 'entityId', 'OutboxOperation'),
    kind: stringField(operation, 'kind', 'OutboxOperation'),
    payload,
    createdAt: stringField(operation, 'createdAt', 'OutboxOperation'),
    status: enumField(operation, 'status', 'OutboxOperation', ['pending'] as const),
  };
}
