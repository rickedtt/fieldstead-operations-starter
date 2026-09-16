export type JobStatus = 'Quoted' | 'Scheduled' | 'En route' | 'In progress' | 'Completed' | 'Canceled';
export type QuoteStatus = 'Draft' | 'Sent' | 'Approved' | 'Declined';
export type InvoiceStatus = 'Not created' | 'Draft' | 'Sent' | 'Paid' | 'Overdue';

export type Customer = {
  id: string; name: string; phone: string; email: string; address: string;
  notes: string; createdAt: string;
};

export type Job = {
  id: string; customerId: string; service: string; description: string;
  quoteStatus: QuoteStatus; quoteAmount: number; quoteSentAt?: string;
  scheduledFor?: string; durationHours: number; crew: string;
  status: JobStatus; invoiceStatus: InvoiceStatus; invoiceAmount: number;
  invoiceDueAt?: string; paidAt?: string; createdAt: string; updatedAt: string;
};

export type Activity = {
  id: string; at: string; jobId?: string; customerId?: string;
  actor: string; action: string; detail: string;
};

export type OperationsState = { customers: Customer[]; jobs: Job[]; activity: Activity[] };

const now = '2026-08-30T09:00:00-05:00';
const ownerActor = 'Fieldstead owner';
const demoNote = 'Synthetic dogfood record — not a real customer.';

