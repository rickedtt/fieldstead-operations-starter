import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { OperationsState } from '../lib/operations';
import type { Customer, ServiceRequest } from '../packages/fieldstead-domain/src';
import { CommunicationLinkTargetSelector } from './communication-link-target-selector';

const state = {
  customers: [{ id: 'customer-1', name: 'Jamie Rivera', email: 'jamie@example.com', phone: '', address: '', notes: '', createdAt: '2026-09-25T12:00:00.000Z' }],
  jobs: [{ id: 'job-1', customerId: 'customer-1', service: 'Fence repair', description: '', status: 'Quoted', quoteStatus: 'Draft', quoteAmount: 125, invoiceStatus: 'Not created', invoiceAmount: 0, crew: '', createdAt: '2026-09-25T12:00:00.000Z', updatedAt: '2026-09-25T12:00:00.000Z' }],
  activity: [],
} as OperationsState;
const customers: Customer[] = [{ id: 'customer-1', displayName: 'Jamie Rivera', primaryEmail: 'jamie@example.com', sourceEmail: { accountId: 'account-1', messageId: 'old', normalizedFrom: 'jamie@example.com' }, audit: { createdAt: '2026-09-25T12:00:00.000Z', createdBy: 'owner', updatedAt: '2026-09-25T12:00:00.000Z', updatedBy: 'owner' } }];
const requests: ServiceRequest[] = [{ id: 'request-1', customerId: 'customer-1', summary: 'Gate damage', details: '', status: 'new', sourceEmail: { accountId: 'account-1', messageId: 'request-source', normalizedFrom: 'jamie@example.com' }, audit: { createdAt: '2026-09-25T12:00:00.000Z', createdBy: 'owner', updatedAt: '2026-09-25T12:00:00.000Z', updatedBy: 'owner' } }];

const localData = {
  listDurableCustomers: vi.fn(async () => customers),
  listDurableServiceRequests: vi.fn(async () => requests),
  getEstimateForJob: vi.fn(async () => ({ estimate: { id: 'estimate-1' } })),
  getInvoiceForJob: vi.fn(async () => ({ invoice: { id: 'invoice-1' } })),
} as never;

describe('communication link target selector', () => {
  it('renders a dedicated owner-only target picker without message content or send actions', () => {
    const html = renderToStaticMarkup(<CommunicationLinkTargetSelector state={state} localData={localData} onConfirm={vi.fn()} />);
    expect(html).toContain('Link communication metadata');
    expect(html).toContain('Owner confirmation required');
    expect(html).toContain('Customer');
    expect(html).toContain('Service request');
    expect(html).toContain('Job');
    expect(html).toContain('Estimate');
    expect(html).toContain('Invoice');
    expect(html).toContain('Choose a target');
    expect(html).toContain('Confirm metadata link');
    expect(html).toContain('disabled');
    expect(html).toContain('No message body is copied');
    expect(html).not.toContain('Send');
  });

});
