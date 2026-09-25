'use client';

import Image from 'next/image';
import { FormEvent, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  Activity, Customer, InvoiceStatus, Job, OperationsState,
  advanceJob, createJob, nextAction, searchJobs, seedState, setInvoiceStatus,
  statusOrder, updateJob,
} from '../lib/operations';
import {
  PROTOTYPE_LABEL, WORKFLOW_STEPS, createBackup, defaultCsvMapping,
  parseBackup, parseCsv, stageLegacyImport,
  type CsvMapping, type CsvRow, type StagedImport,
} from '../lib/client-delivery';
import { useFieldsteadLocalJobs } from './store/fieldstead-local';
import { detectMailProvider, getMailProviderProfile } from '../lib/mail-provider';
import { forwardSubject, replySubject, type EmailMessageAction } from '../lib/mail-actions';
import { normalizeAppVersion, packageVersion } from '../lib/app-version';
import { SetupWizard } from './setup/SetupWizard';
import { loadSetupState, persistSetupState } from './setup/setup-state';
import type { SetupState } from './setup/setup-types';
import { createInitialEmailUiState, reduceEmailUiState } from './email-ui-state';
import { createEmailSyncController } from './email-sync-controller';
import { EmailMessageContent, type EmailAttachment, type RenderableEmailMessage } from './email-message-content';
import { buildFinanceSnapshot } from './finance';
import { QuickBooksReadinessPanel } from './quickbooks-readiness';
import { proposeEmailIntakeReview, type EmailIntakeReviewProposal } from '../lib/email-intake-review';
import { EmailIntakeReviewPanel, type EmailIntakeReviewMode } from './email-intake-review-panel';
import { EstimateEditor, type EstimateEditorLine } from './estimate-editor';
import { buildEmailIntakeConversion, type EmailIntakeApproval, type EmailIntakeDraft } from '../lib/email-intake-conversion';
import type { CommunicationLink, Customer as DurableCustomer, ServiceRequest } from '../packages/fieldstead-domain/src';
import { buildCalendarDays, listUnscheduledJobs, type CalendarMode } from './dispatch-calendar';
import { deriveSyncStatus, syncStatusLabel } from './sync-status';
import { ReportingView } from './reporting-view';
import { OutsideAiAdvisoryStatus } from './outside-ai-advisory-status';
import { CommunicationAutomationPreview } from './communication-automation-preview';
import type { OperationsReport, OperationsReportFilters } from '../packages/fieldstead-local-store/src/reporting';

type View = 'Overview' | 'Dispatch' | 'Assigned Jobs' | 'Jobs' | 'Customers' | 'Activity' | 'Client Delivery' | 'Email' | 'Finance' | 'Reporting' | 'Settings';
type Theme = 'dark' | 'light';
type EmailConnectionInput = { provider: string; email: string; displayName: string; username: string; password: string; imap: { host: string; port: number; secure: boolean }; smtp: { host: string; port: number; secure: boolean } };
type EmailMessage = RenderableEmailMessage & { subject: string; from: string; fromName: string; receivedAt: string; unread: boolean; starred?: boolean };
type EmailAccount = { id: string; email: string; displayName?: string; provider?: string; lastTestedAt?: string | null; configured?: boolean };
type OperationalAttachment = { id:string; ownerType:'job'|'serviceRequest'; ownerId:string; filename:string; contentType:string; size:number; checksum:string; createdAt:string; createdBy:string; source:{kind:'desktop-upload'} };

