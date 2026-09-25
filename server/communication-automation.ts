import type { AuthIdentity } from './types';

export type CommunicationChannel = 'email' | 'sms';
export type DryRunOutcome = 'allowed' | 'denied';

export class CommunicationAutomationError extends Error {
  constructor(readonly status: 400 | 403 | 404 | 409, message = status === 403 ? 'Forbidden.' : status === 404 ? 'Not found.' : status === 409 ? 'Idempotency or version conflict.' : 'Invalid request.') {
    super(message);
    this.name = 'CommunicationAutomationError';
  }
}

type SettingsRow = { enabled: number; email_enabled: number; sms_enabled: number; timezone: string; quiet_start_minute: number; quiet_end_minute: number; tenant_daily_limit: number; recipient_daily_limit: number };
type RuleRow = { id: string; enabled: number; channel: string; template_version: number; daily_limit: number };
type PreferenceRow = { consented_at: string | null; consent_expires_at: string | null; suppression_kind: string | null; suppression_until: string | null };
type AuditRow = { id: string; request_fingerprint: string; result_json: string };

export type CommunicationDryRunInput = { idempotencyKey: string; ruleId: string; channel: CommunicationChannel; recipient: string; contentVersion: number; content: string };
export type CommunicationDryRunResult = { auditId: string; outcome: DryRunOutcome; reason: string | null; ruleId: string; channel: CommunicationChannel; recipient: string; contentVersion: number; contentHash: string; evaluatedAt: string };

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function normalizeRecipient(channel: CommunicationChannel, value: string): string {
  const recipient = value.trim();
  if (channel === 'email') {
    const normalized = recipient.toLowerCase();
    if (normalized.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(normalized)) throw new CommunicationAutomationError(400);
    return normalized;
  }
  if (!/^\+[1-9]\d{7,14}$/.test(recipient)) throw new CommunicationAutomationError(400);
  return recipient;
}

function localMinute(now: Date, timezone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
    const hour = Number(parts.find((part) => part.type === 'hour')?.value);
    const minute = Number(parts.find((part) => part.type === 'minute')?.value);
    return Number.isInteger(hour) && Number.isInteger(minute) ? hour * 60 + minute : null;
  } catch {
    return null;
  }
}

