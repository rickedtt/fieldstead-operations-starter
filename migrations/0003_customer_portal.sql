PRAGMA foreign_keys = ON;

CREATE TABLE portal_invitations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  customer_id TEXT NOT NULL,
  secret_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  revoked_at TEXT,
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, customer_id) REFERENCES customers (organization_id, id),
  FOREIGN KEY (organization_id, created_by_user_id) REFERENCES users (organization_id, id)
);
CREATE INDEX portal_invitations_scope_idx ON portal_invitations (organization_id, customer_id);
CREATE INDEX portal_invitations_creator_rate_idx ON portal_invitations (organization_id, created_by_user_id, created_at);
CREATE INDEX portal_invitations_expiry_idx ON portal_invitations (expires_at);

CREATE TABLE portal_sessions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  customer_id TEXT NOT NULL,
  invitation_id TEXT REFERENCES portal_invitations(id),
  secret_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, customer_id) REFERENCES customers (organization_id, id)
);
CREATE INDEX portal_sessions_scope_idx ON portal_sessions (organization_id, customer_id);
CREATE INDEX portal_sessions_expiry_idx ON portal_sessions (expires_at);

CREATE TABLE portal_estimates (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  customer_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  estimate_number TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'sent', 'approved', 'declined', 'expired')),
  subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
  issued_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, estimate_number),
  FOREIGN KEY (organization_id, customer_id) REFERENCES customers (organization_id, id),
  FOREIGN KEY (organization_id, job_id) REFERENCES jobs (organization_id, id)
);
CREATE INDEX portal_estimates_scope_idx ON portal_estimates (organization_id, customer_id);
