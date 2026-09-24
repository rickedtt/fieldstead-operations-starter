import type { ActivityEvent, Customer, OutboxOperation, ServiceRequest } from '../packages/fieldstead-domain/src';
import type { EmailIntakeConversion } from '../packages/fieldstead-local-store/src';

export type EmailIntakeDraft = { name: string; email: string; phone: string; summary: string; service: string; location: string };
export type EmailIntakeApproval = EmailIntakeConversion['approval'];

export function normalizeEmailIntakeEmail(value: string): string { return value.trim().toLowerCase(); }
export function normalizeEmailIntakePhone(value: string): string { const digits = value.replace(/\D/g, ''); return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits; }
export function normalizeEmailIntakeAddress(value: string): string {
  const aliases: Record<string, string> = { st: 'street', rd: 'road', ave: 'avenue', blvd: 'boulevard', ln: 'lane', dr: 'drive', ct: 'court' };
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean).map((part) => aliases[part] ?? part).join(' ');
}

export function findEmailIntakeDuplicateCandidates(draft: EmailIntakeDraft, customers: Customer[]) {
  const email = normalizeEmailIntakeEmail(draft.email), phone = normalizeEmailIntakePhone(draft.phone), address = normalizeEmailIntakeAddress(draft.location);
  return customers.flatMap((customer) => {
    const matchedOn: Array<'email' | 'phone' | 'address'> = [];
    if (email && normalizeEmailIntakeEmail(customer.primaryEmail ?? '') === email) matchedOn.push('email');
    if (phone && normalizeEmailIntakePhone(customer.primaryPhone ?? '') === phone) matchedOn.push('phone');
    if (address && normalizeEmailIntakeAddress(customer.serviceAddress ?? '') === address) matchedOn.push('address');
    return matchedOn.length ? [{ customerId: customer.id, displayName: customer.displayName, matchedOn }] : [];
  });
}

export function buildEmailIntakeConversion(input: {
  approval: EmailIntakeApproval; source: { accountId: string; messageId: string; from: string; receivedAt: string };
  draft: EmailIntakeDraft; actorId: string; occurredAt: string; operationId: string;
  customerId?: string; existingCustomerId?: string; serviceRequestId?: string;
  customerAuditEventId?: string; requestAuditEventId?: string;
}): EmailIntakeConversion {
  const sourceEmail = { accountId: input.source.accountId, messageId: input.source.messageId, normalizedFrom: normalizeEmailIntakeEmail(input.source.from) };
  const audit = { createdAt: input.occurredAt, createdBy: input.actorId, updatedAt: input.occurredAt, updatedBy: input.actorId };
  const createsCustomer = input.approval !== 'request-only';
  const createsRequest = input.approval !== 'customer-only';
  const customerId = createsCustomer ? input.customerId : input.existingCustomerId;
  if (createsRequest && !customerId) throw new Error('Request-only conversion requires an existing customer');
  if (createsCustomer && !input.customerId) throw new Error('Customer conversion requires a customer id');
  if (createsRequest && !input.serviceRequestId) throw new Error('Request conversion requires a service request id');
  if (createsCustomer && !input.customerAuditEventId) throw new Error('Customer conversion requires an audit event id');
  if (createsRequest && !input.requestAuditEventId) throw new Error('Request conversion requires an audit event id');
  const customer: Customer | undefined = createsCustomer ? { id: input.customerId!, displayName: input.draft.name.trim(), primaryEmail: normalizeEmailIntakeEmail(input.draft.email), primaryPhone: normalizeEmailIntakePhone(input.draft.phone) || undefined, serviceAddress: input.draft.location.trim() || undefined, sourceEmail, audit } : undefined;
  const details = [`Service: ${input.draft.service.trim()}`, `Location: ${input.draft.location.trim()}`].filter((line) => !line.endsWith(': ')).join('\n');
  const serviceRequest: ServiceRequest | undefined = createsRequest ? { id: input.serviceRequestId!, customerId: customerId!, summary: input.draft.summary.trim(), details: details || input.draft.summary.trim(), status: 'new', sourceEmail, audit } : undefined;
  const auditEvents: ActivityEvent[] = [];
  const outboxOperations: OutboxOperation[] = [];
  if (customer) {
    auditEvents.push({ id: input.customerAuditEventId!, at: input.occurredAt, customerId: customer.id, actor: input.actorId, action: 'Email intake customer created', detail: `Created from ${sourceEmail.accountId} / ${sourceEmail.messageId}.` });
    outboxOperations.push({ id: `${input.operationId}:customer`, entityType: 'customer', entityId: customer.id, kind: 'customer.create-from-email', payload: customer as unknown as Record<string, unknown>, createdAt: input.occurredAt, status: 'pending' });
  }
  if (serviceRequest) {
    auditEvents.push({ id: input.requestAuditEventId!, at: input.occurredAt, customerId: serviceRequest.customerId, actor: input.actorId, action: 'Email intake service request created', detail: `Created ${serviceRequest.id} from ${sourceEmail.accountId} / ${sourceEmail.messageId}.` });
    outboxOperations.push({ id: `${input.operationId}:request`, entityType: 'serviceRequest', entityId: serviceRequest.id, kind: 'serviceRequest.create-from-email', payload: serviceRequest as unknown as Record<string, unknown>, createdAt: input.occurredAt, status: 'pending' });
  }
  return { operationId: input.operationId, approval: input.approval, customer, serviceRequest, auditEvents, outboxOperations };
}