export const syntheticDemoState: OperationsState = {
  customers: [
    { id:'demo-fs-cus-northstar', name:'Northstar Bicycle Repair (Demo)', phone:'(312) 555-0101', email:'northstar@example.com', address:'100 Demo Way, Chicago, IL', notes:`${demoNote} Owner prefers a concise weekly operations summary.`, createdAt:'2026-07-12T10:00:00-05:00' },
    { id:'demo-fs-cus-hearth', name:'Hearth & Hammer Workshop (Demo)', phone:'(312) 555-0102', email:'hearth@example.com', address:'200 Sample Street, Chicago, IL', notes:`${demoNote} Use the side entrance for the workflow rehearsal.`, createdAt:'2026-07-22T14:30:00-05:00' },
    { id:'demo-fs-cus-lakeside', name:'Lakeside Garden Studio (Demo)', phone:'(312) 555-0103', email:'lakeside@example.com', address:'300 Example Avenue, Chicago, IL', notes:`${demoNote} Confirmation is recorded locally; no message is sent.`, createdAt:'2026-08-03T09:15:00-05:00' },
    { id:'demo-fs-cus-ember', name:'Ember Home Services (Demo)', phone:'(312) 555-0104', email:'ember@example.com', address:'400 Fictional Road, Chicago, IL', notes:`${demoNote} Bookkeeping states are for rehearsal only.`, createdAt:'2026-06-18T11:00:00-05:00' },
    { id:'demo-fs-cus-copper', name:'Copper Finch Creative (Demo)', phone:'(312) 555-0105', email:'copper@example.com', address:'500 Placeholder Place, Chicago, IL', notes:`${demoNote} Follow-up copy must stay in no-send mode.`, createdAt:'2026-08-20T16:00:00-05:00' },
    { id:'demo-fs-cus-maple', name:'Maple Street Mercantile (Demo)', phone:'(312) 555-0106', email:'maple@example.com', address:'600 Test Lane, Chicago, IL', notes:`${demoNote} Demonstration scope includes a second location.`, createdAt:'2026-08-26T13:45:00-05:00' },
  ],
  jobs: [
    { id:'FS-DEMO-1048', customerId:'demo-fs-cus-northstar', service:'Operations workflow setup', description:'Configure a synthetic estimate-to-schedule workflow and owner handoff.', quoteStatus:'Approved', quoteAmount:620, quoteSentAt:'2026-08-22T10:00:00-05:00', scheduledFor:'2026-08-30T08:30:00-05:00', durationHours:2, crew:'Fieldstead owner', status:'Scheduled', invoiceStatus:'Not created', invoiceAmount:620, createdAt:'2026-08-20T14:00:00-05:00', updatedAt:'2026-08-28T16:10:00-05:00' },
    { id:'FS-DEMO-1049', customerId:'demo-fs-cus-hearth', service:'Local data migration rehearsal', description:'Validate a synthetic import and document the recovery checkpoint.', quoteStatus:'Approved', quoteAmount:480, quoteSentAt:'2026-08-21T15:20:00-05:00', scheduledFor:'2026-08-30T11:00:00-05:00', durationHours:2.5, crew:'Fieldstead owner', status:'En route', invoiceStatus:'Draft', invoiceAmount:480, createdAt:'2026-08-19T09:30:00-05:00', updatedAt:now },
    { id:'FS-DEMO-1050', customerId:'demo-fs-cus-lakeside', service:'Owner dashboard configuration', description:'Review schedule visibility, next actions, and local-only activity.', quoteStatus:'Approved', quoteAmount:350, quoteSentAt:'2026-08-24T09:00:00-05:00', scheduledFor:'2026-08-31T14:30:00-05:00', durationHours:2, crew:'Fieldstead owner', status:'Scheduled', invoiceStatus:'Not created', invoiceAmount:350, createdAt:'2026-08-23T11:20:00-05:00', updatedAt:'2026-08-29T12:00:00-05:00' },
    { id:'FS-DEMO-1044', customerId:'demo-fs-cus-ember', service:'Invoice follow-up rehearsal', description:'Exercise overdue visibility without sending an invoice or collecting money.', quoteStatus:'Approved', quoteAmount:380, quoteSentAt:'2026-08-10T13:00:00-05:00', scheduledFor:'2026-08-20T09:00:00-05:00', durationHours:2, crew:'Fieldstead owner', status:'Completed', invoiceStatus:'Overdue', invoiceAmount:380, invoiceDueAt:'2026-08-24T23:59:00-05:00', createdAt:'2026-08-08T10:00:00-05:00', updatedAt:'2026-08-24T08:00:00-05:00' },
    { id:'FS-DEMO-1051', customerId:'demo-fs-cus-copper', service:'Estimate follow-up workflow', description:'Review a pending synthetic estimate and record the owner decision.', quoteStatus:'Sent', quoteAmount:290, quoteSentAt:'2026-08-26T15:00:00-05:00', durationHours:1.5, crew:'Unassigned', status:'Quoted', invoiceStatus:'Not created', invoiceAmount:290, createdAt:'2026-08-26T14:30:00-05:00', updatedAt:'2026-08-26T15:00:00-05:00' },
    { id:'FS-DEMO-1052', customerId:'demo-fs-cus-maple', service:'Two-location workflow design', description:'Synthetic discovery and handoff plan for two demonstration locations.', quoteStatus:'Sent', quoteAmount:760, quoteSentAt:'2026-08-28T10:30:00-05:00', durationHours:4, crew:'Unassigned', status:'Quoted', invoiceStatus:'Not created', invoiceAmount:760, createdAt:'2026-08-28T09:00:00-05:00', updatedAt:'2026-08-28T10:30:00-05:00' },
    { id:'FS-DEMO-1046', customerId:'demo-fs-cus-northstar', service:'Backup recovery check', description:'Export and restore a synthetic local operations backup.', quoteStatus:'Approved', quoteAmount:240, quoteSentAt:'2026-08-12T11:00:00-05:00', scheduledFor:'2026-08-18T10:00:00-05:00', durationHours:1.5, crew:'Fieldstead owner', status:'Completed', invoiceStatus:'Paid', invoiceAmount:240, invoiceDueAt:'2026-08-25T23:59:00-05:00', paidAt:'2026-08-19T13:00:00-05:00', createdAt:'2026-08-11T12:00:00-05:00', updatedAt:'2026-08-19T13:00:00-05:00' },
    { id:'FS-DEMO-1053', customerId:'demo-fs-cus-ember', service:'Quarterly operations review', description:'Draft a synthetic next-phase operations review.', quoteStatus:'Draft', quoteAmount:310, durationHours:2, crew:'Unassigned', status:'Quoted', invoiceStatus:'Not created', invoiceAmount:310, createdAt:'2026-08-29T15:00:00-05:00', updatedAt:'2026-08-29T15:00:00-05:00' },
  ],
  activity: [
    { id:'demo-fs-act-1', at:now, jobId:'FS-DEMO-1049', customerId:'demo-fs-cus-hearth', actor:ownerActor, action:'Job moved to En route', detail:'The synthetic migration rehearsal is ready for the owner review.' },
    { id:'demo-fs-act-2', at:'2026-08-29T16:40:00-05:00', jobId:'FS-DEMO-1050', customerId:'demo-fs-cus-lakeside', actor:ownerActor, action:'Schedule updated', detail:'Moved to Monday at 2:30 PM; this did not send a confirmation.' },
    { id:'demo-fs-act-3', at:'2026-08-29T15:00:00-05:00', jobId:'FS-DEMO-1053', customerId:'demo-fs-cus-ember', actor:ownerActor, action:'Estimate drafted', detail:'Synthetic operations review estimate created for $310.' },
    { id:'demo-fs-act-4', at:'2026-08-28T10:30:00-05:00', jobId:'FS-DEMO-1052', customerId:'demo-fs-cus-maple', actor:ownerActor, action:'Estimate marked sent', detail:'Estimate for $760 marked sent (demo only; no message delivered).' },
    { id:'demo-fs-act-5', at:'2026-08-26T15:00:00-05:00', jobId:'FS-DEMO-1051', customerId:'demo-fs-cus-copper', actor:ownerActor, action:'Estimate marked sent', detail:'Estimate for $290 marked sent (demo only; no message delivered).' },
    { id:'demo-fs-act-6', at:'2026-08-24T08:00:00-05:00', jobId:'FS-DEMO-1044', customerId:'demo-fs-cus-ember', actor:'Demo system', action:'Invoice became overdue', detail:'Synthetic invoice balance of $380 remains unpaid.' },
  ],
};