function inQuietHours(minute: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

export async function dryRunCommunication(
  db: D1Database,
  identity: AuthIdentity,
  input: CommunicationDryRunInput,
  supplied: { now?: Date; newId?: () => string; globalEnabled?: boolean } = {},
): Promise<CommunicationDryRunResult> {
  if (identity.role !== 'owner_admin') throw new CommunicationAutomationError(403);
  if (!input || !/^[A-Za-z0-9_-]{8,128}$/.test(input.idempotencyKey) || !/^[A-Za-z0-9_-]{1,128}$/.test(input.ruleId) || !['email', 'sms'].includes(input.channel) || !Number.isInteger(input.contentVersion) || input.contentVersion < 1 || typeof input.content !== 'string' || input.content.length < 1 || input.content.length > 100_000) throw new CommunicationAutomationError(400);
  const channel = input.channel as CommunicationChannel;
  const recipient = normalizeRecipient(channel, input.recipient);
  const contentHash = await sha256(JSON.stringify({ ruleId: input.ruleId, channel, recipient, contentVersion: input.contentVersion, content: input.content }));
  const fingerprint = await sha256(JSON.stringify({ ruleId: input.ruleId, channel, recipient, contentVersion: input.contentVersion, contentHash }));
  const existing = await db.prepare('SELECT id, request_fingerprint, result_json FROM communication_dry_run_audits WHERE organization_id = ? AND idempotency_key = ? LIMIT 1').bind(identity.organization_id, input.idempotencyKey).first<AuditRow>();
  if (existing) {
    if (existing.request_fingerprint !== fingerprint) throw new CommunicationAutomationError(409);
    return JSON.parse(existing.result_json) as CommunicationDryRunResult;
  }
  const settings = await db.prepare('SELECT enabled, email_enabled, sms_enabled, timezone, quiet_start_minute, quiet_end_minute, tenant_daily_limit, recipient_daily_limit FROM communication_automation_settings WHERE organization_id = ? LIMIT 1').bind(identity.organization_id).first<SettingsRow>();
  const rule = await db.prepare('SELECT id, enabled, channel, template_version, daily_limit FROM communication_automation_rules WHERE organization_id = ? AND id = ? LIMIT 1').bind(identity.organization_id, input.ruleId).first<RuleRow>();
  if (!settings || !rule) throw new CommunicationAutomationError(404);
  if (rule.channel !== channel) throw new CommunicationAutomationError(400);
  if (rule.template_version !== input.contentVersion) throw new CommunicationAutomationError(409);
  const preference = await db.prepare('SELECT consented_at, consent_expires_at, suppression_kind, suppression_until FROM communication_recipient_preferences WHERE organization_id = ? AND recipient = ? AND channel = ? LIMIT 1').bind(identity.organization_id, recipient, channel).first<PreferenceRow>();
  const now = supplied.now ?? new Date();
  const evaluatedAt = now.toISOString();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const counts = await db.prepare("SELECT COUNT(*) AS tenant_count, SUM(CASE WHEN recipient = ? THEN 1 ELSE 0 END) AS recipient_count, SUM(CASE WHEN rule_id = ? THEN 1 ELSE 0 END) AS rule_count FROM communication_dry_run_audits WHERE organization_id = ? AND outcome = 'allowed' AND evaluated_at >= ?").bind(recipient, input.ruleId, identity.organization_id, dayStart).first<{ tenant_count: number; recipient_count: number; rule_count: number }>();
  const minute = localMinute(now, settings.timezone);
  let reason: string | null = null;
  const globalEnabled = supplied.globalEnabled ?? (db as D1Database & { communicationGlobalEnabled?: boolean }).communicationGlobalEnabled ?? false;
  if (!globalEnabled) reason = 'global_disabled';
  else if (!settings.enabled) reason = 'tenant_disabled';
  else if (!(channel === 'email' ? settings.email_enabled : settings.sms_enabled)) reason = 'channel_disabled';
  else if (!rule.enabled) reason = 'rule_disabled';
  else if (!preference?.consented_at) reason = 'consent_required';
  else if (!preference.consent_expires_at || preference.consent_expires_at <= evaluatedAt) reason = 'consent_expired';
  else if (preference.suppression_kind === 'permanent') reason = 'permanently_suppressed';
  else if (preference.suppression_kind === 'temporary' && (!preference.suppression_until || preference.suppression_until > evaluatedAt)) reason = 'temporarily_suppressed';
  else if (minute === null) reason = 'invalid_timezone';
  else if (inQuietHours(minute, settings.quiet_start_minute, settings.quiet_end_minute)) reason = 'quiet_hours';
  else if (Number(counts?.recipient_count ?? 0) >= settings.recipient_daily_limit) reason = 'recipient_limit';
  else if (Number(counts?.tenant_count ?? 0) >= settings.tenant_daily_limit) reason = 'tenant_limit';
  else if (Number(counts?.rule_count ?? 0) >= rule.daily_limit) reason = 'rule_limit';
  const result: CommunicationDryRunResult = { auditId: supplied.newId?.() ?? crypto.randomUUID(), outcome: reason ? 'denied' : 'allowed', reason, ruleId: rule.id, channel, recipient, contentVersion: input.contentVersion, contentHash, evaluatedAt };
  const inserted = await db.prepare('INSERT INTO communication_dry_run_audits (id, organization_id, rule_id, actor_user_id, idempotency_key, request_fingerprint, channel, recipient, content_version, content_hash, outcome, reason, result_json, evaluated_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(result.auditId, identity.organization_id, rule.id, identity.user_id, input.idempotencyKey, fingerprint, channel, recipient, input.contentVersion, contentHash, result.outcome, result.reason, JSON.stringify(result), evaluatedAt, evaluatedAt).run();
  if (Number(inserted.meta?.changes ?? 0) !== 1) throw new CommunicationAutomationError(409);
  return result;
}
