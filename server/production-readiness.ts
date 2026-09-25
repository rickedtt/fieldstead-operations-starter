export type ProductionReadinessEnv = {
  DB?: D1Database;
  JWT_SECRET?: string;
  JWT_JWKS_URL?: string;
  JWT_ISSUER?: string;
  JWT_AUDIENCE?: string;
  JWT_ASYMMETRIC_VERIFIER?: unknown;
};

export type DeviceContext = {
  deviceId: string;
  sessionId: string;
  platform: 'windows' | 'linux' | 'macos' | 'web';
};

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

export function sanitizeRequestId(value: string | null | undefined): string | undefined {
  return typeof value === 'string' && SAFE_REQUEST_ID.test(value) ? value : undefined;
}

export function parseDeviceContext(value: unknown): DeviceContext {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid sync device context.');
  const { deviceId, sessionId, platform } = value as Record<string, unknown>;
  if (
    typeof deviceId !== 'string' || !SAFE_IDENTIFIER.test(deviceId) ||
    typeof sessionId !== 'string' || !SAFE_IDENTIFIER.test(sessionId) ||
    !['windows', 'linux', 'macos', 'web'].includes(String(platform))
  ) throw new TypeError('Invalid sync device context.');
  return { deviceId, sessionId, platform: platform as DeviceContext['platform'] };
}

export function createRateLimitPolicy() {
  return {
    key: 'tenant-user-device' as const,
    limit: 60,
    windowSeconds: 60,
    burst: 10,
    enforcement: 'external-required' as const,
  };
}

export function evaluateProductionReadiness(environment: ProductionReadinessEnv) {
  const checks = {
    database: Boolean(environment.DB),
    jwtVerification: typeof environment.JWT_ASYMMETRIC_VERIFIER === 'function' && !environment.JWT_SECRET,
    issuer: Boolean(environment.JWT_ISSUER),
    audience: Boolean(environment.JWT_AUDIENCE),
  };
  return { live: true, ready: Object.values(checks).every(Boolean), checks };
}
