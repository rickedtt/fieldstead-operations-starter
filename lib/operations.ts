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

export const seedState: OperationsState = {
  customers: [
    { id:'cus-maya', name:'Maya Thompson', phone:'(312) 555-0148', email:'maya.thompson@example.com', address:'1842 W Berteau Ave, Chicago, IL', notes:'Side gate sticks; text on arrival.', createdAt:'2026-07-12T10:00:00-05:00' },
    { id:'cus-daniel', name:'Daniel Cho', phone:'(773) 555-0181', email:'daniel.cho@example.com', address:'4108 N Lincoln Ave, Chicago, IL', notes:'Water hookup is behind garage.', createdAt:'2026-07-22T14:30:00-05:00' },
    { id:'cus-priya', name:'Priya Shah', phone:'(312) 555-0174', email:'priya.shah@example.com', address:'2231 W Roscoe St, Chicago, IL', notes:'Dog in yard; call before opening gate.', createdAt:'2026-08-03T09:15:00-05:00' },
    { id:'cus-elena', name:'Elena Ramirez', phone:'(773) 555-0129', email:'elena.ramirez@example.com', address:'1520 N Campbell Ave, Chicago, IL', notes:'Prefers email for paperwork.', createdAt:'2026-06-18T11:00:00-05:00' },
    { id:'cus-ben', name:'Ben Carter', phone:'(872) 555-0190', email:'ben.carter@example.com', address:'3701 N Hoyne Ave, Chicago, IL', notes:'Corner property; alley access.', createdAt:'2026-08-20T16:00:00-05:00' },
    { id:'cus-aisha', name:'Aisha Morgan', phone:'(312) 555-0116', email:'aisha.morgan@example.com', address:'2619 W Montrose Ave, Chicago, IL', notes:'Quote includes detached garage.', createdAt:'2026-08-26T13:45:00-05:00' },
  ],
  jobs: [
    { id:'HP-1048', customerId:'cus-maya', service:'Gutter clean + guards', description:'Clean all gutters and install guards on rear elevation.', quoteStatus:'Approved', quoteAmount:620, quoteSentAt:'2026-08-22T10:00:00-05:00', scheduledFor:'2026-08-30T08:30:00-05:00', durationHours:2, crew:'Luis + Sam', status:'Scheduled', invoiceStatus:'Not created', invoiceAmount:620, createdAt:'2026-08-20T14:00:00-05:00', updatedAt:'2026-08-28T16:10:00-05:00' },
    { id:'HP-1049', customerId:'cus-daniel', service:'House wash', description:'Two-story soft wash; protect garden beds.', quoteStatus:'Approved', quoteAmount:480, quoteSentAt:'2026-08-21T15:20:00-05:00', scheduledFor:'2026-08-30T11:00:00-05:00', durationHours:2.5, crew:'Luis + Sam', status:'En route', invoiceStatus:'Draft', invoiceAmount:480, createdAt:'2026-08-19T09:30:00-05:00', updatedAt:now },
    { id:'HP-1050', customerId:'cus-priya', service:'Deck soft wash', description:'Cedar deck and stair rails; low pressure only.', quoteStatus:'Approved', quoteAmount:350, quoteSentAt:'2026-08-24T09:00:00-05:00', scheduledFor:'2026-08-31T14:30:00-05:00', durationHours:2, crew:'Nora', status:'Scheduled', invoiceStatus:'Not created', invoiceAmount:350, createdAt:'2026-08-23T11:20:00-05:00', updatedAt:'2026-08-29T12:00:00-05:00' },
    { id:'HP-1044', customerId:'cus-elena', service:'Driveway pressure wash', description:'Driveway and front walk.', quoteStatus:'Approved', quoteAmount:380, quoteSentAt:'2026-08-10T13:00:00-05:00', scheduledFor:'2026-08-20T09:00:00-05:00', durationHours:2, crew:'Nora', status:'Completed', invoiceStatus:'Overdue', invoiceAmount:380, invoiceDueAt:'2026-08-24T23:59:00-05:00', createdAt:'2026-08-08T10:00:00-05:00', updatedAt:'2026-08-24T08:00:00-05:00' },
    { id:'HP-1051', customerId:'cus-ben', service:'Gutter cleaning', description:'Clean gutters and downspouts; photo report.', quoteStatus:'Sent', quoteAmount:290, quoteSentAt:'2026-08-26T15:00:00-05:00', durationHours:1.5, crew:'Unassigned', status:'Quoted', invoiceStatus:'Not created', invoiceAmount:290, createdAt:'2026-08-26T14:30:00-05:00', updatedAt:'2026-08-26T15:00:00-05:00' },
    { id:'HP-1052', customerId:'cus-aisha', service:'House + garage wash', description:'Brick home soft wash plus detached garage.', quoteStatus:'Sent', quoteAmount:760, quoteSentAt:'2026-08-28T10:30:00-05:00', durationHours:4, crew:'Unassigned', status:'Quoted', invoiceStatus:'Not created', invoiceAmount:760, createdAt:'2026-08-28T09:00:00-05:00', updatedAt:'2026-08-28T10:30:00-05:00' },
    { id:'HP-1046', customerId:'cus-maya', service:'Patio wash', description:'Rear paver patio and furniture rinse.', quoteStatus:'Approved', quoteAmount:240, quoteSentAt:'2026-08-12T11:00:00-05:00', scheduledFor:'2026-08-18T10:00:00-05:00', durationHours:1.5, crew:'Luis', status:'Completed', invoiceStatus:'Paid', invoiceAmount:240, invoiceDueAt:'2026-08-25T23:59:00-05:00', paidAt:'2026-08-19T13:00:00-05:00', createdAt:'2026-08-11T12:00:00-05:00', updatedAt:'2026-08-19T13:00:00-05:00' },
    { id:'HP-1053', customerId:'cus-elena', service:'Fall gutter service', description:'Seasonal gutter service; verify date.', quoteStatus:'Draft', quoteAmount:310, durationHours:2, crew:'Unassigned', status:'Quoted', invoiceStatus:'Not created', invoiceAmount:310, createdAt:'2026-08-29T15:00:00-05:00', updatedAt:'2026-08-29T15:00:00-05:00' },
  ],
  activity: [
    { id:'act-1', at:now, jobId:'HP-1049', customerId:'cus-daniel', actor:'Jordan', action:'Job moved to En route', detail:'Luis + Sam are heading to the property.' },
    { id:'act-2', at:'2026-08-29T16:40:00-05:00', jobId:'HP-1050', customerId:'cus-priya', actor:'Jordan', action:'Schedule updated', detail:'Moved to Monday at 2:30 PM; confirmation still needed.' },
    { id:'act-3', at:'2026-08-29T15:00:00-05:00', jobId:'HP-1053', customerId:'cus-elena', actor:'Jordan', action:'Quote drafted', detail:'Fall gutter service estimate created for $310.' },
    { id:'act-4', at:'2026-08-28T10:30:00-05:00', jobId:'HP-1052', customerId:'cus-aisha', actor:'Jordan', action:'Quote sent', detail:'Estimate for $760 marked sent (demo only; no message delivered).' },
    { id:'act-5', at:'2026-08-26T15:00:00-05:00', jobId:'HP-1051', customerId:'cus-ben', actor:'Jordan', action:'Quote sent', detail:'Estimate for $290 marked sent (demo only; no message delivered).' },
    { id:'act-6', at:'2026-08-24T08:00:00-05:00', jobId:'HP-1044', customerId:'cus-elena', actor:'System', action:'Invoice became overdue', detail:'Invoice balance of $380 remains unpaid.' },
  ],
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
    activity: [{ id:`act-${Date.now()}-${state.activity.length}`, at, jobId, customerId:current.customerId, actor:'Jordan', action, detail }, ...state.activity],
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
  return updateJob(state, jobId, changes, `Quote ${quoteStatus.toLowerCase()}`, `Estimate status changed to ${quoteStatus}.`, at);
}