export const seedState: OperationsState = {
  customers: [],
  jobs: [],
  activity: [],
};

export const statusOrder: JobStatus[] = ['Quoted','Scheduled','En route','In progress','Completed'];

export function nextAction(job: Job) {
  if (job.quoteStatus === 'Draft') return { label:'Send quote', reason:'Quote is ready for review', priority:'high' as const };
  if (job.quoteStatus === 'Sent') return { label:'Follow up on quote', reason:'Customer decision is pending', priority:'high' as const };
  if (job.status === 'Scheduled') return { label:'Start route handoff', reason:'Crew and timing should be confirmed', priority:'normal' as const };
  if (job.status === 'En route') return { label:'Mark in progress', reason:'Crew is heading to the job', priority:'normal' as const };
  if (job.status === 'In progress') return { label:'Complete job', reason:'Finish field work and create invoice', priority:'normal' as const };
  if (job.status === 'Completed' && job.invoiceStatus === 'Not created') return { label:'Create invoice', reason:'Completed work is not yet billed', priority:'high' as const };
  if (job.invoiceStatus === 'Draft') return { label:'Send invoice', reason:'Invoice is still a draft', priority:'high' as const };
  if (job.invoiceStatus === 'Overdue') return { label:'Follow up on invoice', reason:'Payment is past due', priority:'high' as const };
  if (job.invoiceStatus === 'Sent') return { label:'Await payment', reason:'Invoice was sent', priority:'normal' as const };
  if (job.invoiceStatus === 'Paid') return { label:'No action needed', reason:'Job is closed and paid', priority:'low' as const };
  return { label:'Review job', reason:'Check job details', priority:'normal' as const };
}

