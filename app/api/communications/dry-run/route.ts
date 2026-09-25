import { env } from 'cloudflare:workers';
import { AuthError, authenticateBearer } from '../../../../server/auth';
import { CommunicationAutomationError, dryRunCommunication } from '../../../../server/communication-automation';
import type { Env } from '../../../../server/types';

export async function POST(request: Request): Promise<Response> {
  try {
    if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') return Response.json({ error: 'Content-Type must be application/json.' }, { status: 415 });
    const environment = env as unknown as Env & { COMMUNICATION_AUTOMATION_GLOBAL_ENABLED?: string };
    const identity = await authenticateBearer(request.headers.get('authorization'), environment);
    const result = await dryRunCommunication(environment.DB, identity, await request.json(), { globalEnabled: environment.COMMUNICATION_AUTOMATION_GLOBAL_ENABLED === 'true' });
    return Response.json(result, { headers: { 'cache-control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof AuthError || error instanceof CommunicationAutomationError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: 'Communication dry-run unavailable.' }, { status: 503 });
  }
}