export function setInvoiceStatus(state: OperationsState, jobId: string, invoiceStatus: InvoiceStatus, at = new Date().toISOString()): OperationsState {
  return updateJob(state, jobId, { invoiceStatus, ...(invoiceStatus === 'Paid' ? { paidAt:at } : {}) }, `Invoice ${invoiceStatus.toLowerCase()}`, `Invoice status changed to ${invoiceStatus}.`, at);
}

export function createJob(state: OperationsState, input: { customerId:string; service:string; quoteAmount:number; scheduledFor?:string; description?:string }, at = new Date().toISOString()): OperationsState {
  const maxNumber = Math.max(...state.jobs.map((job) => Number(job.id.split('-')[1]) || 1000));
  const job: Job = { id:`HP-${maxNumber + 1}`, customerId:input.customerId, service:input.service, description:input.description || '', quoteStatus:'Draft', quoteAmount:input.quoteAmount, scheduledFor:input.scheduledFor, durationHours:2, crew:'Unassigned', status:'Quoted', invoiceStatus:'Not created', invoiceAmount:input.quoteAmount, createdAt:at, updatedAt:at };
  return { ...state, jobs:[job, ...state.jobs], activity:[{ id:`act-${Date.now()}-${state.activity.length}`, at, jobId:job.id, customerId:job.customerId, actor:'Jordan', action:'Job created', detail:`${job.service} added with a $${job.quoteAmount} draft estimate.` }, ...state.activity] };
}

export function searchJobs(state: OperationsState, query: string, status = 'All') {
  const normalized = query.trim().toLowerCase();
  return state.jobs.filter((job) => {
    const customer = state.customers.find((item) => item.id === job.customerId);
    const matchesQuery = !normalized || [job.id, job.service, job.description, customer?.name, customer?.address].some((value) => value?.toLowerCase().includes(normalized));
    return matchesQuery && (status === 'All' || job.status === status);
  });
}
