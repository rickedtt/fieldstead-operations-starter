import {
  BillingDependencyError,
  type InvoiceRenderer,
  type PaymentProvider,
} from './billing-service';
import type { StripeWebhookVerifier } from './stripe-webhook';

export const unconfiguredInvoiceRenderer: InvoiceRenderer = {
  async render(): Promise<Uint8Array> {
    throw new BillingDependencyError('Invoice PDF rendering is not configured.');
  },
};

export const unconfiguredPaymentProvider: PaymentProvider = {
  status: 'UNCONFIGURED',
  async createPaymentLink(): Promise<never> {
    throw new BillingDependencyError('Payment provider is not configured.');
  },
};

export const unconfiguredStripeWebhookVerifier: StripeWebhookVerifier = {
  status: 'UNCONFIGURED',
  async verifyAndParse(): Promise<never> {
    throw new Error('Stripe webhook verification is not configured.');
  },
};
