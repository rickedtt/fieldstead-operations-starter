import { env } from 'cloudflare:workers';
import { AuthError, authenticateBearer } from '../../../../../server/auth';
import { EstimateDeliveryError, previewEstimateDelivery } from '../../../../../server/estimate-delivery';
import type { Env } from '../../../../../server/types';

export async function POST(request: Request): Promise<Response> {
  try {
    if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') return Response.json({ error: 'Content-Type must be application/json.' }, { status: 415 });
    const environment = env as unknown as Env;
    const identity = await authenticateBearer(request.headers.get('authorization'), environment);
    return Response.json(await previewEstimateDelivery(environment.DB, identity, await request.json()), { headers: { 'cache-control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof AuthError || error instanceof EstimateDeliveryError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: 'Preview unavailable.' }, { status: 503 });
  }
}