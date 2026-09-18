'use client';

import Image from 'next/image';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Activity, Customer, InvoiceStatus, Job, OperationsState, QuoteStatus,
  advanceJob, createJob, nextAction, searchJobs, seedState, setInvoiceStatus,
  setQuoteStatus, statusOrder, updateJob,
} from '../lib/operations';
import {
  PROTOTYPE_LABEL, WORKFLOW_STEPS, createBackup, defaultCsvMapping,
  parseBackup, parseCsv, stageLegacyImport,
  type CsvMapping, type CsvRow, type StagedImport,
} from '../lib/client-delivery';
import { useFieldsteadLocalJobs } from './store/fieldstead-local';

type View = 'Overview' | 'Jobs' | 'Customers' | 'Activity' | 'Client Delivery' | 'Settings';
type Theme = 'dark' | 'light';

const UPDATE_CHANGELOG = [
  { version: 'Current', date: 'September 16, 2026', detail: 'Fixed desktop startup and GitHub updater loading so the program opens normally.' },
  { version: 'Previous', date: 'September 16, 2026', detail: 'Added GitHub release updates, customer removal, an empty starting workspace, and simplified Overview branding.' },
  { version: 'Previous', date: 'September 16, 2026', detail: 'Replaced generic branding with the Fieldstead Systems logo and added the Omarchy application launcher.' },
] as const;

declare global {
  interface Window {
    fieldsteadDesktop?: {
      desktop: boolean;
      checkForUpdates: () => Promise<{ status: string; version?: string; message?: string }>;
      downloadUpdate: () => Promise<{ status: string; message?: string }>;
      installUpdate: () => Promise<{ status: string }>;
      onUpdateStatus: (callback: (status: { event: string; detail?: unknown }) => void) => () => void;
    };
  }
}

