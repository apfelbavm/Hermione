import { NodeColorCategory } from "../engine/types";
import { registerNode } from "../engine/registry";
import { compileResultVar, FUNCTION_LIBRARY_STRIPE_IMPORT } from "../engine/compileUtils";
import { CHARGE_STRUCT_TYPE, CUSTOMER_STRUCT_TYPE } from "../structs/stripe";
import { i18n } from "@i18n";

const GROUP_NAME = "Request.Stripe";

// Calls Stripe via the official "stripe" Node SDK, which talks to Stripe over Node's own
// http/https/crypto modules and is documented by Stripe as server-side only (a secret key shipped
// to a browser is a live credential leak). Same structural situation as sftp.ts/smtp.ts/twilio.ts:
// every node below has a permanent, honest stub execute() reporting that only the compiled output
// can actually reach Stripe; the REAL implementation lives in
// src/server/functionLibraryStripe.ts (backed by src/lib/stripeManager.ts), reached only via
// compileImports, never statically imported here.
function credentialNamePin() {
  return { id: "credentialName", label: i18n.nodes.stripe.__shared.pin_credential_name, type: "string" as const, direction: "input" as const, defaultValue: "" };
}

const STUB_ERROR = 'This Stripe node only runs in the compiled output (under Node.js) — the in-browser "Run" button cannot use the official Stripe SDK client-side (it is server-only and would expose your secret key). Compile this graph and run the generated script to actually call Stripe.';

registerNode({
  type: "stripe.createCustomer",
  label: i18n.nodes.stripe.createCustomer.label,
  description: i18n.nodes.stripe.createCustomer.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "email", label: i18n.nodes.stripe.createCustomer.pin_email, type: "string", direction: "input", defaultValue: "" },
    { id: "name", label: i18n.nodes.stripe.createCustomer.pin_name, type: "string", direction: "input", defaultValue: "" },
    { id: "description", label: i18n.nodes.stripe.createCustomer.pin_description, type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "customerId", label: i18n.nodes.stripe.createCustomer.pin_customer_id, type: "string", direction: "output" },
    { id: "customerEmail", label: i18n.nodes.stripe.createCustomer.pin_customer_email, type: "string", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async () => ({ nextExec: "exec-out", outputs: { success: false, customerId: "", customerEmail: "", error: STUB_ERROR } }),
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryStripe.stripeCreateCustomer(${inputs.credentialName}, ${inputs.email}, ${inputs.name}, ${inputs.description});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, customerId: `${v}.customerId`, customerEmail: `${v}.email`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_STRIPE_IMPORT],
});

registerNode({
  type: "stripe.getCustomer",
  label: i18n.nodes.stripe.getCustomer.label,
  description: i18n.nodes.stripe.getCustomer.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "customerId", label: i18n.nodes.stripe.getCustomer.pin_customer_id, type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "id", label: i18n.nodes.stripe.getCustomer.pin_id, type: "string", direction: "output" },
    { id: "email", label: i18n.nodes.stripe.getCustomer.pin_email, type: "string", direction: "output" },
    { id: "name", label: i18n.nodes.stripe.getCustomer.pin_name, type: "string", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async () => ({ nextExec: "exec-out", outputs: { success: false, id: "", email: "", name: "", error: STUB_ERROR } }),
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryStripe.stripeGetCustomer(${inputs.credentialName}, ${inputs.customerId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, id: `${v}.customerId`, email: `${v}.email`, name: `${v}.name`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_STRIPE_IMPORT],
});

registerNode({
  type: "stripe.deleteCustomer",
  label: i18n.nodes.stripe.deleteCustomer.label,
  description: i18n.nodes.stripe.deleteCustomer.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "customerId", label: i18n.nodes.stripe.deleteCustomer.pin_customer_id, type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "deleted", label: i18n.nodes.stripe.deleteCustomer.pin_deleted, type: "boolean", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async () => ({ nextExec: "exec-out", outputs: { success: false, deleted: false, error: STUB_ERROR } }),
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryStripe.stripeDeleteCustomer(${inputs.credentialName}, ${inputs.customerId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, deleted: `${v}.deleted`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_STRIPE_IMPORT],
});

registerNode({
  type: "stripe.listCustomers",
  label: i18n.nodes.stripe.listCustomers.label,
  description: i18n.nodes.stripe.listCustomers.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "email", label: i18n.nodes.stripe.listCustomers.pin_email, type: "string", direction: "input", defaultValue: "" },
    { id: "limit", label: i18n.nodes.stripe.listCustomers.pin_limit, type: "number", direction: "input", defaultValue: 20 },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "customers", label: i18n.nodes.stripe.listCustomers.pin_customers, type: "struct", subType: CUSTOMER_STRUCT_TYPE, container: "array", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async () => ({ nextExec: "exec-out", outputs: { success: false, customers: [], error: STUB_ERROR } }),
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryStripe.stripeListCustomers(${inputs.credentialName}, ${inputs.email}, ${inputs.limit});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, customers: `${v}.customers`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_STRIPE_IMPORT],
});

