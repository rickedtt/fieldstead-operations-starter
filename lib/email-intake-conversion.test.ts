import { describe, expect, it } from 'vitest';
import type { Customer } from '../packages/fieldstead-domain/src';
import {
  buildEmailIntakeConversion,
  findEmailIntakeDuplicateCandidates,
  normalizeEmailIntakeAddress,
  normalizeEmailIntakeEmail,
  normalizeEmailIntakePhone,
} from './email-intake-conversion';

const source = {
  accountId: 'account-primary',
  messageId: 'msg-1042',
  from: ' Jamie@Example.COM ',
  receivedAt: '2026-09-24T14:30:00-05:00',
};
const draft = {
  name: 'Jamie Rivera', email: ' Jamie@Example.COM ', phone: '(312) 555-0142',
  summary: 'Fence repair at 42 Oak Street', service: 'Fence repair', location: '42 Oak St.',
};

function existingCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'customer-existing', displayName: 'Jamie R.', primaryEmail: 'jamie@example.com',
    primaryPhone: '3125550142', serviceAddress: '42 oak street',
    sourceEmail: { accountId: 'old-mailbox', messageId: 'old-message', normalizedFrom: 'jamie@example.com' },
    audit: { createdAt: '2026-09-01T12:00:00.000Z', createdBy: 'owner-1', updatedAt: '2026-09-01T12:00:00.000Z', updatedBy: 'owner-1' },
    ...overrides,
  };
}

describe('email intake conversion planning', () => {
  it('normalizes duplicate keys and reports candidates without merging them', () => {
    expect(normalizeEmailIntakeEmail(' Jamie@Example.COM ')).toBe('jamie@example.com');
    expect(normalizeEmailIntakePhone('+1 (312) 555-0142')).toBe('3125550142');
    expect(normalizeEmailIntakeAddress(' 42 Oak St., Chicago ')).toBe('42 oak street chicago');
    expect(findEmailIntakeDuplicateCandidates(draft, [existingCustomer()])).toEqual([
      { customerId: 'customer-existing', displayName: 'Jamie R.', matchedOn: ['email', 'phone', 'address'] },
    ]);
  });

  it('builds a combined customer and service-request write with source identity', () => {
    const conversion = buildEmailIntakeConversion({
      approval: 'customer-and-request', source, draft, actorId: 'owner-1',
      occurredAt: '2026-09-24T20:00:00.000Z', customerId: 'customer-new',
      serviceRequestId: 'request-new', operationId: 'email-intake-op-1',
      customerAuditEventId: 'audit-customer', requestAuditEventId: 'audit-request',
    });

    expect(conversion.customer).toMatchObject({
      id: 'customer-new', displayName: 'Jamie Rivera', primaryEmail: 'jamie@example.com',
      primaryPhone: '3125550142', serviceAddress: '42 Oak St.',
      sourceEmail: { accountId: 'account-primary', messageId: 'msg-1042', normalizedFrom: 'jamie@example.com' },
    });
    expect(conversion.serviceRequest).toMatchObject({
      id: 'request-new', customerId: 'customer-new', summary: 'Fence repair at 42 Oak Street',
      details: 'Service: Fence repair\nLocation: 42 Oak St.', status: 'new',
    });
    expect(conversion.auditEvents).toHaveLength(2);
    expect(conversion.outboxOperations.map((operation) => operation.kind)).toEqual([
      'customer.create-from-email', 'serviceRequest.create-from-email',
    ]);
  });

  it('requires an existing customer for request-only conversion', () => {
    expect(() => buildEmailIntakeConversion({
      approval: 'request-only', source, draft, actorId: 'owner-1',
      occurredAt: '2026-09-24T20:00:00.000Z', serviceRequestId: 'request-new',
      operationId: 'email-intake-op-1', requestAuditEventId: 'audit-request',
    })).toThrow(/existing customer/i);
  });
});
