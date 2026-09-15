import { describe, expect, it, vi } from 'vitest';
import {
  StripeWebhookError,
  handleStripeWebhook,
  type StripeWebhookRepository,
  type StripeWebhookVerifier,
} from './stripe-webhook';

const rawBody = '{"stripe":"opaque signed content"}';
const signature = 'test-signature';
const checkoutEvent = {
  id: 'evt_checkout_1',
  type: 'checkout.session.completed',
  created: 1788624000,
  data: {
    object: {
      id: 'cs_test_1',
      payment_status: 'paid',
      metadata: { organization_id: 'org-a', invoice_id: 'invoice-1' },
    },
  },
};

describe('Stripe webhook boundary', () => {
  it('rejects signature verification failure before reconciliation', async () => {
    const reconcileCheckout = vi.fn();
    const verifier: StripeWebhookVerifier = {
      verifyAndParse: vi.fn(async () => { throw new Error('bad signature'); }),
    };

    await expect(handleStripeWebhook({ rawBody, signature }, {
      verifier, repository: { reconcileCheckout },
    })).rejects.toMatchObject<Partial<StripeWebhookError>>({ status: 400 });
    expect(reconcileCheckout).not.toHaveBeenCalled();
  });

  it('rejects a verified but malformed checkout event', async () => {
    const reconcileCheckout = vi.fn();
    const verifier: StripeWebhookVerifier = { verifyAndParse: vi.fn(async () => ({
      ...checkoutEvent,
      data: { object: { id: 'cs_test_1', metadata: {} } },
    })) };

    await expect(handleStripeWebhook({ rawBody, signature }, {
      verifier, repository: { reconcileCheckout },
    })).rejects.toMatchObject<Partial<StripeWebhookError>>({ status: 400 });
    expect(reconcileCheckout).not.toHaveBeenCalled();
  });

  it('reconciles a valid paid checkout idempotently and appends one activity event', async () => {
    const state = { paid: false, eventIds: new Set<string>(), activities: [] as string[] };
    const repository: StripeWebhookRepository = {
      reconcileCheckout: vi.fn(async (event) => {
        if (state.eventIds.has(event.eventId)) return 'DUPLICATE' as const;
        state.eventIds.add(event.eventId);
        state.paid = true;
        state.activities.push(`invoice.paid:${event.invoiceId}:${event.eventId}`);
        return 'APPLIED' as const;
      }),
    };
    const verifier: StripeWebhookVerifier = { verifyAndParse: vi.fn(async () => checkoutEvent) };

    const first = await handleStripeWebhook({ rawBody, signature }, { verifier, repository });
    const replay = await handleStripeWebhook({ rawBody, signature }, { verifier, repository });

    expect(first).toEqual({ outcome: 'APPLIED', eventId: 'evt_checkout_1' });
    expect(replay).toEqual({ outcome: 'DUPLICATE', eventId: 'evt_checkout_1' });
    expect(state.paid).toBe(true);
    expect(state.activities).toEqual(['invoice.paid:invoice-1:evt_checkout_1']);
  });
});