const money = new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:0 });
const dateTime = new Intl.DateTimeFormat('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
const dateOnly = new Intl.DateTimeFormat('en-US', { weekday:'short', month:'short', day:'numeric' });

function cx(...values: Array<string | false | undefined>) { return values.filter(Boolean).join(' '); }
function getCustomer(state: OperationsState, job: Job) { return state.customers.find((customer) => customer.id === job.customerId)!; }
function formatWhen(value?: string) { return value ? dateTime.format(new Date(value)) : 'Not scheduled'; }
function toLocalInput(value?: string) { if (!value) return ''; const date = new Date(value); const offset = date.getTimezoneOffset(); return new Date(date.getTime() - offset * 60000).toISOString().slice(0,16); }

const mutableJobFields = [
  'customerId', 'service', 'description', 'quoteStatus', 'quoteAmount',
  'quoteSentAt', 'scheduledFor', 'durationHours', 'crew', 'status',
  'invoiceStatus', 'invoiceAmount', 'invoiceDueAt', 'paidAt',
] as const satisfies readonly (keyof Job)[];

function changedJobFields(previous: Job, next: Job): Partial<Job> {
  return mutableJobFields.reduce<Partial<Job>>((changes, field) => {
    if (previous[field] !== next[field]) Object.assign(changes, { [field]: next[field] });
    return changes;
  }, {});
}

function StatusPill({ children }: { children:string }) {
  return <span className={`pill pill-${children.toLowerCase().replaceAll(' ','-')}`}>{children}</span>;
}

function Empty({ title, detail }: { title:string; detail:string }) {
  return <div className="empty"><span aria-hidden="true">◇</span><h3>{title}</h3><p>{detail}</p></div>;
}

export default function Home() {
  const [uiState, setUiState] = useState<OperationsState>(seedState);
  const localJobs = useFieldsteadLocalJobs(seedState.jobs);
  const state = useMemo(
    () => ({ ...uiState, jobs: localJobs.jobs }),
    [uiState, localJobs.jobs],
  );
  const [view, setView] = useState<View>('Overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'dark';
    return window.localStorage.getItem('fieldstead-theme') === 'light' ? 'light' : 'dark';
  });
  useEffect(() => {
    window.localStorage.setItem('fieldstead-theme', theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedJobId, setSelectedJobId] = useState<string>();
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>();
  const [modal, setModal] = useState<'job'|'customer'|null>(null);
  const [toast, setToast] = useState('');

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setSelectedJobId(undefined); setSelectedCustomerId(undefined); setModal(null); } };
    window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close);
  }, []);
  useEffect(() => { if (!toast) return; const id = window.setTimeout(() => setToast(''), 2800); return () => window.clearTimeout(id); }, [toast]);

  const jobs = useMemo(() => searchJobs(state, query, statusFilter), [state, query, statusFilter]);
  const selectedJob = state.jobs.find((job) => job.id === selectedJobId);
  const selectedCustomer = state.customers.find((customer) => customer.id === selectedCustomerId);
  const openJobs = state.jobs.filter((job) => !['Completed','Canceled'].includes(job.status));
  const approvedPipeline = openJobs.filter((job) => job.quoteStatus === 'Approved').reduce((sum, job) => sum + job.quoteAmount, 0);
  const unpaid = state.jobs.filter((job) => ['Sent','Overdue'].includes(job.invoiceStatus)).reduce((sum, job) => sum + job.invoiceAmount, 0);
  const needsAttention = state.jobs.filter((job) => nextAction(job).priority === 'high');

  function mutate(next: OperationsState, message: string) {
    const nextJob = next.jobs.find((job) => {
      const previous = state.jobs.find((candidate) => candidate.id === job.id);
      return previous && mutableJobFields.some((field) => previous[field] !== job[field]);
    });
    const activity = next.activity[0]?.id !== state.activity[0]?.id
      ? next.activity[0]
      : undefined;
    setUiState(next);
    setToast(message);
    if (nextJob) {
      const previous = state.jobs.find((job) => job.id === nextJob.id)!;
      void localJobs.mutateJob(
        nextJob.id,
        changedJobFields(previous, nextJob),
        activity,
      ).catch(() => undefined);
    }
  }
  function saveNewJob(next: OperationsState, id: string) {
    const job = next.jobs.find((candidate) => candidate.id === id)!;
    const activity = next.activity.find((candidate) => candidate.jobId === id);
    setUiState(next);
    setView("Jobs");
    setStatusFilter("All");
    setQuery("");
    setToast(`${id} created`);
    setModal(null);
    setSelectedJobId(id);
    void localJobs.createJob(job, activity).catch((error: unknown) => {
      setToast(error instanceof Error ? `Could not save ${id}: ${error.message}` : `Could not save ${id}`);
    });
  }
  function removeCustomer(customerId: string) {
    const customer = state.customers.find((item) => item.id === customerId);
    if (!customer || !window.confirm(`Remove ${customer.name} and its ${state.jobs.filter((job) => job.customerId === customerId).length} related job(s) from this local workspace?`)) return;
    const next = {
      customers: state.customers.filter((item) => item.id !== customerId),
      jobs: state.jobs.filter((job) => job.customerId !== customerId),
      activity: state.activity.filter((item) => item.customerId !== customerId),
    };
    setUiState(next);
    setSelectedCustomerId(undefined);
    setToast(`${customer.name} removed`);
    void localJobs.replaceDemoJobs(next.jobs).catch(() => setToast('Customer removed from view, but local job cleanup failed'));
  }
  async function migratePreviousData() {
    try {
      const result = await localJobs.migrateLocalStorage();
      setToast(result.imported
        ? `Imported ${result.jobs} previous local jobs`
        : result.reason === 'already-imported'
          ? 'Previous local data was already imported'
          : 'No previous local data found');
    } catch {
      setToast('Previous local data could not be imported');
    }
  }
  function applyStagedImport(staged: StagedImport) {
    const importedAt = new Date().toISOString();
    const activity: Activity = {
      id: `act-import-${Date.now()}`,
      at: importedAt,
      actor: 'Fieldstead owner',
      action: 'Legacy CSV import confirmed',
      detail: `${staged.counts.imported} synthetic jobs imported; ${staged.counts.skipped} rows skipped. Source IDs were preserved.`,
    };
    const next = {
      customers: [...staged.customers, ...state.customers],
      jobs: [...staged.jobs, ...state.jobs],
      activity: [activity, ...state.activity],
    };
    setUiState(next);
    setToast(`${staged.counts.imported} synthetic jobs imported`);
    void localJobs.replaceDemoJobs(next.jobs).catch(() => undefined);
  }
  function restoreBackup(next: OperationsState) {
    setUiState(structuredClone(next));
    setSelectedJobId(undefined);
    setSelectedCustomerId(undefined);
    setToast('Synthetic backup restored');
    void localJobs.replaceDemoJobs(next.jobs).catch(() => undefined);
  }
  function goToJobs(filter = 'All') { setStatusFilter(filter); setQuery(''); setView('Jobs'); }

  return (
    <main className={cx('app-shell', `theme-${theme}`, sidebarCollapsed && 'sidebar-collapsed')}>
      <aside className="sidebar">
        <div className="brand"><Image className="brand-logo" src="/assets/fieldstead-systems-connected.svg" width={1600} height={520} alt="Fieldstead Systems" priority/></div>
        <button className="sidebar-toggle" type="button" aria-label={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'} title={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'} onClick={() => setSidebarCollapsed((value) => !value)}>{sidebarCollapsed ? '›' : '‹'}</button>
        <nav aria-label="Main navigation">
          {(['Overview','Jobs','Customers','Activity','Client Delivery','Settings'] as View[]).map((item) => { const icon = ({ Overview: '⌂', Jobs: '▤', Customers: '♧', Activity: '◌', 'Client Delivery': '⇢', Settings: '⚙' } as Record<View, string>)[item]; return (
            <button key={item} className={cx('nav-item', view === item && 'active')} onClick={() => setView(item)}>
              <span className="nav-icon" aria-hidden="true">{icon}</span><span className="nav-label">{item}</span>{item === 'Jobs' && <b>{openJobs.length}</b>}
            </button>
          ); })}
        </nav>
        <div className="sidebar-foot"><span className="avatar">FS</span><span>Fieldstead owner</span></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button className="mobile-brand" aria-label="Go to overview" onClick={() => setView('Overview')}><Image src="/favicon.svg" width={32} height={32} alt="Fieldstead Systems"/></button>
          <div><p className="eyebrow">FIELDSTEAD SYSTEMS</p><h1>{view === 'Overview' ? 'Owner operations, at a glance.' : view}</h1></div>
          {view !== 'Settings' && <div className="header-actions"><button className="secondary desktop-only" onClick={() => setModal('customer')}>New customer</button><button className="primary" onClick={() => setModal('job')}>＋ New job</button></div>}
        </header>

        <div className="dogfood-banner" role="note"><span>Confirmed Fieldstead records only · no customer messages, invoices, or payments are sent.</span></div>

        <div className="content">
          {view === 'Overview' && <Overview state={state} approvedPipeline={approvedPipeline} unpaid={unpaid} attention={needsAttention} openJob={(id) => setSelectedJobId(id)} goToJobs={goToJobs} />}
          {view === 'Jobs' && <JobsView state={state} jobs={jobs} query={query} setQuery={setQuery} filter={statusFilter} setFilter={setStatusFilter} openJob={setSelectedJobId} />}
          {view === 'Customers' && <CustomersView state={state} query={query} setQuery={setQuery} openCustomer={setSelectedCustomerId} newCustomer={() => setModal('customer')} />}
          {view === 'Activity' && <ActivityView state={state} openJob={setSelectedJobId} />}
          {view === 'Client Delivery' && <ClientDeliveryView state={state} applyImport={applyStagedImport} restore={restoreBackup} />}
          {view === 'Settings' && <SettingsView theme={theme} setTheme={setTheme} migratePreviousData={() => void migratePreviousData()} />}
        </div>

      </section>

      {selectedJob && <JobDrawer state={state} job={selectedJob} close={() => setSelectedJobId(undefined)} save={(next,message) => mutate(next,message)} />}
      {selectedCustomer && <CustomerDrawer state={state} customer={selectedCustomer} close={() => setSelectedCustomerId(undefined)} openJob={(id) => { setSelectedCustomerId(undefined); setSelectedJobId(id); }} remove={() => removeCustomer(selectedCustomer.id)} />}
      {modal === 'job' && <NewJobModal state={state} close={() => setModal(null)} save={saveNewJob} />}
      {modal === 'customer' && <NewCustomerModal state={state} close={() => setModal(null)} save={(next) => { mutate(next,'Customer added'); setModal(null); }} />}
      {toast && <div className="toast" role="status">✓ {toast}</div>}
    </main>
  );
}

