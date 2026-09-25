# Fieldstead Business Package Product Roadmap

**Status:** Staged backlog; only the read-only Finance foundation is in the current increment.  
**Safety boundary:** No QuickBooks credentials, OAuth grants, bank connections, payment-provider changes, releases, or installs are part of this work.

## Product principles

- Keep local-first operations usable when integrations are unavailable.
- Preview imports and outbound effects before applying them.
- Preserve append-only activity and explicit owner confirmation for consequential changes.
- Treat external accounting, messaging, payments, and sync as separately gated adapters.
- Ship vertical increments with tests, backup/recovery coverage, and clear unsupported-state UI.

## Stage 0 — Shared foundation and product shell

- [x] Fluid reusable application canvas with responsive gutters and shrink-safe page children.
- [x] Persistent navigation and existing Email workflow preserved.
- [x] Finance tab shell based only on existing job invoice/payment fields.
- [ ] Extract reusable page header, metric, table, empty-state, and integration-boundary components.
- [ ] Define durable IDs, timestamps, activity events, validation, and migration conventions for every new domain.
- [ ] Add role/capability checks to UI and service boundaries before multi-user use.

## Stage 1 — CRM and intake

- [ ] Persist customer/contact records durably alongside jobs.
- [ ] Add lead/service-request intake with source, requested service, location, notes, consent, and owner.
- [ ] Add duplicate detection and merge preview for customers and leads.
- [ ] Add lead pipeline states, next action, follow-up date, and conversion to estimate/job.
- [ ] Add CSV import preview, validation report, rollback checkpoint, and audit event.

## Stage 2 — Estimates and proposals

- [ ] Model estimate line items, taxes, discounts, terms, attachments, and version history.
- [ ] Create printable preview/PDF generation without sending.
- [ ] Add approval/decline recording and revision workflow.
- [ ] Gate email/SMS delivery behind reviewed templates, consent, confirmation, and delivery audit.
- [ ] Convert an accepted estimate to a job without copying mutable data incorrectly.

## Stage 3 — Scheduling and dispatch

- [ ] Add calendar/day/week views, unscheduled queue, duration, crew, and service-area context.
- [ ] Add drag/drop or explicit reschedule with conflict detection and audit entries.
- [ ] Add dispatcher assignment and crew availability rules.
- [ ] Add route-order suggestions as advisory only; preserve manual override.
- [ ] Add confirmation/reminder previews before any customer communication.

## Stage 4 — Field and mobile workflow

- [ ] Add assigned-job mobile view with offline cache and explicit sync state.
- [ ] Add arrival/start/pause/complete events, notes, photos, checklists, and signatures.
- [ ] Add safe attachment storage, retention, export, and deletion rules.
- [ ] Add conflict handling for office/field concurrent edits.
- [ ] Add accessibility, small-screen, intermittent-network, and recovery acceptance tests.

## Stage 5 — Email and communications

- [x] Preserve current multi-account email connection, sync, compose, attachment, and message-action features.
- [ ] Link messages to customers, leads, estimates, jobs, and invoices with owner confirmation.
- [ ] Add templates, drafts, scheduled reminders, consent/suppression, and delivery history.
- [ ] Add communication timeline and failed-delivery retry controls.
- [ ] Keep bulk actions reversible where provider capabilities permit and clearly mark destructive actions.

## Stage 5B — Outside-AI advisory boundary

- [x] Add a disabled-by-default, provider-neutral outside-AI advisory boundary for summary, intake, draft, and route suggestions with fixture-only execution, redaction preview, strict token/cost/quota/timeout controls, provenance/confidence, owner confirmation, no-write audit metadata, prompt-injection blocking, and deterministic fallback.
- [ ] Add any live AI provider only after explicit security/privacy review, encrypted credential design, durable metering, production model evaluation, and owner-controlled enablement; no automatic messaging, scheduling, pricing, accounting, payment, or record mutation is authorized.

## Stage 6 — Finance, invoices, payments, and QuickBooks

### 6A — Local read-only foundation

- [x] Summarize invoiced, outstanding, overdue, and paid amounts from existing job contracts.
- [x] Show a read-only invoice register and open its originating job.
- [x] Display explicit “QuickBooks not connected” and “No external writes” boundaries.
- [ ] Persist first-class invoice and payment records instead of relying only on job fields.
- [ ] Add invoice detail, line items, due dates, partial payments, credits, refunds, and audit history.

