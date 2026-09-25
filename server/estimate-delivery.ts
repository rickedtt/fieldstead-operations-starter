import type { AuthIdentity } from './types';

export class EstimateDeliveryError extends Error {
  constructor(readonly status: 400 | 403 | 404 | 409, message = status === 403 ? 'Forbidden.' : status === 404 ? 'Not found.' : status === 409 ? 'Estimate version conflict.' : 'Invalid request.') {
    super(message);
    this.name = 'EstimateDeliveryError';
  }
}

type DeliveryRow = { id: string; estimate_number: string; subtotal_cents: number; status: string; version: number; expires_at: string | null; customer_name: string; customer_email: string | null };

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function previewEstimateDelivery(db: D1Database, identity: AuthIdentity, input: { estimateId: string; version: number }) {
  if (identity.role !== 'owner_admin') throw new EstimateDeliveryError(403);
  if (!input.estimateId || !Number.isInteger(input.version)) throw new EstimateDeliveryError(400);
  const row = await db.prepare(`SELECT e.id, e.estimate_number, e.subtotal_cents, e.status, e.version, e.expires_at, c.name AS customer_name, c.email AS customer_email FROM portal_estimates e JOIN customers c ON c.organization_id = e.organization_id AND c.id = e.customer_id WHERE e.organization_id = ? AND e.id = ? LIMIT 1`).bind(identity.organization_id, input.estimateId).first<DeliveryRow>();
  if (!row) throw new EstimateDeliveryError(404);
  if (row.version !== input.version) throw new EstimateDeliveryError(409);
  if (row.status !== 'sent') throw new EstimateDeliveryError(409);
  if (!row.customer_email) throw new EstimateDeliveryError(400);
  const subject = `Estimate ${row.estimate_number} from Fieldstead Systems`;
  const body = `Hello ${row.customer_name},\n\nEstimate ${row.estimate_number} totals $${(row.subtotal_cents / 100).toFixed(2)}.\n\nPlease review it in your customer portal.`;
  const canonical = JSON.stringify({ estimateId: row.id, version: row.version, recipient: row.customer_email, subject, body });
  return { estimateId: row.id, version: row.version, recipient: row.customer_email, subject, body, contentHash: await sha256(canonical) };
}