const UPDATE_CHANGELOG = [
  { version: 'Current', date: 'September 20, 2026', detail: 'Synchronized the Operations Starter scope across the program: clearer office workflow, scheduling attention, daily follow-up, reporting, activity history, and explicit add-on boundaries.' },
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
      getEmailConfig: () => Promise<EmailAccount | null>;
      getEmailAccounts: () => Promise<{ accounts: EmailAccount[]; activeAccountId: string | null }>;
      clearEmailConfig: (accountId?: string) => Promise<{ configured: boolean; accounts: EmailAccount[]; activeAccountId: string | null }>;
      testEmailConnection: (input: EmailConnectionInput) => Promise<{ ok: boolean; message: string }>;
      saveEmailConfig: (input: EmailConnectionInput) => Promise<{ ok: boolean; message?: string; config?: unknown }>;
      syncEmail: (accountId?: string) => Promise<{ ok: boolean; message?: string; messages?: EmailMessage[]; syncedAt?: string }>;
      sendEmail: (input: { to: string; subject: string; text: string }, accountId?: string) => Promise<{ ok: boolean; messageId?: string; message?: string }>;
      emailMessageAction: (accountId: string, uid: string, action: EmailMessageAction) => Promise<{ ok: boolean; action?: string; uid?: string; message?: string }>;
      emailBulkAction: (accountId: string, uids: string[], action: EmailMessageAction) => Promise<{ ok: boolean; action?: string; uids?: string[]; message?: string }>;
      previewEmailAttachment: (accountId: string, messageId: string, attachmentId: string) => Promise<{ ok: boolean; filename?: string; message?: string }>;
      saveEmailAttachment: (accountId: string, messageId: string, attachmentId: string) => Promise<{ ok: boolean; canceled?: boolean; filename?: string; bytes?: number; message?: string }>;
      openEmailExternalLink: (url: string) => Promise<{ ok: boolean; url?: string; message?: string }>;
      chooseOperationalAttachment: (ownerType: 'job'|'serviceRequest', ownerId: string, actorId: string) => Promise<{ ok:boolean; canceled?:boolean; attachment?:OperationalAttachment; message?:string }>;
      listOperationalAttachments: (ownerType: 'job'|'serviceRequest', ownerId: string) => Promise<{ ok:boolean; attachments?:OperationalAttachment[]; message?:string }>;
      previewOperationalAttachment: (attachmentId: string) => Promise<{ ok:boolean; filename?:string; message?:string }>;
      exportOperationalAttachment: (attachmentId: string) => Promise<{ ok:boolean; canceled?:boolean; filename?:string; message?:string }>;
      deleteOperationalAttachment: (attachmentId: string, actorId: string) => Promise<{ ok:boolean; message?:string }>;
      getOperationalAttachmentBackupManifest: () => Promise<{ ok:boolean; manifest?:{ attachmentCount:number; contentIncluded:boolean; warning:string }; message?:string }>;
      exportOperationalAttachmentStore: () => Promise<{ ok:boolean; canceled?:boolean; attachmentCount?:number; verified?:boolean; message?:string }>;
      getSetupState: () => Promise<unknown>;
      saveSetupState: (state: SetupState) => Promise<unknown>;
      getAppVersion: () => Promise<string>;
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

function OperationalAttachments({ ownerType, ownerId, localData }: { ownerType:'job'|'serviceRequest'; ownerId:string; localData:ReturnType<typeof useFieldsteadLocalJobs> }) {
  const [attachments, setAttachments] = useState<OperationalAttachment[]>([]);
  const [status, setStatus] = useState('Attachments are stored locally on this desktop.');
  const refresh = useCallback(async () => {
    const result = await window.fieldsteadDesktop?.listOperationalAttachments(ownerType, ownerId);
    if (result?.ok) {
      setAttachments(result.attachments || []);
    } else if (result?.message) setStatus(result.message);
  }, [ownerType, ownerId]);
  useEffect(() => { const timer = window.setTimeout(() => { void refresh(); }, 0); return () => window.clearTimeout(timer); }, [refresh]);
  async function add() { const result = await window.fieldsteadDesktop?.chooseOperationalAttachment(ownerType, ownerId, 'Fieldstead owner'); if (result?.ok && result.attachment) { await localData.recordAttachmentAdded(result.attachment); setStatus(`${result.attachment.filename} added.`); await refresh(); } else if (!result?.canceled) setStatus(result?.message || 'Attachment could not be added.'); }
  async function preview(id:string) { const result = await window.fieldsteadDesktop?.previewOperationalAttachment(id); setStatus(result?.ok ? `${result.filename || 'Attachment'} opened.` : result?.message || 'Preview is unavailable.'); }
  async function exportFile(id:string) { const result = await window.fieldsteadDesktop?.exportOperationalAttachment(id); setStatus(result?.ok ? `${result.filename || 'Attachment'} exported.` : result?.canceled ? 'Export canceled.' : result?.message || 'Export failed.'); }
  async function remove(item:OperationalAttachment) { if (!window.confirm(`Delete ${item.filename} from this local record? This removes the managed content and records an audit tombstone.`)) return; const result = await window.fieldsteadDesktop?.deleteOperationalAttachment(item.id, 'Fieldstead owner'); if (result?.ok) { await localData.recordAttachmentDeleted(item.id); setStatus(`${item.filename} deleted.`); await refresh(); } else setStatus(result?.message || 'Delete failed.'); }
  return <section className="detail-section"><div className="detail-heading"><h3>Attachments &amp; photos</h3><button className="secondary" onClick={() => void add()}>Add attachment</button></div><p className="helper">PDF, plain text, JPEG, PNG, GIF, and WebP only. Files stay on this desktop.</p>{attachments.length ? <div className="attachment-list">{attachments.map((item) => <div className="attachment-card" key={item.id}><span><strong>{item.filename}</strong><small>{item.contentType} · {Math.ceil(item.size / 1024)} KB</small></span><div><button onClick={() => void preview(item.id)}>Preview</button><button onClick={() => void exportFile(item.id)}>Export</button><button className="danger" onClick={() => void remove(item)}>Delete</button></div></div>)}</div> : <p className="helper">No attachments yet.</p>}<p className="helper" role="status">{status}</p></section>;
}

function CommunicationTimeline({ entityType, entityId, localData }: { entityType:'customer'|'serviceRequest'|'job'|'estimate'|'invoice'; entityId:string; localData:ReturnType<typeof useFieldsteadLocalJobs> }) {
  const [links, setLinks] = useState<CommunicationLink[]>([]);
  useEffect(() => { let active = true; void localData.listCommunicationTimeline(entityType, entityId).then((items) => { if (active) setLinks(items); }); return () => { active = false; }; }, [entityId, entityType, localData]);
  return <section className="detail-section"><div className="detail-heading"><h3>Communication timeline</h3><span className="safe-state">Metadata only</span></div>{links.length ? <div className="drawer-activity">{links.map((link) => <div key={link.id}><span/><div><strong>{link.subject}</strong><p>{link.source.direction} email with {link.correspondent}</p><small>{dateTime.format(new Date(link.occurredAt))} · {link.source.accountId} / {link.source.messageId}</small></div></div>)}</div> : <p className="helper">No email metadata has been explicitly linked to this record.</p>}</section>;
}

export default function Home() {
  const [uiState, setUiState] = useState<OperationsState>(seedState);
  const localJobs = useFieldsteadLocalJobs(seedState.jobs);
  const state = useMemo(
    () => ({
      ...uiState,
      customers: localJobs.customers.map((customer) => ({
        id: customer.id,
        name: customer.displayName,
        phone: customer.primaryPhone || '',
        email: customer.primaryEmail || '',
        address: customer.serviceAddress || '',
        notes: '',
        createdAt: customer.audit.createdAt,
      })),
      jobs: localJobs.jobs,
      activity: localJobs.activity,
    }),
    [uiState, localJobs.customers, localJobs.jobs, localJobs.activity],
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
  const [selectedServiceRequest, setSelectedServiceRequest] = useState<ServiceRequest>();
  const [modal, setModal] = useState<'job'|'customer'|null>(null);
  const [toast, setToast] = useState('');
  const [setupState, setSetupState] = useState<SetupState | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [reportFilters, setReportFilters] = useState<OperationsReportFilters>({});
  const [report, setReport] = useState<OperationsReport>();
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<Error | null>(null);
  const buildOperationsReport = localJobs.buildOperationsReport;
  const syncStatus = { connected: false, syncing: false, ...localJobs.sync };

  useEffect(() => {
    let cancelled = false;
    void loadSetupState(window.fieldsteadDesktop, window.localStorage).then((loaded) => {
      if (cancelled) return;
      setSetupState(loaded);
      setSetupOpen(loaded.status !== 'complete');
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setSelectedJobId(undefined); setSelectedCustomerId(undefined); setSelectedServiceRequest(undefined); setModal(null); } };
    window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close);
  }, []);
  useEffect(() => { if (!toast) return; const id = window.setTimeout(() => setToast(''), 2800); return () => window.clearTimeout(id); }, [toast]);
  useEffect(() => {
    if (view !== 'Reporting') return;
    let cancelled = false;
    const generatedAt = new Date().toISOString();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    void buildOperationsReport({ generatedAt, timezone, filters: reportFilters })
      .then((next) => { if (!cancelled) { setReport(next); setReportError(null); setReportLoading(false); } })
      .catch((error: unknown) => { if (!cancelled) { setReportError(error instanceof Error ? error : new Error(String(error))); setReportLoading(false); } });
    return () => { cancelled = true; };
  }, [view, reportFilters, buildOperationsReport]);

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
  async function saveSetup(next: SetupState) {
    const saved = await persistSetupState(next, window.fieldsteadDesktop, window.localStorage);
    setSetupState(saved);
  }
  function reopenSetup() {
    if (!setupState) return;
    setSetupState({ ...setupState, currentStep: 'review' });
    setSetupOpen(true);
  }
  function changeReportFilters(next: OperationsReportFilters) {
    setReportLoading(true); setReportError(null); setReportFilters(next);
  }
  function exportReport() {
    if (!report) return;
    const csv = localJobs.exportOperationsReportCsv(report);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = `fieldstead-operations-report-${report.generatedAt.slice(0, 10)}.csv`;
    link.click(); URL.revokeObjectURL(url);
    setToast('Visible report exported');
  }

  return (
    <main className={cx('app-shell', `theme-${theme}`, sidebarCollapsed && 'sidebar-collapsed')}>
      <aside className="sidebar">
        <div className="brand"><Image className="brand-logo brand-logo-full" src="/assets/fieldstead-systems-connected.svg" width={1600} height={520} alt="Fieldstead Systems" priority/><Image className="brand-logo-compact" src="/favicon.svg" width={32} height={32} alt="Fieldstead Systems" priority/></div>
        <button className="sidebar-toggle" type="button" aria-label={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'} title={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'} onClick={() => setSidebarCollapsed((value) => !value)}>{sidebarCollapsed ? '›' : '‹'}</button>
        <nav aria-label="Main navigation">
          {(['Overview','Dispatch','Assigned Jobs','Jobs','Customers','Activity','Client Delivery','Email','Finance','Reporting','Settings'] as View[]).map((item) => { const icon = ({ Overview: '⌂', Dispatch: '▦', 'Assigned Jobs': '✓', Jobs: '▤', Customers: '♧', Activity: '◌', 'Client Delivery': '⇢', Email: '✉', Finance: '$', Reporting: '▥', Settings: '⚙' } as Record<View, string>)[item]; return (
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
          <div className="header-actions"><span className={`sync-status sync-status-${deriveSyncStatus(syncStatus)}`} role="status">{syncStatusLabel(syncStatus)}</span>{view !== 'Settings' && <><button className="secondary desktop-only" onClick={() => setModal('customer')}>New customer</button><button className="primary" onClick={() => setModal('job')}>＋ New job</button></>}</div>
        </header>

        <div className="dogfood-banner" role="note"><span>Starter workflow: office-first visibility for customers, jobs, schedules, follow-up, and payment status. No customer messages, invoices, or payments are sent.</span></div>

        <div className="content">
          {view === 'Overview' && <Overview state={state} approvedPipeline={approvedPipeline} unpaid={unpaid} attention={needsAttention} openJob={(id) => setSelectedJobId(id)} goToJobs={goToJobs} />}
          {view === 'Dispatch' && <DispatchView state={state} localData={localJobs} openJob={setSelectedJobId} />}
          {view === 'Assigned Jobs' && <AssignedJobsView localData={localJobs} openJob={setSelectedJobId} />}
          {view === 'Jobs' && <JobsView state={state} jobs={jobs} query={query} setQuery={setQuery} filter={statusFilter} setFilter={setStatusFilter} openJob={setSelectedJobId} />}
          {view === 'Customers' && <CustomersView state={state} query={query} setQuery={setQuery} openCustomer={setSelectedCustomerId} newCustomer={() => setModal('customer')} />}
          {view === 'Activity' && <ActivityView state={state} openJob={setSelectedJobId} />}
          {view === 'Client Delivery' && <ClientDeliveryView state={state} applyImport={applyStagedImport} restore={restoreBackup} />}
          {view === 'Email' && <EmailView state={state} localData={localJobs} openServiceRequestDetail={setSelectedServiceRequest} />}
          {view === 'Finance' && <FinanceView state={state} />}
          {view === 'Reporting' && <ReportingView report={report} loading={reportLoading} error={reportError} customers={state.customers.map((customer) => ({ id: customer.id, name: customer.name }))} assignees={[...new Map(state.jobs.filter((job) => job.crew && job.crew !== 'Unassigned').map((job) => [job.crew, { id: job.crew, name: job.crew }])).values()]} filters={reportFilters} onFiltersChange={changeReportFilters} onExport={exportReport} />}
          {view === 'Settings' && <SettingsView theme={theme} setTheme={setTheme} migratePreviousData={() => void migratePreviousData()} reopenSetup={reopenSetup} />}
        </div>

      </section>

      {selectedJob && <JobDrawer state={state} job={selectedJob} localData={localJobs} close={() => setSelectedJobId(undefined)} save={(next,message) => mutate(next,message)} />}
      {selectedCustomer && <CustomerDrawer state={state} customer={selectedCustomer} close={() => setSelectedCustomerId(undefined)} openJob={(id) => { setSelectedCustomerId(undefined); setSelectedJobId(id); }} remove={() => removeCustomer(selectedCustomer.id)} />}
      {selectedServiceRequest && <ServiceRequestDrawer serviceRequest={selectedServiceRequest} localData={localJobs} close={() => setSelectedServiceRequest(undefined)} />}
      {modal === 'job' && <NewJobModal state={state} close={() => setModal(null)} save={saveNewJob} />}
      {modal === 'customer' && <NewCustomerModal state={state} close={() => setModal(null)} save={(next) => {
        const customer = next.customers.find((candidate) => !state.customers.some((existing) => existing.id === candidate.id));
        const activity = next.activity.find((candidate) => candidate.customerId === customer?.id);
        if (!customer || !activity) return;
        const durableCustomer: DurableCustomer = {
          id: customer.id,
          displayName: customer.name,
          primaryEmail: customer.email || undefined,
          primaryPhone: customer.phone || undefined,
          serviceAddress: customer.address || undefined,
          sourceEmail: {
            accountId: 'manual-entry',
            messageId: `manual:${customer.id}`,
            normalizedFrom: customer.email.trim().toLowerCase() || `manual:${customer.id}`,
          },
          audit: { createdAt: customer.createdAt, createdBy: 'Fieldstead owner', updatedAt: customer.createdAt, updatedBy: 'Fieldstead owner' },
        };
        setModal(null);
        setToast('Customer added');
        void localJobs.createCustomer(durableCustomer, activity).catch((error: unknown) => {
          setToast(error instanceof Error ? `Could not save customer: ${error.message}` : 'Could not save customer');
        });
      }} />}
      {setupOpen && setupState && <SetupWizard state={setupState} onChange={setSetupState} onSave={saveSetup} onClose={() => setSetupOpen(false)} />}
      {toast && <div className="toast" role="status">✓ {toast}</div>}
    </main>
  );
}

function AssignedJobsView({ localData, openJob }: { localData: ReturnType<typeof useFieldsteadLocalJobs>; openJob:(id:string)=>void }) {
  const actorId = 'fieldstead-owner';
  const [assigned, setAssigned] = useState<Awaited<ReturnType<typeof localData.listAssignedJobs>>>([]);
  const [selectedId, setSelectedId] = useState(''); const [note, setNote] = useState(''); const [message, setMessage] = useState('Offline-ready local queue. New actions remain Pending until a sync system acknowledges them.');
  const [syncState, setSyncState] = useState<'Pending'|'Synced'|'Conflicted'>('Synced');
  const refresh = useCallback(async () => { const entries = await localData.listAssignedJobs(actorId); setAssigned(entries); setSelectedId((current) => current || entries[0]?.job.id || ''); }, [localData]);
  useEffect(() => { const timer = window.setTimeout(() => { void refresh(); }, 0); return () => window.clearTimeout(timer); }, [refresh]);
  const selected = assigned.find((entry) => entry.job.id === selectedId)?.job || assigned[0]?.job;
  async function act(kind: 'arrive'|'start'|'pause'|'resume'|'complete'|'cancel'|'note'|'checklist', extra: Record<string, unknown> = {}) { if (!selected) return; try { setSyncState('Pending'); await localData.recordFieldEvent({ jobId: selected.id, actorId, actorRole: 'field_crew', kind, ...extra }); await refresh(); setMessage(`${selected.id}: ${kind} saved locally.`); setNote(''); } catch (error) { setSyncState('Conflicted'); setMessage(error instanceof Error ? error.message : 'Field action could not be saved.'); } }
  return <div className="assigned-jobs-page">
    <section className="field-banner"><div><p className="eyebrow">FIELD / MOBILE MINIMUM</p><h2>Assigned jobs</h2><p>Only work assigned to this crew is shown. No location tracking, signatures, customer communication, or remote-sync claim.</p></div><span className={`field-sync field-sync-${syncState.toLowerCase()}`}>{syncState}</span></section>
    <p className="field-offline-note">Offline-ready local queue · Pending means stored locally · Synced requires acknowledgment · Conflicted needs review</p>
    {!assigned.length ? <Empty title="No assigned jobs" detail="Dispatch must assign this crew before field access is available."/> : <div className="assigned-jobs-layout"><div className="assigned-job-list">{assigned.map(({ job }) => <button key={job.id} className={cx('assigned-job-card', selected?.id === job.id && 'active')} onClick={() => setSelectedId(job.id)}><strong>{job.service}</strong><span>{job.id} · {formatWhen(job.scheduledFor)}</span><small>{job.description}</small></button>)}</div>{selected && <section className="field-job-panel"><div className="detail-heading"><div><p className="eyebrow">ASSIGNED TO FIELDSTEAD OWNER</p><h2>{selected.service}</h2></div><StatusPill>{selected.status}</StatusPill></div><p>{selected.description}</p><button className="secondary" onClick={() => openJob(selected.id)}>Open full job</button><div className="field-action-grid" aria-label="Assigned job actions"><button onClick={() => void act('arrive')}>Arrived</button><button onClick={() => void act('start')}>Start work</button><button onClick={() => void act('pause')}>Pause</button><button onClick={() => void act('resume')}>Resume</button><button onClick={() => void act('complete')}>Complete</button><button className="danger" onClick={() => void act('cancel')}>Cancel job</button></div><form className="field-note-form" onSubmit={(event) => { event.preventDefault(); if (note.trim()) void act('note', { note: note.trim() }); }}><label>Add note<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Work notes stored as an append-only event"/></label><button className="secondary">Add note</button></form><fieldset className="field-checklist"><legend>Checklist</legend>{['Confirm access', 'Protect work area', 'Final cleanup'].map((label) => <label key={label}><input type="checkbox" onChange={(event) => void act('checklist', { checklistItemId: label.toLowerCase().replaceAll(' ', '-'), checklistLabel: label, checklistCompleted: event.target.checked })}/>{label}</label>)}</fieldset></section>}</div>}
    <p role="status" className="dispatch-status">{message}</p>
  </div>;
}

function DispatchView({ state, localData, openJob }: { state: OperationsState; localData: ReturnType<typeof useFieldsteadLocalJobs>; openJob:(id:string)=>void }) {
  const [mode, setMode] = useState<CalendarMode>('week'); const [focus, setFocus] = useState(() => new Date());
  const [editing, setEditing] = useState<Job>(); const [scheduledFor, setScheduledFor] = useState(''); const [durationHours, setDurationHours] = useState('2'); const [assignee, setAssignee] = useState('Fieldstead owner'); const [overrideReason, setOverrideReason] = useState('');
  const [message, setMessage] = useState('Select a job to schedule, assign, reschedule, or unassign.');
  const days = buildCalendarDays(state.jobs, focus, mode); const unscheduled = listUnscheduledJobs(state.jobs);
  function edit(job: Job) { setEditing(job); setScheduledFor(toLocalInput(job.scheduledFor)); setDurationHours(String(job.durationHours || 2)); setAssignee(job.crew === 'Unassigned' ? 'Fieldstead owner' : job.crew); setOverrideReason(''); }
  async function saveSchedule(event: FormEvent) { event.preventDefault(); if (!editing || !scheduledFor) return; try { const assigneeName = assignee.trim() || undefined; const assigneeId = assigneeName === 'Fieldstead owner' ? 'fieldstead-owner' : assigneeName?.toLowerCase().replace(/\s+/g, '-'); await localData.scheduleJob({ jobId: editing.id, scheduledFor: new Date(scheduledFor).toISOString(), durationHours: Number(durationHours), assigneeId, assigneeName, actorId: 'Fieldstead owner', actorRole: 'owner_admin', conflictOverrideReason: overrideReason.trim() || undefined }); setMessage(`${editing.id} schedule saved.`); setEditing(undefined); } catch (error) { setMessage(error instanceof Error ? error.message : 'Schedule could not be saved.'); } }
  async function unassign() { if (!editing) return; try { await localData.unassignJob(editing.id); setMessage(`${editing.id} unassigned; schedule preserved.`); setEditing(undefined); } catch (error) { setMessage(error instanceof Error ? error.message : 'Job could not be unassigned.'); } }
  async function unschedule() { if (!editing) return; try { await localData.unscheduleJob(editing.id); setMessage(`${editing.id} returned to the unscheduled queue.`); setEditing(undefined); } catch (error) { setMessage(error instanceof Error ? error.message : 'Job could not be unscheduled.'); } }
  function move(amount:number) { const next = new Date(focus); next.setDate(next.getDate() + amount * (mode === 'week' ? 7 : 1)); setFocus(next); }
  return <div className="dispatch-page"><section className="dispatch-toolbar"><div><p className="eyebrow">DISPATCH FOUNDATION</p><h2>Calendar and assignment board</h2><p>No route optimization, reminders, or external calendar writes.</p></div><div className="dispatch-controls"><div className="segmented"><button className={mode === 'day' ? 'active' : ''} onClick={() => setMode('day')}>Day</button><button className={mode === 'week' ? 'active' : ''} onClick={() => setMode('week')}>Week</button></div><button className="secondary" onClick={() => move(-1)} aria-label={`Previous ${mode}`}>←</button><button className="secondary" onClick={() => setFocus(new Date())}>Today</button><button className="secondary" onClick={() => move(1)} aria-label={`Next ${mode}`}>→</button></div></section><div className="dispatch-layout"><section className={cx('calendar-grid', mode === 'day' && 'calendar-day-mode')} aria-label={`${mode} dispatch calendar`}>{days.map((day) => <article key={day.key}><header><strong>{day.date.toLocaleDateString(undefined,{weekday:'short'})}</strong><span>{day.date.toLocaleDateString(undefined,{month:'short',day:'numeric'})}</span></header><div>{day.jobs.map((job) => <button key={job.id} className="calendar-job" onClick={() => edit(job)}><time>{new Date(job.scheduledFor!).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})}</time><strong>{job.service}</strong><small>{job.crew} · {job.durationHours}h · {job.id}</small></button>)}{!day.jobs.length && <p className="calendar-empty">No scheduled work</p>}</div></article>)}</section><aside className="unscheduled-queue"><div className="section-title"><div><p className="eyebrow">UNSCHEDULED</p><h2>Queue</h2></div><b>{unscheduled.length}</b></div>{unscheduled.map((job) => <button key={job.id} onClick={() => edit(job)}><strong>{job.service}</strong><small>{job.id} · {job.crew}</small></button>)}{!unscheduled.length && <p>All open work has a date.</p>}</aside></div>{editing && <form className="dispatch-editor" onSubmit={saveSchedule}><div><p className="eyebrow">SCHEDULE / ASSIGN</p><h2>{editing.id} · {editing.service}</h2></div><label>Date and time<input required autoFocus type="datetime-local" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)}/></label><label>Duration hours<input required min="0.25" step="0.25" type="number" value={durationHours} onChange={(event) => setDurationHours(event.target.value)}/></label><label>Assignee<input value={assignee} onChange={(event) => setAssignee(event.target.value)} placeholder="Unassigned"/></label><label>Conflict override reason<textarea value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} placeholder="Required only when deliberately overriding an overlap"/></label><div className="dispatch-editor-actions"><button className="primary">Save schedule</button><button type="button" className="secondary" onClick={() => void unassign()}>Unassign only</button><button type="button" className="secondary" onClick={() => void unschedule()}>Unschedule</button><button type="button" className="secondary" onClick={() => openJob(editing.id)}>Open job</button><button type="button" className="secondary" onClick={() => setEditing(undefined)}>Cancel</button></div></form>}<p role="status" className="dispatch-status">{message}</p></div>;
}

function FinanceView({ state }: { state: OperationsState }) {
  const snapshot = buildFinanceSnapshot(state);
  return <div className="finance-page">
    <section className="finance-intro">
      <div><p className="eyebrow">FINANCE FOUNDATION</p><h2>Invoice and payment visibility</h2><p>Read-only local summary from the invoice fields already stored on Fieldstead jobs. No accounting provider, bank, payment processor, or customer account is connected.</p></div>
      <span className="pill pill-pending">QuickBooks not connected</span>
    </section>
    <section className="finance-metrics" aria-label="Finance summary">
      <article><p>Invoiced</p><strong>{money.format(snapshot.totals.invoiced)}</strong><small>Draft, sent, overdue, and paid</small></article>
      <article><p>Outstanding</p><strong>{money.format(snapshot.totals.outstanding)}</strong><small>Excludes paid invoices</small></article>
      <article><p>Overdue</p><strong>{money.format(snapshot.totals.overdue)}</strong><small>Manual bookkeeping status</small></article>
      <article><p>Paid</p><strong>{money.format(snapshot.totals.paid)}</strong><small>Recorded locally on jobs</small></article>
    </section>
    <section className="finance-card">
      <div className="section-title"><div><p className="eyebrow">INVOICE REGISTER</p><h2>Read-only local summary</h2></div><span className="safe-state">No external writes</span></div>
      {snapshot.invoices.length ? <div className="finance-table" role="table" aria-label="Invoice register">
        <div className="finance-table-head" role="row"><span>Customer / job</span><span>Status</span><span>Due</span><span>Amount</span></div>
        {snapshot.invoices.map((invoice) => <div className="finance-row" role="row" key={invoice.jobId}><span><strong>{invoice.customerName}</strong><small>{invoice.service} · {invoice.jobId}</small></span><span><StatusPill>{invoice.status}</StatusPill></span><span>{invoice.paidAt ? `Paid ${dateOnly.format(new Date(invoice.paidAt))}` : invoice.dueAt ? dateOnly.format(new Date(invoice.dueAt)) : 'Not set'}</span><strong>{money.format(invoice.amount)}</strong></div>)}
      </div> : <Empty title="No invoices yet" detail="Jobs with Draft, Sent, Overdue, or Paid invoice states will appear here."/>}
    </section>
    <QuickBooksReadinessPanel />
    <section className="finance-card finance-boundary"><div><p className="eyebrow">QUICKBOOKS ROADMAP</p><h2>Connection remains gated</h2></div><p>Future phases can add reviewed OAuth, company selection, mapping, import previews, idempotent sync, reconciliation, audit history, and disconnect controls. This foundation does not request credentials or make provider calls.</p></section>
  </div>;
}

function EmailView({ state, localData, openServiceRequestDetail }: { state: OperationsState; localData: ReturnType<typeof useFieldsteadLocalJobs>; openServiceRequestDetail: (request: ServiceRequest) => void }) {
  const emptyConnection: EmailConnectionInput = { provider:'Custom IMAP/SMTP', email:'', displayName:'', username:'', password:'', imap:{host:'',port:993,secure:true}, smtp:{host:'',port:465,secure:true} };
  const [connection, setConnection] = useState<EmailConnectionInput>(emptyConnection);
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [status, setStatus] = useState('Email is not connected.');
  const [busy, setBusy] = useState(false);
  const syncController = useRef<ReturnType<typeof createEmailSyncController<Awaited<ReturnType<NonNullable<typeof window.fieldsteadDesktop>['syncEmail']>>>> | null>(null);
  const [compose, setCompose] = useState({to:'',subject:'',text:''});
  const [emailUi, dispatchEmailUi] = useReducer(reduceEmailUiState, undefined, createInitialEmailUiState);
  const [intakeReview, setIntakeReview] = useState<{ proposal: EmailIntakeReviewProposal; mode: EmailIntakeReviewMode; draft?: EmailIntakeDraft; approval: EmailIntakeApproval; operationId?: string; jobHandoffOperationId?: string; jobHandoffOccurredAt?: string; jobHandoffAuditEventId?: string; result?: { customerId?: string; serviceRequestId?: string; replayed: boolean } }>();
  const [durableCustomers, setDurableCustomers] = useState<DurableCustomer[]>([]);
  const activeAccount = accounts.find((account) => account.id === activeAccountId) || accounts[0];
  const configured = accounts.length > 0;
  async function loadAccounts() {
    const result = await window.fieldsteadDesktop?.getEmailAccounts();
    if (!result) return;
    setAccounts(result.accounts || []);
    setActiveAccountId(result.activeAccountId || result.accounts?.[0]?.id || null);
    if (result.accounts?.length) setStatus(`Connected as ${result.accounts.find((account) => account.id === result.activeAccountId)?.email || result.accounts[0].email}.`);
  }
  useEffect(() => { let cancelled = false; void window.fieldsteadDesktop?.getEmailAccounts().then((result) => { if (cancelled || !result) return; setAccounts(result.accounts || []); setActiveAccountId(result.activeAccountId || result.accounts?.[0]?.id || null); if (result.accounts?.length) setStatus(`Connected as ${result.accounts.find((account) => account.id === result.activeAccountId)?.email || result.accounts[0].email}.`); }); return () => { cancelled = true; }; }, []);
  function selectProvider(provider: string) {
    const profile = getMailProviderProfile(provider);
    setConnection((current) => ({ ...current, provider: profile.id, imap: profile.imap, smtp: profile.smtp }));
    setStatus(provider === 'unknown' ? 'Choose your provider or enter the server settings supplied by your mail host.' : `${profile.name} settings loaded. Choose secure sign-in details to continue.`);
  }
  function updateEmail(value: string) {
    const provider = detectMailProvider(value);
    setConnection((current) => ({ ...current, email: value }));
    if (provider !== 'unknown') selectProvider(provider);
  }
  function update(field: keyof EmailConnectionInput | 'imap.host' | 'imap.port' | 'smtp.host' | 'smtp.port', value: string) { setConnection((current) => { const next = structuredClone(current); if (field === 'email' || field === 'displayName' || field === 'username' || field === 'password') next[field] = value; else if (field === 'imap.host') next.imap.host = value; else if (field === 'smtp.host') next.smtp.host = value; else if (field === 'imap.port') next.imap.port = Number(value); else if (field === 'smtp.port') next.smtp.port = Number(value); return next; }); }
  function addAccount() { setConnection(emptyConnection); setActiveAccountId(null); setStatus('Enter the next mailbox details to add an account.'); }
  async function connect() { setBusy(true); setStatus('Testing IMAP and SMTP…'); const result = await window.fieldsteadDesktop?.saveEmailConfig(connection); setBusy(false); if (result?.ok) { await loadAccounts(); setStatus('Email account connected securely on this device.'); } else setStatus(result?.message || 'Email connection failed.'); }
  async function removeAccount() { if (!activeAccountId || !window.confirm(`Remove ${activeAccount?.email || 'this email account'} from this device?`)) return; setBusy(true); const result = await window.fieldsteadDesktop?.clearEmailConfig(activeAccountId); setBusy(false); setAccounts(result?.accounts || []); setActiveAccountId(result?.activeAccountId || null); setMessages([]); setStatus(result?.configured ? 'Email account removed.' : 'No email accounts are connected.'); }
  async function sync() { if (!activeAccountId || !window.fieldsteadDesktop) return; syncController.current ||= createEmailSyncController((accountId) => window.fieldsteadDesktop!.syncEmail(accountId)); setBusy(true); setStatus('Syncing incoming mail…'); try { const result = await syncController.current.sync(activeAccountId); if (result?.ok) { setMessages(result.messages || []); setStatus(`Synced ${result.messages?.length || 0} messages.`); } else setStatus(result?.message || 'Inbox sync failed.'); } finally { setBusy(false); } }
  async function send() { if (!activeAccountId) return; setBusy(true); const result = await window.fieldsteadDesktop?.sendEmail(compose, activeAccountId); setBusy(false); setStatus(result?.ok ? 'Message sent.' : (result?.message || 'Message could not be sent.')); if (result?.ok) { setCompose({to:'',subject:'',text:''}); dispatchEmailUi({ type:'send-succeeded' }); } }
  function cancelCompose() { setCompose({to:'',subject:'',text:''}); dispatchEmailUi({ type:'cancel-compose' }); setStatus(`Connected as ${activeAccount?.email || 'your mailbox'}.`); }
  function prepareReply(message: EmailMessage, forward = false) { setCompose({ to: forward ? '' : message.from, subject: forward ? forwardSubject(message.subject) : replySubject(message.subject), text: `\n\n--- ${forward ? 'Forwarded' : 'Original'} message ---\n${message.text}` }); dispatchEmailUi({ type:'open-compose' }); setStatus(forward ? 'Forward draft prepared.' : 'Reply draft prepared.'); }
  async function messageAction(message: EmailMessage, action: EmailMessageAction) { if (!activeAccountId) return; if (action === 'reply') { prepareReply(message); return; } if (action === 'forward') { prepareReply(message, true); return; } if (action === 'delete' && !window.confirm(`Delete “${message.subject}” from the mail server? This cannot be undone.`)) return; setBusy(true); setStatus(action === 'delete' ? 'Deleting message…' : 'Updating message…'); try { const result = await window.fieldsteadDesktop?.emailMessageAction(activeAccountId, message.id, action); if (!result?.ok) { setStatus(result?.message || 'Message action failed.'); return; } if (action === 'delete' || action === 'archive') { setMessages((current) => current.filter((candidate) => candidate.id !== message.id)); dispatchEmailUi({ type:'remove-message', messageId:message.id }); } else setMessages((current) => current.map((candidate) => candidate.id === message.id ? { ...candidate, unread: action === 'unread' ? true : action === 'read' ? false : candidate.unread, starred: action === 'star' ? true : action === 'unstar' ? false : candidate.starred } : candidate)); setStatus(action === 'delete' ? 'Message deleted from the mail server.' : action === 'archive' ? 'Message archived.' : 'Message updated.'); } finally { setBusy(false); } }
  async function bulkAction(action: EmailMessageAction) { if (!activeAccountId || !emailUi.selectedMessageIds.length) return; const selected = emailUi.selectedMessageIds; if (action === 'delete' && !window.confirm(`Permanently delete ${selected.length} selected message${selected.length === 1 ? '' : 's'} from the mail server? This cannot be undone.`)) return; setBusy(true); setStatus(action === 'delete' ? 'Deleting selected messages…' : 'Updating selected messages…'); try { const result = await window.fieldsteadDesktop?.emailBulkAction(activeAccountId, selected, action); if (!result?.ok) { setStatus(result?.message || 'Bulk message action failed.'); return; } if (action === 'delete' || action === 'archive') setMessages((current) => current.filter((message) => !selected.includes(message.id))); else setMessages((current) => current.map((message) => selected.includes(message.id) ? { ...message, unread: action === 'unread' ? true : action === 'read' ? false : message.unread, starred: action === 'star' ? true : action === 'unstar' ? false : message.starred } : message)); dispatchEmailUi({ type:'clear-selection' }); setStatus(`${selected.length} message${selected.length === 1 ? '' : 's'} ${action === 'delete' ? 'deleted' : action === 'archive' ? 'archived' : 'updated'}.`); } finally { setBusy(false); } }
  async function previewAttachment(message: EmailMessage, attachment: EmailAttachment) { if (!activeAccountId) return; setStatus(`Opening ${attachment.filename}…`); const result = await window.fieldsteadDesktop?.previewEmailAttachment(activeAccountId, message.id, attachment.id); if (result?.ok) setStatus(`${result.filename || attachment.filename} opened in the system viewer.`); else setStatus(result?.message || 'Attachment preview is unavailable.'); }
  async function saveAttachment(message: EmailMessage, attachment: EmailAttachment) { if (!activeAccountId) return; setStatus(`Choose where to save ${attachment.filename}…`); const result = await window.fieldsteadDesktop?.saveEmailAttachment(activeAccountId, message.id, attachment.id); if (result?.ok) setStatus(`${result.filename || attachment.filename} saved.`); else if (result?.canceled) setStatus('Attachment save canceled.'); else setStatus(result?.message || 'Attachment could not be saved.'); }
  async function openExternalLink(url: string) { const result = await window.fieldsteadDesktop?.openEmailExternalLink(url); if (!result?.ok) setStatus(result?.message || 'Link could not be opened.'); }
  async function linkMessage(message: EmailMessage, entityType: 'customer'|'serviceRequest'|'job', entityId: string) { if (!activeAccountId) return; try { const saved = await localData.linkCommunication({ entityType, entityId, source: { kind:'email', direction:'inbound', accountId:activeAccountId, messageId:message.id }, subject:message.subject || '(no subject)', correspondent:message.from || 'unknown correspondent', occurredAt:message.receivedAt }); setStatus(saved.replayed ? 'This email was already linked to that record.' : `Email linked to ${entityType} ${entityId}. No message content was copied or sent.`); } catch (error) { setStatus(error instanceof Error ? error.message : 'Email link could not be saved.'); } }
  function reviewIntake(message: EmailMessage) { if (!activeAccountId) return; void localData.listDurableCustomers().then(setDurableCustomers); setIntakeReview({ proposal: proposeEmailIntakeReview({ messageId:message.id, accountId:activeAccountId, from:{ name:message.fromName, address:message.from }, subject:message.subject, text:message.text, receivedAt:message.receivedAt }), mode:'review', approval:'customer-and-request' }); }
  async function confirmIntakeConversion(draft: EmailIntakeDraft, approval: EmailIntakeApproval, existingCustomerId?: string) {
    if (!intakeReview) return;
    const occurredAt = new Date().toISOString();
    const operationId = intakeReview.operationId ?? `email-intake-${crypto.randomUUID()}`;
    const customerId = approval === 'request-only' ? undefined : `customer-${crypto.randomUUID()}`;
    const requestId = approval === 'customer-only' ? undefined : `request-${crypto.randomUUID()}`;
    try {
      const conversion = buildEmailIntakeConversion({ approval, draft, actorId:'Fieldstead owner', occurredAt, operationId, customerId, existingCustomerId, serviceRequestId:requestId, customerAuditEventId:customerId ? `activity-${crypto.randomUUID()}` : undefined, requestAuditEventId:requestId ? `activity-${crypto.randomUUID()}` : undefined, source:{ accountId:intakeReview.proposal.source.accountId, messageId:intakeReview.proposal.source.messageId, from:draft.email, receivedAt:intakeReview.proposal.source.receivedAt } });
      const saved = await localData.convertEmailIntake(conversion);
      setDurableCustomers(await localData.listDurableCustomers());
      setIntakeReview({ ...intakeReview, mode:'converted', draft, approval, operationId, result:{ customerId:saved.customer?.id, serviceRequestId:saved.serviceRequest?.id, replayed:saved.replayed } });
      setStatus(saved.replayed ? 'Email intake conversion already existed; original result replayed.' : 'Email intake conversion saved locally.');
    } catch (error) {
      setStatus(error instanceof Error ? `Email intake conversion failed: ${error.message}` : 'Email intake conversion failed.');
    }
  }
  async function confirmJobHandoff(serviceRequestId: string) {
    if (!intakeReview) return;
    const operationId = intakeReview.jobHandoffOperationId ?? `service-request-job-${serviceRequestId}`;
    const occurredAt = intakeReview.jobHandoffOccurredAt ?? new Date().toISOString();
    const auditEventId = intakeReview.jobHandoffAuditEventId ?? `activity-${operationId}`;
    setIntakeReview({ ...intakeReview, jobHandoffOperationId: operationId, jobHandoffOccurredAt: occurredAt, jobHandoffAuditEventId: auditEventId });
    try {
      const saved = await localData.convertServiceRequestToJob({
        serviceRequestId, jobId: `job-${serviceRequestId}`, operationId,
        actorId: 'Fieldstead owner', actorRole: 'owner_admin',
        occurredAt, auditEventId,
      });
      setStatus(saved.replayed ? `Job ${saved.job.id} already existed; original handoff replayed.` : `Draft job ${saved.job.id} created from ${serviceRequestId}.`);
    } catch (error) {
      setStatus(error instanceof Error ? `Job handoff failed: ${error.message}` : 'Job handoff failed.');
    }
  }
  async function openServiceRequest(serviceRequestId: string) {
    const request = await localData.getDurableServiceRequest(serviceRequestId);
    if (request) openServiceRequestDetail(request);
    else setStatus('Service request could not be found.');
  }
  useEffect(() => { if (!activeAccountId) return undefined; const accountId = activeAccountId; const controller = syncController.current ||= createEmailSyncController((id) => window.fieldsteadDesktop!.syncEmail(id)); const refresh = async () => { setBusy(true); setStatus('Syncing incoming mail…'); try { const result = await controller.sync(accountId); if (result?.ok) { setMessages(result.messages || []); setStatus(`Synced ${result.messages?.length || 0} messages.`); } else setStatus(result?.message || 'Inbox sync failed.'); } finally { setBusy(false); } }; const first = window.setTimeout(() => { void refresh(); }, 0); const timer = window.setInterval(() => { void refresh(); }, 60_000); return () => { window.clearTimeout(first); window.clearInterval(timer); }; }, [activeAccountId]);
  const matched = (message: EmailMessage) => state.customers.find((customer) => customer.email.toLowerCase() === message.from.toLowerCase());
  return <div className="settings-page email-page">
    <section className="attention-card settings-card email-account-panel">
      <div className="section-title"><div><p className="eyebrow">EMAIL ACCOUNTS</p><h2>{configured ? 'Connected mailboxes' : 'Connect a mailbox'}</h2></div><span className={`pill ${configured ? 'pill-approved' : 'pill-pending'}`}>{configured ? 'Connected' : 'Setup needed'}</span></div>
      <p className="settings-status" role="status" aria-live="polite">{busy && <span className="email-sync-spinner" aria-hidden="true"/>}{status}</p>
      {configured && activeAccountId ? <div className="email-account-controls"><label>Active account<select value={activeAccountId} onChange={(event) => { setActiveAccountId(event.target.value); setMessages([]); }} >{accounts.map((account) => <option value={account.id} key={account.id}>{account.email}</option>)}</select></label><div className="email-account-actions"><button className="secondary" disabled={busy} onClick={() => void sync()}>Sync now</button><button className="secondary" disabled={busy} onClick={addAccount}>＋ Add account</button><button className="danger" disabled={busy} onClick={() => void removeAccount()}>Remove account</button></div></div> : <div className="email-connection-form"><label>Provider<select value={connection.provider} onChange={(event) => selectProvider(event.target.value === 'Google Workspace / Gmail' ? 'google' : event.target.value === 'Microsoft 365 / Outlook' ? 'microsoft' : event.target.value === 'Yahoo Mail' ? 'yahoo' : event.target.value === 'iCloud Mail' ? 'icloud' : event.target.value === 'Zoho Mail' ? 'zoho' : 'unknown')}><option>Choose provider</option><option>Google Workspace / Gmail</option><option>Microsoft 365 / Outlook</option><option>Yahoo Mail</option><option>iCloud Mail</option><option>Zoho Mail</option><option>Other provider</option></select></label><div className="form-grid"><label>Business email<input type="email" value={connection.email} onChange={(event) => updateEmail(event.target.value)} /></label><label>Display name<input value={connection.displayName} onChange={(event) => update('displayName',event.target.value)} /></label></div><div className="form-grid"><label>Username<input value={connection.username} onChange={(event) => update('username',event.target.value)} /></label><label>Password or app password<input type="password" value={connection.password} onChange={(event) => update('password',event.target.value)} /></label></div><div className="form-grid"><label>IMAP host<input placeholder="imap.example.com" value={connection.imap.host} onChange={(event) => update('imap.host',event.target.value)} /></label><label>IMAP port<input type="number" value={connection.imap.port} onChange={(event) => update('imap.port',event.target.value)} /></label></div><div className="form-grid"><label>SMTP host<input placeholder="smtp.example.com" value={connection.smtp.host} onChange={(event) => update('smtp.host',event.target.value)} /></label><label>SMTP port<input type="number" value={connection.smtp.port} onChange={(event) => update('smtp.port',event.target.value)} /></label></div><button className="primary" disabled={busy} onClick={() => void connect()}>{accounts.length ? 'Add email account' : 'Test and connect email'}</button></div>}
    </section>
    {configured && <><section className="email-toolbar"><button className="primary email-compose-button" onClick={() => dispatchEmailUi({ type:'open-compose' })}>＋ Compose</button></section><section className="attention-card settings-card email-inbox-card"><div className="section-title"><div><p className="eyebrow">INBOX</p><h2>Incoming messages</h2></div><span className="email-count">{messages.length || ''}</span></div>{messages.length === 0 ? <Empty title={busy ? 'Syncing messages…' : 'No synced messages yet'} detail={busy ? 'Checking the selected mailbox.' : 'The inbox refreshes automatically when opened. You can also use Sync now.'} /> : <><div className="email-bulk-toolbar" aria-label="Inbox actions"><label className="email-select-all"><input type="checkbox" aria-label="Select all messages" checked={messages.length > 0 && emailUi.selectedMessageIds.length === messages.length} onChange={(event) => dispatchEmailUi(event.target.checked ? { type:'select-visible', messageIds:messages.map((message) => message.id) } : { type:'clear-selection' })}/><span>{emailUi.selectedMessageIds.length ? `${emailUi.selectedMessageIds.length} selected` : 'Select all'}</span></label>{emailUi.selectedMessageIds.length > 0 && <div className="email-bulk-actions"><button disabled={busy} onClick={() => void bulkAction('archive')}>Archive</button><button disabled={busy} onClick={() => void bulkAction('read')}>Mark read</button><button disabled={busy} onClick={() => void bulkAction('unread')}>Mark unread</button><button disabled={busy} onClick={() => void bulkAction('star')}>Star</button><button disabled={busy} onClick={() => void bulkAction('unstar')}>Unstar</button><button className="danger" disabled={busy} onClick={() => void bulkAction('delete')}>Delete</button><button disabled={busy} onClick={() => dispatchEmailUi({ type:'clear-selection' })}>Clear</button></div>}</div><div className="email-list">{messages.map((message) => { const expanded = emailUi.expandedMessageId === message.id; const selected = emailUi.selectedMessageIds.includes(message.id); const attachmentCount = message.attachments?.length || 0; const imageCount = message.inlineImages?.length || 0; const detailId = `email-detail-${message.id}`; return <article key={message.id} className={cx('email-message-card', message.unread && 'email-unread', expanded && 'email-expanded', selected && 'email-selected')}><div className="email-row-shell"><input className="email-row-checkbox" type="checkbox" aria-label={`Select ${message.subject || 'message'}`} checked={selected} onChange={() => dispatchEmailUi({ type:'toggle-selection', messageId:message.id })}/><button type="button" className="email-star-button" aria-label={message.starred ? 'Unstar message' : 'Star message'} onClick={() => void messageAction(message, message.starred ? 'unstar' : 'star')}>{message.starred ? '★' : '☆'}</button><button type="button" className="email-message-summary" aria-expanded={expanded} aria-controls={detailId} onClick={() => dispatchEmailUi({ type:'toggle-message', messageId:message.id })}><strong className="email-sender">{message.fromName || message.from || 'Unknown sender'}</strong><span className="email-subject"><b>{message.subject || '(no subject)'}</b><em> — {message.text.replace(/\s+/g,' ').slice(0,150) || (attachmentCount ? `${attachmentCount} attachment${attachmentCount === 1 ? '' : 's'}` : 'No message preview')}</em></span><span className="email-row-indicators">{attachmentCount > 0 && <span aria-label={`${attachmentCount} attachment${attachmentCount === 1 ? '' : 's'}`}>📎</span>}{imageCount > 0 && <span aria-label="Includes image">▧</span>}</span><time>{dateTime.format(new Date(message.receivedAt))}</time></button></div>{expanded && <div id={detailId} className="email-message-details"><div className="email-detail-heading"><strong>{message.fromName || message.from}</strong><small>{message.from} · {new Date(message.receivedAt).toLocaleString()}</small></div><EmailMessageContent message={message} onOpenExternalLink={(url) => void openExternalLink(url)} onPreviewAttachment={(attachment) => void previewAttachment(message, attachment)} onSaveAttachment={(attachment) => void saveAttachment(message, attachment)}/>{matched(message) && <p className="email-customer-match">Customer match: {matched(message)!.name}</p>}<div className="email-message-actions"><button onClick={() => reviewIntake(message)}>Review intake</button>{matched(message) && <button onClick={() => void linkMessage(message,'customer',matched(message)!.id)}>Link to matched customer</button>}{state.jobs.filter((job) => matched(message)?.id === job.customerId).map((job) => <button key={`link-${message.id}-${job.id}`} onClick={() => void linkMessage(message,'job',job.id)}>Link to {job.id}</button>)}<button onClick={() => void messageAction(message,'reply')}>Reply</button><button onClick={() => void messageAction(message,'forward')}>Forward</button><button onClick={() => void messageAction(message,message.unread ? 'read' : 'unread')}>Mark {message.unread ? 'read' : 'unread'}</button><button onClick={() => void messageAction(message,'archive')}>Archive</button><button className="danger" onClick={() => void messageAction(message,'delete')}>Delete</button></div></div>}</article>; })}</div></>}</section>{intakeReview && <EmailIntakeReviewPanel proposal={intakeReview.proposal} mode={intakeReview.mode} customers={durableCustomers} selectedApproval={intakeReview.approval} conversionResult={intakeReview.result} onSelectApproval={(approval) => setIntakeReview((current) => current ? { ...current, approval } : current)} onDismiss={() => setIntakeReview(undefined)} onEdit={(draft) => setIntakeReview((current) => current ? { ...current, draft, mode: current.mode === 'edit' ? 'review' : 'edit' } : current)} onApprove={(draft) => setIntakeReview((current) => current ? { ...current, draft, mode:'approved' } : current)} onConfirmConversion={confirmIntakeConversion} onConfirmJobHandoff={confirmJobHandoff} onOpenServiceRequest={openServiceRequest}/>} {emailUi.composeOpen && <section className="attention-card settings-card email-compose-card"><div className="section-title"><div><p className="eyebrow">NEW MESSAGE</p><h2>Compose</h2></div><button className="close" aria-label="Close compose" onClick={cancelCompose}>×</button></div><div className="email-compose-form"><label>To<input type="email" value={compose.to} onChange={(event) => setCompose({...compose,to:event.target.value})}/></label><label>Subject<input value={compose.subject} onChange={(event) => setCompose({...compose,subject:event.target.value})}/></label><label>Message<textarea rows={8} value={compose.text} onChange={(event) => setCompose({...compose,text:event.target.value})}/></label><div><button className="primary" disabled={busy || !compose.to || !compose.subject} onClick={() => void send()}>Send</button><button className="secondary" onClick={cancelCompose}>Discard</button></div></div></section>}</>}
  </div>;
}
function SettingsView({ theme, setTheme, migratePreviousData, reopenSetup }: { theme: Theme; setTheme: (theme: Theme) => void; migratePreviousData: () => void; reopenSetup: () => void }) {
  const [appVersion, setAppVersion] = useState(packageVersion);
  const [status, setStatus] = useState('Checking GitHub for updates…');
  const [available, setAvailable] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const unsubscribe = window.fieldsteadDesktop?.onUpdateStatus((update) => {
      if (update.event === 'checking-for-update') { setChecking(true); setStatus('Checking GitHub for updates…'); }
      if (update.event === 'update-available') { setChecking(false); setAvailable(true); setStatus('A new Fieldstead update is available.'); }
      if (update.event === 'update-not-available') { setChecking(false); setStatus('This program is up to date.'); }
      if (update.event === 'update-downloaded') { setChecking(false); setDownloaded(true); setStatus('Update downloaded. Click Install update now to apply it.'); }
      if (update.event === 'download-progress') { setChecking(false); setStatus('Downloading update…'); }
      if (update.event === 'error') { setChecking(false); setStatus(update.detail instanceof Error ? update.detail.message : String(update.detail || 'The update could not be downloaded.')); }
    });
    void window.fieldsteadDesktop?.getAppVersion()
      .then((version) => { if (!cancelled) setAppVersion(normalizeAppVersion(version)); })
      .catch(() => { /* Keep the package version when runtime metadata is unavailable. */ });
    void window.fieldsteadDesktop?.checkForUpdates();
    return () => { cancelled = true; unsubscribe?.(); };
  }, []);
  async function check() {
    setChecking(true);
    setStatus('Checking GitHub for updates…');
    const result = await window.fieldsteadDesktop?.checkForUpdates();
    if (result?.status === 'development') { setChecking(false); setStatus('Updates are available from the packaged desktop program.'); }
    if (result?.status === 'error') { setChecking(false); setStatus(result.message || 'The update could not be checked.'); }
  }
  async function download() {
    setStatus('Downloading update from GitHub…');
    const result = await window.fieldsteadDesktop?.downloadUpdate();
    if (result?.status === 'error') setStatus(result.message || 'The update could not be downloaded.');
  }
  async function install() {
    setStatus('Installing update and restarting the program…');
    await window.fieldsteadDesktop?.installUpdate();
  }
  return <div className="settings-page">
    <div className="activity-intro"><p className="eyebrow">SETTINGS</p><h2>Fieldstead Systems</h2><p>Choose how the program looks. This preference is saved on this device and does not follow the operating system.</p></div>
    <section className="attention-card settings-card"><div className="section-title"><div><p className="eyebrow">WORKSPACE SETUP</p><h2>First-run capabilities</h2></div><span className="pill pill-approved">4 capabilities</span></div><p className="settings-copy">Review business identity, email, sync / remote workspace, and backup / export setup. Only non-secret planning details are stored here.</p><button className="secondary" onClick={reopenSetup}>Reopen setup wizard</button></section>
    <section className="attention-card settings-card"><div className="section-title"><div><p className="eyebrow">LOCAL DATA</p><h2>Import previous data</h2></div></div><p className="settings-copy">Bring forward compatible local records from an earlier Fieldstead workspace.</p><button className="secondary" onClick={migratePreviousData}>Import previous local data</button></section>
    <OutsideAiAdvisoryStatus />
    <CommunicationAutomationPreview identity={{ user_id: 'fieldstead-owner', organization_id: 'fieldstead-local', role: 'owner_admin' }} />
    <QuickBooksReadinessPanel />
    <section className="attention-card settings-card"><div className="section-title"><div><p className="eyebrow">APPEARANCE</p><h2>Display mode</h2></div><span className="pill pill-approved">{theme === 'dark' ? 'Dark' : 'Light'}</span></div><p className="settings-copy">Dark mode is the default. Light mode is available when you prefer a brighter workspace.</p><div className="theme-picker" role="group" aria-label="Display mode"><button className={theme === 'dark' ? 'primary' : 'secondary'} onClick={() => setTheme('dark')}>Dark mode</button><button className={theme === 'light' ? 'primary' : 'secondary'} onClick={() => setTheme('light')}>Light mode</button></div></section>
    <section className="attention-card settings-card"><div className="section-title"><div><p className="eyebrow">GITHUB UPDATES</p><h2>Keep this program current</h2></div><span className="pill pill-approved">GitHub</span></div><p className="settings-copy">Check GitHub here and install a newer packaged Fieldstead release without manually reopening the program.</p><p className="app-version">Installed version <strong>v{appVersion}</strong></p><div className="update-actions"><button className="secondary" disabled={checking} onClick={() => void check()}>{checking ? 'Checking…' : 'Check for updates'}</button>{available && !downloaded && <button className="primary" onClick={() => void download()}>Update now</button>}{downloaded && <button className="primary" onClick={() => void install()}>Install update now</button>}</div><p className="settings-status" role="status">{status}</p><div className="change-log"><p className="eyebrow">CHANGE LOG</p>{UPDATE_CHANGELOG.map((entry) => <article key={`${entry.version}-${entry.detail}`}><div><strong>{entry.version}</strong><small>{entry.date}</small></div><p>{entry.detail}</p></article>)}</div></section>
  </div>;
}

