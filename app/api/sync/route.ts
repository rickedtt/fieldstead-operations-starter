import { env } from 'cloudflare:workers';
import { AuthError, authenticateBearer } from '../../../server/auth';
import { SyncRequestError, processSyncBatch } from '../../../server/sync-service';
import type { Env } from '../../../server/types';

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const environment = env as unknown as Env;
    const identity = await authenticateBearer(request.headers.get('authorization'), environment);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Request body must be valid JSON.' }, 400);
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
    return json(result, status);
  } catch (error) {
    if (error instanceof AuthError || error instanceof SyncRequestError) {
      return json({ error: error.message }, error.status);
    }
    return json({ error: 'Sync service unavailable.' }, 503);
  }
}