function SettingsView({ theme, setTheme, migratePreviousData }: { theme: Theme; setTheme: (theme: Theme) => void; migratePreviousData: () => void }) {
  const [status, setStatus] = useState('Checking GitHub for updates…');
  const [available, setAvailable] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    const unsubscribe = window.fieldsteadDesktop?.onUpdateStatus((update) => {
      if (update.event === 'checking-for-update') { setChecking(true); setStatus('Checking GitHub for updates…'); }
      if (update.event === 'update-available') { setChecking(false); setAvailable(true); setStatus('A new Fieldstead update is available.'); }
      if (update.event === 'update-not-available') { setChecking(false); setStatus('This program is up to date.'); }
      if (update.event === 'update-downloaded') { setChecking(false); setDownloaded(true); setStatus('Update downloaded. Click Install update now to apply it.'); }
      if (update.event === 'download-progress') { setChecking(false); setStatus('Downloading update…'); }
      if (update.event === 'error') { setChecking(false); setStatus('GitHub update check is unavailable right now.'); }
    });
    void window.fieldsteadDesktop?.checkForUpdates();
    return () => unsubscribe?.();
  }, []);
  async function check() {
    setChecking(true);
    setStatus('Checking GitHub for updates…');
    const result = await window.fieldsteadDesktop?.checkForUpdates();
    if (result?.status === 'development') { setChecking(false); setStatus('Updates are available from the packaged desktop program.'); }
  }
  async function download() {
    setStatus('Downloading update from GitHub…');
    await window.fieldsteadDesktop?.downloadUpdate();
  }
  async function install() {
    setStatus('Installing update and restarting the program…');
    await window.fieldsteadDesktop?.installUpdate();
  }
  return <div className="settings-page">
    <div className="activity-intro"><p className="eyebrow">SETTINGS</p><h2>Fieldstead Systems</h2><p>Choose how the program looks. This preference is saved on this device and does not follow the operating system.</p></div>
    <section className="attention-card settings-card"><div className="section-title"><div><p className="eyebrow">LOCAL DATA</p><h2>Import previous data</h2></div></div><p className="settings-copy">Bring forward compatible local records from an earlier Fieldstead workspace.</p><button className="secondary" onClick={migratePreviousData}>Import previous local data</button></section>
    <section className="attention-card settings-card"><div className="section-title"><div><p className="eyebrow">APPEARANCE</p><h2>Display mode</h2></div><span className="pill pill-approved">{theme === 'dark' ? 'Dark' : 'Light'}</span></div><p className="settings-copy">Dark mode is the default. Light mode is available when you prefer a brighter workspace.</p><div className="theme-picker" role="group" aria-label="Display mode"><button className={theme === 'dark' ? 'primary' : 'secondary'} onClick={() => setTheme('dark')}>Dark mode</button><button className={theme === 'light' ? 'primary' : 'secondary'} onClick={() => setTheme('light')}>Light mode</button></div></section>
    <section className="attention-card settings-card" aria-labelledby="email-communications-heading"><div className="section-title"><div><p className="eyebrow">EMAIL COMMUNICATIONS</p><h2 id="email-communications-heading">Business email setup</h2></div><span className="pill pill-pending">Optional</span></div><p className="settings-copy">Set up the opportunity to connect your business email later, without opening another window. These planning details stay on this device. Email sending is not connected yet.</p><form className="email-setup-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); window.localStorage.setItem("fieldstead-email-setup", JSON.stringify(Object.fromEntries(form.entries()))); }}><div className="form-grid"><label>Business email<input name="businessEmail" type="email" placeholder="you@yourbusiness.com"/></label><label>Display name<input name="displayName" placeholder="Your business name"/></label></div><div className="form-grid"><label>Email provider<select name="provider"><option>Choose later</option><option>Google Workspace / Gmail</option><option>Microsoft 365 / Outlook</option><option>Other provider</option></select></label><label>Intended use<select name="purpose"><option>Customer communications</option><option>Inquiry replies</option><option>Internal office messages</option></select></label></div><button className="secondary" type="submit">Save email setup</button></form><p className="settings-status">Do not enter passwords, app keys, tokens, or connection secrets here. A future connection step can be added when you are ready.</p></section>
    <section className="attention-card settings-card"><div className="section-title"><div><p className="eyebrow">GITHUB UPDATES</p><h2>Keep this program current</h2></div><span className="pill pill-approved">GitHub</span></div><p className="settings-copy">Check GitHub here and install a newer packaged Fieldstead release without manually reopening the program.</p><div className="update-actions"><button className="secondary" disabled={checking} onClick={() => void check()}>{checking ? 'Checking…' : 'Check for updates'}</button>{available && !downloaded && <button className="primary" onClick={() => void download()}>Update now</button>}{downloaded && <button className="primary" onClick={() => void install()}>Install update now</button>}</div><p className="settings-status" role="status">{status}</p><div className="change-log"><p className="eyebrow">CHANGE LOG</p>{UPDATE_CHANGELOG.map((entry) => <article key={`${entry.version}-${entry.detail}`}><div><strong>{entry.version}</strong><small>{entry.date}</small></div><p>{entry.detail}</p></article>)}</div></section>
  </div>;
}

