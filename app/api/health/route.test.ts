import { describe, expect, it, vi } from 'vitest';
import { GET as liveness } from './live/route';
import { GET as readiness } from './ready/route';

vi.mock('cloudflare:workers', () => ({ env: {} }));

describe('sync health routes', () => {
  it('reports liveness without claiming production readiness', async () => {
    const response = await liveness(new Request('https://fieldstead.test/api/health/live', {
      headers: { 'x-request-id': 'req_01HZY8ABCDEF0123456789' },
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get('x-request-id')).toBe('req_01HZY8ABCDEF0123456789');
    expect(await response.json()).toEqual({ status: 'live', requestId: 'req_01HZY8ABCDEF0123456789' });
  });

  it('fails closed with redacted structured readiness details', async () => {
    const response = await readiness(new Request('https://fieldstead.test/api/health/ready'));
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({
      status: 'not_ready',
      error: { code: 'production_prerequisites_missing', message: 'Sync service is not ready.' },
      checks: { database: false, jwtVerification: false, issuer: false, audience: false },
    });
  });
});
