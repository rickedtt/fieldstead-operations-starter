import type { Customer, Job, JobStatus, OperationsState } from './operations';

export const PROTOTYPE_LABEL = 'Golden Client Prototype';
export const WORKFLOW_STEPS = [
  'Lead',
  'Customer',
  'Job',
  'Completion',
  'Invoice',
  'Approval',
  'Payment reconciliation',
  'Audit trail',
  'Backup/Recovery',
] as const;

export type CsvRow = Record<string, string>;
export type CsvMapping = {
  customerId: string;
  jobId: string;
  customerName: string;
  email: string;
  phone: string;
  address: string;
  service: string;
  description: string;
  amount: string;
  status: string;
};

export const defaultCsvMapping: CsvMapping = {
  customerId: 'customer_ref',
  jobId: 'job_ref',
  customerName: 'customer_name',
  email: 'email',
  phone: 'phone',
  address: 'address',
  service: 'service',
  description: 'description',
  amount: 'amount',
  status: 'status',
};

export type ImportIssueKind = 'duplicate' | 'missing' | 'invalid';
export type ImportIssue = {
  row: number;
  sourceId: string;
  kind: ImportIssueKind;
  detail: string;
};

export type StagedImport = {
  counts: {
    source: number;
    imported: number;
    skipped: number;
    duplicate: number;
    missing: number;
    invalid: number;
  };
  customers: Customer[];
  jobs: Job[];
  issues: ImportIssue[];
};

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      fields.push(value.trim());
      value = '';
    } else {
      value += character;
    }
  }
  if (quoted) throw new TypeError('CSV contains an unterminated quoted field');
  fields.push(value.trim());
  return fields;
}

export function parseCsv(source: string): CsvRow[] {
  const lines = source.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  if (headers.some((header) => !header)) throw new TypeError('CSV headers cannot be blank');
  return lines.slice(1).map((line, rowIndex) => {
    const values = parseCsvLine(line);
    if (values.length !== headers.length) {
      throw new TypeError(`CSV row ${rowIndex + 2} has ${values.length} fields; expected ${headers.length}`);
    }
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}

function clean(row: CsvRow, header: string): string {
  return (row[header] ?? '').trim();
}

function validEmail(value: string): boolean {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validPhone(value: string): boolean {
  return !value || value.replace(/\D/g, '').length === 10;
}

function mappedStatus(value: string): JobStatus {
  const statuses: JobStatus[] = ['Quoted', 'Scheduled', 'En route', 'In progress', 'Completed', 'Canceled'];
  return statuses.includes(value as JobStatus) ? value as JobStatus : 'Quoted';
}

export function stageLegacyImport(
  rows: CsvRow[],
  mapping: CsvMapping,
  current: OperationsState,
  importedAt = '2026-09-05T12:00:00.000Z',
): StagedImport {
  const jobs: Job[] = [];
  const customers = new Map<string, Customer>();
  const issues: ImportIssue[] = [];
  const knownJobIds = new Set(current.jobs.map((job) => job.id.toLowerCase()));
  const seenJobIds = new Set<string>();

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const customerId = clean(row, mapping.customerId);
    const jobId = clean(row, mapping.jobId);
    const name = clean(row, mapping.customerName);
    const email = clean(row, mapping.email);
    const phone = clean(row, mapping.phone);
    const address = clean(row, mapping.address);
    const service = clean(row, mapping.service);
    const amountText = clean(row, mapping.amount);
    const sourceId = jobId || customerId || `row-${rowNumber}`;
    const missing = [
      ['customer ID', customerId], ['job ID', jobId], ['customer name', name],
      ['address', address], ['service', service], ['amount', amountText],
    ].filter(([, value]) => !value).map(([label]) => label);
    const amount = Number(amountText);

    if (missing.length) {
      issues.push({ row: rowNumber, sourceId, kind: 'missing', detail: `Missing ${missing.join(', ')}` });
      return;
    }
    if (!Number.isFinite(amount) || amount < 0 || (!email && !phone) || !validEmail(email) || !validPhone(phone)) {
      issues.push({ row: rowNumber, sourceId, kind: 'invalid', detail: 'Invalid amount or customer contact details' });
      return;
    }
    const normalizedJobId = jobId.toLowerCase();
    if (knownJobIds.has(normalizedJobId) || seenJobIds.has(normalizedJobId)) {
      issues.push({ row: rowNumber, sourceId, kind: 'duplicate', detail: `Job source ID ${jobId} already exists in this import or demo` });
      return;
    }

    seenJobIds.add(normalizedJobId);
    if (!current.customers.some((customer) => customer.id.toLowerCase() === customerId.toLowerCase()) && !customers.has(customerId.toLowerCase())) {
      customers.set(customerId.toLowerCase(), {
        id: customerId,
        name,
        email,
        phone,
        address,
        notes: `Imported from staged legacy CSV; source ID preserved: ${customerId}`,
        createdAt: importedAt,
      });
    }

    const status = mappedStatus(clean(row, mapping.status));
    jobs.push({
      id: jobId,
      customerId,
      service,
      description: clean(row, mapping.description),
      quoteStatus: status === 'Quoted' ? 'Sent' : 'Approved',
      quoteAmount: amount,
      durationHours: 2,
      crew: 'Unassigned',
      status,
      invoiceStatus: status === 'Completed' ? 'Draft' : 'Not created',
      invoiceAmount: amount,
      createdAt: importedAt,
      updatedAt: importedAt,
    });
  });

  const duplicate = issues.filter((issue) => issue.kind === 'duplicate').length;
  const missing = issues.filter((issue) => issue.kind === 'missing').length;
  const invalid = issues.filter((issue) => issue.kind === 'invalid').length;
  return {
    counts: { source: rows.length, imported: jobs.length, skipped: issues.length, duplicate, missing, invalid },
    customers: [...customers.values()],
    jobs,
    issues,
  };
}

export type DemoBackup = {
  kind: 'fieldstead-golden-client-demo-backup';
  version: 1;
  createdAt: string;
  syntheticOnly: true;
  state: OperationsState;
};

export function createBackup(state: OperationsState, createdAt = new Date().toISOString()): DemoBackup {
  return { kind: 'fieldstead-golden-client-demo-backup', version: 1, createdAt, syntheticOnly: true, state: structuredClone(state) };
}

export function parseBackup(source: string): DemoBackup {
  const value: unknown = JSON.parse(source);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Backup must be a JSON object');
  const backup = value as Partial<DemoBackup>;
  if (backup.kind !== 'fieldstead-golden-client-demo-backup' || backup.version !== 1 || backup.syntheticOnly !== true) {
    throw new TypeError('This is not a supported synthetic demo backup');
  }
  if (!backup.state || !Array.isArray(backup.state.customers) || !Array.isArray(backup.state.jobs) || !Array.isArray(backup.state.activity)) {
    throw new TypeError('Backup is missing operations data');
  }
  return backup as DemoBackup;
}
