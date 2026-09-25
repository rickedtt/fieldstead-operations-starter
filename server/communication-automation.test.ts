import { describe, expect, it } from 'vitest';
import { dryRunCommunication } from './communication-automation';
import { FakeD1Database } from './testing/fake-d1';

const now = new Date('2026-09-25T15:00:00.000Z');
const owner = { user_id: 'owner-1', organization_id: 'org-1', role: 'owner_admin' as const };
const dispatcher = { ...owner, role: 'dispatcher' as const };

function fixture() {
  const db = new FakeD1Database();
  db.communicationSettings.push({ organization_id: 'org-1', enabled: 1, email_enabled: 1, sms_enabled: 0, timezone: 'America/Chicago', quiet_start_minute: 1320, quiet_end_minute: 420, tenant_daily_limit: 10, recipient_daily_limit: 2, updated_at: now.toISOString() });
  db.communicationRules.push({ id: 'rule-1', organization_id: 'org-1', enabled: 1, channel: 'email', template_version: 3, daily_limit: 5 });
  db.communicationPreferences.push({ organization_id: 'org-1', recipient: 'ada@example.test', channel: 'email', consented_at: '2026-09-24T00:00:00.000Z', consent_expires_at: '2026-10-01T00:00:00.000Z', suppression_kind: null, suppression_until: null });
  return db;
}

const request = { idempotencyKey: 'dryrun_01234567', ruleId: 'rule-1', channel: 'email' as const, recipient: ' Ada@Example.Test ', contentVersion: 3, content: 'Appointment reminder' };

describe('communication automation dry-run', () => {
  it('requires owner_admin and records an immutable allowed audit without delivery', async () => {
    const db = fixture();
    await expect(dryRunCommunication(db as unknown as D1Database, dispatcher, request, { now })).rejects.toMatchObject({ status: 403 });
    const result = await dryRunCommunication(db as unknown as D1Database, owner, request, { now, newId: () => 'audit-1' });
    expect(result).toMatchObject({ auditId: 'audit-1', outcome: 'allowed', channel: 'email', recipient: 'ada@example.test', contentVersion: 3 });
    expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(db.communicationAudits).toHaveLength(1);
    expect(JSON.stringify(db)).not.toContain('provider');
  });

  it('replays the same request and conflicts when the idempotency key payload changes', async () => {
    const db = fixture();
    const first = await dryRunCommunication(db as unknown as D1Database, owner, request, { now, newId: () => 'audit-1' });
    await expect(dryRunCommunication(db as unknown as D1Database, owner, request, { now })).resolves.toEqual(first);
    expect(db.communicationAudits).toHaveLength(1);
    await expect(dryRunCommunication(db as unknown as D1Database, owner, { ...request, content: 'Changed' }, { now })).rejects.toMatchObject({ status: 409 });
  });

  it('normalizes strict email and E.164 recipients and rejects invalid input or version drift', async () => {
    const db = fixture();
    await expect(dryRunCommunication(db as unknown as D1Database, owner, { ...request, recipient: 'not-email' }, { now })).rejects.toMatchObject({ status: 400 });
    await expect(dryRunCommunication(db as unknown as D1Database, owner, { ...request, contentVersion: 2 }, { now })).rejects.toMatchObject({ status: 409 });
    await expect(dryRunCommunication(db as unknown as D1Database, owner, { ...request, channel: 'fax' as 'email' }, { now })).rejects.toMatchObject({ status: 400 });
  });

  it('denies without explicit unexpired consent and for permanent or active temporary suppression', async () => {
    for (const [preference, reason] of [
      [{ consented_at: null }, 'consent_required'],
      [{ consent_expires_at: '2026-09-25T14:59:59.000Z' }, 'consent_expired'],
      [{ suppression_kind: 'permanent' }, 'permanently_suppressed'],
      [{ suppression_kind: 'temporary', suppression_until: '2026-09-26T00:00:00.000Z' }, 'temporarily_suppressed'],
    ] as const) {
      const db = fixture();
      Object.assign(db.communicationPreferences[0], preference);
      const result = await dryRunCommunication(db as unknown as D1Database, owner, { ...request, idempotencyKey: `dryrun_${reason}` }, { now });
      expect(result).toMatchObject({ outcome: 'denied', reason });
    }
  });

  it('fails closed on global, tenant, channel, or rule kill switches and quiet hours', async () => {
    const cases: Array<[string, (db: FakeD1Database) => void]> = [
      ['global_disabled', (db) => { db.communicationGlobalEnabled = false; }],
      ['tenant_disabled', (db) => { db.communicationSettings[0].enabled = 0; }],
      ['channel_disabled', (db) => { db.communicationSettings[0].email_enabled = 0; }],
      ['rule_disabled', (db) => { db.communicationRules[0].enabled = 0; }],
      ['quiet_hours', (db) => { db.communicationSettings[0].quiet_start_minute = 540; db.communicationSettings[0].quiet_end_minute = 660; }],
    ];
    for (const [reason, mutate] of cases) {
      const db = fixture(); mutate(db);
      await expect(dryRunCommunication(db as unknown as D1Database, owner, { ...request, idempotencyKey: `dryrun_${reason}` }, { now })).resolves.toMatchObject({ outcome: 'denied', reason });
    }
  });

  it('enforces per-recipient, tenant, and rule daily limits from immutable audit history', async () => {
    for (const [reason, counts] of [['recipient_limit', [1, 10, 10]], ['tenant_limit', [10, 1, 10]], ['rule_limit', [10, 10, 1]]] as const) {
      const db = fixture();
      db.communicationSettings[0].recipient_daily_limit = counts[0];
      db.communicationSettings[0].tenant_daily_limit = counts[1];
      db.communicationRules[0].daily_limit = counts[2];
      db.communicationAudits.push({ id: 'prior', organization_id: 'org-1', rule_id: 'rule-1', channel: 'email', recipient: 'ada@example.test', outcome: 'allowed', evaluated_at: '2026-09-25T13:00:00.000Z' });
      await expect(dryRunCommunication(db as unknown as D1Database, owner, { ...request, idempotencyKey: `dryrun_${reason}` }, { now })).resolves.toMatchObject({ outcome: 'denied', reason });
    }
  });
});
