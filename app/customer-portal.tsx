import type { PortalEstimate, PortalInvoice, PortalJob } from '../server/portal-service';

export type CustomerPortalSnapshot = {
  jobs: PortalJob[];
  estimates: PortalEstimate[];
  invoices: PortalInvoice[];
};

const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function when(value: string | null): string {
  return value ? date.format(new Date(value)) : 'Not scheduled';
}

export function CustomerPortal({ snapshot }: { snapshot: CustomerPortalSnapshot }) {
  return <main className="customer-portal">
    <header className="customer-portal-header"><div><p className="eyebrow">FIELDSTEAD SYSTEMS</p><h1>Customer portal</h1><p>Track estimates, scheduled work, invoices, and payment status.</p></div><span className="customer-portal-readonly">Read-only</span></header>
    <nav aria-label="Customer portal sections"><a href="#estimates">Estimates</a><a href="#appointments">Jobs &amp; appointments</a><a href="#invoices">Invoices</a></nav>
    <section id="estimates" aria-labelledby="portal-estimates"><h2 id="portal-estimates">Estimates</h2>{snapshot.estimates.length ? <div className="customer-portal-list">{snapshot.estimates.map((estimate) => <article key={estimate.id}><div><strong>{estimate.estimateNumber}</strong><small>Issued {when(estimate.issuedAt)}</small></div><span>{estimate.status}</span><b>{money.format(estimate.subtotalCents / 100)}</b></article>)}</div> : <p>No estimates are available.</p>}</section>
    <section id="appointments" aria-labelledby="portal-appointments"><h2 id="portal-appointments">Jobs &amp; appointments</h2>{snapshot.jobs.length ? <div className="customer-portal-list">{snapshot.jobs.map((job) => <article key={job.id}><div><strong>{job.service}</strong><small>{job.description}</small></div><span>{job.status}</span><time dateTime={job.scheduledFor || undefined}>{when(job.scheduledFor)}</time></article>)}</div> : <p>No jobs or appointments are available.</p>}</section>
    <section id="invoices" aria-labelledby="portal-invoices"><h2 id="portal-invoices">Invoices &amp; payment status</h2>{snapshot.invoices.length ? <div className="customer-portal-list">{snapshot.invoices.map((invoice) => <article key={invoice.id}><div><strong>{invoice.invoiceNumber}</strong><small>Issued {when(invoice.issuedAt)}</small></div><span>{invoice.status}</span><b>{money.format(invoice.amountDueCents / 100)}</b></article>)}</div> : <p>No invoices are available.</p>}</section>
    <footer>This portal cannot change records, approve estimates, send messages, or initiate payments.</footer>
  </main>;
}
