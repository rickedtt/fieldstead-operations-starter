import { describe, expect, it } from 'vitest';
import {
  parsePricebookItem,
  parseRecurringServiceAgreement,
  parseRecurringServiceOccurrence,
  previewRecurringServiceOccurrences,
} from './index';

const audit = { createdAt: '2026-09-25T12:00:00.000Z', createdBy: 'owner-1', updatedAt: '2026-09-25T12:00:00.000Z', updatedBy: 'owner-1' };

const agreement = {
  id: 'agreement-1', customerId: 'customer-1', name: 'Weekly grounds service', status: 'active' as const,
  cadence: { frequency: 'weekly' as const, interval: 1, weekdays: [1], localTime: '09:30' },
  timezone: 'America/Chicago', startsOn: '2026-10-01', serviceSummary: 'Grounds service',
  serviceDetails: 'Perform the agreed weekly service.', pricebookItemId: 'pb-1', pricebookItemVersion: 2,
  generationTarget: 'serviceRequest' as const, audit,
};

describe('versioned pricebook and recurring agreement domain', () => {
  it('requires a positive pricebook version while retaining snapshot-compatible fields', () => {
    expect(parsePricebookItem({ id: 'pb-1', version: 2, name: 'Grounds service', unit: 'visit', unitPriceCents: 12500, active: true, audit })).toMatchObject({ id: 'pb-1', version: 2 });
    expect(() => parsePricebookItem({ id: 'pb-1', version: 0, name: 'Grounds service', unit: 'visit', unitPriceCents: 12500, active: true, audit })).toThrow(/version/);
  });

  it('strictly parses agreements and occurrence provenance', () => {
    expect(parseRecurringServiceAgreement(agreement)).toMatchObject({ timezone: 'America/Chicago', generationTarget: 'serviceRequest' });
    expect(parseRecurringServiceOccurrence({ id: 'occ-1', agreementId: 'agreement-1', agreementVersion: 1, scheduledFor: '2026-10-05T14:30:00.000Z', localDate: '2026-10-05', status: 'preview', generationTarget: 'serviceRequest', provenanceKey: 'agreement-1:2026-10-05T14:30:00.000Z' })).toMatchObject({ status: 'preview' });
    expect(() => parseRecurringServiceAgreement({ ...agreement, timezone: 'Not/AZone' })).toThrow(/timezone/);
  });

  it('previews timezone-safe occurrences across daylight saving time with bounded limits', () => {
    const preview = previewRecurringServiceOccurrences(agreement, { from: '2026-10-25', through: '2026-11-15' });
    expect(preview.map((item) => item.scheduledFor)).toEqual([
      '2026-10-26T14:30:00.000Z',
      '2026-11-02T15:30:00.000Z',
      '2026-11-09T15:30:00.000Z',
    ]);
    expect(() => previewRecurringServiceOccurrences(agreement, { from: '2026-10-01', through: '2026-12-31' })).toThrow(/90 days/);
    expect(() => previewRecurringServiceOccurrences({ ...agreement, cadence: { frequency: 'daily', interval: 1, localTime: '09:30' } }, { from: '2026-10-01', through: '2026-12-29', maxOccurrences: 89 })).toThrow(/occurrence limit/);
  });
});
