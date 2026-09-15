import {
  SYNC_PROTOCOL_VERSION,
  parseOperationBatch,
  parseOperationResult,
  type ConflictRecord,
  type JsonObject,
  type JsonValue,
  type OperationResult,
  type RejectedOperation,
  type SyncOperation,
} from '../packages/fieldstead-sync/src';
import {
  customerExists,
  findJob,
  findStoredMutation,
  insertActivityStatement,
  insertDraftInvoiceStatement,
  insertJobStatement,
  insertMutationStatement,
  updateJobStatement,
  type JobRow,
} from './database';
import type { AuthIdentity } from './types';

type Decision =
  | { status: 'ACCEPTED' }
  | {
      status: 'REJECTED' | 'RETRYABLE' | 'CONFLICT';
      rejection: RejectedOperation;
      conflict?: ConflictRecord;
    };

type Plan = { decision: Decision; statements: D1PreparedStatement[] };

const CREW_FIELDS = new Set(['status', 'scheduledFor', 'description']);
const PRIVILEGED_FIELDS = new Set([
  ...CREW_FIELDS,
  'assignedUserId',
  'service',
  'quoteAmount',
  'quoteMargin',
  'invoiceAmount',
]);

export class SyncRequestError extends Error {
  constructor(message: string, readonly status: 400) {
    super(message);
    this.name = 'SyncRequestError';
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function rejection(
  operation: SyncOperation,
  code: RejectedOperation['code'],
  message: string,
  retryable = false,
): RejectedOperation {
  return { operationId: operation.id, code, message, retryable };
}

function reject(
  operation: SyncOperation,
  code: RejectedOperation['code'],
  message: string,
  status: 'REJECTED' | 'RETRYABLE' = 'REJECTED',
): Decision {
  return { status, rejection: rejection(operation, code, message, status === 'RETRYABLE') };
}

function requiredString(value: JsonValue | undefined, name: string): string {
  if (typeof value !== 'string' || !value) throw new TypeError(`${name} must be a non-empty string`);
  return value;
}

function optionalString(value: JsonValue | undefined, name: string): string | null {
  if (value === undefined || value === null) return null;
  return requiredString(value, name);
}

function numberValue(value: JsonValue | undefined, name: string, fallback = 0): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}

function baseVersion(value: JsonValue | undefined): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new TypeError('payload.baseVersion must be a positive integer');
  }
  return value;
}

