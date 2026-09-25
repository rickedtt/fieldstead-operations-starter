export type AdvisoryKind = 'summary' | 'intake-suggestion' | 'draft-suggestion' | 'route-suggestion';

export type AdvisoryConfig = {
  enabled: false;
  mode: 'fixture-only';
  provider: string;
  limits: {
    maxInputTokens: number;
    maxOutputTokens: number;
    maxCostMicrosPerRequest: number;
    maxDailyTokens: number;
  };
  timeoutMs: number;
};

type AdvisoryRuntimeConfig = Omit<AdvisoryConfig, 'enabled'> & { enabled: boolean };

export type AdvisoryRequest = {
  kind: AdvisoryKind;
  requestId: string;
  ownerConfirmation: false;
  source: { fixtureId: string; text: string };
};

export type AdvisoryProviderOutput = {
  suggestions: string[];
  confidence: number;
  usage: { inputTokens: number; outputTokens: number; costMicros: number };
  model?: string;
};

export type AdvisoryProvider = {
  id: string;
  fixtureOnly: true;
  networkUsed: false;
  invoke(input: { kind: AdvisoryKind; redactedInput: string }): Promise<AdvisoryProviderOutput>;
};

export type AdvisoryFinding = {
  code: 'advisory-disabled' | 'daily-token-limit' | 'input-token-limit' | 'malformed-output' | 'output-token-limit' | 'prompt-injection' | 'provider-timeout' | 'request-cost-limit';
  severity: 'warning' | 'error';
  message: string;
};

type AdvisoryAudit = {
  requestId: string;
  fixtureId: string;
  recordWrites: false;
  externalWrites: false;
  messaging: false;
  scheduling: false;
  pricing: false;
  accounting: false;
  payments: false;
  ownerConfirmationRequired: true;
};

const CREDENTIAL_KEY = /^(?:(?:access|refresh)[-_]?token|token|secret|password|passwd|authorization|credential|api[-_]?key|client[-_]?id)$/i;
const INJECTION_PATTERN = /ignore\s+(?:all\s+)?previous\s+instructions|reveal\s+(?:the\s+)?system\s+prompt|export\s+all\s+records|bypass\s+(?:the\s+)?(?:rules|safeguards)/i;

function object(value: unknown, owner: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError(`${owner} must be an object`);
  return value as Record<string, unknown>;
}

function strictKeys(value: Record<string, unknown>, allowed: readonly string[], owner: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) throw new TypeError(`${owner} has unknown field: ${unknown.sort()[0]}`);
}

function assertNoCredentialKeys(value: unknown, path = 'config'): void {
  if (Array.isArray(value)) return value.forEach((entry, index) => assertNoCredentialKeys(entry, `${path}[${index}]`));
  if (typeof value !== 'object' || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    if (CREDENTIAL_KEY.test(key)) throw new TypeError(`${path}.${key} is a credential-like key and is not allowed`);
    assertNoCredentialKeys(child, `${path}.${key}`);
  }
}

function requiredString(value: Record<string, unknown>, key: string, owner: string): string {
  if (typeof value[key] !== 'string' || value[key].trim().length === 0 || value[key].length > 100) throw new TypeError(`${owner}.${key} must be a non-empty string of at most 100 characters`);
  return value[key];
}

function positiveInteger(value: Record<string, unknown>, key: string, owner: string, maximum: number): number {
  if (!Number.isSafeInteger(value[key]) || Number(value[key]) <= 0 || Number(value[key]) > maximum) throw new TypeError(`${owner}.${key} must be a positive safe integer at most ${maximum}`);
  return Number(value[key]);
}

export function parseAdvisoryConfig(value: unknown): AdvisoryConfig {
  assertNoCredentialKeys(value);
  const config = object(value, 'AdvisoryConfig');
  strictKeys(config, ['enabled', 'mode', 'provider', 'limits', 'timeoutMs'], 'AdvisoryConfig');
  if (config.enabled !== false) throw new TypeError('AdvisoryConfig must remain disabled by default');
  if (config.mode !== 'fixture-only') throw new TypeError('AdvisoryConfig.mode must be fixture-only');
  const limits = object(config.limits, 'AdvisoryConfig.limits');
  strictKeys(limits, ['maxInputTokens', 'maxOutputTokens', 'maxCostMicrosPerRequest', 'maxDailyTokens'], 'AdvisoryConfig.limits');
  return {
    enabled: false,
    mode: 'fixture-only',
    provider: requiredString(config, 'provider', 'AdvisoryConfig'),
    limits: {
      maxInputTokens: positiveInteger(limits, 'maxInputTokens', 'AdvisoryConfig.limits', 100_000),
      maxOutputTokens: positiveInteger(limits, 'maxOutputTokens', 'AdvisoryConfig.limits', 100_000),
      maxCostMicrosPerRequest: positiveInteger(limits, 'maxCostMicrosPerRequest', 'AdvisoryConfig.limits', 100_000_000),
      maxDailyTokens: positiveInteger(limits, 'maxDailyTokens', 'AdvisoryConfig.limits', 10_000_000),
    },
    timeoutMs: positiveInteger(config, 'timeoutMs', 'AdvisoryConfig', 30_000),
  };
}

