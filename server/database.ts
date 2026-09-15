import type { AuthIdentity, UserRole } from './types';

export type JobRow = {
  id: string;
  organization_id: string;
  customer_id: string;
  assigned_user_id: string | null;
  service: string;
  description: string;
  status: string;
  scheduled_for: string | null;
  quote_amount: number;
  quote_margin: number | null;
  invoice_amount: number;
  version: number;
  created_at: string;
  updated_at: string;
};

export type StoredMutationRow = {
  organization_id: string;
  operation_id: string;
  fingerprint: string;
  result_json: string;
};

const SELECT_ACTIVE_USER = `
  SELECT id, organization_id, role
  FROM users
  WHERE id = ? AND organization_id = ? AND status = 'active'
  LIMIT 1
`;

const SELECT_MUTATION = `
  SELECT organization_id, operation_id, fingerprint, result_json
  FROM mutations_log
  WHERE organization_id = ? AND operation_id = ?
  LIMIT 1
`;

const SELECT_JOB = `
  SELECT id, organization_id, customer_id, assigned_user_id, service,
         description, status, scheduled_for, quote_amount, quote_margin,
         invoice_amount, version, created_at, updated_at
  FROM jobs
  WHERE organization_id = ? AND id = ?
  LIMIT 1
`;

const SELECT_CUSTOMER = `
  SELECT id
  FROM customers
  WHERE organization_id = ? AND id = ?
  LIMIT 1
`;

const INSERT_JOB = `
  INSERT INTO jobs (
    id, organization_id, customer_id, assigned_user_id, service, description,
    status, scheduled_for, quote_amount, quote_margin, invoice_amount,
    version, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
`;

// Numbered parameters let one canonical JSON patch drive a fixed, parameterized
// statement. Null is currently treated as "not supplied" for nullable columns.
const UPDATE_JOB = `
  UPDATE jobs SET
    status = COALESCE(json_extract(?1, '$.status'), status),
    scheduled_for = COALESCE(json_extract(?1, '$.scheduled_for'), scheduled_for),
    assigned_user_id = COALESCE(json_extract(?1, '$.assigned_user_id'), assigned_user_id),
    service = COALESCE(json_extract(?1, '$.service'), service),
    description = COALESCE(json_extract(?1, '$.description'), description),
    quote_amount = COALESCE(json_extract(?1, '$.quote_amount'), quote_amount),
    quote_margin = COALESCE(json_extract(?1, '$.quote_margin'), quote_margin),
    invoice_amount = COALESCE(json_extract(?1, '$.invoice_amount'), invoice_amount),
    version = version + 1,
    updated_at = ?2
  WHERE organization_id = ?3 AND id = ?4 AND version = ?5
`;

const INSERT_ACTIVITY = `
  INSERT INTO activity_events (
    id, organization_id, job_id, actor_user_id, event_type, detail_json,
    occurred_at, version, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
`;

const INSERT_MUTATION = `
  INSERT INTO mutations_log (
    organization_id, operation_id, actor_user_id, entity_type, entity_id,
    payload_json, fingerprint, status, result_json, processed_at, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const INSERT_DRAFT_INVOICE = `
  INSERT INTO invoices (
    id, organization_id, job_id, customer_id, created_by_user_id, invoice_number,
    status, currency, amount_due_cents, issued_at, version, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, 'draft', 'usd', ?, ?, 1, ?, ?)
  ON CONFLICT (organization_id, job_id) DO NOTHING
`;

export async function findActiveIdentity(
  db: D1Database,
  userId: string,
  organizationId: string,
): Promise<AuthIdentity | null> {
  const row = await db.prepare(SELECT_ACTIVE_USER).bind(userId, organizationId).first<{
    id: string;
    organization_id: string;
    role: UserRole;
  }>();
  if (!row || !['owner_admin', 'dispatcher', 'field_crew'].includes(row.role)) return null;
  return { user_id: row.id, organization_id: row.organization_id, role: row.role };
}

export function findStoredMutation(
  db: D1Database,
  organizationId: string,
  operationId: string,
): Promise<StoredMutationRow | null> {
  return db.prepare(SELECT_MUTATION).bind(organizationId, operationId).first<StoredMutationRow>();
}

export function findJob(
  db: D1Database,
  organizationId: string,
  jobId: string,
): Promise<JobRow | null> {
  return db.prepare(SELECT_JOB).bind(organizationId, jobId).first<JobRow>();
}

export async function customerExists(
  db: D1Database,
  organizationId: string,
  customerId: string,
): Promise<boolean> {
  return (await db.prepare(SELECT_CUSTOMER).bind(organizationId, customerId).first<{ id: string }>()) !== null;
}

export function insertJobStatement(db: D1Database, values: unknown[]): D1PreparedStatement {
  return db.prepare(INSERT_JOB).bind(...values);
}

export function updateJobStatement(
  db: D1Database,
  patchJson: string,
  updatedAt: string,
  organizationId: string,
  jobId: string,
  baseVersion: number,
): D1PreparedStatement {
  return db.prepare(UPDATE_JOB).bind(patchJson, updatedAt, organizationId, jobId, baseVersion);
}

export function insertActivityStatement(db: D1Database, values: unknown[]): D1PreparedStatement {
  return db.prepare(INSERT_ACTIVITY).bind(...values);
}

export function insertMutationStatement(db: D1Database, values: unknown[]): D1PreparedStatement {
  return db.prepare(INSERT_MUTATION).bind(...values);
}

export function insertDraftInvoiceStatement(db: D1Database, values: unknown[]): D1PreparedStatement {
  return db.prepare(INSERT_DRAFT_INVOICE).bind(...values);
}