function Overview({ state, approvedPipeline, unpaid, attention, openJob, goToJobs }: { state:OperationsState; approvedPipeline:number; unpaid:number; attention:Job[]; openJob:(id:string)=>void; goToJobs:(filter?:string)=>void }) {
  const upcoming = state.jobs.filter((job) => job.scheduledFor && !['Completed','Canceled'].includes(job.status)).sort((a,b) => a.scheduledFor!.localeCompare(b.scheduledFor!)).slice(0,4);
  const quotes = state.jobs.filter((job) => job.quoteStatus === 'Sent').length;
  const overdue = state.jobs.filter((job) => job.invoiceStatus === 'Overdue').length;
  const unscheduled = state.jobs.filter((job) => job.quoteStatus === 'Approved' && !job.scheduledFor).length;
  return <>
    <section className="value-strip"><div><span className="value-icon">✓</span><p><strong>Nothing gets lost after “yes.”</strong><br/>Estimates, owner handoffs, and payment follow-up stay visible in one place.</p></div><span>Confirmed records only</span></section>
    <section className="metric-grid" aria-label="Operations summary">
      <article><p>Open jobs</p><strong>{state.jobs.filter((job) => !['Completed','Canceled'].includes(job.status)).length}</strong><small>{unscheduled ? `${unscheduled} approved, not scheduled` : 'All approved work is scheduled'}</small></article>
      <article><p>Approved pipeline</p><strong>{money.format(approvedPipeline)}</strong><small>Scheduled and active work</small></article>
      <article><p>Awaiting payment</p><strong>{money.format(unpaid)}</strong><small>{overdue} overdue invoice</small></article>
      <article><p>Estimates awaiting reply</p><strong>{quotes}</strong><small>Oldest marked sent 4 days ago</small></article>
    </section>
    <section className="attention-card">
      <div className="section-title"><div><p className="eyebrow">NEXT ACTIONS</p><h2>Keep work moving</h2></div><button className="text-button" onClick={() => goToJobs()}>View all jobs →</button></div>
      <div className="action-list">{attention.slice(0,4).map((job) => { const action = nextAction(job); const customer = getCustomer(state,job); return <button key={job.id} onClick={() => openJob(job.id)}><span className="alert-dot">!</span><span><strong>{action.label}</strong><small>{customer.name} · {job.id} · {action.reason}</small></span><b>→</b></button>; })}</div>
    </section>
    <section className="overview-grid">
      <div><div className="section-title"><div><p className="eyebrow">UPCOMING ROUTE</p><h2>Next on the calendar</h2></div><button className="text-button" onClick={() => goToJobs('Scheduled')}>Schedule →</button></div>
        <div className="route-list">{upcoming.map((job) => <button key={job.id} onClick={() => openJob(job.id)}><div className="date-block"><strong>{dateOnly.format(new Date(job.scheduledFor!)).split(',')[0]}</strong><span>{new Date(job.scheduledFor!).getDate()}</span></div><span className="route-line" aria-hidden="true"/><div><StatusPill>{job.status}</StatusPill><h3>{getCustomer(state,job).name}</h3><p>{dateTime.format(new Date(job.scheduledFor!))} · {job.service}</p></div><b>→</b></button>)}</div>
      </div>
      <aside className="activity-peek"><div className="section-title"><div><p className="eyebrow">RECENT HANDOFFS</p><h2>Activity</h2></div></div>{state.activity.slice(0,5).map((item) => <div className="mini-activity" key={item.id}><span/><div><strong>{item.action}</strong><p>{item.detail}</p><small>{dateTime.format(new Date(item.at))} · {item.actor}</small></div></div>)}</aside>
    </section>
  </>;
}

