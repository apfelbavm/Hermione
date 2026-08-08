import { NodeColorCategory } from "@hermione/graph/engine/types";
import { registerNode } from "@hermione/graph/engine/registry";
import { compileResultVar, STRIPE_MANAGER_IMPORT } from "@hermione/graph/engine/compileUtils";
import { CHARGE_STRUCT_TYPE, CUSTOMER_STRUCT_TYPE } from "@hermione/graph/structs/stripe";
import { i18n } from "@i18n";

// Every operation below calls the exact same StripeManager static method (packages/core/src/lib/
// stripeManager.ts) from both execute() (interpreter path) and compileExecute() (compiled/deployed
// path) — StripeManager resolves the named credential straight from the database itself (see its
// findCredential), so unlike most other providers there is no separate functionLibraryStripe.ts
// env-var-reading layer and no ctx.getCredential vault lookup here: both paths are already identical.
//
// StripeManager reaches the database directly (see its own header comment), which pulls in
// better-sqlite3 and Node builtins — fine for execute(), which only ever runs server-side, but this
// file is still statically imported client-side too (for the node-creation menu), so a plain
// top-level import here would drag that whole chain into the browser bundle. Loaded with a runtime
// `import()` instead, ignored by both bundlers, so it's never even resolved for the client build;
// only ever actually called server-side, where it resolves normally.
async function loadStripeManager(): Promise<typeof import("@hermione/core/lib/stripeManager").StripeManager> {
  const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "@hermione/core/lib/stripeManager");
  return mod.StripeManager;
}

const GROUP_NAME = "Request.Stripe";

function credentialNamePin() {
  return { id: "credentialName", label: i18n.nodes.stripe.__shared.pin_credential_name, type: "string" as const, direction: "input" as const, defaultValue: "" };
}

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
  execute: async ({ inputs }) => {
    const result = await (await loadStripeManager()).createCustomer(String(inputs.credentialName ?? ""), String(inputs.email ?? ""), String(inputs.name ?? ""), String(inputs.description ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, customerId: result.customerId, customerEmail: result.email, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await StripeManager.createCustomer(${inputs.credentialName}, ${inputs.email}, ${inputs.name}, ${inputs.description});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, customerId: `${v}.customerId`, customerEmail: `${v}.email`, error: `${v}.error` };
  },
  compileImports: [STRIPE_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadStripeManager()).getCustomer(String(inputs.credentialName ?? ""), String(inputs.customerId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, id: result.customerId, email: result.email, name: result.name, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await StripeManager.getCustomer(${inputs.credentialName}, ${inputs.customerId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, id: `${v}.customerId`, email: `${v}.email`, name: `${v}.name`, error: `${v}.error` };
  },
  compileImports: [STRIPE_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadStripeManager()).deleteCustomer(String(inputs.credentialName ?? ""), String(inputs.customerId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await StripeManager.deleteCustomer(${inputs.credentialName}, ${inputs.customerId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, deleted: `${v}.deleted`, error: `${v}.error` };
  },
  compileImports: [STRIPE_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadStripeManager()).listCustomers(String(inputs.credentialName ?? ""), String(inputs.email ?? ""), Number(inputs.limit) || 20);
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await StripeManager.listCustomers(${inputs.credentialName}, ${inputs.email}, ${inputs.limit});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, customers: `${v}.customers`, error: `${v}.error` };
  },
  compileImports: [STRIPE_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadStripeManager()).createPaymentIntent(String(inputs.credentialName ?? ""), Number(inputs.amount) || 0, String(inputs.currency ?? ""), String(inputs.customerId ?? ""), String(inputs.description ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await StripeManager.createPaymentIntent(${inputs.credentialName}, ${inputs.amount}, ${inputs.currency}, ${inputs.customerId}, ${inputs.description});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, paymentIntentId: `${v}.paymentIntentId`, clientSecret: `${v}.clientSecret`, status: `${v}.status`, error: `${v}.error` };
  },
  compileImports: [STRIPE_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadStripeManager()).getPaymentIntent(String(inputs.credentialName ?? ""), String(inputs.paymentIntentId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await StripeManager.getPaymentIntent(${inputs.credentialName}, ${inputs.paymentIntentId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, status: `${v}.status`, amount: `${v}.amount`, currency: `${v}.currency`, error: `${v}.error` };
  },
  compileImports: [STRIPE_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadStripeManager()).cancelPaymentIntent(String(inputs.credentialName ?? ""), String(inputs.paymentIntentId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await StripeManager.cancelPaymentIntent(${inputs.credentialName}, ${inputs.paymentIntentId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, status: `${v}.status`, error: `${v}.error` };
  },
  compileImports: [STRIPE_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadStripeManager()).createRefund(String(inputs.credentialName ?? ""), String(inputs.paymentIntentId ?? ""), Number(inputs.amount) || 0);
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await StripeManager.createRefund(${inputs.credentialName}, ${inputs.paymentIntentId}, ${inputs.amount});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, refundId: `${v}.refundId`, status: `${v}.status`, error: `${v}.error` };
  },
  compileImports: [STRIPE_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadStripeManager()).listCharges(String(inputs.credentialName ?? ""), String(inputs.customerId ?? ""), Number(inputs.limit) || 20);
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await StripeManager.listCharges(${inputs.credentialName}, ${inputs.customerId}, ${inputs.limit});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, charges: `${v}.charges`, error: `${v}.error` };
  },
  compileImports: [STRIPE_MANAGER_IMPORT],
});
