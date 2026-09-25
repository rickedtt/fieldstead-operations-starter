PRAGMA foreign_keys = ON;

ALTER TABLE portal_estimates ADD COLUMN expires_at TEXT;
ALTER TABLE portal_estimates ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1);
ALTER TABLE portal_estimates ADD COLUMN decided_at TEXT;
ALTER TABLE portal_estimates ADD COLUMN decision_idempotency_key TEXT;
ALTER TABLE portal_estimates ADD COLUMN decision_result_json TEXT;
CREATE UNIQUE INDEX portal_estimates_decision_idempotency_idx ON portal_estimates (organization_id, customer_id, decision_idempotency_key) WHERE decision_idempotency_key IS NOT NULL;