import type {
  InvoiceRepository,
  PaymentLinkRepository,
  PaymentLinkRequestRecord,
} from './billing-service';
import type { StripeCheckoutCompleted } from '../packages/fieldstead-sync/src/billing';
import type { StripeWebhookRepository } from './stripe-webhook';

type InvoiceRow = {
  id: string;
  organization_id: string;
  job_id: string;
  customer_id: string;
  invoice_number: string;
  issued_at: string;
  currency: 'usd';
  amount_due_cents: number;
  customer_name: string;
  customer_email: string | null;
  customer_address: string | null;
  service: string;
};

type PaymentLinkRow = {
  id: string;
  organization_id: string;
  invoice_id: string;
  approved_by_user_id: string;
  idempotency_key: string;
  status: PaymentLinkRequestRecord['status'];
  created_at: string;
};

const SELECT_INVOICE = `
  SELECT i.id, i.organization_id, i.job_id, i.customer_id, i.invoice_number,
         i.issued_at, i.currency, i.amount_due_cents,
         c.name AS customer_name, c.email AS customer_email,
         c.service_address AS customer_address, j.service
  FROM invoices i
  JOIN customers c
    ON c.organization_id = i.organization_id AND c.id = i.customer_id
  JOIN jobs j
    ON j.organization_id = i.organization_id AND j.id = i.job_id
  WHERE i.organization_id = ? AND i.id = ?
  LIMIT 1
`;

export class D1InvoiceRepository implements InvoiceRepository {
  constructor(private readonly db: D1Database) {}

  async findForTenant(organizationId: string, invoiceId: string): Promise<unknown | null> {
    const row = await this.db.prepare(SELECT_INVOICE).bind(organizationId, invoiceId).first<InvoiceRow>();
    if (!row) return null;
    return {
      id: row.id,
      organizationId: row.organization_id,
      jobId: row.job_id,
      customerId: row.customer_id,
      number: row.invoice_number,
      issuedAt: row.issued_at,
      currency: row.currency,
      customer: {
        name: row.customer_name,
        email: row.customer_email,
        address: row.customer_address,
      },
      lineItems: [{ description: row.service, quantity: 1, unitAmountCents: row.amount_due_cents }],
      amountDueCents: row.amount_due_cents,
    };
  }
}

export class D1PaymentLinkRepository implements PaymentLinkRepository {
  constructor(private readonly db: D1Database) {}

  async findByIdempotencyKey(organizationId: string, key: string): Promise<PaymentLinkRequestRecord | null> {
    const row = await this.db.prepare(`
      SELECT id, organization_id, invoice_id, approved_by_user_id,
             idempotency_key, status, created_at
      FROM payment_link_requests
      WHERE organization_id = ? AND idempotency_key = ?
      LIMIT 1
    `).bind(organizationId, key).first<PaymentLinkRow>();
    return row ? {
      id: row.id,
      organizationId: row.organization_id,
      invoiceId: row.invoice_id,
      approvedByUserId: row.approved_by_user_id,
      idempotencyKey: row.idempotency_key,
      status: row.status,
      createdAt: row.created_at,
    } : null;
  }

  create(record: PaymentLinkRequestRecord): Promise<D1Result<unknown>> {
    return this.db.prepare(`
      INSERT INTO payment_link_requests (
        id, organization_id, invoice_id, approved_by_user_id, idempotency_key,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      record.id,
      record.organizationId,
      record.invoiceId,
      record.approvedByUserId,
      record.idempotencyKey,
      record.status,
      record.createdAt,
      record.createdAt,
    ).run();
  }

  markProviderResult(
    organizationId: string,
    requestId: string,
    result: { status: 'READY'; providerReference: string } | { status: 'RETRYABLE' },
  ): Promise<D1Result<unknown>> {
    return this.db.prepare(`
      UPDATE payment_link_requests
      SET status = ?, provider_reference = ?, updated_at = ?
      WHERE organization_id = ? AND id = ?
    `).bind(
      result.status,
      result.status === 'READY' ? result.providerReference : null,
      new Date().toISOString(),
      organizationId,
      requestId,
    ).run();
  }
}

type ReconciliationInvoice = {
  id: string;
  job_id: string;
  customer_id: string;
  created_by_user_id: string;
};

export class D1StripeWebhookRepository implements StripeWebhookRepository {
  constructor(private readonly db: D1Database) {}

  async reconcileCheckout(event: StripeCheckoutCompleted): Promise<'APPLIED' | 'DUPLICATE' | 'NOT_FOUND' | 'RETRYABLE'> {
    try {
      const duplicate = await this.db.prepare(`
        SELECT provider_event_id FROM payment_webhook_events
        WHERE provider = 'stripe' AND provider_event_id = ? LIMIT 1
      `).bind(event.eventId).first<{ provider_event_id: string }>();
      if (duplicate) return 'DUPLICATE';

      const invoice = await this.db.prepare(`
        SELECT id, job_id, customer_id, created_by_user_id
        FROM invoices WHERE organization_id = ? AND id = ? LIMIT 1
      `).bind(event.organizationId, event.invoiceId).first<ReconciliationInvoice>();
      if (!invoice) return 'NOT_FOUND';

      const processedAt = new Date().toISOString();
      const activityId = `stripe:${event.eventId}:invoice-paid`;
      await this.db.batch([
        this.db.prepare(`
          INSERT INTO payment_webhook_events (
            provider, provider_event_id, organization_id, invoice_id,
            checkout_session_id, event_type, occurred_at, processed_at
          ) VALUES ('stripe', ?, ?, ?, ?, 'checkout.session.completed', ?, ?)
        `).bind(
          event.eventId, event.organizationId, event.invoiceId,
          event.checkoutSessionId, event.occurredAt, processedAt,
        ),
        this.db.prepare(`
          INSERT INTO activity_events (
            id, organization_id, job_id, customer_id, actor_user_id, event_type,
            detail_json, occurred_at, version, created_at, updated_at
          )
          SELECT ?, organization_id, job_id, customer_id, created_by_user_id,
                 'invoice.paid', ?, ?, 1, ?, ?
          FROM invoices
          WHERE organization_id = ? AND id = ? AND status <> 'paid'
        `).bind(
          activityId,
          JSON.stringify({ invoiceId: event.invoiceId, provider: 'stripe', providerEventId: event.eventId }),
          event.occurredAt,
          processedAt,
          processedAt,
          event.organizationId,
          event.invoiceId,
        ),
        this.db.prepare(`
          UPDATE invoices
          SET status = 'paid', paid_at = ?, paid_provider = 'stripe',
              paid_provider_event_id = ?, checkout_session_id = ?,
              version = version + 1, updated_at = ?
          WHERE organization_id = ? AND id = ? AND status <> 'paid'
        `).bind(
          event.occurredAt,
          event.eventId,
          event.checkoutSessionId,
          processedAt,
          event.organizationId,
          event.invoiceId,
        ),
      ]);
      return 'APPLIED';
    } catch {
      try {
        const winner = await this.db.prepare(`
          SELECT provider_event_id FROM payment_webhook_events
          WHERE provider = 'stripe' AND provider_event_id = ? LIMIT 1
        `).bind(event.eventId).first<{ provider_event_id: string }>();
        if (winner) return 'DUPLICATE';
      } catch {
        // Preserve the retryable outcome when D1 is still unavailable.
      }
      return 'RETRYABLE';
    }
  }
}