function serverJob(row: JobRow): JsonObject {
  return {
    id: row.id,
    customerId: row.customer_id,
    assignedUserId: row.assigned_user_id,
    service: row.service,
    description: row.description,
    status: row.status,
    scheduledFor: row.scheduled_for,
    quoteAmount: row.quote_amount,
    quoteMargin: row.quote_margin,
    invoiceAmount: row.invoice_amount,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function conflict(operation: SyncOperation, row: JobRow, version: number): Decision {
  const record: ConflictRecord = {
    operationId: operation.id,
    entityType: operation.entityType,
    entityId: operation.entityId,
    reason: 'concurrent_update',
    clientVersion: String(version),
    serverVersion: String(row.version),
    serverRecord: serverJob(row),
    message: 'The server record changed; reconcile against the authoritative server value.',
  };
  return {
    status: 'CONFLICT',
    rejection: rejection(operation, 'conflict', record.message),
    conflict: record,
  };
}

function mutationStatement(
  db: D1Database,
  identity: AuthIdentity,
  operation: SyncOperation,
  canonicalPayload: string,
  fingerprint: string,
  decision: Decision,
  processedAt: string,
): D1PreparedStatement {
  return insertMutationStatement(db, [
    identity.organization_id,
    operation.id,
    identity.user_id,
    operation.entityType,
    operation.entityId,
    canonicalPayload,
    fingerprint,
    decision.status,
    canonicalJson(decision),
    processedAt,
    operation.createdAt,
  ]);
}

async function planJobUpdate(
  db: D1Database,
  identity: AuthIdentity,
  operation: SyncOperation,
  processedAt: string,
): Promise<Plan> {
  const version = baseVersion(operation.payload.baseVersion);
  const job = await findJob(db, identity.organization_id, operation.entityId);
  if (!job) return { decision: reject(operation, 'unauthorized', 'The job is not in this organization.'), statements: [] };
  if (identity.role === 'field_crew' && job.assigned_user_id !== identity.user_id) {
    return { decision: reject(operation, 'forbidden', 'Field Crew may update only assigned jobs.'), statements: [] };
  }
  const fields = Object.keys(operation.payload).filter((field) => field !== 'baseVersion');
  const allowed = identity.role === 'field_crew' ? CREW_FIELDS : PRIVILEGED_FIELDS;
  if (!fields.length || fields.some((field) => !allowed.has(field))) {
    const crewMessage = 'Field Crew cannot change pricing, quote margin, users, organization settings, or financial metrics.';
    return {
      decision: reject(
        operation,
        identity.role === 'field_crew' ? 'forbidden' : 'malformed_operation',
        identity.role === 'field_crew' ? crewMessage : 'The job update contains unsupported fields.',
      ),
      statements: [],
    };
  }
  if (job.version !== version) return { decision: conflict(operation, job, version), statements: [] };

  const names: Record<string, string> = {
    status: 'status', scheduledFor: 'scheduled_for', description: 'description',
    assignedUserId: 'assigned_user_id', service: 'service', quoteAmount: 'quote_amount',
    quoteMargin: 'quote_margin', invoiceAmount: 'invoice_amount',
  };
  const patch: JsonObject = {};
  for (const field of fields) patch[names[field]] = operation.payload[field];
  const statements = [updateJobStatement(
    db, canonicalJson(patch), processedAt,
    identity.organization_id, operation.entityId, version,
  )];
  if (operation.payload.status === 'Completed' && job.status !== 'Completed') {
    const invoiceId = `invoice:${identity.organization_id}:${job.id}`;
    const amount = operation.payload.invoiceAmount ?? job.invoice_amount;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
      throw new TypeError('payload.invoiceAmount must be a non-negative finite number');
    }
    statements.push(insertDraftInvoiceStatement(db, [
      invoiceId,
      identity.organization_id,
      job.id,
      job.customer_id,
      identity.user_id,
      `INV-${job.id}`,
      Math.round(amount * 100),
      processedAt,
      processedAt,
      processedAt,
    ]));
  }
  return {
    decision: { status: 'ACCEPTED' },
    statements,
  };
}

async function planJobCreate(
  db: D1Database,
  identity: AuthIdentity,
  operation: SyncOperation,
  processedAt: string,
): Promise<Plan> {
  if (identity.role === 'field_crew') {
    return { decision: reject(operation, 'forbidden', 'Field Crew cannot create jobs.'), statements: [] };
  }
  const payload = operation.payload;
  const customerId = requiredString(payload.customerId, 'payload.customerId');
  if (!(await customerExists(db, identity.organization_id, customerId))) {
    return { decision: reject(operation, 'unauthorized', 'The customer is not in this organization.'), statements: [] };
  }
  const existing = await findJob(db, identity.organization_id, operation.entityId);
  if (existing) return { decision: conflict(operation, existing, 0), statements: [] };
  return {
    decision: { status: 'ACCEPTED' },
    statements: [insertJobStatement(db, [
      operation.entityId, identity.organization_id, customerId,
      optionalString(payload.assignedUserId, 'payload.assignedUserId'),
      requiredString(payload.service, 'payload.service'),
      typeof payload.description === 'string' ? payload.description : '',
      typeof payload.status === 'string' ? payload.status : 'Quoted',
      optionalString(payload.scheduledFor, 'payload.scheduledFor'),
      numberValue(payload.quoteAmount, 'payload.quoteAmount'),
      payload.quoteMargin === null ? null : numberValue(payload.quoteMargin, 'payload.quoteMargin'),
      numberValue(payload.invoiceAmount, 'payload.invoiceAmount'),
      processedAt, processedAt,
    ])],
  };
}

async function planCheckin(
  db: D1Database,
  identity: AuthIdentity,
  operation: SyncOperation,
  processedAt: string,
): Promise<Plan> {
  const jobId = requiredString(operation.payload.jobId, 'payload.jobId');
  const job = await findJob(db, identity.organization_id, jobId);
  if (!job) return { decision: reject(operation, 'unauthorized', 'The job is not in this organization.'), statements: [] };
  if (identity.role === 'field_crew' && job.assigned_user_id !== identity.user_id) {
    return { decision: reject(operation, 'forbidden', 'Field Crew may check in only to assigned jobs.'), statements: [] };
  }
  const occurredAt = typeof operation.payload.occurredAt === 'string'
    ? operation.payload.occurredAt : operation.createdAt;
  const detail = operation.payload.detail ?? {};
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) {
    throw new TypeError('payload.detail must be an object');
  }
  return {
    decision: { status: 'ACCEPTED' },
    statements: [insertActivityStatement(db, [
      operation.entityId, identity.organization_id, jobId, identity.user_id,
      'checkin.manual', canonicalJson(detail), occurredAt, processedAt, processedAt,
    ])],
  };
}

