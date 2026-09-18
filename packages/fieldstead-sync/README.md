# Fieldstead sync architecture

`fieldstead-sync` defines the browser/server-neutral contract for sending local
outbox operations to a possible future Fieldstead server. It contains no React, browser storage,
database, or server framework imports.

## Protocol boundary

An `OperationBatch` identifies the protocol version, batch, client, optional
opaque cursor, and operations. Both sides must call the runtime parsers at
untrusted boundaries. An `OperationResult` identifies every accepted operation
and every rejected operation; rejections carry a stable code, message, and
retryability flag. Conflict records are attached only to operations rejected
with the `conflict` code.

Operation IDs are durable idempotency keys, not per-request sequence numbers.
A client retry must send the same operation ID and identical operation content.
An ingestion implementation must replay the operation's original result for an
identical retry. Reusing an ID for different content must be rejected with
`idempotency_key_reused`. Batch IDs are for tracing and do not replace
operation-level idempotency.

`SyncTransport` is the shared client boundary used by both browser and Electron
builds. `HttpSyncTransport` submits the validated batch to the authenticated
Workers `POST /api/sync` route; it accepts an injected endpoint and token
provider, so Windows and Omarchy can target the same deployment without
localhost assumptions. `InMemorySyncTransport` remains only a deterministic test
double and is never selected as a production fallback. `SyncClient` coalesces
concurrent drains, preserves retryable operations, advances cursors, and passes
terminal rejections/conflicts to the outbox.

The client wiring is implemented, but live operation still requires deployment
configuration: D1 binding, migrations, JWT issuance/rotation, active users, and
a real Windows-to-Omarchy round-trip test. This package does not claim that
those production boundaries are configured.

## Implemented server boundary

The server verifies HS256 JWT signatures and time claims, then looks up the
active user, organization, and role in D1. The sync service uses parameterized,
tenant-scoped queries, durable operation fingerprints, optimistic job versions,
Field Crew authorization, and server-wins conflict payloads. It supports
`job.create`, `job.update`, and `checkin.manual`.

Each operation's writes are sent in one transactional D1 `batch()`. The service
does not claim that an entire mixed operation loop is atomic because D1 does not
provide an interactive read/branch/write transaction API.

Deployment must still configure the D1 binding and JWT secret, apply migrations,
seed real users, manage production keys/tokens, and provide password enrollment
and verification through a reviewed Argon2id implementation. The code documents
the Argon2id PHC format and provisioning interface but does not ship a fake
verifier. Browser-local PIN handling is separate from server authentication;
SHA-256 PIN hashing is not Argon2id.

## Billing contracts

`billing.ts` contains browser/framework-neutral runtime parsers for invoice PDF
requests, owner-approved payment-link requests, validated invoice documents,
and paid Stripe Checkout completion events. Money crosses these boundaries only
as non-negative integer cents, and invoice totals must exactly match line items.
The Stripe-shaped parser is called only after an injected verifier accepts the
raw body and signature; this package does not verify signatures or import an SDK.