function parseRuntimeConfig(value: unknown, allowEnabledFixtureHarness: boolean): AdvisoryRuntimeConfig {
  if (!allowEnabledFixtureHarness) return parseAdvisoryConfig(value);
  const raw = object(value, 'AdvisoryConfig');
  if (raw.enabled !== true) return parseAdvisoryConfig(value);
  return { ...parseAdvisoryConfig({ ...raw, enabled: false }), enabled: true };
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function baseAudit(request: AdvisoryRequest): AdvisoryAudit {
  return {
    requestId: request.requestId,
    fixtureId: request.source.fixtureId,
    recordWrites: false,
    externalWrites: false,
    messaging: false,
    scheduling: false,
    pricing: false,
    accounting: false,
    payments: false,
    ownerConfirmationRequired: true,
  };
}

export function previewAdvisoryRequest(configValue: unknown, request: AdvisoryRequest) {
  const config = parseRuntimeConfig(configValue, true);
  if (!request.requestId.startsWith('fixture:') || !request.source.fixtureId.startsWith('fixture:')) throw new TypeError('Advisory requests must use fixture identifiers');
  if (request.ownerConfirmation !== false) throw new TypeError('Advisory requests cannot arrive pre-confirmed');
  if (!['summary', 'intake-suggestion', 'draft-suggestion', 'route-suggestion'].includes(request.kind)) throw new TypeError('Unsupported advisory kind');
  if (typeof request.source.text !== 'string' || request.source.text.length === 0 || request.source.text.length > 20_000) throw new TypeError('Advisory source text must contain 1 to 20000 characters');
  const redactions: Array<{ category: 'email' | 'phone' | 'street-address'; count: number }> = [];
  let redactedInput = request.source.text;
  const patterns = [
    { category: 'email' as const, replacement: '[REDACTED_EMAIL]', pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
    { category: 'phone' as const, replacement: '[REDACTED_PHONE]', pattern: /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/g },
    { category: 'street-address' as const, replacement: '[REDACTED_ADDRESS]', pattern: /\b\d{1,6}\s+[A-Za-z0-9.' -]+\s(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Boulevard|Blvd|Court|Ct|Way)\b/gi },
  ];
  for (const item of patterns) {
    let count = 0;
    redactedInput = redactedInput.replace(item.pattern, () => { count += 1; return item.replacement; });
    if (count > 0) redactions.push({ category: item.category, count });
  }
  return {
    kind: request.kind,
    requestId: request.requestId,
    redactedInput,
    redactions,
    estimatedInputTokens: estimateTokens(redactedInput),
    minimization: { includedFields: ['kind', 'redacted-text'], excludedFields: ['attachments', 'credentials', 'customer-identifiers', 'record-history'] },
    limits: config.limits,
    audit: baseAudit(request),
  };
}

function fallbackSuggestion(kind: AdvisoryKind): string {
  const suggestions: Record<AdvisoryKind, string> = {
    summary: 'Review the fixture source and create a concise owner-verified summary.',
    'intake-suggestion': 'Review the fixture request, confirm scope, and decide whether to create a local intake record.',
    'draft-suggestion': 'Prepare a neutral draft for owner review; do not send it automatically.',
    'route-suggestion': 'Compare the fixture stops manually; do not change the schedule or dispatch order automatically.',
  };
  return suggestions[kind];
}

function fallback(request: AdvisoryRequest, findings: AdvisoryFinding[]) {
  return {
    kind: request.kind,
    requestId: request.requestId,
    status: 'fallback' as const,
    suggestions: [fallbackSuggestion(request.kind)],
    confidence: 0.35,
    ownerConfirmationRequired: true as const,
    provenance: { provider: 'local-deterministic-fallback', model: 'rules-v1', fixtureOnly: true as const, networkUsed: false as const },
    findings,
    audit: baseAudit(request),
  };
}

function validOutput(value: unknown): value is AdvisoryProviderOutput {
  if (typeof value !== 'object' || value === null) return false;
  const output = value as Partial<AdvisoryProviderOutput>;
  return Array.isArray(output.suggestions)
    && output.suggestions.length > 0
    && output.suggestions.every((item) => typeof item === 'string' && item.length > 0 && item.length <= 1_000)
    && typeof output.confidence === 'number' && output.confidence >= 0 && output.confidence <= 1
    && typeof output.usage === 'object' && output.usage !== null
    && [output.usage.inputTokens, output.usage.outputTokens, output.usage.costMicros].every((item) => Number.isSafeInteger(item) && Number(item) >= 0);
}

export function createFixtureAdvisoryProvider(usage = { inputTokens: 24, outputTokens: 32, costMicros: 0 }): AdvisoryProvider {
  return {
    id: 'fixture-local',
    fixtureOnly: true,
    networkUsed: false,
    async invoke(input) {
      return { suggestions: [`Fixture-only ${input.kind}: owner review required.`], confidence: 0.72, usage, model: 'fixture-script-v1' };
    },
  };
}

export function createOutsideAiAdvisoryBoundary(options: {
  config: unknown;
  provider: AdvisoryProvider;
  allowEnabledFixtureHarness?: boolean;
  usage?: { date: string; inputTokens: number; outputTokens: number; costMicros: number };
}) {
  const config = parseRuntimeConfig(options.config, options.allowEnabledFixtureHarness === true);
  if (!options.provider.fixtureOnly || options.provider.networkUsed) throw new TypeError('Only zero-network fixture providers are accepted');
  return {
    capabilities: {
      enabled: config.enabled,
      mode: 'fixture-only' as const,
      providerNeutral: true as const,
      networkCalls: false as const,
      credentials: false as const,
      recordWrites: false as const,
      ownerConfirmationRequired: true as const,
      kinds: ['summary', 'intake-suggestion', 'draft-suggestion', 'route-suggestion'] as const,
    },
    async advise(request: AdvisoryRequest) {
      const preview = previewAdvisoryRequest(config, request);
      if (!config.enabled) return fallback(request, [{ code: 'advisory-disabled', severity: 'warning', message: 'Outside-AI advisory is disabled by the hard kill switch.' }]);
      if (INJECTION_PATTERN.test(preview.redactedInput)) return fallback(request, [{ code: 'prompt-injection', severity: 'error', message: 'Instruction-like source content was blocked before provider invocation.' }]);
      if (preview.estimatedInputTokens > config.limits.maxInputTokens) return fallback(request, [{ code: 'input-token-limit', severity: 'error', message: 'Estimated input exceeds the per-request token limit.' }]);
      const dailyTokens = (options.usage?.inputTokens ?? 0) + (options.usage?.outputTokens ?? 0) + preview.estimatedInputTokens;
      if (dailyTokens > config.limits.maxDailyTokens) return fallback(request, [{ code: 'daily-token-limit', severity: 'error', message: 'Daily token quota would be exceeded.' }]);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('provider-timeout')), config.timeoutMs); });
        const output = await Promise.race([options.provider.invoke({ kind: request.kind, redactedInput: preview.redactedInput }), timeout]);
        if (!validOutput(output)) return fallback(request, [{ code: 'malformed-output', severity: 'error', message: 'Provider output did not match the strict advisory contract.' }]);
        const findings: AdvisoryFinding[] = [];
        if (output.usage.outputTokens > config.limits.maxOutputTokens) findings.push({ code: 'output-token-limit', severity: 'error', message: 'Provider output exceeds the per-request token limit.' });
        if (output.usage.costMicros > config.limits.maxCostMicrosPerRequest) findings.push({ code: 'request-cost-limit', severity: 'error', message: 'Provider output exceeds the per-request cost limit.' });
        if (dailyTokens + output.usage.outputTokens > config.limits.maxDailyTokens) findings.push({ code: 'daily-token-limit', severity: 'error', message: 'Provider output exceeds the daily token quota.' });
        if (findings.length > 0) return fallback(request, findings);
        return {
          kind: request.kind,
          requestId: request.requestId,
          status: 'advisory' as const,
          suggestions: output.suggestions,
          confidence: output.confidence,
          ownerConfirmationRequired: true as const,
          provenance: { provider: options.provider.id, model: output.model ?? 'unspecified-fixture', fixtureOnly: true as const, networkUsed: false as const },
          findings,
          audit: baseAudit(request),
        };
      } catch (error) {
        if (error instanceof Error && error.message === 'provider-timeout') return fallback(request, [{ code: 'provider-timeout', severity: 'error', message: 'Fixture provider exceeded the configured timeout.' }]);
        return fallback(request, [{ code: 'malformed-output', severity: 'error', message: 'Fixture provider failed without producing a valid advisory.' }]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
  };
}
