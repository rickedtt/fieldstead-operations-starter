import { describe, expect, it, vi } from 'vitest';
import { openSafeExternalLink, safeExternalUrl } from './external-link.mjs';

describe('safe external email links', () => {
  it.each([
    'https://fieldstead.example/jobs?id=42',
    'http://localhost:3000/help',
  ])('allows %s', (url) => expect(safeExternalUrl(url)).toBe(url));

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'ftp://example.test/file',
    'https://safe.example\nfile:///etc/passwd',
    'not a url',
  ])('rejects %s', (url) => expect(() => safeExternalUrl(url)).toThrow('Only HTTP and HTTPS links can be opened.'));

  it('passes only a validated URL to Electron shell.openExternal', async () => {
    const openExternal = vi.fn().mockResolvedValue(undefined);
    await expect(openSafeExternalLink(openExternal, 'https://fieldstead.example/help')).resolves.toEqual({
      ok: true,
      url: 'https://fieldstead.example/help',
    });
    expect(openExternal).toHaveBeenCalledWith('https://fieldstead.example/help');
  });
});
