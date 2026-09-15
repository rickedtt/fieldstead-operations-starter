# Harbor & Pine sync server

`app/api/sync/route.ts` is a POST-only Vinext route. It reads `DB` and
`JWT_SECRET` from `cloudflare:workers`, requires a Bearer token, and delegates
authentication and mutation processing to this directory. It returns 401 for
invalid authentication, 403 for inactive users or forbidden mutations, 400 for
malformed input, 409 for conflicts/idempotency misuse, and 503 for retryable
database failures.

`auth.ts` verifies only HS256 JWTs with Web Crypto and validates integer `iat`
and `exp` claims. The token supplies subject and organization identifiers for
lookup; D1 supplies the authoritative active status and role. Tenant or role
values in request bodies are never authorization inputs.

`database.ts` contains fixed, parameterized D1 statements. `sync-service.ts`
processes each operation as an atomic D1 `batch()` containing the domain write
and durable mutation result. D1 does not support an interactive transaction for
the surrounding read/branch/write loop, so the whole incoming batch is not
atomic. The unique `(organization_id, operation_id)` constraint is the retry
race guard, and job updates also use a tenant-scoped version predicate.

Not supplied by this repository: deployed D1/JWT bindings, migration execution,
real organization/user seeding, token issuance, production key storage and
rotation, password rate limiting/recovery, or an Argon2id runtime. See
`password-provisioning.ts` for the required Argon2id PHC-format interface. It is
not implemented with plaintext credentials, SHA-256 PIN hashes, or browser PINs.

The first billing slice is also server-owned. Job completion inserts one draft
invoice per tenant/job; office users may request a validated invoice document;
only owner-admin users may approve a payment-link request. D1 adapters persist
idempotency keys, webhook receipts, paid reconciliation, and one activity event.

The checked-in PDF renderer, payment provider, and Stripe signature verifier are
explicitly unconfigured boundaries. No SDK, secret, external call, URL, or fake
verification is present. A deployment must inject reviewed implementations. The
webhook service requires verification before its narrow event parser, and its D1
reconciliation batch exposes `DUPLICATE`, `NOT_FOUND`, and `RETRYABLE` outcomes.