function JobsView({ state, jobs, query, setQuery, filter, setFilter, openJob }: { state:OperationsState; jobs:Job[]; query:string; setQuery:(v:string)=>void; filter:string; setFilter:(v:string)=>void; openJob:(id:string)=>void }) {
  return <>
    <div className="list-toolbar"><label className="search"><span aria-hidden="true">⌕</span><input aria-label="Search jobs" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customer, service, address or job…"/></label><label className="select-label">Status<select value={filter} onChange={(event) => setFilter(event.target.value)}><option>All</option>{statusOrder.map((status) => <option key={status}>{status}</option>)}<option>Canceled</option></select></label></div>
    <div className="result-count">{jobs.length} {jobs.length === 1 ? 'job' : 'jobs'} <span>· click a row to manage the handoff</span></div>
    {jobs.length ? <div className="job-table" role="table" aria-label="Jobs">
      <div className="table-head" role="row"><span>Customer / job</span><span>Schedule</span><span>Status</span><span>Value</span><span>Next action</span></div>
      {jobs.map((job) => { const customer = getCustomer(state,job); const action = nextAction(job); return <button role="row" className="table-row" key={job.id} onClick={() => openJob(job.id)}><span><strong>{customer.name}</strong><small>{job.service} · {job.id}</small></span><span><strong>{job.scheduledFor ? dateOnly.format(new Date(job.scheduledFor)) : 'Unscheduled'}</strong><small>{job.scheduledFor ? dateTime.format(new Date(job.scheduledFor)).split(', ').at(-1) : 'Set a date after approval'}</small></span><span><StatusPill>{job.status}</StatusPill><small>Estimate: {job.quoteStatus}</small></span><span><strong>{money.format(job.quoteAmount)}</strong><small>Invoice: {job.invoiceStatus}</small></span><span className={cx('next-cell', action.priority === 'high' && 'urgent')}><strong>{action.label}</strong><small>{action.reason}</small></span></button>})}
    </div> : <Empty title="No jobs found" detail="Try a broader search or clear the status filter."/>}
  </>;
}

function CustomersView({ state, query, setQuery, openCustomer, newCustomer }: { state:OperationsState; query:string; setQuery:(v:string)=>void; openCustomer:(id:string)=>void; newCustomer:()=>void }) {
  const customers = state.customers.filter((customer) => [customer.name,customer.email,customer.phone,customer.address].some((value) => value.toLowerCase().includes(query.toLowerCase())));
  return <><div className="list-toolbar"><label className="search"><span aria-hidden="true">⌕</span><input aria-label="Search customers" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, contact, or address…"/></label><button className="secondary" onClick={newCustomer}>＋ New customer</button></div><div className="customer-grid">{customers.map((customer) => { const customerJobs = state.jobs.filter((job) => job.customerId === customer.id); const lifetime = customerJobs.filter((job) => job.invoiceStatus === 'Paid').reduce((sum,job) => sum + job.invoiceAmount,0); return <button className="customer-card" key={customer.id} onClick={() => openCustomer(customer.id)}><div className="customer-initials">{customer.name.split(' ').map((part) => part[0]).join('')}</div><div><h2>{customer.name}</h2><p>{customer.address}</p></div><dl><div><dt>Jobs</dt><dd>{customerJobs.length}</dd></div><div><dt>Paid work</dt><dd>{money.format(lifetime)}</dd></div></dl><span>{customer.email}</span><b>View record →</b></button>})}</div>{!customers.length && <Empty title="No customers found" detail="Try a different name, phone number, or address."/>}</>;
}

function ActivityView({ state, openJob }: { state:OperationsState; openJob:(id:string)=>void }) {
  return <div className="activity-page"><div className="activity-intro"><p className="eyebrow">AUDIT TRAIL</p><h2>A clear record of every handoff</h2><p>Changes made in this demo are recorded here with the job, person, and time. This helps the office and field crew work from the same story.</p></div><div className="activity-feed">{state.activity.map((item:Activity) => <button key={item.id} onClick={() => item.jobId && openJob(item.jobId)} disabled={!item.jobId}><time>{dateTime.format(new Date(item.at))}</time><span className="activity-node"/><div><StatusPill>{item.actor}</StatusPill><h3>{item.action}</h3><p>{item.detail}</p><small>{item.jobId || 'Customer record'} {item.jobId && '· Open job →'}</small></div></button>)}</div></div>;
}

const mappingFields: Array<[keyof CsvMapping, string]> = [
  ['customerId', 'Customer source ID'], ['jobId', 'Job source ID'],
  ['customerName', 'Customer name'], ['email', 'Email'], ['phone', 'Phone'],
  ['address', 'Address'], ['service', 'Service'], ['description', 'Description'],
  ['amount', 'Amount'], ['status', 'Job status'],
];

