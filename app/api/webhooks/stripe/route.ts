import { env } from 'cloudflare:workers';
import { D1StripeWebhookRepository } from '../../../../server/billing-database';
import { handleStripeWebhook, StripeWebhookError } from '../../../../server/stripe-webhook';
import type { Env } from '../../../../server/types';
import { unconfiguredStripeWebhookVerifier } from '../../../../server/unconfigured-integrations';

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const environment = env as unknown as Env;
    const result = await handleStripeWebhook({
      rawBody: await request.text(),
      signature: request.headers.get('stripe-signature'),
    }, {
      verifier: unconfiguredStripeWebhookVerifier,
      repository: new D1StripeWebhookRepository(environment.DB),
    });
    const status = result.outcome === 'UNCONFIGURED' || result.outcome === 'RETRYABLE' ? 503 : 200;
    return json(result, status);
  } catch (error) {
    if (error instanceof StripeWebhookError) return json({ error: error.message }, error.status);
    return json({ outcome: 'RETRYABLE', error: 'Webhook reconciliation failed.' }, 503);
  }
}
