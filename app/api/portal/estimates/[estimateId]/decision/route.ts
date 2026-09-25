import { env } from 'cloudflare:workers';
import { authenticatePortalSession, PortalAccessError } from '../../../../../../server/portal-auth';
import { decidePortalEstimate, PortalDecisionError } from '../../../../../../server/portal-service';
import type { Env } from '../../../../../../server/types';

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'private, no-store' } });
}

export async function POST(request: Request, context: { params: Promise<{ estimateId: string }> }): Promise<Response> {
  try {
    if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') return json({ error: 'Content-Type must be application/json.' }, 415);
    const environment = env as unknown as Env;
    const identity = await authenticatePortalSession(request.headers.get('authorization'), environment.DB);
    const { estimateId } = await context.params;
    const result = await decidePortalEstimate(environment.DB, identity, estimateId, await request.json());
    return json(result, 200);
  } catch (error) {
    if (error instanceof PortalAccessError || error instanceof PortalDecisionError) return json({ error: error.message }, error.status);
    return json({ error: 'Invalid request.' }, 400);
  }
}

function methodNotAllowed(): Response {
  return new Response(null, { status: 405, headers: { allow: 'POST', 'cache-control': 'no-store' } });
}

export const GET = methodNotAllowed;
export const HEAD = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;