function Overview({ state, approvedPipeline, unpaid, attention, openJob, goToJobs }: { state:OperationsState; approvedPipeline:number; unpaid:number; attention:Job[]; openJob:(id:string)=>void; goToJobs:(filter?:string)=>void }) {
  const upcoming = state.jobs.filter((job) => job.scheduledFor && !['Completed','Canceled'].includes(job.status)).sort((a,b) => a.scheduledFor!.localeCompare(b.scheduledFor!)).slice(0,4);
  const quotes = state.jobs.filter((job) => job.quoteStatus === 'Sent').length;
  const overdue = state.jobs.filter((job) => job.invoiceStatus === 'Overdue').length;
  const unscheduled = state.jobs.filter((job) => job.quoteStatus === 'Approved' && !job.scheduledFor).length;
  return <>
    <section className="value-strip"><div><span className="value-icon">✓</span><p><strong>Nothing gets lost after “yes.”</strong><br/>Estimates, owner handoffs, and payment follow-up stay visible in one place.</p></div><span>Confirmed records only</span></section>
    <section className="starter-scope-card" aria-label="Operations Starter scope"><div><p className="eyebrow">OPERATIONS STARTER</p><h2>One dependable office workflow</h2><p>Customers, service requests, jobs, statuses, basic schedule visibility, estimate follow-up, invoice/payment-status follow-up, daily attention, and practical summaries.</p></div><ul><li>Discovery and workflow mapping</li><li>Customer and contact records</li><li>Job and service-request tracking</li><li>Training, handoff, and recovery plan</li></ul></section>
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
    void window.fieldsteadDesktop?.getOperationalAttachmentBackupManifest().then((result) => {
      if (result?.manifest?.attachmentCount) setMessage(`Local JSON backup downloaded. Managed attachment content is not included; ${result.manifest.warning}`);
    });
  }

  async function exportAttachmentStore() {
    const result = await window.fieldsteadDesktop?.exportOperationalAttachmentStore();
    if (result?.ok) setMessage(`Complete local attachment store exported with a checksum-verified manifest for ${result.attachmentCount || 0} attachments.`);
    else if (result?.canceled) setMessage('Attachment-store export canceled. The managed source store was unchanged.');
    else setMessage(result?.message || 'Attachment-store export failed. The managed source store was unchanged.');
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
        <p className="card-copy">Export the current Fieldstead customers, jobs, and audit activity. The JSON backup excludes both attachment binaries and attachment metadata. Restore accepts only a versioned Fieldstead dogfood backup.</p>
        <dl><div><dt>Customers</dt><dd>{state.customers.length}</dd></div><div><dt>Jobs</dt><dd>{state.jobs.length}</dd></div><div><dt>Audit events</dt><dd>{state.activity.length}</dd></div></dl>
        <button className="primary full" onClick={downloadBackup}>Download JSON backup</button>
        <button className="secondary full" onClick={() => void exportAttachmentStore()}>Export complete attachment store</button>
        <label className="secondary restore-button">Restore from backup<input type="file" accept="application/json,.json" onChange={(event) => { void restoreFile(event.target.files?.[0]); event.target.value = ''; }}/></label>
        <p className="boundary-note">Managed attachment content and metadata are not included in this JSON backup. The separate complete store export copies binaries plus a checksum-verified manifest and preserves the managed source store. Retention uses a manual retention policy: review and delete only with explicit owner confirmation. No automatic purge, credentials, provider calls, or remote writes are used.</p>
      </aside>
    </div>
    <p className="delivery-message" role="status">{message}</p>
  </div>;
}

