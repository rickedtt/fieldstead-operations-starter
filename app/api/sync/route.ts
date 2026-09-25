import { env } from 'cloudflare:workers';
import { AuthError, authenticateBearer } from '../../../server/auth';
import { SyncRequestError, processSyncBatch } from '../../../server/sync-service';
import type { Env } from '../../../server/types';
import {
  evaluateProductionReadiness,
  parseDeviceContext,
  sanitizeRequestId,
} from '../../../server/production-readiness';

function json(body: unknown, status: number, requestId: string): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store', 'x-request-id': requestId } });
}

export async function POST(request: Request): Promise<Response> {
  const requestId = sanitizeRequestId(request.headers.get('x-request-id')) ?? crypto.randomUUID();
  try {
    try {
      parseDeviceContext({
        deviceId: request.headers.get('x-fieldstead-device-id'),
        sessionId: request.headers.get('x-fieldstead-session-id'),
        platform: request.headers.get('x-fieldstead-platform'),
      });
    } catch {
      return json({ error: { code: 'invalid_device_context', message: 'Invalid sync device context.' }, requestId }, 400, requestId);
    }
    if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') return json({ error: { code: 'unsupported_media_type', message: 'Content-Type must be application/json.' }, requestId }, 415, requestId);
    const declaredLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > 262_144) return json({ error: { code: 'request_too_large', message: 'Request body is too large.' }, requestId }, 413, requestId);
    const environment = env as unknown as Env;
    if (!evaluateProductionReadiness(environment).ready) {
      return json({ error: { code: 'sync_not_ready', message: 'Sync service is not ready.' }, requestId }, 503, requestId);
    }
    const identity = await authenticateBearer(request.headers.get('authorization'), environment);
    let body: unknown;
    try {
      const text = await request.text();
      if (new TextEncoder().encode(text).byteLength > 262_144) return json({ error: { code: 'request_too_large', message: 'Request body is too large.' }, requestId }, 413, requestId);
      body = JSON.parse(text);
    } catch {
      return json({ error: { code: 'invalid_json', message: 'Request body must be valid JSON.' }, requestId }, 400, requestId);
    }
    const result = await processSyncBatch(environment.DB, identity, body);
    const codes = new Set(result.rejectedOperations.map(({ code }) => code));
    const status = result.rejectedOperations.some(({ retryable }) => retryable)
      ? 503
      : codes.has('conflict') || codes.has('idempotency_key_reused')
        ? 409
        : codes.has('forbidden') || codes.has('unauthorized')
          ? 403
          : result.rejectedOperations.length && !result.acceptedOperationIds.length ? 400 : 200;
    return json(result, status, requestId);
  } catch (error) {
    if (error instanceof AuthError || error instanceof SyncRequestError) {
      return json({ error: { code: error instanceof AuthError ? 'authentication_failed' : 'invalid_sync_request', message: error.message }, requestId }, error.status, requestId);
    }
    return json({ error: { code: 'sync_unavailable', message: 'Sync service unavailable.' }, requestId }, 503, requestId);
  }
}
