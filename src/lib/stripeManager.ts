/** Thin wrapper around the official "stripe" Node SDK. That package talks to Stripe over Node's
 * own `https`/`http`/`crypto` modules (see node_modules/stripe/cjs/net/NodeHttpClient.js and
 * platform/NodePlatformFunctions.js) and Stripe's own docs call it out as server-side only, since a
 * secret key shipped to a browser is a live credential leak — so, like TwilioManager, this class is
 * only ever constructed from Node.js (interpreter execute() or a compiled/deployed script), never
 * from the graph editor's own bundle. Every method turns either a successful SDK response or a
 * thrown Stripe error into the same plain {success, error} shape every other provider manager
 * returns (see lib/slackManager.ts). */
import Stripe from "stripe";

export interface StripeOpResult {
  success: boolean;
  error: string;
  [key: string]: unknown;
}

export interface StripeCreateCustomerResult extends StripeOpResult {
  customerId: string;
  email: string;
}

export interface StripeGetCustomerResult extends StripeOpResult {
  customerId: string;
  email: string;
  name: string;
}

export interface StripeDeleteCustomerResult extends StripeOpResult {
  deleted: boolean;
}

export interface StripeCustomer {
  id: string;
  email: string;
  name: string;
}

export interface StripeListCustomersResult extends StripeOpResult {
  customers: StripeCustomer[];
}

export interface StripeCreatePaymentIntentResult extends StripeOpResult {
  paymentIntentId: string;
  clientSecret: string;
  status: string;
}

export interface StripeGetPaymentIntentResult extends StripeOpResult {
  paymentIntentId: string;
  status: string;
  amount: number;
  currency: string;
}

export interface StripeCancelPaymentIntentResult extends StripeOpResult {
  status: string;
}

export interface StripeCreateRefundResult extends StripeOpResult {
  refundId: string;
  status: string;
}

export interface StripeCharge {
  id: string;
  amount: number;
  currency: string;
  status: string;
  description: string;
  [key: string]: unknown;
}

export interface StripeListChargesResult extends StripeOpResult {
  charges: StripeCharge[];
}

function errorMessage(err: unknown): string {
  return err instanceof Stripe.errors.StripeError ? err.message : err instanceof Error ? err.message : String(err);
}

export class StripeManager {
  private readonly client: Stripe;

  constructor(secretKey: string) {
    this.client = new Stripe(secretKey);
  }

  async createCustomer(email: string, name: string, description: string): Promise<StripeCreateCustomerResult> {
    try {
      const customer = await this.client.customers.create({
        ...(email ? { email } : {}),
        ...(name ? { name } : {}),
        ...(description ? { description } : {}),
      });
      return { success: true, customerId: customer.id, email: customer.email ?? "", error: "" };
    } catch (err) {
      return { success: false, customerId: "", email: "", error: errorMessage(err) };
    }
  }

  async getCustomer(customerId: string): Promise<StripeGetCustomerResult> {
    try {
      const customer = await this.client.customers.retrieve(customerId);
      if (customer.deleted) return { success: false, customerId: "", email: "", name: "", error: `Customer "${customerId}" has been deleted` };
      return { success: true, customerId: customer.id, email: customer.email ?? "", name: customer.name ?? "", error: "" };
    } catch (err) {
      return { success: false, customerId: "", email: "", name: "", error: errorMessage(err) };
    }
  }

  async deleteCustomer(customerId: string): Promise<StripeDeleteCustomerResult> {
    try {
      const result = await this.client.customers.del(customerId);
      return { success: true, deleted: result.deleted === true, error: "" };
    } catch (err) {
      return { success: false, deleted: false, error: errorMessage(err) };
    }
  }

  async listCustomers(email: string, limit: number): Promise<StripeListCustomersResult> {
    try {
      const result = await this.client.customers.list({ ...(email ? { email } : {}), limit: limit || 20 });
      return { success: true, customers: result.data.map((c) => ({ id: c.id, email: c.email ?? "", name: c.name ?? "" })), error: "" };
    } catch (err) {
      return { success: false, customers: [], error: errorMessage(err) };
    }
  }

  async createPaymentIntent(amount: number, currency: string, customerId: string, description: string): Promise<StripeCreatePaymentIntentResult> {
    try {
      const paymentIntent = await this.client.paymentIntents.create({
        amount,
        currency: currency || "usd",
        ...(customerId ? { customer: customerId } : {}),
        ...(description ? { description } : {}),
      });
      return { success: true, paymentIntentId: paymentIntent.id, clientSecret: paymentIntent.client_secret ?? "", status: paymentIntent.status, error: "" };
    } catch (err) {
      return { success: false, paymentIntentId: "", clientSecret: "", status: "", error: errorMessage(err) };
    }
  }

  async getPaymentIntent(paymentIntentId: string): Promise<StripeGetPaymentIntentResult> {
    try {
      const paymentIntent = await this.client.paymentIntents.retrieve(paymentIntentId);
      return { success: true, paymentIntentId: paymentIntent.id, status: paymentIntent.status, amount: paymentIntent.amount, currency: paymentIntent.currency, error: "" };
    } catch (err) {
      return { success: false, paymentIntentId: "", status: "", amount: 0, currency: "", error: errorMessage(err) };
    }
  }

  async cancelPaymentIntent(paymentIntentId: string): Promise<StripeCancelPaymentIntentResult> {
    try {
      const paymentIntent = await this.client.paymentIntents.cancel(paymentIntentId);
      return { success: true, status: paymentIntent.status, error: "" };
    } catch (err) {
      return { success: false, status: "", error: errorMessage(err) };
    }
  }

  async createRefund(paymentIntentId: string, amount: number): Promise<StripeCreateRefundResult> {
    try {
      const refund = await this.client.refunds.create({
        payment_intent: paymentIntentId,
        ...(amount > 0 ? { amount } : {}),
      });
      return { success: true, refundId: refund.id, status: refund.status ?? "", error: "" };
    } catch (err) {
      return { success: false, refundId: "", status: "", error: errorMessage(err) };
    }
  }

  async listCharges(customerId: string, limit: number): Promise<StripeListChargesResult> {
    try {
      const result = await this.client.charges.list({ ...(customerId ? { customer: customerId } : {}), limit: limit || 20 });
      return {
        success: true,
        charges: result.data.map((c) => ({ id: c.id, amount: c.amount, currency: c.currency, status: c.status, description: c.description ?? "" })),
        error: "",
      };
    } catch (err) {
      return { success: false, charges: [], error: errorMessage(err) };
    }
  }
}