function ClientDeliveryView({ state, applyImport, restore }: { state:OperationsState; applyImport:(staged:StagedImport)=>void; restore:(state:OperationsState)=>void }) {
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [mapping, setMapping] = useState<CsvMapping>(defaultCsvMapping);
  const [staged, setStaged] = useState<StagedImport>();
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState('No CSV has been loaded. Live demo state is unchanged.');
  const headers = rows[0] ? Object.keys(rows[0]) : [];

  function loadCsv(source: string, name: string) {
    try {
      const parsed = parseCsv(source);
      setRows(parsed);
      setFileName(name);
      setMapping(defaultCsvMapping);
      setStaged(undefined);
      setConfirmed(false);
      setMessage(`${parsed.length} source rows loaded for mapping. Nothing has been imported.`);
    } catch (error) {
      setRows([]);
      setStaged(undefined);
      setMessage(error instanceof Error ? error.message : 'CSV could not be read.');
    }
  }

  async function loadSample() {
    try {
      const response = await fetch('/demo-data/legacy-client-jobs.csv');
      if (!response.ok) throw new Error('Bundled sample could not be loaded.');
      loadCsv(await response.text(), 'legacy-client-jobs.csv');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Bundled sample could not be loaded.');
    }
  }

  function validatePreview() {
    const next = stageLegacyImport(rows, mapping, state, new Date().toISOString());
    setStaged(next);
    setConfirmed(false);
    setMessage('Validation complete. Review every count before confirming import.');
  }

  function confirmImport() {
    if (!staged || !confirmed) return;
    applyImport(staged);
    setRows([]);
    setStaged(undefined);
    setConfirmed(false);
    setMessage('Import confirmed and applied to local Fieldstead records.');
  }

  function downloadBackup() {
    const source = JSON.stringify(createBackup(state), null, 2);
    const url = URL.createObjectURL(new Blob([source], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `fieldstead-demo-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage('Local Fieldstead JSON backup downloaded.');
  }

  async function restoreFile(file?: File) {
    if (!file) return;
    try {
      restore(parseBackup(await file.text()).state);
      setMessage(`Restored ${file.name}. This affected local Fieldstead browser data only.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Backup could not be restored.');
    }
  }

  return <div className="delivery-page">
    <section className="delivery-intro">
      <div><p className="eyebrow">{PROTOTYPE_LABEL.toUpperCase()}</p><h2>One accountable client-delivery chain</h2><p>Use this view to manage confirmed Fieldstead work and rehearse recovery without contacting a customer, payment provider, or external service.</p></div>
      <span className="demo-seal">FIELDSTEAD</span>
    </section>

    <ol className="workflow-chain" aria-label="Fieldstead local delivery workflow">
      {WORKFLOW_STEPS.map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, '0')}</span><strong>{step}</strong>{index < WORKFLOW_STEPS.length - 1 && <b aria-hidden="true">→</b>}</li>)}
    </ol>

    <div className="delivery-grid">
      <section className="delivery-card import-card">
        <div className="card-heading"><div><p className="eyebrow">STAGED TRANSFER</p><h2>Legacy CSV import</h2></div><span className="safe-state">Preview first</span></div>
        <p className="card-copy">Load an approved Fieldstead CSV, map its columns, and validate every row. No local record changes occur until you explicitly confirm.</p>
        <div className="file-actions">
          <button className="secondary" onClick={() => void loadSample()}>Load bundled sample</button>
          <label className="secondary file-button">Choose CSV<input type="file" accept=".csv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) void file.text().then((source) => loadCsv(source, file.name)); }}/></label>
          {fileName && <span>{fileName}</span>}
        </div>
        {headers.length > 0 && <>
          <div className="mapping-grid">{mappingFields.map(([field, label]) => <label key={field}>{label}<select value={mapping[field]} onChange={(event) => { setMapping({ ...mapping, [field]: event.target.value }); setStaged(undefined); setConfirmed(false); }}><option value="">Not mapped</option>{headers.map((header) => <option key={header}>{header}</option>)}</select></label>)}</div>
          <button className="primary validate-button" onClick={validatePreview}>Validate staged rows</button>
        </>}
        {staged && <div className="validation-results" aria-live="polite">
          <div className="count-grid">{Object.entries(staged.counts).map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
          {staged.issues.length > 0 && <div className="issue-list"><h3>Rows held back</h3>{staged.issues.map((issue) => <div key={`${issue.row}-${issue.kind}`}><span>Row {issue.row}</span><StatusPill>{issue.kind}</StatusPill><p>{issue.sourceId} · {issue.detail}</p></div>)}</div>}
          <label className="confirm-import"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)}/><span>I reviewed the validation report and want to import {staged.counts.imported} Fieldstead records.</span></label>
          <button className="primary full" disabled={!confirmed || staged.counts.imported === 0} onClick={confirmImport}>Confirm Fieldstead import</button>
        </div>}
      </section>

      <aside className="delivery-card backup-card">
        <div className="card-heading"><div><p className="eyebrow">BACKUP &amp; RECOVERY</p><h2>Demo continuity</h2></div><span className="safe-state">JSON · local</span></div>
        <p className="card-copy">Export the current Fieldstead customers, jobs, and audit activity. Restore accepts only a versioned Fieldstead dogfood backup.</p>
        <dl><div><dt>Customers</dt><dd>{state.customers.length}</dd></div><div><dt>Jobs</dt><dd>{state.jobs.length}</dd></div><div><dt>Audit events</dt><dd>{state.activity.length}</dd></div></dl>
        <button className="primary full" onClick={downloadBackup}>Download JSON backup</button>
        <label className="secondary restore-button">Restore from backup<input type="file" accept="application/json,.json" onChange={(event) => { void restoreFile(event.target.files?.[0]); event.target.value = ''; }}/></label>
        <p className="boundary-note">No credentials, provider calls, or remote writes are used. Shared-device sync is not configured yet.</p>
      </aside>
    </div>
    <p className="delivery-message" role="status">{message}</p>
  </div>;
}

function DrawerShell({ title, subtitle, close, children }: { title:string; subtitle:string; close:()=>void; children:React.ReactNode }) {
  return <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><aside className="drawer" role="dialog" aria-modal="true" aria-label={title}><header><div><p className="eyebrow">{subtitle}</p><h2>{title}</h2></div><button className="close" aria-label="Close details" onClick={close}>×</button></header>{children}</aside></div>;
}

