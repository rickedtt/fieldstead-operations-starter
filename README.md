# Fieldstead Systems Operations Starter

This repository is Fieldstead Systems using its own local-first operations product as the first customer. It is an internal dogfood application built from the proven Harbor & Pine operations foundation, with Fieldstead branding and entirely synthetic demonstration customers, jobs, estimates, schedules, invoices, payments, and activity.

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
2. Open **Jobs**, select a synthetic `FS-DEMO-*` record, and approve a pending estimate. Add a date and the `Fieldstead owner` crew to make the estimate-to-schedule handoff visible.
3. Advance a scheduled job through **En route**, **In progress**, and **Completed**. Completion creates a draft invoice state and appends an activity entry.
4. Change the invoice state to **Sent** or **Paid**. This updates bookkeeping visibility only; it does not create an invoice, payment link, charge, email, or text message.
5. Open **Client Delivery**. Download a versioned JSON backup, optionally stage the bundled synthetic CSV, and restore the backup to rehearse recovery. Use the reset button beside the Fieldstead owner identity to return to seeded demo jobs.

## What works in this dogfood build

- Local-first job persistence in IndexedDB, including close-and-reopen behavior and optimistic updates with a pending outbox.
- Synthetic customer and job records; estimate follow-up; schedule, crew, and job-status visibility; invoice and payment-state visibility.
- Append-only activity for workflow changes passed through job mutations.
- Explicitly confirmed synthetic CSV staging with duplicate, missing-field, and invalid-row reporting.
- Versioned JSON export and recovery for the complete in-app operations state.
- Desktop loopback navigation restrictions and server boundaries that remain fail-closed when unconfigured.

## Exact limitations

- All included people, businesses, contact details, addresses, jobs, amounts, and events are fictional demo data. New entries should remain synthetic.
- IndexedDB currently persists job records, activity supplied with job mutations, assignments, outbox operations, and migration metadata. Customer additions and the in-memory activity view require JSON backup/restore for continuity across a full app reload.
- “Sent,” “Paid,” and similar states are manual bookkeeping labels. No email, SMS, invoice PDF delivery, payment link, charge, bank reconciliation, or customer notification occurs.
- The app is single-device and has no live multi-user synchronization, account provisioning, remote backup, conflict UI, or production authentication flow.
- CSV import and JSON restore trust the owner to choose synthetic files. They are local workflows, not a production data migration service.
- The bundled server, billing, and sync modules are safety boundaries and testable contracts, not enabled services. Their provider adapters and secrets are deliberately unconfigured.

## Remaining production boundaries

Before any real customer deployment, Fieldstead would need an explicit security and privacy review; production authentication and authorization; durable customer/activity persistence and migrations; encrypted backup and recovery policy; tenant isolation; a configured and monitored sync service; real invoice/PDF/payment integrations with verified webhooks; consent-aware communications; audit retention; error reporting; accessibility and cross-platform QA; operational monitoring; credential rotation; and a documented support and incident-response process.

Those boundaries are intentionally outside this internal dogfood build. Do not treat the current application as production-ready or deploy it with real customer data.
