import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { Customer, Job, RecurringServiceAgreement } from '../../fieldstead-domain/src';
import { createFieldsteadRepository, type FieldsteadRepository } from './index';

const databases: FieldsteadRepository[] = [];
const audit = { createdAt: '2026-09-25T12:00:00.000Z', createdBy: 'owner-1', updatedAt: '2026-09-25T12:00:00.000Z', updatedBy: 'owner-1' };
const agreement: RecurringServiceAgreement = { id: 'agreement-1', version: 1, customerId: 'customer-1', name: 'Weekly grounds service', status: 'active', cadence: { frequency: 'weekly', interval: 1, weekdays: [1], localTime: '09:30' }, timezone: 'America/Chicago', startsOn: '2026-10-01', serviceSummary: 'Grounds service', serviceDetails: 'Perform the agreed weekly service.', pricebookItemId: 'pb-1', pricebookItemVersion: 1, generationTarget: 'serviceRequest', audit };

function customer(): Customer { return { id: 'customer-1', displayName: 'Jamie Rivera', sourceEmail: { accountId: 'manual', messageId: 'agreement-customer-1', normalizedFrom: 'jamie@example.com' }, audit }; }
function job(): Job { return { id: 'existing-job', customerId: 'customer-1', service: 'Old service', description: 'Existing record', quoteStatus: 'Draft', quoteAmount: 0, durationHours: 0, crew: 'Unassigned', status: 'Quoted', invoiceStatus: 'Not created', invoiceAmount: 0, createdAt: audit.createdAt, updatedAt: audit.updatedAt }; }
async function repository() { const repo = createFieldsteadRepository(`fieldstead-recurring-${crypto.randomUUID()}`); databases.push(repo); await repo.customers.add(customer()); await repo.jobs.add(job()); return repo; }
afterEach(async () => { await Promise.all(databases.splice(0).map((repo) => repo.delete())); });

describe('pricebook versioning and recurring generation', () => {
  it('creates immutable pricebook versions without mutating historical estimate snapshots', async () => {
    const repo = await repository();
    await repo.savePricebookItem({ item: { id: 'pb-1', version: 1, name: 'Grounds service', unit: 'visit', unitPriceCents: 10000, active: true, audit }, operationId: 'pb-v1', actorId: 'owner-1', actorRole: 'owner_admin', occurredAt: audit.createdAt, auditEventId: 'audit-pb-v1' });
    await repo.estimates.add({ id: 'estimate-1', jobId: 'existing-job', status: 'Draft', subtotalCents: 10000, audit });
    await repo.estimateLineItems.add({ id: 'line-1', estimateId: 'estimate-1', position: 0, description: 'Grounds service', quantity: 1, unit: 'visit', unitPriceCents: 10000, lineTotalCents: 10000, pricebookItemId: 'pb-1', pricebookItemName: 'Grounds service' });
    await repo.savePricebookItem({ item: { id: 'pb-1', version: 2, name: 'Grounds service', unit: 'visit', unitPriceCents: 12500, active: true, audit: { ...audit, updatedAt: '2026-09-25T13:00:00.000Z' } }, operationId: 'pb-v2', actorId: 'owner-1', actorRole: 'owner_admin', occurredAt: '2026-09-25T13:00:00.000Z', auditEventId: 'audit-pb-v2' });
    await expect(repo.listPricebookItemVersions('pb-1')).resolves.toMatchObject([{ version: 1, unitPriceCents: 10000 }, { version: 2, unitPriceCents: 12500 }]);
    await expect(repo.getEstimateForJob('existing-job')).resolves.toMatchObject({ lines: [{ unitPriceCents: 10000 }] });
  });

  it('previews without writes, requires owner approval, and generates draft requests idempotently with provenance', async () => {
    const repo = await repository();
    await repo.saveRecurringServiceAgreement({ agreement, operationId: 'agreement-save-1', actorId: 'owner-1', actorRole: 'owner_admin', occurredAt: audit.createdAt, auditEventId: 'audit-agreement-1' });
    const preview = await repo.previewRecurringServiceAgreement('agreement-1', { from: '2026-10-01', through: '2026-10-31' });
    expect(preview).toHaveLength(4);
    await expect(repo.recurringServiceOccurrences.count()).resolves.toBe(0);
    const input = { agreementId: 'agreement-1', occurrenceIds: preview.slice(0, 2).map((item) => item.id), preview, operationId: 'generate-1', actorId: 'owner-1', actorRole: 'owner_admin' as const, occurredAt: '2026-09-25T14:00:00.000Z', auditEventId: 'audit-generate-1' };
    await expect(repo.generateRecurringOccurrences({ ...input, actorRole: 'dispatcher' })).rejects.toThrow(/owner approval/i);
    const first = await repo.generateRecurringOccurrences(input);
    expect(first.replayed).toBe(false);
    expect(first.generated).toHaveLength(2);
    await expect(repo.serviceRequests.count()).resolves.toBe(2);
    await expect(repo.jobs.count()).resolves.toBe(1);
    expect((await repo.generateRecurringOccurrences(input)).replayed).toBe(true);
    await expect(repo.serviceRequests.count()).resolves.toBe(2);
    await expect(repo.recurringServiceOccurrences.toArray()).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ agreementId: 'agreement-1', status: 'generated', generatedEntityId: expect.any(String), provenanceKey: expect.stringContaining('agreement-1:') })]));
  });

  it('can explicitly generate unscheduled draft jobs and rejects duplicate occurrence generation under a new operation', async () => {
    const repo = await repository();
    await repo.saveRecurringServiceAgreement({ agreement: { ...agreement, id: 'agreement-job', generationTarget: 'job' }, operationId: 'save-job-agreement', actorId: 'owner-1', actorRole: 'owner_admin', occurredAt: audit.createdAt, auditEventId: 'audit-save-job-agreement' });
    const preview = await repo.previewRecurringServiceAgreement('agreement-job', { from: '2026-10-01', through: '2026-10-15' });
    await repo.generateRecurringOccurrences({ agreementId: 'agreement-job', occurrenceIds: [preview[0].id], preview, operationId: 'generate-job-1', actorId: 'owner-1', actorRole: 'owner_admin', occurredAt: '2026-09-25T14:00:00.000Z', auditEventId: 'audit-generate-job-1' });
    const generated = (await repo.jobs.toArray()).find((item) => item.id !== 'existing-job');
    expect(generated).toMatchObject({ status: 'Quoted', quoteStatus: 'Draft', invoiceStatus: 'Not created', crew: 'Unassigned' });
    expect(generated?.scheduledFor).toBeUndefined();
    await expect(repo.generateRecurringOccurrences({ agreementId: 'agreement-job', occurrenceIds: [preview[0].id], preview, operationId: 'generate-job-2', actorId: 'owner-1', actorRole: 'owner_admin', occurredAt: '2026-09-25T14:05:00.000Z', auditEventId: 'audit-generate-job-2' })).rejects.toThrow(/already generated/i);
  });
});
