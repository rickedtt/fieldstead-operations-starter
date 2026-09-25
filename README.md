# Fieldstead Systems Operations Starter

This repository is Fieldstead Systems using its own local-first operations product as the first customer. It is an internal dogfood application built from the proven Harbor & Pine operations foundation, with Fieldstead branding and an empty operational workspace. Only confirmed Fieldstead records entered by the owner belong in the live dogfood store; synthetic fixtures remain isolated to tests and the explicitly staged import rehearsal.

This is not a production deployment. It does not contain real customer data, paid API integrations, service credentials, or a configured cloud account.

## Run locally

Use Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open the local URL printed by the development server. Browser job changes are stored in IndexedDB under the Fieldstead dogfood database. `npm run desktop:build` prepares the separate Electron package when a desktop build is needed.

## Five-minute owner walkthrough

1. Start on **Overview**. Read the dogfood banner, local-save status, open-job metrics, estimates awaiting reply, upcoming schedule, and recent activity.
2. Create or enter a confirmed Fieldstead job in **Jobs**, then approve its estimate. Add a date and owner assignment to make the estimate-to-schedule handoff visible.
3. Advance a scheduled job through **En route**, **In progress**, and **Completed**. Completion creates a draft invoice state and appends an activity entry.
4. Change the invoice state to **Sent** or **Paid**. This updates bookkeeping visibility only; it does not create an invoice, payment link, charge, email, or text message.
5. Open **Client Delivery**. Download a versioned JSON backup and restore it to rehearse recovery. The bundled synthetic CSV is an explicitly labeled test fixture and is not part of the live Fieldstead workspace.

## Current Operations Starter contract

The program now follows the synchronized Starter definition used by the website and owner PDF:

- Discovery and workflow mapping.
- Customer and contact records with phone, email, service address, notes, and linked jobs.
- Job and service-request tracking with defined statuses.
- Basic schedule visibility, including approved work that still needs a date or crew handoff.
- Estimate and quote follow-up through draft, sent, approved, and declined states.
- Invoice and payment-status visibility as manual bookkeeping labels only.
- Daily attention and follow-up list for callbacks, estimates, scheduling, unfinished work, and payment status.
- Basic operational summaries, activity and decision history, configuration, training, handoff, and recovery planning.

## What works in this dogfood build

- Local-first job persistence in IndexedDB, including close-and-reopen behavior and optimistic updates with a pending outbox.
- Synthetic customer and job records; estimate follow-up; schedule, crew, and job-status visibility; invoice and payment-state visibility.
- Approved unscheduled work is surfaced as a high-priority **Schedule job** action.
- Append-only activity for workflow changes passed through job mutations.
- Explicitly confirmed synthetic CSV staging with duplicate, missing-field, and invalid-row reporting.
- Versioned JSON export and recovery for the complete in-app operations state.
- Desktop loopback navigation restrictions and server boundaries that remain fail-closed when unconfigured.
- A disabled-by-default, fixture-only outside-AI advisory boundary with redaction preview, strict limits, provenance/confidence, owner confirmation, no-write audit metadata, deterministic fallback, and no network or credential path.

## Exact limitations

- The live starting workspace contains only the Fieldstead Systems internal identity and no invented customers, jobs, amounts, or activity. Enter confirmed Fieldstead records only.
- IndexedDB currently persists job records, activity supplied with job mutations, assignments, outbox operations, and migration metadata. Customer additions and the in-memory activity view require JSON backup/restore for continuity across a full app reload.
- “Sent,” “Paid,” and similar states are manual bookkeeping labels. No email, SMS, invoice PDF delivery, payment link, charge, bank reconciliation, or customer notification occurs.
- The app is single-device and has no live multi-user synchronization, account provisioning, remote backup, conflict UI, or production authentication flow.
- CSV import and JSON restore trust the owner to choose synthetic files. They are local workflows, not a production data migration service.
- The bundled server, billing, sync, QuickBooks, and outside-AI advisory modules are safety boundaries and testable contracts, not enabled services. Their provider adapters and secrets are deliberately unconfigured. The advisory boundary is fixture-only, has a hard disabled switch, performs no network or record writes, and exposes only local redaction/status previews. `/api/health/live` reports process liveness, while `/api/health/ready` and `/api/sync` fail closed until database, issuer, audience, and an injected asymmetric verification boundary are present. No JWKS fetcher or distributed rate-limit enforcement is shipped locally.

## Remaining production boundaries

Before any real customer deployment, Fieldstead would need an explicit security and privacy review; production authentication and authorization; durable customer/activity persistence and migrations; encrypted backup and recovery policy; tenant isolation; a configured and monitored sync service; real invoice/PDF/payment integrations with verified webhooks; consent-aware communications; audit retention; error reporting; accessibility and cross-platform QA; operational monitoring; credential rotation; and a documented support and incident-response process.

Those boundaries are intentionally outside this internal dogfood build. Do not treat the current application as production-ready or deploy it with real customer data.

## Cross-platform dogfood boundary

The app is designed to be exercised on both a Windows laptop and the Linux Omarchy machine. Each device uses durable local IndexedDB storage and records changes in an outbox. The repository includes a versioned, authenticated sync protocol and server route foundation with idempotency, tenant scoping, role checks, and conflict records.

The shared endpoint is **not configured yet**. Bidirectional Windows ↔ Omarchy operation still requires a user-approved shared endpoint reachable by both devices, reviewed authentication and device identity, a network path such as an approved private overlay, deployment of the server route and database migrations, and a tested foreground retry/reconciliation flow. Until that gate is completed, do not describe the two devices as synchronized and do not enter real customer data.

The first true dogfood test will be: enter a confirmed Fieldstead record on one device, sync it, verify it on the other device, make a second-device change, sync back, then inspect the outbox, activity, and conflict behavior.
