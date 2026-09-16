export const APP_ID = 'com.fieldstead.operations.starter';
export const PRODUCT_NAME = 'Fieldstead Systems Operations Starter';
export const LOOPBACK_HOST = '127.0.0.1';
export const PREFERRED_PORT = 43127;

export function localServerUrl(port) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new TypeError('Desktop server port must be an integer from 1 to 65535.');
  }

  return `http://${LOOPBACK_HOST}:${port}`;
}

export function isAllowedDesktopUrl(rawUrl, serverUrl) {
  try {
    const candidate = new URL(rawUrl);
    const allowedServer = new URL(serverUrl);

    if (candidate.protocol === 'data:') return true;
    if (candidate.protocol === 'blob:') return candidate.origin === allowedServer.origin;

    return isAllowedNavigationUrl(rawUrl, serverUrl);
  } catch {
    return false;
  }
}

export function isAllowedNavigationUrl(rawUrl, serverUrl) {
  try {
    const candidate = new URL(rawUrl);
    const allowedServer = new URL(serverUrl);

    return (
      candidate.protocol === 'http:' &&
      candidate.hostname === LOOPBACK_HOST &&
      candidate.origin === allowedServer.origin
    );
  } catch {
    return false;
  }
}
