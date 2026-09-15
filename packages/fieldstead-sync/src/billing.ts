export type InvoiceDocument = {
  id: string;
  organizationId: string;
  jobId: string;
  customerId: string;
  number: string;
  issuedAt: string;
  currency: 'usd';
  customer: { name: string; email: string | null; address: string | null };
  lineItems: Array<{ description: string; quantity: number; unitAmountCents: number }>;
  amountDueCents: number;
};

export type InvoicePdfRequest = { invoiceId: string };
export type PaymentLinkRequest = { invoiceId: string; idempotencyKey: string };
export type StripeCheckoutCompleted = {
  eventId: string;
  checkoutSessionId: string;
  organizationId: string;
  invoiceId: string;
  occurredAt: string;
};

type UnknownRecord = Record<string, unknown>;

function record(value: unknown, name: string): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value as UnknownRecord;
}

function string(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}

function nullableString(value: unknown, name: string): string | null {
  if (value === null) return null;
  return string(value, name);
}

function integer(value: unknown, name: string, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) {
    throw new TypeError(`${name} must be an integer of at least ${minimum}`);
  }
  return value;
}

function isoInstant(value: unknown, name: string): string {
  const parsed = string(value, name);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(parsed) || Number.isNaN(Date.parse(parsed))) {
    throw new TypeError(`${name} must be an ISO-8601 timestamp`);
  }
  return parsed;
}

export function parseInvoicePdfRequest(value: unknown): InvoicePdfRequest {
  const input = record(value, 'InvoicePdfRequest');
  return { invoiceId: string(input.invoiceId, 'InvoicePdfRequest.invoiceId') };
}

export function parsePaymentLinkRequest(value: unknown): PaymentLinkRequest {
  const input = record(value, 'PaymentLinkRequest');
  return {
    invoiceId: string(input.invoiceId, 'PaymentLinkRequest.invoiceId'),
    idempotencyKey: string(input.idempotencyKey, 'PaymentLinkRequest.idempotencyKey'),
  };
}

export function parseInvoiceDocument(value: unknown): InvoiceDocument {
  const input = record(value, 'InvoiceDocument');
  const customer = record(input.customer, 'InvoiceDocument.customer');
  if (!Array.isArray(input.lineItems) || input.lineItems.length === 0) {
    throw new TypeError('InvoiceDocument.lineItems must be a non-empty array');
  }
  const lineItems = input.lineItems.map((value, index) => {
    const item = record(value, `InvoiceDocument.lineItems[${index}]`);
    return {
      description: string(item.description, `InvoiceDocument.lineItems[${index}].description`),
      quantity: integer(item.quantity, `InvoiceDocument.lineItems[${index}].quantity`, 1),
      unitAmountCents: integer(item.unitAmountCents, `InvoiceDocument.lineItems[${index}].unitAmountCents`),
    };
  });
  const amountDueCents = integer(input.amountDueCents, 'InvoiceDocument.amountDueCents');
  const calculated = lineItems.reduce(
    (total, item) => total + item.quantity * item.unitAmountCents,
    0,
  );
  if (!Number.isSafeInteger(calculated) || amountDueCents !== calculated) {
    throw new TypeError('InvoiceDocument.amountDueCents must equal the line-item total');
  }
  if (input.currency !== 'usd') throw new TypeError('InvoiceDocument.currency must be usd');

  return {
    id: string(input.id, 'InvoiceDocument.id'),
    organizationId: string(input.organizationId, 'InvoiceDocument.organizationId'),
    jobId: string(input.jobId, 'InvoiceDocument.jobId'),
    customerId: string(input.customerId, 'InvoiceDocument.customerId'),
    number: string(input.number, 'InvoiceDocument.number'),
    issuedAt: isoInstant(input.issuedAt, 'InvoiceDocument.issuedAt'),
    currency: 'usd',
    customer: {
      name: string(customer.name, 'InvoiceDocument.customer.name'),
      email: nullableString(customer.email, 'InvoiceDocument.customer.email'),
      address: nullableString(customer.address, 'InvoiceDocument.customer.address'),
    },
    lineItems,
    amountDueCents,
  };
}

export function parseStripeCheckoutCompleted(value: unknown): StripeCheckoutCompleted {
  const event = record(value, 'StripeEvent');
  if (event.type !== 'checkout.session.completed') {
    throw new TypeError('StripeEvent.type must be checkout.session.completed');
  }
  const data = record(event.data, 'StripeEvent.data');
  const object = record(data.object, 'StripeEvent.data.object');
  if (object.payment_status !== 'paid') {
    throw new TypeError('StripeEvent.data.object.payment_status must be paid');
  }
  const metadata = record(object.metadata, 'StripeEvent.data.object.metadata');
  const created = integer(event.created, 'StripeEvent.created');
  return {
    eventId: string(event.id, 'StripeEvent.id'),
    checkoutSessionId: string(object.id, 'StripeEvent.data.object.id'),
    organizationId: string(metadata.organization_id, 'StripeEvent.data.object.metadata.organization_id'),
    invoiceId: string(metadata.invoice_id, 'StripeEvent.data.object.metadata.invoice_id'),
    occurredAt: new Date(created * 1000).toISOString(),
  };
}
