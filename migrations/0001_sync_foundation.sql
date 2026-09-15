PRAGMA foreign_keys = ON;

CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner_admin', 'dispatcher', 'field_crew')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  password_hash TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, email),
  UNIQUE (organization_id, id)
);
CREATE INDEX users_organization_id_idx ON users (organization_id);
CREATE INDEX users_organization_role_idx ON users (organization_id, role);

CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  service_address TEXT,
  property_notes TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, id)
);
CREATE INDEX customers_organization_id_idx ON customers (organization_id);
CREATE INDEX customers_organization_name_idx ON customers (organization_id, name);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  customer_id TEXT NOT NULL,
  assigned_user_id TEXT,
  service TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  scheduled_for TEXT,
  quote_amount REAL NOT NULL DEFAULT 0,
  quote_margin REAL,
  invoice_amount REAL NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, customer_id)
    REFERENCES customers (organization_id, id),
  FOREIGN KEY (organization_id, assigned_user_id)
    REFERENCES users (organization_id, id)
);
CREATE INDEX jobs_organization_id_idx ON jobs (organization_id);
CREATE INDEX jobs_organization_customer_idx ON jobs (organization_id, customer_id);
CREATE INDEX jobs_organization_assignee_idx ON jobs (organization_id, assigned_user_id);
CREATE INDEX jobs_organization_status_idx ON jobs (organization_id, status);

CREATE TABLE activity_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  job_id TEXT,
  customer_id TEXT,
  actor_user_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  detail_json TEXT NOT NULL CHECK (json_valid(detail_json)),
  occurred_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, job_id)
    REFERENCES jobs (organization_id, id),
  FOREIGN KEY (organization_id, customer_id)
    REFERENCES customers (organization_id, id),
  FOREIGN KEY (organization_id, actor_user_id)
    REFERENCES users (organization_id, id)
);
CREATE INDEX activity_events_organization_id_idx ON activity_events (organization_id);
CREATE INDEX activity_events_organization_job_idx ON activity_events (organization_id, job_id);
CREATE INDEX activity_events_organization_occurred_idx ON activity_events (organization_id, occurred_at);

CREATE TABLE mutations_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  operation_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  fingerprint TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACCEPTED', 'REJECTED', 'RETRYABLE', 'CONFLICT')),
  result_json TEXT NOT NULL CHECK (json_valid(result_json)),
  processed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (organization_id, operation_id),
  FOREIGN KEY (organization_id, actor_user_id)
    REFERENCES users (organization_id, id)
);
CREATE INDEX mutations_log_organization_id_idx ON mutations_log (organization_id);
CREATE INDEX mutations_log_organization_entity_idx ON mutations_log (organization_id, entity_type, entity_id);
CREATE INDEX mutations_log_organization_processed_idx ON mutations_log (organization_id, processed_at);
