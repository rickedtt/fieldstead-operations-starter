PRAGMA foreign_keys = ON;

CREATE TABLE communication_automation_settings (
  organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  email_enabled INTEGER NOT NULL DEFAULT 0 CHECK (email_enabled IN (0, 1)),
  sms_enabled INTEGER NOT NULL DEFAULT 0 CHECK (sms_enabled IN (0, 1)),
  timezone TEXT NOT NULL,
  quiet_start_minute INTEGER NOT NULL CHECK (quiet_start_minute BETWEEN 0 AND 1439),
  quiet_end_minute INTEGER NOT NULL CHECK (quiet_end_minute BETWEEN 0 AND 1439),
  tenant_daily_limit INTEGER NOT NULL CHECK (tenant_daily_limit BETWEEN 1 AND 100000),
  recipient_daily_limit INTEGER NOT NULL CHECK (recipient_daily_limit BETWEEN 1 AND 1000),
  updated_at TEXT NOT NULL
);

CREATE TABLE communication_automation_rules (
  id TEXT NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  template_version INTEGER NOT NULL CHECK (template_version >= 1),
  daily_limit INTEGER NOT NULL CHECK (daily_limit BETWEEN 1 AND 100000),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, id)
);

CREATE TABLE communication_recipient_preferences (
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  recipient TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  consented_at TEXT,
  consent_expires_at TEXT,
  suppression_kind TEXT CHECK (suppression_kind IS NULL OR suppression_kind IN ('temporary', 'permanent')),
  suppression_until TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, recipient, channel),
  CHECK (consented_at IS NULL OR consent_expires_at IS NOT NULL),
  CHECK (suppression_kind != 'temporary' OR suppression_until IS NOT NULL)
);

CREATE TABLE communication_dry_run_audits (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rule_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  idempotency_key TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  recipient TEXT NOT NULL,
  content_version INTEGER NOT NULL CHECK (content_version >= 1),
  content_hash TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('allowed', 'denied')),
  reason TEXT,
  result_json TEXT NOT NULL,
  evaluated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (organization_id, rule_id) REFERENCES communication_automation_rules(organization_id, id),
  UNIQUE (organization_id, idempotency_key)
);

CREATE INDEX communication_dry_run_limits_idx ON communication_dry_run_audits (organization_id, evaluated_at, outcome);
CREATE INDEX communication_dry_run_recipient_idx ON communication_dry_run_audits (organization_id, recipient, evaluated_at, outcome);
CREATE INDEX communication_dry_run_rule_idx ON communication_dry_run_audits (organization_id, rule_id, evaluated_at, outcome);

CREATE TRIGGER communication_dry_run_audits_no_update
BEFORE UPDATE ON communication_dry_run_audits
BEGIN
  SELECT RAISE(ABORT, 'communication dry-run audits are immutable');
END;

CREATE TRIGGER communication_dry_run_audits_no_delete
BEFORE DELETE ON communication_dry_run_audits
BEGIN
  SELECT RAISE(ABORT, 'communication dry-run audits are immutable');
END;
