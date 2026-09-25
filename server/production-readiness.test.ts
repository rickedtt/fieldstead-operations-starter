import { describe, expect, it } from 'vitest';
import {
  createRateLimitPolicy,
  evaluateProductionReadiness,
  parseDeviceContext,
  sanitizeRequestId,
} from './production-readiness';

describe('production sync readiness contracts', () => {
  it('fails closed when required production prerequisites are absent', () => {
    expect(evaluateProductionReadiness({})).toEqual({
      live: true,
      ready: false,
      checks: {
        database: false,
        jwtVerification: false,
        issuer: false,
        audience: false,
      },
    });
  });

  it('requires an asymmetric verification boundary and rejects legacy shared secrets', () => {
    expect(evaluateProductionReadiness({
      DB: {} as D1Database,
      JWT_SECRET: 'legacy-secret',
      JWT_ISSUER: 'https://identity.fieldstead.invalid/',
      JWT_AUDIENCE: 'fieldstead-sync',
    })).toMatchObject({ ready: false, checks: { database: true, jwtVerification: false } });
    expect(evaluateProductionReadiness({
      DB: {} as D1Database,
      JWT_JWKS_URL: 'https://identity.fieldstead.invalid/.well-known/jwks.json',
      JWT_ISSUER: 'https://identity.fieldstead.invalid/',
      JWT_AUDIENCE: 'fieldstead-sync',
    })).toMatchObject({ ready: false, checks: { jwtVerification: false } });
  });

  it('validates request IDs and device context without accepting arbitrary values', () => {
    expect(sanitizeRequestId('req_01HZY8ABCDEF0123456789')).toBe('req_01HZY8ABCDEF0123456789');
    expect(sanitizeRequestId('bad request id')).toBeUndefined();
    expect(parseDeviceContext({ deviceId: 'device-01', sessionId: 'session-01', platform: 'windows' }))
      .toEqual({ deviceId: 'device-01', sessionId: 'session-01', platform: 'windows' });
    expect(() => parseDeviceContext({ deviceId: '../device', sessionId: 'session-01', platform: 'windows' }))
      .toThrow('Invalid sync device context.');
  });

  it('defines a pure bounded rate-limit policy without process-local enforcement claims', () => {
    expect(createRateLimitPolicy()).toEqual({
      key: 'tenant-user-device',
      limit: 60,
      windowSeconds: 60,
      burst: 10,
      enforcement: 'external-required',
    });
  });
});
