# Communication automation dry-run

Fieldstead includes a provider-neutral policy evaluator for communication **dry-runs only**.

## Safety boundary

- The only route is `POST /api/communications/dry-run`.
- Only an authenticated `owner_admin` may use it.
- It never imports or calls SMTP, SMS, provider SDKs, `fetch`, sockets, schedulers, queues, retries, or delivery executors.
- There is no live-send route and no communication provider credential configuration.
- The global kill switch is disabled unless `COMMUNICATION_AUTOMATION_GLOBAL_ENABLED` is exactly `true`; tenant, channel, and rule switches also default disabled in D1.

## Policy evaluation

Every request binds the normalized recipient, channel, rule, content version, and SHA-256 content hash. Evaluation requires:

- a tenant-scoped rule whose channel and version match;
- strict lowercase email normalization or strict E.164 SMS normalization;
- explicit consent with a future expiration;
- no permanent or active temporary suppression;
- an explicit valid IANA timezone and a time outside configured quiet hours;
- available recipient, tenant, and rule daily capacity;
- all global, tenant, channel, and rule switches enabled.

Every outcome, including denial, is inserted into an immutable audit table. Reusing an idempotency key with the same fingerprint returns the original result; a changed fingerprint returns conflict.

## Persistence

Migration `0005_communication_automation_dry_run.sql` adds tenant settings, rules, recipient preferences, and append-only dry-run audits. Audit update/delete triggers enforce immutability.

## Deferred by design

Live delivery, provider adapters, credentials, retry policy, scheduling, queues, execution routes, and automatic invocation remain out of scope until separately designed and approved.
