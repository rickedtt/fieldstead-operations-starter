import { PortalAccessError, type PortalIdentity } from './portal-auth';

export type PortalResource = 'estimates' | 'jobs' | 'invoices';
export type PortalJob = { id: string; service: string; description: string; status: string; scheduledFor: string | null };
export type PortalEstimate = { id: string; jobId: string; estimateNumber: string; status: string; subtotalCents: number; issuedAt: string | null };
export type PortalInvoice = { id: string; jobId: string; invoiceNumber: string; status: string; currency: string; amountDueCents: number; issuedAt: string; paidAt: string | null };
export type PortalProjection = PortalJob | PortalEstimate | PortalInvoice;
export type EstimateDecision = 'approved' | 'declined';

type Row = Record<string, unknown>;

const QUERIES: Record<PortalResource, string> = {
  jobs: `SELECT id, service, description, status, scheduled_for FROM jobs WHERE organization_id = ? AND customer_id = ?`,
  estimates: `SELECT id, job_id, estimate_number, status, subtotal_cents, issued_at FROM portal_estimates WHERE organization_id = ? AND customer_id = ?`,
  invoices: `SELECT id, job_id, invoice_number, status, currency, amount_due_cents, issued_at, paid_at FROM invoices WHERE organization_id = ? AND customer_id = ?`,
};

const ORDER_BY: Record<PortalResource, string> = {
  jobs: ' ORDER BY scheduled_for, id',
  estimates: ' ORDER BY issued_at DESC, id',
  invoices: ' ORDER BY issued_at DESC, id',
};

function project(resource: PortalResource, row: Row): PortalProjection {
  if (resource === 'jobs') return { id: String(row.id), service: String(row.service), description: String(row.description), status: String(row.status), scheduledFor: row.scheduled_for === null ? null : String(row.scheduled_for) };
  if (resource === 'estimates') return { id: String(row.id), jobId: String(row.job_id), estimateNumber: String(row.estimate_number), status: String(row.status), subtotalCents: Number(row.subtotal_cents), issuedAt: row.issued_at === null ? null : String(row.issued_at) };
  return { id: String(row.id), jobId: String(row.job_id), invoiceNumber: String(row.invoice_number), status: String(row.status), currency: String(row.currency), amountDueCents: Number(row.amount_due_cents), issuedAt: String(row.issued_at), paidAt: row.paid_at === null || row.paid_at === undefined ? null : String(row.paid_at) };
}

export async function listPortalResource(db: D1Database, identity: PortalIdentity, resource: PortalResource): Promise<PortalProjection[]> {
  const result = await db.prepare(`${QUERIES[resource]}${ORDER_BY[resource]}`).bind(identity.organizationId, identity.customerId).all<Row>();
  return result.results.map((row) => project(resource, row));
}

export async function getPortalResource(db: D1Database, identity: PortalIdentity, resource: PortalResource, id: string): Promise<PortalProjection> {
  const row = await db.prepare(`${QUERIES[resource]} AND id = ?`).bind(identity.organizationId, identity.customerId, id).first<Row>();
  if (!row) throw new PortalAccessError(404);
  return project(resource, row);
}

export class PortalDecisionError extends Error {
  constructor(readonly status: 400 | 404 | 409, message = status === 404 ? 'Not found.' : status === 409 ? 'Estimate decision conflict.' : 'Invalid request.') {
    super(message);
    this.name = 'PortalDecisionError';
  }
}

type EstimateDecisionRow = {
  id: string; organization_id: string; customer_id: string; status: string;
  version: number; expires_at: string | null; decided_at: string | null;
  decision_idempotency_key: string | null; decision_result_json: string | null;
};

export async function decidePortalEstimate(
  db: D1Database,
  identity: PortalIdentity,
  estimateId: string,
  input: { decision: EstimateDecision; version: number; confirmation: boolean; idempotencyKey: string },
  supplied: { now?: Date; newId?: () => string } = {},
): Promise<{ estimateId: string; status: EstimateDecision; version: number; decidedAt: string }> {
  if (!input.confirmation || !['approved', 'declined'].includes(input.decision) || !Number.isInteger(input.version) || !/^[A-Za-z0-9_-]{8,128}$/.test(input.idempotencyKey)) throw new PortalDecisionError(400);
  const row = await db.prepare(`SELECT id, organization_id, customer_id, status, version, expires_at, decided_at, decision_idempotency_key, decision_result_json FROM portal_estimates WHERE organization_id = ? AND customer_id = ? AND id = ? LIMIT 1`).bind(identity.organizationId, identity.customerId, estimateId).first<EstimateDecisionRow>();
  if (!row) throw new PortalDecisionError(404);
  if (row.decision_idempotency_key === input.idempotencyKey && row.decision_result_json) {
    const prior = JSON.parse(row.decision_result_json) as { status: EstimateDecision; version: number };
    if (prior.status !== input.decision || prior.version !== input.version) throw new PortalDecisionError(409);
    return prior as { estimateId: string; status: EstimateDecision; version: number; decidedAt: string };
  }
  const now = supplied.now ?? new Date();
  if (row.status !== 'sent' || row.decided_at || row.version !== input.version || !row.expires_at || row.expires_at <= now.toISOString()) throw new PortalDecisionError(409);
  const decidedAt = now.toISOString();
  const result = { estimateId, status: input.decision, version: input.version, decidedAt };
  const updated = await db.batch([
    db.prepare(`UPDATE portal_estimates SET status = ?, decided_at = ?, decision_idempotency_key = ?, decision_result_json = ?, updated_at = ? WHERE organization_id = ? AND customer_id = ? AND id = ? AND status = 'sent' AND version = ? AND decided_at IS NULL AND expires_at > ?`).bind(input.decision, decidedAt, input.idempotencyKey, JSON.stringify(result), decidedAt, identity.organizationId, identity.customerId, estimateId, input.version, decidedAt),
    db.prepare(`INSERT INTO activity_events (id, organization_id, customer_id, actor_user_id, event_type, detail_json, occurred_at, version, created_at, updated_at) SELECT ?, ?, ?, NULL, ?, ?, ?, 1, ?, ? WHERE EXISTS (SELECT 1 FROM portal_estimates WHERE organization_id = ? AND customer_id = ? AND id = ? AND decision_idempotency_key = ?)`).bind((supplied.newId ?? (() => crypto.randomUUID()))(), identity.organizationId, identity.customerId, `portal.estimate.${input.decision}`, JSON.stringify({ estimateId, version: input.version, idempotencyKey: input.idempotencyKey }), decidedAt, decidedAt, decidedAt, identity.organizationId, identity.customerId, estimateId, input.idempotencyKey),
  ]);
  if (Number(updated[0]?.meta?.changes ?? 0) !== 1 || Number(updated[1]?.meta?.changes ?? 0) !== 1) throw new PortalDecisionError(409);
  return result;
}
