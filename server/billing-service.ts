import {
  parseInvoiceDocument,
  parseInvoicePdfRequest,
  parsePaymentLinkRequest,
  type InvoiceDocument,
} from '../packages/fieldstead-sync/src/billing';
import type { AuthIdentity } from './types';

export type PaymentLinkRequestRecord = {
  id: string;
  organizationId: string;
  invoiceId: string;
  approvedByUserId: string;
  idempotencyKey: string;
  status: 'UNCONFIGURED' | 'PENDING' | 'READY' | 'RETRYABLE';
  createdAt: string;
};

export interface InvoiceRepository {
  findForTenant(organizationId: string, invoiceId: string): Promise<unknown | null>;
}

export interface InvoiceRenderer {
  render(document: InvoiceDocument): Promise<Uint8Array>;
}

export interface PaymentLinkRepository {
  findByIdempotencyKey(organizationId: string, key: string): Promise<PaymentLinkRequestRecord | null>;
  create(record: PaymentLinkRequestRecord): Promise<unknown>;
  markProviderResult(
    organizationId: string,
    requestId: string,
    result: { status: 'READY'; providerReference: string } | { status: 'RETRYABLE' },
  ): Promise<unknown>;
}

export type PaymentProvider = {
  status: 'UNCONFIGURED' | 'CONFIGURED';
  createPaymentLink(input: {
    requestId: string;
    invoiceId: string;
    organizationId: string;
    amountDueCents: number;
    currency: 'usd';
  }): Promise<{ providerReference: string }>;
};

export class BillingAccessError extends Error {
  constructor(message: string, readonly status: 403 | 404) {
    super(message);
    this.name = 'BillingAccessError';
  }
}

export class BillingInputError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = 'BillingInputError';
  }
}

export class BillingDependencyError extends Error {
  readonly outcome = 'UNCONFIGURED' as const;

  constructor(message: string, readonly status = 503) {
    super(message);
    this.name = 'BillingDependencyError';
  }
}

function parse<T>(parser: (input: unknown) => T, input: unknown): T {
  try {
    return parser(input);
  } catch (error) {
    throw new BillingInputError(error instanceof Error ? error.message : 'Invalid billing input.');
  }
}

function canReadInvoices(identity: AuthIdentity): boolean {
  return identity.role === 'owner_admin' || identity.role === 'dispatcher';
}

export async function generateInvoicePdf(
  identity: AuthIdentity,
  input: unknown,
  dependencies: { invoices: InvoiceRepository; renderer: InvoiceRenderer },
): Promise<Uint8Array> {
  if (!canReadInvoices(identity)) throw new BillingAccessError('Invoice documents require office access.', 403);
  const request = parse(parseInvoicePdfRequest, input);
  const stored = await dependencies.invoices.findForTenant(identity.organization_id, request.invoiceId);
  if (!stored) throw new BillingAccessError('Invoice not found.', 404);
  const document = parse(parseInvoiceDocument, stored);
  if (document.organizationId !== identity.organization_id) {
    throw new BillingAccessError('Invoice not found.', 404);
  }
  return dependencies.renderer.render(document);
}

export async function requestInvoicePaymentLink(
  identity: AuthIdentity,
  input: unknown,
  dependencies: {
    invoices: InvoiceRepository;
    paymentLinks: PaymentLinkRepository;
    provider: PaymentProvider;
    now?: () => string;
    newId?: () => string;
  },
): Promise<{ outcome: 'UNCONFIGURED' | 'READY' | 'RETRYABLE'; requestId: string; invoiceId: string }> {
  if (identity.role !== 'owner_admin') {
    throw new BillingAccessError('Only an owner administrator may approve a payment link.', 403);
  }
  const request = parse(parsePaymentLinkRequest, input);
  const existing = await dependencies.paymentLinks.findByIdempotencyKey(
    identity.organization_id,
    request.idempotencyKey,
  );
  if (existing) {
    const outcome = existing.status === 'READY' ? 'READY'
      : existing.status === 'UNCONFIGURED' ? 'UNCONFIGURED' : 'RETRYABLE';
    return { outcome, requestId: existing.id, invoiceId: existing.invoiceId };
  }
  const stored = await dependencies.invoices.findForTenant(identity.organization_id, request.invoiceId);
  if (!stored) throw new BillingAccessError('Invoice not found.', 404);
  const invoice = parse(parseInvoiceDocument, stored);
  if (invoice.organizationId !== identity.organization_id) throw new BillingAccessError('Invoice not found.', 404);

  const requestId = dependencies.newId?.() ?? crypto.randomUUID();
  const status = dependencies.provider.status === 'UNCONFIGURED' ? 'UNCONFIGURED' : 'PENDING';
  await dependencies.paymentLinks.create({
    id: requestId,
    organizationId: identity.organization_id,
    invoiceId: invoice.id,
    approvedByUserId: identity.user_id,
    idempotencyKey: request.idempotencyKey,
    status,
    createdAt: dependencies.now?.() ?? new Date().toISOString(),
  });
  if (dependencies.provider.status === 'UNCONFIGURED') {
    return { outcome: 'UNCONFIGURED', requestId, invoiceId: invoice.id };
  }
  try {
    const result = await dependencies.provider.createPaymentLink({
      requestId,
      invoiceId: invoice.id,
      organizationId: identity.organization_id,
      amountDueCents: invoice.amountDueCents,
      currency: invoice.currency,
    });
    await dependencies.paymentLinks.markProviderResult(identity.organization_id, requestId, {
      status: 'READY', providerReference: result.providerReference,
    });
    return { outcome: 'READY', requestId, invoiceId: invoice.id };
  } catch {
    await dependencies.paymentLinks.markProviderResult(identity.organization_id, requestId, { status: 'RETRYABLE' });
    return { outcome: 'RETRYABLE', requestId, invoiceId: invoice.id };
  }
}
