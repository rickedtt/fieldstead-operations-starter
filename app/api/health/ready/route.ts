import { env } from 'cloudflare:workers';
import { evaluateProductionReadiness, sanitizeRequestId } from '../../../../server/production-readiness';

export function GET(request: Request): Response {
  const requestId = sanitizeRequestId(request.headers.get('x-request-id')) ?? crypto.randomUUID();
  const readiness = evaluateProductionReadiness(env);
  const body = readiness.ready
    ? { status: 'ready', requestId, checks: readiness.checks }
    : {
        status: 'not_ready',
        requestId,
        error: { code: 'production_prerequisites_missing', message: 'Sync service is not ready.' },
        checks: readiness.checks,
      };
  return Response.json(body, {
    status: readiness.ready ? 200 : 503,
    headers: { 'cache-control': 'no-store', 'x-request-id': requestId },
  });
}
