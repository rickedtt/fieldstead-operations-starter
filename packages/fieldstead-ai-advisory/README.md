# Outside-AI advisory boundary

`fieldstead-ai-advisory` is a provider-neutral contract boundary for optional advisory suggestions. It is intentionally disabled, fixture-only, local, and side-effect-free.

## Implemented

- Strict contracts for `summary`, `intake-suggestion`, `draft-suggestion`, and `route-suggestion` requests.
- A hard kill switch: accepted application configuration requires `enabled: false`.
- A test-only enabled harness that still accepts only injected fixture providers declaring `fixtureOnly: true` and `networkUsed: false`.
- Redaction/minimization preview for email addresses, phone numbers, and street addresses before provider invocation.
- Explicit excluded fields: attachments, credentials, customer identifiers, and record history.
- Provenance, confidence, findings, usage limits, and owner-confirmation requirements on results.
- Per-request input/output token limits, request cost ceiling, daily token quota, and timeout handling.
- Prompt-injection blocking, strict output validation, and deterministic local fallback.
- Audit metadata that always declares no record or external writes and no messaging, scheduling, pricing, accounting, or payment actions.
- A read-only Settings status surface showing the disabled state, limits, redaction preview, and safety boundary.

## Safety boundary

The package has no provider SDK, HTTP client, fetch call, environment-variable access, credentials, database, repository, filesystem, outbox, messaging, scheduling, pricing, accounting, payment, or mutation dependency. Requests and source identifiers must use the `fixture:` prefix. Suggestions are never owner-confirmed in advance and never applied automatically.

The application configuration cannot enable the boundary. The enabled harness exists only so tests can exercise timeout, quota, malformed-output, prompt-injection, and limit failures with local injected fixtures.

## Deferred live provider work

Live provider selection, credential storage, network transport, vendor SDKs, production model evaluation, durable usage accounting, tenant policy, consent/privacy review, observability, retention policy, and any workflow that applies or sends a suggestion remain unsupported. Any future live integration requires a separate security review and an explicit owner-controlled enablement design; it must not inherit the fixture harness as a production switch.