registerNode({
  type: "stripe.createPaymentIntent",
  label: i18n.nodes.stripe.createPaymentIntent.label,
  description: i18n.nodes.stripe.createPaymentIntent.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "amount", label: i18n.nodes.stripe.createPaymentIntent.pin_amount, type: "number", direction: "input", defaultValue: 0 },
    { id: "currency", label: i18n.nodes.stripe.createPaymentIntent.pin_currency, type: "string", direction: "input", defaultValue: "usd" },
    { id: "customerId", label: i18n.nodes.stripe.createPaymentIntent.pin_customer_id, type: "string", direction: "input", defaultValue: "" },
    { id: "description", label: i18n.nodes.stripe.createPaymentIntent.pin_description, type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "paymentIntentId", label: i18n.nodes.stripe.createPaymentIntent.pin_payment_intent_id, type: "string", direction: "output" },
    { id: "clientSecret", label: i18n.nodes.stripe.createPaymentIntent.pin_client_secret, type: "string", direction: "output" },
    { id: "status", label: i18n.nodes.stripe.createPaymentIntent.pin_status, type: "string", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async () => ({ nextExec: "exec-out", outputs: { success: false, paymentIntentId: "", clientSecret: "", status: "", error: STUB_ERROR } }),
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryStripe.stripeCreatePaymentIntent(${inputs.credentialName}, ${inputs.amount}, ${inputs.currency}, ${inputs.customerId}, ${inputs.description});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, paymentIntentId: `${v}.paymentIntentId`, clientSecret: `${v}.clientSecret`, status: `${v}.status`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_STRIPE_IMPORT],
});

registerNode({
  type: "stripe.getPaymentIntent",
  label: i18n.nodes.stripe.getPaymentIntent.label,
  description: i18n.nodes.stripe.getPaymentIntent.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "paymentIntentId", label: i18n.nodes.stripe.getPaymentIntent.pin_payment_intent_id, type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "status", label: i18n.nodes.stripe.getPaymentIntent.pin_status, type: "string", direction: "output" },
    { id: "amount", label: i18n.nodes.stripe.getPaymentIntent.pin_amount, type: "number", direction: "output" },
    { id: "currency", label: i18n.nodes.stripe.getPaymentIntent.pin_currency, type: "string", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async () => ({ nextExec: "exec-out", outputs: { success: false, status: "", amount: 0, currency: "", error: STUB_ERROR } }),
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryStripe.stripeGetPaymentIntent(${inputs.credentialName}, ${inputs.paymentIntentId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, status: `${v}.status`, amount: `${v}.amount`, currency: `${v}.currency`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_STRIPE_IMPORT],
});

registerNode({
  type: "stripe.cancelPaymentIntent",
  label: i18n.nodes.stripe.cancelPaymentIntent.label,
  description: i18n.nodes.stripe.cancelPaymentIntent.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "paymentIntentId", label: i18n.nodes.stripe.cancelPaymentIntent.pin_payment_intent_id, type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "status", label: i18n.nodes.stripe.cancelPaymentIntent.pin_status, type: "string", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async () => ({ nextExec: "exec-out", outputs: { success: false, status: "", error: STUB_ERROR } }),
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryStripe.stripeCancelPaymentIntent(${inputs.credentialName}, ${inputs.paymentIntentId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, status: `${v}.status`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_STRIPE_IMPORT],
});

registerNode({
  type: "stripe.createRefund",
  label: i18n.nodes.stripe.createRefund.label,
  description: i18n.nodes.stripe.createRefund.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "paymentIntentId", label: i18n.nodes.stripe.createRefund.pin_payment_intent_id, type: "string", direction: "input", defaultValue: "" },
    { id: "amount", label: i18n.nodes.stripe.createRefund.pin_amount, type: "number", direction: "input", defaultValue: 0 },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "refundId", label: i18n.nodes.stripe.createRefund.pin_refund_id, type: "string", direction: "output" },
    { id: "status", label: i18n.nodes.stripe.createRefund.pin_status, type: "string", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async () => ({ nextExec: "exec-out", outputs: { success: false, refundId: "", status: "", error: STUB_ERROR } }),
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryStripe.stripeCreateRefund(${inputs.credentialName}, ${inputs.paymentIntentId}, ${inputs.amount});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, refundId: `${v}.refundId`, status: `${v}.status`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_STRIPE_IMPORT],
});

registerNode({
  type: "stripe.listCharges",
  label: i18n.nodes.stripe.listCharges.label,
  description: i18n.nodes.stripe.listCharges.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "customerId", label: i18n.nodes.stripe.listCharges.pin_customer_id, type: "string", direction: "input", defaultValue: "" },
    { id: "limit", label: i18n.nodes.stripe.listCharges.pin_limit, type: "number", direction: "input", defaultValue: 20 },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "charges", label: i18n.nodes.stripe.listCharges.pin_charges, type: "struct", subType: CHARGE_STRUCT_TYPE, container: "array", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async () => ({ nextExec: "exec-out", outputs: { success: false, charges: [], error: STUB_ERROR } }),
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryStripe.stripeListCharges(${inputs.credentialName}, ${inputs.customerId}, ${inputs.limit});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, charges: `${v}.charges`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_STRIPE_IMPORT],
});