function JobDrawer({ state, job, close, save }: { state:OperationsState; job:Job; close:()=>void; save:(next:OperationsState,message:string)=>void }) {
  const customer = getCustomer(state,job); const action = nextAction(job);
  const [scheduledFor,setScheduledFor] = useState(toLocalInput(job.scheduledFor)); const [crew,setCrew] = useState(job.crew);
  const nextStatus = job.status === 'Quoted' && job.quoteStatus !== 'Approved' ? undefined : statusOrder[statusOrder.indexOf(job.status)+1];
  return <DrawerShell title={`${job.id} · ${customer.name}`} subtitle="JOB DETAIL" close={close}>
    <div className="drawer-scroll">
      <section className="next-action"><p className="eyebrow">RECOMMENDED NEXT ACTION</p><div><span>→</span><div><strong>{action.label}</strong><p>{action.reason}</p></div></div>{nextStatus && <button onClick={() => save(advanceJob(state,job.id),`Job moved to ${nextStatus}`)}>Mark {nextStatus.toLowerCase()}</button>}</section>
      <section className="detail-section"><div className="detail-heading"><h3>Job</h3><StatusPill>{job.status}</StatusPill></div><h2>{job.service}</h2><p>{job.description || 'No work notes added.'}</p><div className="info-grid"><div><small>Customer</small><strong>{customer.name}</strong></div><div><small>Phone</small><strong>{customer.phone}</strong></div><div className="wide"><small>Property</small><strong>{customer.address}</strong></div></div></section>
      <section className="detail-section"><div className="detail-heading"><h3>Estimate</h3><strong>{money.format(job.quoteAmount)}</strong></div><div className="segmented" role="group" aria-label="Estimate status">{(['Draft','Sent','Approved','Declined'] as QuoteStatus[]).map((status) => <button className={job.quoteStatus === status ? 'selected' : ''} key={status} onClick={() => save(setQuoteStatus(state,job.id,status),`Estimate marked ${status.toLowerCase()}`)}>{status}</button>)}</div><p className="helper">Status changes are recorded only. This dogfood app never sends real messages.</p></section>
      <section className="detail-section"><h3>Schedule &amp; handoff</h3><div className="form-grid"><label>Visit date and time<input type="datetime-local" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)}/></label><label>Crew<input value={crew} onChange={(event) => setCrew(event.target.value)} placeholder="Unassigned"/></label></div><button className="secondary full" onClick={() => save(updateJob(state,job.id,{ scheduledFor:scheduledFor ? new Date(scheduledFor).toISOString() : undefined, crew },'Schedule updated',`${formatWhen(scheduledFor ? new Date(scheduledFor).toISOString() : undefined)} · ${crew || 'Unassigned'}`),'Schedule saved')}>Save schedule</button></section>
      <section className="detail-section"><div className="detail-heading"><h3>Invoice &amp; payment</h3><strong>{money.format(job.invoiceAmount)}</strong></div><label className="select-label full-label">Invoice state<select value={job.invoiceStatus} onChange={(event) => save(setInvoiceStatus(state,job.id,event.target.value as InvoiceStatus),`Invoice marked ${event.target.value.toLowerCase()}`)}>{(['Not created','Draft','Sent','Paid','Overdue'] as InvoiceStatus[]).map((status) => <option key={status}>{status}</option>)}</select></label><p className="helper">This tracks bookkeeping state only. No invoice or payment is transmitted.</p></section>
      <section className="detail-section"><h3>Job activity</h3><div className="drawer-activity">{state.activity.filter((item) => item.jobId === job.id).map((item) => <div key={item.id}><span/><div><strong>{item.action}</strong><p>{item.detail}</p><small>{dateTime.format(new Date(item.at))} · {item.actor}</small></div></div>)}</div></section>
    </div>
  </DrawerShell>;
}

function CustomerDrawer({ state, customer, close, openJob, remove }: { state:OperationsState; customer:Customer; close:()=>void; openJob:(id:string)=>void; remove:()=>void }) {
  const jobs = state.jobs.filter((job) => job.customerId === customer.id);
  return <DrawerShell title={customer.name} subtitle="CUSTOMER RECORD" close={close}><div className="drawer-scroll"><section className="detail-section contact-card"><div className="customer-initials large">{customer.name.split(' ').map((part) => part[0]).join('')}</div><div><a href={`tel:${customer.phone}`}>{customer.phone}</a><a href={`mailto:${customer.email}`}>{customer.email}</a><p>{customer.address}</p></div></section><section className="detail-section"><h3>Property notes</h3><p>{customer.notes || 'No property notes.'}</p></section><section className="detail-section"><div className="detail-heading"><h3>Job history</h3><strong>{jobs.length} jobs</strong></div><div className="compact-jobs">{jobs.map((job) => <button key={job.id} onClick={() => openJob(job.id)}><span><strong>{job.service}</strong><small>{job.id} · {formatWhen(job.scheduledFor)}</small></span><span><StatusPill>{job.status}</StatusPill><b>{money.format(job.quoteAmount)} →</b></span></button>)}</div></section><section className="detail-section danger-zone"><h3>Remove customer</h3><p>This removes the customer and related local jobs from this workspace.</p><button className="danger" onClick={remove}>Remove customer</button></section></div></DrawerShell>;
}

