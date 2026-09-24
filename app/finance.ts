import type { InvoiceStatus, OperationsState } from '../lib/operations';

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
