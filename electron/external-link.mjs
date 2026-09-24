const SAFE_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:']);

export function safeExternalUrl(value) {
  try {
    if (typeof value !== 'string' || /[\r\n\0]/.test(value)) throw new Error();
    const url = new URL(value);
    if (!SAFE_EXTERNAL_PROTOCOLS.has(url.protocol)) throw new Error();
    return url.href;
  } catch {
    throw new Error('Only HTTP and HTTPS links can be opened.');
  }
}

export async function openSafeExternalLink(openExternal, value) {
  const url = safeExternalUrl(value);
  await openExternal(url);
  return { ok: true, url };
}
