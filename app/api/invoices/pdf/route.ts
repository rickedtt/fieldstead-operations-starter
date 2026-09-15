import { env } from 'cloudflare:workers';
import { AuthError, authenticateBearer } from '../../../../server/auth';
import { D1InvoiceRepository } from '../../../../server/billing-database';
import {
  BillingAccessError,
  BillingDependencyError,
  BillingInputError,
  generateInvoicePdf,
} from '../../../../server/billing-service';
import type { Env } from '../../../../server/types';
import { unconfiguredInvoiceRenderer } from '../../../../server/unconfigured-integrations';

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
    const bytes = await generateInvoicePdf(identity, body, {
      invoices: new D1InvoiceRepository(environment.DB),
      renderer: unconfiguredInvoiceRenderer,
    });
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return new Response(arrayBuffer, {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'cache-control': 'private, no-store',
      },
    });
  } catch (error) {
    if (error instanceof AuthError || error instanceof BillingAccessError || error instanceof BillingInputError) {
      return json({ error: error.message }, error.status);
    }
    if (error instanceof BillingDependencyError) {
      return json({ outcome: error.outcome, error: error.message }, error.status);
    }
    return json({ outcome: 'RETRYABLE', error: 'Invoice generation failed.' }, 503);
  }
}
