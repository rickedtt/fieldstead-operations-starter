# Local communication timeline links

Fieldstead can persist an owner-approved link between existing email metadata and a Customer, ServiceRequest, Job, Estimate, or Invoice.

## Safety boundary

- A link is created only by an explicit owner command in the email UI or repository API.
- Records contain source account/message identity, direction, subject, correspondent, message occurrence time, and link audit metadata.
- Message bodies, attachment content, mailbox credentials, and provider secrets are never copied into the link.
- Linking is local-only: it creates no outbox operation, provider call, send, schedule, reminder, or automation.
- The same operation replays idempotently; reusing an operation key with different content fails.
- The same email cannot be linked twice to the same entity.
- Timeline order is deterministic: occurrence time, link time, then link id.

## UI

Expanded inbound messages offer explicit link buttons when the sender matches a local customer. The customer and that customer's jobs are eligible targets. Job and service-request drawers show read-only metadata timelines.

Estimate and invoice target types are supported by the durable repository foundation; dedicated target-selection UI is deferred.
