import { createOutsideAiAdvisoryBoundary, createFixtureAdvisoryProvider, previewAdvisoryRequest } from '../packages/fieldstead-ai-advisory/src';

const config = {
  enabled: false,
  mode: 'fixture-only',
  provider: 'fixture-local',
  limits: { maxInputTokens: 1_000, maxOutputTokens: 400, maxCostMicrosPerRequest: 5_000, maxDailyTokens: 10_000 },
  timeoutMs: 1_000,
} as const;

const fixtureRequest = {
  kind: 'summary',
  requestId: 'fixture:advisory:status',
  ownerConfirmation: false,
  source: { fixtureId: 'fixture:status:1', text: 'Contact owner@example.invalid about the synthetic service request.' },
} as const;

export function buildOutsideAiStatus() {
  return createOutsideAiAdvisoryBoundary({ config, provider: createFixtureAdvisoryProvider() }).capabilities;
}

export function OutsideAiAdvisoryStatus() {
  const status = buildOutsideAiStatus();
  const preview = previewAdvisoryRequest(config, fixtureRequest);
  return <section className="attention-card settings-card" aria-label="Outside-AI advisory status">
    <div className="section-title"><div><p className="eyebrow">OUTSIDE-AI ADVISORY</p><h2>Outside-AI advisory</h2></div><span className="pill pill-pending">Disabled</span></div>
    <p className="settings-copy">Provider-neutral suggestions for summaries, intake, drafts, and routes are behind a hard kill switch. Fixture-only local fallback remains available for contract testing.</p>
    <dl className="quickbooks-mappings">
      <div><dt>Mode</dt><dd><strong>Fixture-only</strong><small>No live provider is configured</small></dd></div>
      <div><dt>Safety</dt><dd><strong>No network, credentials, or record writes</strong><small>No messaging, scheduling, pricing, accounting, or payment actions</small></dd></div>
      <div><dt>Approval</dt><dd><strong>Owner confirmation required</strong><small>Suggestions never mutate records automatically</small></dd></div>
      <div><dt>Limits</dt><dd><strong>{config.limits.maxInputTokens} input / {config.limits.maxOutputTokens} output tokens</strong><small>{config.limits.maxDailyTokens} daily tokens · {config.limits.maxCostMicrosPerRequest} μUSD request ceiling</small></dd></div>
      <div><dt>Redaction preview</dt><dd><strong>{preview.redactedInput}</strong><small>{preview.redactions.length} direct identifier category removed</small></dd></div>
    </dl>
    <p className="helper">Capabilities: {status.kinds.join(', ')}. Provenance and confidence accompany every result.</p>
  </section>;
}