function ModalShell({ title, close, children }: { title:string; close:()=>void; children:React.ReactNode }) { return <div className="overlay modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><header><div><p className="eyebrow">QUICK ADD</p><h2>{title}</h2></div><button className="close" aria-label="Close" onClick={close}>×</button></header>{children}</section></div>; }

function NewJobModal({ state, close, save }: { state:OperationsState; close:()=>void; save:(next:OperationsState,id:string)=>void }) {
  const firstCustomer = state.customers[0];
  const [customerMode, setCustomerMode] = useState<"existing" | "new">("existing");
  const [customerId, setCustomerId] = useState(firstCustomer?.id || "");
  const [customerDraft, setCustomerDraft] = useState({ name: firstCustomer?.name || "", phone: firstCustomer?.phone || "", email: firstCustomer?.email || "", address: firstCustomer?.address || "", notes: firstCustomer?.notes || "" });
  const [service, setService] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");

  function chooseCustomer(value: string) {
    if (value === "__new__") {
      setCustomerMode("new"); setCustomerId("");
      setCustomerDraft({ name: "", phone: "", email: "", address: "", notes: "" });
      return;
    }
    const customer = state.customers.find((item) => item.id === value);
    if (!customer) return;
    setCustomerMode("existing"); setCustomerId(customer.id);
    setCustomerDraft({ name: customer.name, phone: customer.phone, email: customer.email, address: customer.address, notes: customer.notes || "" });
  }

  function updateCustomer(field: keyof typeof customerDraft, value: string) {
    setCustomerDraft((current) => ({ ...current, [field]: value }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const at = new Date().toISOString();
    const resolvedCustomerId = customerMode === "new" ? "demo-fs-cus-" + Date["now"]() : customerId;
    const existing = state.customers.find((item) => item.id === resolvedCustomerId);
    const customer: Customer = { id: resolvedCustomerId, ...customerDraft, createdAt: existing?.createdAt || at };
    const customers = customerMode === "new" ? [customer, ...state.customers] : state.customers.map((item) => item.id === resolvedCustomerId ? { ...item, ...customerDraft } : item);
    const next = createJob({ ...state, customers }, { customerId: resolvedCustomerId, service: service.trim(), quoteAmount: Number(amount), scheduledFor: date ? new Date(date).toISOString() : undefined, description: description.trim() }, at);
    save(next, next.jobs[0].id);
  }

  return <ModalShell title="Create a job" close={close}><form onSubmit={submit} className="modal-form">
    <section className="inline-customer-panel"><div className="detail-heading"><div><p className="eyebrow">CUSTOMER</p><h3>Who is this job for?</h3></div><span className="safe-state">Quick add</span></div>
      <label>Choose customer<select required value={customerMode === "new" ? "__new__" : customerId} onChange={(event) => chooseCustomer(event.target.value)}><option value="__new__">＋ New customer</option>{state.customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.name}</option>)}</select></label>
      <div className="form-grid"><label>Name<input required value={customerDraft.name} onChange={(event) => updateCustomer("name", event.target.value)} placeholder="Customer name"/></label><label>Phone<input required type="tel" value={customerDraft.phone} onChange={(event) => updateCustomer("phone", event.target.value)} placeholder="(555) 555-5555"/></label></div>
      <div className="form-grid"><label>Email<input required type="email" value={customerDraft.email} onChange={(event) => updateCustomer("email", event.target.value)} placeholder="name.com"/></label><label>Service address<input required value={customerDraft.address} onChange={(event) => updateCustomer("address", event.target.value)} placeholder="Property address"/></label></div>
      <label>Customer notes<textarea value={customerDraft.notes} onChange={(event) => updateCustomer("notes", event.target.value)} placeholder="Access details, preferences, and property notes"/></label>
    </section>
    <section><div className="detail-heading"><h3>Job details</h3><span className="safe-state">Draft</span></div><label>Service<input required autoFocus={customerMode === "existing"} value={service} onChange={(event) => setService(event.target.value)} placeholder="e.g. House soft wash"/></label><div className="form-grid"><label>Estimate amount<input required min="0" step="1" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0"/></label><label>Schedule (optional)<input type="datetime-local" value={date} onChange={(event) => setDate(event.target.value)}/></label></div><label>Work notes<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Scope, access notes, and crew handoff details"/></label></section>
    <div className="modal-actions"><button type="button" className="secondary" onClick={close}>Cancel</button><button className="primary">Create draft job</button></div>
  </form></ModalShell>;
}

function NewCustomerModal({ state, close, save }: { state:OperationsState; close:()=>void; save:(next:OperationsState)=>void }) {
  const [form,setForm] = useState({ name:'', phone:'', email:'', address:'', notes:'' });
  function submit(event:FormEvent) { event.preventDefault(); const at = new Date().toISOString(); const id = `demo-fs-cus-${Date.now()}`; const customer:Customer = { id, ...form, createdAt:at }; const activity:Activity = { id:`act-${Date.now()}`, at, customerId:id, actor:'Fieldstead owner', action:'Customer added', detail:`${form.name} was added to the local customer list.` }; save({ ...state, customers:[customer,...state.customers], activity:[activity,...state.activity] }); }
  return <ModalShell title="Add a customer" close={close}><form onSubmit={submit} className="modal-form"><label>Full name<input required autoFocus value={form.name} onChange={(event) => setForm({...form,name:event.target.value})}/></label><div className="form-grid"><label>Phone<input required type="tel" value={form.phone} onChange={(event) => setForm({...form,phone:event.target.value})}/></label><label>Email<input required type="email" value={form.email} onChange={(event) => setForm({...form,email:event.target.value})}/></label></div><label>Service address<input required value={form.address} onChange={(event) => setForm({...form,address:event.target.value})}/></label><label>Property notes<textarea value={form.notes} onChange={(event) => setForm({...form,notes:event.target.value})} placeholder="Access details, preferences, and useful handoff notes"/></label><div className="modal-actions"><button type="button" className="secondary" onClick={close}>Cancel</button><button className="primary">Add customer</button></div></form></ModalShell>;
}
