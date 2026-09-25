# Disconnected QuickBooks Online US readiness

`fieldstead-quickbooks` is a dependency-free TypeScript readiness package for QuickBooks Online US. It is intentionally disconnected and fixture-only.

## Implemented

- Strict non-secret configuration parsing for `quickbooks-online`, region `US`, and mode `fixture-only`.
- Recursive rejection of credential-like keys, including tokens, secrets, passwords, authorization, API keys, client IDs, and realm IDs.
- Labeled synthetic fixtures whose identifiers use the `fixture:` prefix and whose email uses the reserved `.invalid` domain.
- Deterministic staged mapping previews for customers, service items, taxes, invoices, payments, credits, accounts, classes, and locations.
- Stable source provenance, explicit `ready`/`unsupported` outcomes, structured findings, and integer-cent reconciliation.
- An adapter capability boundary that always reports `connected: false`, `mode: fixture-only`, and `externalWrites: false`.

## Safety boundary

This package contains no OAuth, credentials, provider SDK, network fetch, environment-variable access, database access, filesystem access, server imports, migrations, repository writes, or outbox writes. Fixture IDs are synthetic and must never be treated as QuickBooks IDs.

## Unsupported / deferred

Live OAuth and company selection, encrypted token storage, API discovery, pagination, rate-limit handling, read-only import staging, duplicate matching, persistence, and all external writes remain unsupported. Unsupported currencies and broken fixture references are returned as findings rather than guessed or silently accepted.