export function updateJob(state: OperationsState, jobId: string, changes: Partial<Job>, action: string, detail: string, at = new Date().toISOString()): OperationsState {
  const current = state.jobs.find((job) => job.id === jobId);
  if (!current) return state;
  const job = { ...current, ...changes, updatedAt: at };
  return {
    ...state,
    jobs: state.jobs.map((item) => item.id === jobId ? job : item),
    activity: [{ id:`act-${Date.now()}-${state.activity.length}`, at, jobId, customerId:current.customerId, actor:ownerActor, action, detail }, ...state.activity],
  };
}

export function advanceJob(state: OperationsState, jobId: string, at?: string): OperationsState {
  const job = state.jobs.find((item) => item.id === jobId);
  if (!job || job.status === 'Completed' || job.status === 'Canceled') return state;
  const index = statusOrder.indexOf(job.status);
  const status = statusOrder[Math.min(index + 1, statusOrder.length - 1)];
  const extras: Partial<Job> = status === 'Completed' && job.invoiceStatus === 'Not created' ? { invoiceStatus:'Draft' } : {};
  return updateJob(state, jobId, { status, ...extras }, `Job moved to ${status}`, status === 'Completed' ? 'Field work completed; an invoice draft was created.' : `Operations status advanced from ${job.status}.`, at);
}

export function setQuoteStatus(state: OperationsState, jobId: string, quoteStatus: QuoteStatus, at = new Date().toISOString()): OperationsState {
  const changes: Partial<Job> = { quoteStatus };
  if (quoteStatus === 'Sent') changes.quoteSentAt = at;
  if (quoteStatus === 'Approved') changes.status = 'Scheduled';
  return updateJob(state, jobId, changes, `Estimate ${quoteStatus.toLowerCase()}`, `Estimate status changed to ${quoteStatus}. No message was sent.`, at);
}

export function setInvoiceStatus(state: OperationsState, jobId: string, invoiceStatus: InvoiceStatus, at = new Date().toISOString()): OperationsState {
  return updateJob(state, jobId, { invoiceStatus, ...(invoiceStatus === 'Paid' ? { paidAt:at } : {}) }, `Invoice ${invoiceStatus.toLowerCase()}`, `Invoice status changed to ${invoiceStatus}.`, at);
}

export function createJob(state: OperationsState, input: { customerId:string; service:string; quoteAmount:number; scheduledFor?:string; description?:string }, at = new Date().toISOString()): OperationsState {
  const maxNumber = Math.max(...state.jobs.map((job) => Number(job.id.split('-').at(-1)) || 1000));
  const job: Job = { id:`FS-OPS-${maxNumber + 1}`, customerId:input.customerId, service:input.service, description:input.description || '', quoteStatus:'Draft', quoteAmount:input.quoteAmount, scheduledFor:input.scheduledFor, durationHours:2, crew:'Unassigned', status:'Quoted', invoiceStatus:'Not created', invoiceAmount:input.quoteAmount, createdAt:at, updatedAt:at };
  return { ...state, jobs:[job, ...state.jobs], activity:[{ id:`act-${Date.now()}-${state.activity.length}`, at, jobId:job.id, customerId:job.customerId, actor:ownerActor, action:'Job created', detail:`${job.service} added with a $${job.quoteAmount} draft estimate.` }, ...state.activity] };
}

export function searchJobs(state: OperationsState, query: string, status = 'All') {
  const normalized = query.trim().toLowerCase();
  return state.jobs.filter((job) => {
    const customer = state.customers.find((item) => item.id === job.customerId);
    const matchesQuery = !normalized || [job.id, job.service, job.description, customer?.name, customer?.address].some((value) => value?.toLowerCase().includes(normalized));
    return matchesQuery && (status === 'All' || job.status === status);
  });
}
