import { env } from 'cloudflare:workers';
import { authenticatePortalSession, PortalAccessError } from '../../../../server/portal-auth';
import { listPortalResource, type PortalResource } from '../../../../server/portal-service';
import type { Env } from '../../../../server/types';

const RESOURCES = new Set<PortalResource>(['estimates', 'jobs', 'invoices']);

function response(body: unknown, status: number, head = false): Response {
  const headers = { 'cache-control': 'private, no-store', 'content-type': 'application/json' };
  return head ? new Response(null, { status, headers }) : Response.json(body, { status, headers });
}

async function read(request: Request, context: { params: Promise<{ resource: string }> }, head = false): Promise<Response> {
  try {
    const { resource } = await context.params;
    if (!RESOURCES.has(resource as PortalResource)) throw new PortalAccessError(404);
    const environment = env as unknown as Env;
    const identity = await authenticatePortalSession(request.headers.get('authorization'), environment.DB);
    const items = await listPortalResource(environment.DB, identity, resource as PortalResource);
    return response({ items }, 200, head);
  } catch (error) {
    if (error instanceof PortalAccessError) return response({ error: error.message }, error.status, head);
    return response({ error: 'Not found.' }, 404, head);
  }
}

export function GET(request: Request, context = { params: Promise.resolve({ resource: new URL(request.url).pathname.split('/').filter(Boolean).at(-1) || '' }) }): Promise<Response> {
  return read(request, context);
}

export function HEAD(request: Request, context = { params: Promise.resolve({ resource: new URL(request.url).pathname.split('/').filter(Boolean).at(-1) || '' }) }): Promise<Response> {
  return read(request, context, true);
}

export function POST(): Response {
  return new Response(null, { status: 405, headers: { allow: 'GET, HEAD', 'cache-control': 'no-store' } });
}

export const PUT = POST;
export const PATCH = POST;
export const DELETE = POST;
