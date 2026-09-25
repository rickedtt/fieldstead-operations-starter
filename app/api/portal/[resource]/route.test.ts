import { describe, expect, it, vi } from 'vitest';
import { GET, HEAD, POST } from './route';

vi.mock('cloudflare:workers', () => ({ env: {} }));

function request(method: string, path = '/api/portal/jobs', token?: string) {
  return new Request(`https://fieldstead.test${path}`, { method, headers: token ? { authorization: `Bearer ${token}` } : {} });
}

describe('portal route method and error boundary', () => {
  it('exposes GET and HEAD only and rejects mutations without touching a provider', async () => {
    const response = await POST(request('POST'));
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, HEAD');
  });

  it('returns the same generic unauthorized response for missing credentials', async () => {
    const getResponse = await GET(request('GET'));
    const headResponse = await HEAD(request('HEAD'));
    expect(getResponse.status).toBe(401);
    await expect(getResponse.json()).resolves.toEqual({ error: 'Unauthorized.' });
    expect(headResponse.status).toBe(401);
    expect(await headResponse.text()).toBe('');
  });
});
