import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { seedState } from './operations';
import {
  PROTOTYPE_LABEL,
  WORKFLOW_STEPS,
  createBackup,
  defaultCsvMapping,
  parseBackup,
  parseCsv,
  stageLegacyImport,
} from './client-delivery';

const sampleCsv = [
  'customer_ref,job_ref,customer_name,email,phone,address,service,description,amount,status',
  'LEG-C001,LEG-J001,Jamie Test,jamie.test@example.com,(312) 555-0101,"101 Demo Ave, Chicago, IL",Window washing,Exterior only,325,Completed',
  'LEG-C001,LEG-J002,Jamie Test,jamie.test@example.com,(312) 555-0101,"101 Demo Ave, Chicago, IL",Gutter cleaning,Front elevation,225,Scheduled',
].join('\n');

describe('client delivery CSV staging', () => {
  it('parses quoted CSV fields and maps rows without mutating source state', () => {
    const before = structuredClone(seedState);
    const rows = parseCsv(sampleCsv);
    const staged = stageLegacyImport(rows, defaultCsvMapping, seedState);

    expect(rows).toHaveLength(2);
    expect(rows[0]?.address).toBe('101 Demo Ave, Chicago, IL');
    expect(staged.customers[0]?.id).toBe('LEG-C001');
    expect(staged.jobs.map((job) => job.id)).toEqual(['LEG-J001', 'LEG-J002']);
    expect(seedState).toEqual(before);
  });

  it('reports duplicate, missing, and invalid rows before confirmation', () => {
    const csv = readFileSync('public/demo-data/legacy-client-jobs.csv', 'utf8');
    const staged = stageLegacyImport(parseCsv(csv), defaultCsvMapping, seedState);

    expect(staged.counts.source).toBeGreaterThanOrEqual(6);
    expect(staged.counts.duplicate).toBeGreaterThanOrEqual(1);
    expect(staged.counts.missing).toBeGreaterThanOrEqual(1);
    expect(staged.counts.invalid).toBeGreaterThanOrEqual(1);
    expect(staged.counts.imported + staged.counts.skipped).toBe(staged.counts.source);
  });
});

describe('synthetic backup contract', () => {
  it('roundtrips the complete operations state', () => {
    const backup = createBackup(seedState, '2026-09-05T12:00:00.000Z');
    const restored = parseBackup(JSON.stringify(backup));

    expect(restored.state).toEqual(seedState);
    expect(restored.kind).toBe('fieldstead-golden-client-demo-backup');
  });
});

describe('required prototype labels', () => {
  it('names the prototype and every delivery handoff', () => {
    expect(PROTOTYPE_LABEL).toBe('Golden Client Prototype');
    expect(WORKFLOW_STEPS).toEqual([
      'Lead', 'Customer', 'Job', 'Completion', 'Invoice', 'Approval',
      'Payment reconciliation', 'Audit trail', 'Backup/Recovery',
    ]);
  });
});