function DrawerShell({ title, subtitle, close, children }: { title:string; subtitle:string; close:()=>void; children:React.ReactNode }) {
  return <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><aside className="drawer" role="dialog" aria-modal="true" aria-label={title}><header><div><p className="eyebrow">{subtitle}</p><h2>{title}</h2></div><button className="close" aria-label="Close details" onClick={close}>×</button></header>{children}</aside></div>;
}

function ServiceRequestDrawer({ serviceRequest, localData, close }: { serviceRequest: ServiceRequest; localData: ReturnType<typeof useFieldsteadLocalJobs>; close: () => void }) {
  return <DrawerShell title={serviceRequest.summary} subtitle="SERVICE REQUEST" close={close}><div className="drawer-scroll"><section className="detail-section"><div className="detail-heading"><h3>Durable request</h3><StatusPill>{serviceRequest.status}</StatusPill></div><p>{serviceRequest.details}</p><div className="info-grid"><div><small>Request ID</small><strong>{serviceRequest.id}</strong></div><div><small>Customer ID</small><strong>{serviceRequest.customerId}</strong></div><div className="wide"><small>Source</small><strong>{serviceRequest.sourceEmail.normalizedFrom}</strong></div></div></section><CommunicationTimeline entityType="serviceRequest" entityId={serviceRequest.id} localData={localData}/><OperationalAttachments ownerType="serviceRequest" ownerId={serviceRequest.id} localData={localData}/></div></DrawerShell>;
}

