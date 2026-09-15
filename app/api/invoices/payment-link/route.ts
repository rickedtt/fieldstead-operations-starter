import { env } from 'cloudflare:workers';
import { AuthError, authenticateBearer } from '../../../../server/auth';
import { D1InvoiceRepository, D1PaymentLinkRepository } from '../../../../server/billing-database';
import {
  BillingAccessError,
  BillingInputError,
  requestInvoicePaymentLink,
} from '../../../../server/billing-service';
import type { Env } from '../../../../server/types';
import { unconfiguredPaymentProvider } from '../../../../server/unconfigured-integrations';

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
    const result = await requestInvoicePaymentLink(identity, body, {
      invoices: new D1InvoiceRepository(environment.DB),
      paymentLinks: new D1PaymentLinkRepository(environment.DB),
      provider: unconfiguredPaymentProvider,
    });
    return json(result, result.outcome === 'UNCONFIGURED' || result.outcome === 'RETRYABLE' ? 503 : 201);
  } catch (error) {
    if (error instanceof AuthError || error instanceof BillingAccessError || error instanceof BillingInputError) {
      return json({ error: error.message }, error.status);
    }
    return json({ outcome: 'RETRYABLE', error: 'Payment-link request could not be persisted.' }, 503);
  }
}
