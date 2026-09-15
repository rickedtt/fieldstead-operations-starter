import {
  parseStripeCheckoutCompleted,
  type StripeCheckoutCompleted,
} from '../packages/fieldstead-sync/src/billing';

export interface StripeWebhookVerifier {
  status?: 'CONFIGURED' | 'UNCONFIGURED';
  verifyAndParse(rawBody: string, signature: string): Promise<unknown>;
}

export interface StripeWebhookRepository {
  reconcileCheckout(event: StripeCheckoutCompleted): Promise<'APPLIED' | 'DUPLICATE' | 'NOT_FOUND' | 'RETRYABLE'>;
}

export class StripeWebhookError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 503) {
    super(message);
    this.name = 'StripeWebhookError';
  }
}

export async function handleStripeWebhook(
  input: { rawBody: string; signature: string | null },
  dependencies: { verifier: StripeWebhookVerifier; repository: StripeWebhookRepository },
): Promise<{ outcome: 'UNCONFIGURED' | 'APPLIED' | 'DUPLICATE' | 'RETRYABLE'; eventId?: string }> {
  if (dependencies.verifier.status === 'UNCONFIGURED') return { outcome: 'UNCONFIGURED' };
  if (!input.signature) throw new StripeWebhookError('Stripe-Signature header is required.', 400);
  let untrusted: unknown;
  try {
    untrusted = await dependencies.verifier.verifyAndParse(input.rawBody, input.signature);
  } catch {
    throw new StripeWebhookError('Webhook signature verification failed.', 400);
  }
  let event: StripeCheckoutCompleted;
  try {
    event = parseStripeCheckoutCompleted(untrusted);
  } catch (error) {
    throw new StripeWebhookError(error instanceof Error ? error.message : 'Malformed webhook event.', 400);
  }
  const outcome = await dependencies.repository.reconcileCheckout(event);
  if (outcome === 'NOT_FOUND') throw new StripeWebhookError('Invoice not found.', 404);
  return { outcome, eventId: event.eventId };
}