function JobDrawer({ state, job, localData, close, save }: { state:OperationsState; job:Job; localData:ReturnType<typeof useFieldsteadLocalJobs>; close:()=>void; save:(next:OperationsState,message:string)=>void }) {
  const customer = getCustomer(state,job); const action = nextAction(job);
  const [scheduledFor,setScheduledFor] = useState(toLocalInput(job.scheduledFor)); const [crew,setCrew] = useState(job.crew);
  const [estimateLines, setEstimateLines] = useState<EstimateEditorLine[]>([{ description: job.service, quantity: 1, unit: 'job', unitPriceCents: Math.round(job.quoteAmount * 100) }]);
  const [pricebookItems, setPricebookItems] = useState<Awaited<ReturnType<typeof localData.listPricebookItems>>>([]);
  useEffect(() => { let active = true; void Promise.all([localData.getEstimateForJob(job.id), localData.listPricebookItems()]).then(([saved, pricebook]) => { if (!active) return; setPricebookItems(pricebook); if (saved) setEstimateLines(saved.lines.map((line) => ({ description: line.description, quantity: line.quantity, unit: line.unit, unitPriceCents: line.unitPriceCents, pricebookItemId: line.pricebookItemId, pricebookItemName: line.pricebookItemName }))); }); return () => { active = false; }; }, [job.id, localData]);
  async function saveEstimate(lines: EstimateEditorLine[]) { const occurredAt = new Date().toISOString(); const estimateId = `estimate:${job.id}`; const subtotalCents = lines.reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0); await localData.saveEstimate({ operationId: crypto.randomUUID(), actorId: 'Fieldstead owner', actorRole: 'owner_admin', occurredAt, auditEventId: `activity-${crypto.randomUUID()}`, estimate: { id: estimateId, jobId: job.id, status: 'Draft', subtotalCents, audit: { createdAt: occurredAt, createdBy: 'Fieldstead owner', updatedAt: occurredAt, updatedBy: 'Fieldstead owner' } }, lines: lines.map((line, position) => ({ id: `${estimateId}:line:${position}`, estimateId, position, ...line, lineTotalCents: line.quantity * line.unitPriceCents })) }); setEstimateLines(lines); save(updateJob(state, job.id, { quoteAmount: subtotalCents / 100, quoteStatus: 'Draft' }, 'Estimate saved', `${lines.length} line item(s) saved locally.`), 'Estimate saved'); }
  const nextStatus = job.status === 'Quoted' && job.quoteStatus !== 'Approved' ? undefined : statusOrder[statusOrder.indexOf(job.status)+1];
  return <DrawerShell title={`${job.id} · ${customer.name}`} subtitle="JOB DETAIL" close={close}>
    <div className="drawer-scroll">
      <section className="next-action"><p className="eyebrow">RECOMMENDED NEXT ACTION</p><div><span>→</span><div><strong>{action.label}</strong><p>{action.reason}</p></div></div>{nextStatus && <button onClick={() => save(advanceJob(state,job.id),`Job moved to ${nextStatus}`)}>Mark {nextStatus.toLowerCase()}</button>}</section>
      <section className="detail-section"><div className="detail-heading"><h3>Job</h3><StatusPill>{job.status}</StatusPill></div><h2>{job.service}</h2><p>{job.description || 'No work notes added.'}</p><div className="info-grid"><div><small>Customer</small><strong>{customer.name}</strong></div><div><small>Phone</small><strong>{customer.phone}</strong></div><div className="wide"><small>Property</small><strong>{customer.address}</strong></div></div></section>
      <section className="detail-section"><div className="detail-heading"><h3>Estimate</h3><strong>{money.format(job.quoteAmount)}</strong></div><EstimateEditor jobId={job.id} initialLines={estimateLines} pricebookItems={pricebookItems} onSave={saveEstimate}/><p className="helper">Saved estimates remain Draft and local. This dogfood app never sends real messages.</p></section>
      <section className="detail-section"><h3>Schedule &amp; handoff</h3><div className="form-grid"><label>Visit date and time<input type="datetime-local" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)}/></label><label>Crew<input value={crew} onChange={(event) => setCrew(event.target.value)} placeholder="Unassigned"/></label></div><button className="secondary full" onClick={() => save(updateJob(state,job.id,{ scheduledFor:scheduledFor ? new Date(scheduledFor).toISOString() : undefined, crew },'Schedule updated',`${formatWhen(scheduledFor ? new Date(scheduledFor).toISOString() : undefined)} · ${crew || 'Unassigned'}`),'Schedule saved')}>Save schedule</button></section>
      <section className="detail-section"><div className="detail-heading"><h3>Invoice &amp; payment</h3><strong>{money.format(job.invoiceAmount)}</strong></div><label className="select-label full-label">Invoice state<select value={job.invoiceStatus} onChange={(event) => save(setInvoiceStatus(state,job.id,event.target.value as InvoiceStatus),`Invoice marked ${event.target.value.toLowerCase()}`)}>{(['Not created','Draft','Sent','Paid','Overdue'] as InvoiceStatus[]).map((status) => <option key={status}>{status}</option>)}</select></label><p className="helper">This tracks bookkeeping state only. No invoice or payment is transmitted.</p></section>
      <OperationalAttachments ownerType="job" ownerId={job.id} localData={localData}/>
      <CommunicationTimeline entityType="job" entityId={job.id} localData={localData}/>
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
