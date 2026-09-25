import { PortalAccessError, type PortalIdentity } from './portal-auth';

export type PortalResource = 'estimates' | 'jobs' | 'invoices';
export type PortalJob = { id: string; service: string; description: string; status: string; scheduledFor: string | null };
export type PortalEstimate = { id: string; jobId: string; estimateNumber: string; status: string; subtotalCents: number; issuedAt: string | null };
export type PortalInvoice = { id: string; jobId: string; invoiceNumber: string; status: string; currency: string; amountDueCents: number; issuedAt: string; paidAt: string | null };
export type PortalProjection = PortalJob | PortalEstimate | PortalInvoice;

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
