/** Thin wrapper around the official "stripe" Node SDK. That package talks to Stripe over Node's
 * own `https`/`http`/`crypto` modules (see node_modules/stripe/cjs/net/NodeHttpClient.js and
 * platform/NodePlatformFunctions.js) and Stripe's own docs call it out as server-side only, since a
 * secret key shipped to a browser is a live credential leak — so, like TwilioManager, this class is
 * only ever constructed from Node.js (interpreter execute() or a compiled/deployed script), never
 * from the graph editor's own bundle. Every method turns either a successful SDK response or a
 * thrown Stripe error into the same plain {success, error} shape every other provider manager
 * returns (see lib/slackManager.ts). */
import Stripe from "stripe";
import { getDatabaseManager } from "../server/DatabaseManager.ts";
import { resolveAllCredentials } from "../server/vaultCredentials.ts";
import type { StripeApiKeyCredentialData } from "@hermione/shared/types";

export interface StripeAuth {
  secretKey: string;
}

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

const managerCache = new Map<string, StripeManager>();

export class StripeManager {
  private readonly client: Stripe;

  static getInstance(auth: StripeAuth): StripeManager {
    const key = auth.secretKey;
    let manager = managerCache.get(key);
    if (!manager) {
      manager = new StripeManager(auth.secretKey);
      managerCache.set(key, manager);
    }
    return manager;
  }

  private constructor(secretKey: string) {
    this.client = new Stripe(secretKey);
  }

  static errorMessage(err: unknown): string {
    return err instanceof Stripe.errors.StripeError ? err.message : err instanceof Error ? err.message : String(err);
  }

  private static async findCredential(credentialName: string): Promise<{ ok: true; auth: StripeAuth } | { ok: false; error: string }> {
    const credRecord = (await resolveAllCredentials(getDatabaseManager())).get(credentialName);
    if (!credRecord) return { ok: false, error: `Credential "${credentialName}" not found in the vault` };
    if (credRecord.type !== "stripeApiKey") return { ok: false, error: `Credential "${credentialName}" is not a Stripe API Key credential` };
    const data = credRecord.data as StripeApiKeyCredentialData;
    return { ok: true, auth: { secretKey: data.secretKey } };
  }

