import { useEffect, useMemo, useState } from 'react';
import type { OperationsState } from '../lib/operations';
import type { CommunicationEntityType, Customer, ServiceRequest } from '../packages/fieldstead-domain/src';
import type { useFieldsteadLocalJobs } from './store/fieldstead-local';

type Target = { entityType: CommunicationEntityType; entityId: string; label: string; group: string };

export function CommunicationLinkTargetSelector({ state, localData, onConfirm }: {
  state: OperationsState;
  localData: ReturnType<typeof useFieldsteadLocalJobs>;
  onConfirm: (target: Pick<Target, 'entityType' | 'entityId'>) => Promise<void> | void;
}) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [derived, setDerived] = useState<Target[]>([]);
  const [selected, setSelected] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([
      localData.listDurableCustomers(),
      localData.listDurableServiceRequests(),
      Promise.all(state.jobs.map(async (job) => {
        const [estimate, invoice] = await Promise.all([localData.getEstimateForJob(job.id), localData.getInvoiceForJob(job.id)]);
        return { job, estimate, invoice };
      })),
    ]).then(([nextCustomers, nextRequests, records]) => {
      if (!active) return;
      setCustomers(nextCustomers);
      setRequests(nextRequests);
      setDerived(records.flatMap(({ job, estimate, invoice }) => [
        ...(estimate ? [{ entityType: 'estimate' as const, entityId: estimate.estimate.id, label: `${job.id} estimate`, group: 'Estimates' }] : []),
        ...(invoice ? [{ entityType: 'invoice' as const, entityId: invoice.invoice.id, label: `${job.id} invoice`, group: 'Invoices' }] : []),
      ]));
    });
    return () => { active = false; };
  }, [localData, state.jobs]);

  const targets = useMemo<Target[]>(() => [
    ...customers.map((customer) => ({ entityType: 'customer', entityId: customer.id, label: customer.displayName, group: 'Customers' } as const)),
    ...requests.map((request) => ({ entityType: 'serviceRequest', entityId: request.id, label: `${request.summary} · ${request.id}`, group: 'Service requests' } as const)),
    ...state.jobs.map((job) => ({ entityType: 'job', entityId: job.id, label: `${job.id} · ${job.service}`, group: 'Jobs' } as const)),
    ...derived,
  ].sort((left, right) => left.group.localeCompare(right.group) || left.label.localeCompare(right.label)), [customers, requests, state.jobs, derived]);
  const target = targets.find((item) => `${item.entityType}:${item.entityId}` === selected);

  return <section className="communication-link-target" aria-label="Link communication metadata">
    <div className="detail-heading"><div><p className="eyebrow">OWNER-ONLY LINK</p><h3>Link communication metadata</h3></div><span className="safe-state">Owner confirmation required</span></div>
    <p className="helper">Choose one Customer, Service request, Job, Estimate, or Invoice. No message body is copied, and no message is sent.</p>
    <label>Target record<select aria-label="Communication link target" value={selected} onChange={(event) => { setSelected(event.target.value); setConfirmed(false); }}><option value="">Choose a target</option>{targets.map((item) => <option key={`${item.entityType}:${item.entityId}`} value={`${item.entityType}:${item.entityId}`}>{item.group.slice(0, -1)} · {item.label}</option>)}</select></label>
    <label className="confirm-import"><input type="checkbox" checked={confirmed} disabled={!target} onChange={(event) => setConfirmed(event.target.checked)}/><span>I reviewed the selected target and approve linking this email metadata only.</span></label>
    <button type="button" className="secondary full" disabled={!target || !confirmed} onClick={() => target && void onConfirm(target)}>Confirm metadata link</button>
  </section>;
}