async function planOperation(
  db: D1Database,
  identity: AuthIdentity,
  operation: SyncOperation,
  processedAt: string,
): Promise<Plan> {
  if (operation.kind === 'job.update' && operation.entityType === 'job') {
    return planJobUpdate(db, identity, operation, processedAt);
  }
  if (operation.kind === 'job.create' && operation.entityType === 'job') {
    return planJobCreate(db, identity, operation, processedAt);
  }
  if (operation.kind === 'checkin.manual' && operation.entityType === 'activityEvent') {
    return planCheckin(db, identity, operation, processedAt);
  }
  return {
    decision: reject(operation, 'malformed_operation', 'Unsupported operation kind or entity type.'),
    statements: [],
  };
}

async function executeOperation(
  db: D1Database,
  identity: AuthIdentity,
  operation: SyncOperation,
  processedAt: string,
): Promise<Decision> {
  const canonicalPayload = canonicalJson(operation);
  const fingerprint = await sha256(canonicalPayload);
  try {
    const stored = await findStoredMutation(db, identity.organization_id, operation.id);
    if (stored) {
      if (stored.fingerprint !== fingerprint) {
        return reject(operation, 'idempotency_key_reused', 'The operation ID was already used for different content.');
      }
      return JSON.parse(stored.result_json) as Decision;
    }

    let plan: Plan;
    try {
      plan = await planOperation(db, identity, operation, processedAt);
    } catch (error) {
      plan = {
        decision: reject(
          operation, 'malformed_operation',
          error instanceof Error ? error.message : 'Malformed operation payload.',
        ),
        statements: [],
      };
    }
    await db.batch([
      ...plan.statements,
      mutationStatement(db, identity, operation, canonicalPayload, fingerprint, plan.decision, processedAt),
    ]);
    return plan.decision;
  } catch {
    // Another request can win the tenant-scoped unique operation key between
    // the read and batch. If so, replay its durable result.
    try {
      const winner = await findStoredMutation(db, identity.organization_id, operation.id);
      if (winner?.fingerprint === fingerprint) return JSON.parse(winner.result_json) as Decision;
    } catch {
      // D1 remains unavailable.
    }
    return reject(operation, 'server_error', 'The operation could not be persisted. Retry later.', 'RETRYABLE');
  }
}

/**
 * Operations are processed in order. Each domain write plus its mutation log
 * insert is one atomic D1 batch. D1 does not provide an interactive transaction
 * across this read/branch/write loop, so the whole mixed OperationBatch is not
 * claimed to be atomic. The tenant-scoped unique mutation key handles retry
 * races; optimistic conditional writes protect versions within each operation.
 */
export async function processSyncBatch(
  db: D1Database,
  identity: AuthIdentity,
  input: unknown,
): Promise<OperationResult> {
  let batch;
  try {
    batch = parseOperationBatch(input);
  } catch (error) {
    throw new SyncRequestError(error instanceof Error ? error.message : 'Malformed operation batch.', 400);
  }

  const acceptedOperationIds: string[] = [];
  const rejectedOperations: RejectedOperation[] = [];
  const conflicts: ConflictRecord[] = [];
  let position = batch.cursor?.position ?? '0';
  for (const operation of batch.operations) {
    const processedAt = new Date().toISOString();
    const decision = await executeOperation(db, identity, operation, processedAt);
    position = processedAt;
    if (decision.status === 'ACCEPTED') acceptedOperationIds.push(operation.id);
    else {
      rejectedOperations.push(decision.rejection);
      if (decision.conflict) conflicts.push(decision.conflict);
    }
  }
  return parseOperationResult({
    protocolVersion: SYNC_PROTOCOL_VERSION,
    batchId: batch.batchId,
    cursor: { version: SYNC_PROTOCOL_VERSION, position },
    acceptedOperationIds,
    rejectedOperations,
    conflicts,
  });
}
