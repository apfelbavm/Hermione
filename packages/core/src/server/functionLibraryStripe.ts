import { StripeManager } from "../lib/stripeManager.ts";

/** Compile-time-only counterpart of nodes/stripe.ts's execute() vault lookup (resolveStripeCredential)
 * — the compiled/deployed script has no access to the Credential Vault database, only the
 * interpreter does, so it reads the same credential's secretKey back from an environment variable
 * instead, the same "HERMIONE_CRED_<NAME>_<FIELD>" naming credentialEnv.ts's applyCredentialEnvVars
 * writes. Never called by the interpreter — genuinely different credential-sourcing behavior, not
 * duplicated logic (see functionLibrarySlack.ts for the same pattern). */
function stripeManagerFromEnv(credentialName: string): { ok: true; manager: StripeManager } | { ok: false; error: string } {
  const prefix = `HERMIONE_CRED_${String(credentialName)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")}`;
  const type = process.env[`${prefix}_CREDENTIAL_TYPE`];
  if (type !== "stripeApiKey") return { ok: false, error: `Credential "${credentialName}" not found in the vault, or is not a Stripe API Key credential` };
  return { ok: true, manager: new StripeManager(process.env[`${prefix}_SECRET_KEY`] || "") };
}

export async function stripeCreateCustomer(credentialName: string, email: string, name: string, description: string) {
  const cred = stripeManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, customerId: "", email: "", error: cred.error };
  return cred.manager.createCustomer(email, name, description);
}

export async function stripeGetCustomer(credentialName: string, customerId: string) {
  const cred = stripeManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, customerId: "", email: "", name: "", error: cred.error };
  return cred.manager.getCustomer(customerId);
}

export async function stripeDeleteCustomer(credentialName: string, customerId: string) {
  const cred = stripeManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, deleted: false, error: cred.error };
  return cred.manager.deleteCustomer(customerId);
}

export async function stripeListCustomers(credentialName: string, email: string, limit: number) {
  const cred = stripeManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, customers: [], error: cred.error };
  return cred.manager.listCustomers(email, limit);
}

export async function stripeCreatePaymentIntent(credentialName: string, amount: number, currency: string, customerId: string, description: string) {
  const cred = stripeManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, paymentIntentId: "", clientSecret: "", status: "", error: cred.error };
  return cred.manager.createPaymentIntent(amount, currency, customerId, description);
}

export async function stripeGetPaymentIntent(credentialName: string, paymentIntentId: string) {
  const cred = stripeManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, paymentIntentId: "", status: "", amount: 0, currency: "", error: cred.error };
  return cred.manager.getPaymentIntent(paymentIntentId);
}

export async function stripeCancelPaymentIntent(credentialName: string, paymentIntentId: string) {
  const cred = stripeManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, status: "", error: cred.error };
  return cred.manager.cancelPaymentIntent(paymentIntentId);
}

export async function stripeCreateRefund(credentialName: string, paymentIntentId: string, amount: number) {
  const cred = stripeManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, refundId: "", status: "", error: cred.error };
  return cred.manager.createRefund(paymentIntentId, amount);
}

export async function stripeListCharges(credentialName: string, customerId: string, limit: number) {
  const cred = stripeManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, charges: [], error: cred.error };
  return cred.manager.listCharges(customerId, limit);
}
