import { describe, expect, it, vi } from 'vitest';

vi.mock('cloudflare:workers', () => ({ env: {} }));
vi.mock('../../../server/auth', () => ({
  AuthError: class AuthError extends Error { status = 401 as const; code = 'authentication_failed'; },
  authenticateBearer: vi.fn(),
}));

import { POST } from './route';

describe('sync route production boundary', () => {
  it('fails closed before authentication when production prerequisites are absent', async () => {
    const response = await POST(new Request('https://fieldstead.test/api/sync', {
      method: 'POST',
      headers: {
        authorization: 'Bearer not-a-real-token',
        'content-type': 'application/json',
        'x-request-id': 'req_01HZY8ABCDEF0123456789',
        'x-fieldstead-device-id': 'device-01',
        'x-fieldstead-session-id': 'session-01',
        'x-fieldstead-platform': 'linux',
      },
      body: '{}',
    }));
    expect(response.status).toBe(503);
    expect(response.headers.get('x-request-id')).toBe('req_01HZY8ABCDEF0123456789');
    expect(await response.json()).toEqual({
      error: { code: 'sync_not_ready', message: 'Sync service is not ready.' },
      requestId: 'req_01HZY8ABCDEF0123456789',
    });
  });

  it('returns a structured redacted error for invalid device context', async () => {
    const response = await POST(new Request('https://fieldstead.test/api/sync', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-fieldstead-device-id': '../bad',
        'x-fieldstead-session-id': 'session-01',
        'x-fieldstead-platform': 'linux',
      },
      body: '{}',
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'invalid_device_context', message: 'Invalid sync device context.' },
    });
  });
});
