import type { InvoiceStatus, OperationsState } from '../lib/operations';
import type { Invoice, PaymentEntry } from '../packages/fieldstead-domain/src';

export type FinanceInvoice = {
  jobId: string;
  customerName: string;
  service: string;
  status: Exclude<InvoiceStatus, 'Not created'>;
  amount: number;
  dueAt?: string;
  paidAt?: string;
};

export type FinanceSnapshot = {
  totals: { invoiced: number; outstanding: number; overdue: number; paid: number };
  invoices: FinanceInvoice[];
};

const financeStatusOrder: Record<FinanceInvoice['status'], number> = {
  Overdue: 0,
  Sent: 1,
  Draft: 2,
  Paid: 3,
};

export function buildFinanceSnapshot(state: OperationsState): FinanceSnapshot {
  const customerNames = new Map(state.customers.map((customer) => [customer.id, customer.name]));
  const invoices = state.jobs
    .filter((job): job is typeof job & { invoiceStatus: FinanceInvoice['status'] } => job.invoiceStatus !== 'Not created')
    .map((job) => ({
      jobId: job.id,
      customerName: customerNames.get(job.customerId) || 'Unknown customer',
      service: job.service,
      status: job.invoiceStatus,
      amount: job.invoiceAmount,
      dueAt: job.invoiceDueAt,
      paidAt: job.paidAt,
    }))
    .sort((left, right) => financeStatusOrder[left.status] - financeStatusOrder[right.status] || right.amount - left.amount);

  return {
    totals: {
      invoiced: invoices.reduce((sum, invoice) => sum + invoice.amount, 0),
      outstanding: invoices.filter((invoice) => invoice.status !== 'Paid').reduce((sum, invoice) => sum + invoice.amount, 0),
      overdue: invoices.filter((invoice) => invoice.status === 'Overdue').reduce((sum, invoice) => sum + invoice.amount, 0),
      paid: invoices.filter((invoice) => invoice.status === 'Paid').reduce((sum, invoice) => sum + invoice.amount, 0),
    },
    invoices,
  };
}

export type FinanceLedgerInvoice = Invoice & { customerName: string; service: string; paidCents: number; balanceCents: number; payments: PaymentEntry[] };
export type FinanceLedgerSnapshot = { totals: { invoicedCents: number; outstandingCents: number; overdueCents: number; paidCents: number }; invoices: FinanceLedgerInvoice[] };

export function buildFinanceLedgerSnapshot(invoices: Invoice[], entries: PaymentEntry[], customerNames: Map<string, string>, jobServices: Map<string, string>, now: string): FinanceLedgerSnapshot {
  const rows = invoices.map((invoice) => {
    const payments = entries.filter((entry) => entry.invoiceId === invoice.id).sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id));
    const paidCents = payments.reduce((sum, entry) => sum + (entry.kind === 'payment' ? entry.amountCents : -entry.amountCents), 0);
    return { ...invoice, customerName: customerNames.get(invoice.customerId) || 'Unknown customer', service: jobServices.get(invoice.jobId) || 'Unknown service', paidCents, balanceCents: invoice.subtotalCents - paidCents, payments };
  }).sort((left, right) => right.issuedAt.localeCompare(left.issuedAt) || left.id.localeCompare(right.id));
  return { totals: { invoicedCents: rows.reduce((sum, row) => sum + row.subtotalCents, 0), outstandingCents: rows.reduce((sum, row) => sum + row.balanceCents, 0), overdueCents: rows.filter((row) => row.balanceCents > 0 && (row.status === 'Overdue' || Boolean(row.dueAt && row.dueAt < now))).reduce((sum, row) => sum + row.balanceCents, 0), paidCents: rows.reduce((sum, row) => sum + row.paidCents, 0) }, invoices: rows };
}
