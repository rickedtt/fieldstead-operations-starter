PRAGMA foreign_keys = ON;

CREATE TABLE invoices (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  job_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'paid', 'overdue')),
  currency TEXT NOT NULL DEFAULT 'usd' CHECK (currency = 'usd'),
  amount_due_cents INTEGER NOT NULL CHECK (amount_due_cents >= 0),
  issued_at TEXT NOT NULL,
  paid_at TEXT,
  paid_provider TEXT,
  paid_provider_event_id TEXT,
  checkout_session_id TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, job_id),
  UNIQUE (organization_id, invoice_number),
  FOREIGN KEY (organization_id, job_id) REFERENCES jobs (organization_id, id),
  FOREIGN KEY (organization_id, customer_id) REFERENCES customers (organization_id, id),
  FOREIGN KEY (organization_id, created_by_user_id) REFERENCES users (organization_id, id)
);
CREATE INDEX invoices_organization_status_idx ON invoices (organization_id, status);
CREATE INDEX invoices_organization_customer_idx ON invoices (organization_id, customer_id);

CREATE TABLE payment_link_requests (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  invoice_id TEXT NOT NULL,
  approved_by_user_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('UNCONFIGURED', 'PENDING', 'READY', 'RETRYABLE')),
  provider_reference TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, idempotency_key),
  FOREIGN KEY (organization_id, invoice_id) REFERENCES invoices (organization_id, id),
  FOREIGN KEY (organization_id, approved_by_user_id) REFERENCES users (organization_id, id)
);
CREATE INDEX payment_link_requests_invoice_idx
  ON payment_link_requests (organization_id, invoice_id);

CREATE TABLE payment_webhook_events (
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  invoice_id TEXT NOT NULL,
  checkout_session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  processed_at TEXT NOT NULL,
  PRIMARY KEY (provider, provider_event_id),
  FOREIGN KEY (organization_id, invoice_id) REFERENCES invoices (organization_id, id)
);
CREATE INDEX payment_webhook_events_invoice_idx
  ON payment_webhook_events (organization_id, invoice_id);
