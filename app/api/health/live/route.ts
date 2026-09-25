import { sanitizeRequestId } from '../../../../server/production-readiness';

export function GET(request: Request): Response {
  const requestId = sanitizeRequestId(request.headers.get('x-request-id')) ?? crypto.randomUUID();
  return Response.json({ status: 'live', requestId }, {
    status: 200,
    headers: { 'cache-control': 'no-store', 'x-request-id': requestId },
  });
}