### 6B — QuickBooks discovery and mapping (still disconnected)

- [ ] Document supported QuickBooks product/region and official API constraints before implementation.
- [x] Define disconnected fixture mappings for customer, service item, tax, invoice, payment, credit, account, and class/location records.
- [x] Add a strict non-secret, QuickBooks Online US fixture-only readiness configuration model.
- [ ] Build live-adapter pagination and rate-limit handling after OAuth/API work is explicitly authorized. Fixture contract tests and recursive credential-key rejection are complete.

### 6C — Reviewed connection and read-only import

- [ ] Add OAuth through the system browser with state/PKCE, encrypted token storage, rotation, and disconnect.
- [ ] Require explicit company selection and show granted scopes.
- [ ] Import customers/items/invoices/payments into a staging area; never overwrite automatically.
- [ ] Add duplicate matching, mapping preview, rejected-row report, and reconciliation totals.

### 6D — Controlled synchronization

- [ ] Add idempotent push/pull operations with external IDs, cursors, retries, and dead-letter review.
- [ ] Require owner approval for creates/updates until acceptance criteria justify narrower automation.
- [ ] Add conflict resolution, closed-period protection, tax/rounding validation, and immutable audit records.
- [ ] Add reconciliation dashboard, last-success state, provider outage handling, and disconnect cleanup.

### 6E — Payments

- [ ] Separate invoice bookkeeping from payment collection provider responsibilities.
- [ ] Add payment-link preview and verified webhook processing only after security review.
- [ ] Model fees, partial payments, refunds, chargebacks, deposits, and payout reconciliation.
- [ ] Never store raw card data; document PCI/provider boundaries and incident response.

## Stage 7 — Inventory and job costing

- [ ] Model catalog items, units, vendors, purchase cost, stock locations, and reorder thresholds.
- [ ] Add job material/labor/equipment estimates and actuals.
- [ ] Add purchase/receipt/adjustment flows with audit and negative-stock policy.
- [ ] Add gross-margin and variance views tied to completed jobs and invoice records.
- [ ] Map inventory/accounting behavior only after Finance contracts are stable.

## Stage 8 — Reporting and automation

- [ ] Define metric contracts for pipeline, conversion, schedule utilization, cycle time, aging, revenue, and margin.
- [ ] Add filterable dashboards and CSV/PDF export with source timestamps.
- [ ] Add an automation rules engine in dry-run mode first, with previews and audit output.
- [ ] Add approval gates, quiet hours, rate limits, retries, and kill switches before enabling actions.
- [ ] Add data-quality warnings so reports do not imply unsupported accounting accuracy.

## Stage 9 — Customer portal and API

- [ ] Add tenant-safe customer identity and invitation/revocation flow.
- [ ] Add read-only estimate, appointment, job, invoice, and payment-status views first.
- [ ] Add approval, document upload, and payment actions only with scoped authorization and audit.
- [ ] Define versioned API contracts, idempotency, pagination, rate limits, webhook signing, and SDK examples.
- [ ] Complete privacy, retention, accessibility, and abuse-prevention review.

## Stage 10 — Settings, security, sync, and backup

- [ ] Persist business identity, locations, users, roles, permissions, numbering, taxes, and templates.
- [ ] Add production authentication, tenant isolation, session/device management, and least privilege.
- [ ] Complete encrypted cross-device sync with conflict UI and observable outbox state.
- [ ] Add encrypted automatic backups, restore drills, retention policy, and export/delete workflows.
- [ ] Add structured logs, error reporting, health checks, credential rotation, and incident runbooks.
- [ ] Complete Windows/Linux packaging, upgrade, rollback, accessibility, and recovery acceptance matrices before release.

## Release gates for every stage

1. Failing tests written before behavior changes; targeted and full suites pass.
2. Build and package validation pass without publishing or installing.
3. Data migration, backup, restore, and rollback behavior are documented and tested.
4. External effects are disabled by default, clearly labeled, previewable, and auditable.
5. Security/privacy/accessibility review is recorded for the added surface.
6. User documentation states what is real, local-only, disconnected, or unsupported.