  static async createCustomer(credentialName: string, email: string, name: string, description: string): Promise<StripeCreateCustomerResult> {
    const cred = await StripeManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, customerId: "", email: "", error: cred.error };
    return StripeManager.getInstance(cred.auth).createCustomer(email, name, description);
  }

  static async getCustomer(credentialName: string, customerId: string): Promise<StripeGetCustomerResult> {
    const cred = await StripeManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, customerId: "", email: "", name: "", error: cred.error };
    return StripeManager.getInstance(cred.auth).getCustomer(customerId);
  }

  static async deleteCustomer(credentialName: string, customerId: string): Promise<StripeDeleteCustomerResult> {
    const cred = await StripeManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, deleted: false, error: cred.error };
    return StripeManager.getInstance(cred.auth).deleteCustomer(customerId);
  }

  static async listCustomers(credentialName: string, email: string, limit: number): Promise<StripeListCustomersResult> {
    const cred = await StripeManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, customers: [], error: cred.error };
    return StripeManager.getInstance(cred.auth).listCustomers(email, limit);
  }

  static async createPaymentIntent(credentialName: string, amount: number, currency: string, customerId: string, description: string): Promise<StripeCreatePaymentIntentResult> {
    const cred = await StripeManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, paymentIntentId: "", clientSecret: "", status: "", error: cred.error };
    return StripeManager.getInstance(cred.auth).createPaymentIntent(amount, currency, customerId, description);
  }

  static async getPaymentIntent(credentialName: string, paymentIntentId: string): Promise<StripeGetPaymentIntentResult> {
    const cred = await StripeManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, paymentIntentId: "", status: "", amount: 0, currency: "", error: cred.error };
    return StripeManager.getInstance(cred.auth).getPaymentIntent(paymentIntentId);
  }

  static async cancelPaymentIntent(credentialName: string, paymentIntentId: string): Promise<StripeCancelPaymentIntentResult> {
    const cred = await StripeManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, status: "", error: cred.error };
    return StripeManager.getInstance(cred.auth).cancelPaymentIntent(paymentIntentId);
  }

  static async createRefund(credentialName: string, paymentIntentId: string, amount: number): Promise<StripeCreateRefundResult> {
    const cred = await StripeManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, refundId: "", status: "", error: cred.error };
    return StripeManager.getInstance(cred.auth).createRefund(paymentIntentId, amount);
  }

  static async listCharges(credentialName: string, customerId: string, limit: number): Promise<StripeListChargesResult> {
    const cred = await StripeManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, charges: [], error: cred.error };
    return StripeManager.getInstance(cred.auth).listCharges(customerId, limit);
  }

  private async createCustomer(email: string, name: string, description: string): Promise<StripeCreateCustomerResult> {
    try {
      const customer = await this.client.customers.create({
        ...(email ? { email } : {}),
        ...(name ? { name } : {}),
        ...(description ? { description } : {}),
      });
      return { success: true, customerId: customer.id, email: customer.email ?? "", error: "" };
    } catch (err) {
      return { success: false, customerId: "", email: "", error: StripeManager.errorMessage(err) };
    }
  }

  private async getCustomer(customerId: string): Promise<StripeGetCustomerResult> {
    try {
      const customer = await this.client.customers.retrieve(customerId);
      if (customer.deleted) return { success: false, customerId: "", email: "", name: "", error: `Customer "${customerId}" has been deleted` };
      return { success: true, customerId: customer.id, email: customer.email ?? "", name: customer.name ?? "", error: "" };
    } catch (err) {
      return { success: false, customerId: "", email: "", name: "", error: StripeManager.errorMessage(err) };
    }
  }

  private async deleteCustomer(customerId: string): Promise<StripeDeleteCustomerResult> {
    try {
      const result = await this.client.customers.del(customerId);
      return { success: true, deleted: result.deleted === true, error: "" };
    } catch (err) {
      return { success: false, deleted: false, error: StripeManager.errorMessage(err) };
    }
  }

  private async listCustomers(email: string, limit: number): Promise<StripeListCustomersResult> {
    try {
      const result = await this.client.customers.list({ ...(email ? { email } : {}), limit: limit || 20 });
      return { success: true, customers: result.data.map((c) => ({ id: c.id, email: c.email ?? "", name: c.name ?? "" })), error: "" };
    } catch (err) {
      return { success: false, customers: [], error: StripeManager.errorMessage(err) };
    }
  }

  private async createPaymentIntent(amount: number, currency: string, customerId: string, description: string): Promise<StripeCreatePaymentIntentResult> {
    try {
      const paymentIntent = await this.client.paymentIntents.create({
        amount,
        currency: currency || "usd",
        ...(customerId ? { customer: customerId } : {}),
        ...(description ? { description } : {}),
      });
      return { success: true, paymentIntentId: paymentIntent.id, clientSecret: paymentIntent.client_secret ?? "", status: paymentIntent.status, error: "" };
    } catch (err) {
      return { success: false, paymentIntentId: "", clientSecret: "", status: "", error: StripeManager.errorMessage(err) };
    }
  }

  private async getPaymentIntent(paymentIntentId: string): Promise<StripeGetPaymentIntentResult> {
    try {
      const paymentIntent = await this.client.paymentIntents.retrieve(paymentIntentId);
      return { success: true, paymentIntentId: paymentIntent.id, status: paymentIntent.status, amount: paymentIntent.amount, currency: paymentIntent.currency, error: "" };
    } catch (err) {
      return { success: false, paymentIntentId: "", status: "", amount: 0, currency: "", error: StripeManager.errorMessage(err) };
    }
  }

  private async cancelPaymentIntent(paymentIntentId: string): Promise<StripeCancelPaymentIntentResult> {
    try {
      const paymentIntent = await this.client.paymentIntents.cancel(paymentIntentId);
      return { success: true, status: paymentIntent.status, error: "" };
    } catch (err) {
      return { success: false, status: "", error: StripeManager.errorMessage(err) };
    }
  }

  private async createRefund(paymentIntentId: string, amount: number): Promise<StripeCreateRefundResult> {
    try {
      const refund = await this.client.refunds.create({
        payment_intent: paymentIntentId,
        ...(amount > 0 ? { amount } : {}),
      });
      return { success: true, refundId: refund.id, status: refund.status ?? "", error: "" };
    } catch (err) {
      return { success: false, refundId: "", status: "", error: StripeManager.errorMessage(err) };
    }
  }

  private async listCharges(customerId: string, limit: number): Promise<StripeListChargesResult> {
    try {
      const result = await this.client.charges.list({ ...(customerId ? { customer: customerId } : {}), limit: limit || 20 });
      return {
        success: true,
        charges: result.data.map((c) => ({ id: c.id, amount: c.amount, currency: c.currency, status: c.status, description: c.description ?? "" })),
        error: "",
      };
    } catch (err) {
      return { success: false, charges: [], error: StripeManager.errorMessage(err) };
    }
  }
}
