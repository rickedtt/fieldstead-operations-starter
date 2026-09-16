# Fieldstead packages

These packages support the local-first Fieldstead Systems Operations Starter
dogfood application.

## `fieldstead-domain`

`packages/fieldstead-domain/src/index.ts` exports the shared `Job`,
`JobAssignment`, `ActivityEvent`, and `OutboxOperation` types. It also exports:

- `JOB_STATUS_TRANSITIONS` and `canTransitionJobStatus` for the supported
  Fieldstead operations workflow.
- `CAPABILITIES` and `ROLE_CAPABILITIES` for `owner_admin`, `dispatcher`, and
  `field_crew`.
- `parseJob`, `parseJobAssignment`, `parseActivityEvent`, and
  `parseOutboxOperation` for dependency-free runtime validation.

The module has no browser, React, database, or server imports.

## `fieldstead-local-store`

Create a repository with `createFieldsteadRepository(name?)`. Schema version 1
contains `jobs`, `assignments`, `activityEvents`, `outboxOperations`, and
`metadata` Dexie tables. The repository exposes `getJob`, `listJobs`,
`observeJobs`, `listPendingOperations`, and `mutateJob`.

`mutateJob` validates status changes and atomically writes the optimistic job
update, its pending outbox operation, and an optional activity event. Callers
must supply a globally unique `operationId`; a duplicate rejects the entire
transaction, so the local job is not partially updated.

The Harbor & Pine compatibility import is deliberately separate and opt-in:

```ts
await importHarborPineOperationsV1(repository, window.localStorage);
```

The helper reads `harbor-pine-operations-v1`, validates it, imports jobs and
activity, derives legacy crew assignments, and records a migration marker. It
does not modify or delete localStorage, and subsequent calls are no-ops.

## `fieldstead-sync`

`packages/fieldstead-sync/src/index.ts` defines and validates versioned
operation batches, opaque cursors, explicit operation outcomes, and conflict
records. `transport.ts` contains the typed transport boundary and an in-memory
test double; it does not expose a server route or provide persistence. See the
[sync architecture](./fieldstead-sync/README.md) for idempotency rules and the
remaining authenticated server work.
