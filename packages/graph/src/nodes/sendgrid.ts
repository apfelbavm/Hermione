import { NodeColorCategory } from "@hermione/graph/engine/types";
import { registerNode } from "@hermione/graph/engine/registry";
import { compileResultVar, SENDGRID_MANAGER_IMPORT, RETRY_HELPER_IMPORT } from "@hermione/graph/engine/compileUtils";
import { CONTACT_STRUCT_TYPE, API_KEY_STRUCT_TYPE, CONTACT_LIST_STRUCT_TYPE, BOUNCE_STRUCT_TYPE, SPAM_REPORT_STRUCT_TYPE, GLOBAL_UNSUBSCRIBE_STRUCT_TYPE, EMAIL_STAT_STRUCT_TYPE, VERIFIED_SENDER_STRUCT_TYPE } from "@hermione/graph/structs/sendgrid";
import { withRetry } from "@hermione/core/lib/retry";
import { retryCountPin, retryDelayMsPin, attemptsPin } from "@hermione/graph/nodes/shared/retryPins";
import { i18n } from "@i18n";

// Every operation below calls the exact same SendGridManager static method (packages/core/src/lib/
// sendGridManager.ts) from both execute() (interpreter path) and compileExecute() (compiled/deployed
// path) — SendGridManager resolves the named credential straight from the database itself (see its
// findCredential), so like twilio.ts's nodes there is no separate functionLibrarySendGrid.ts
// env-var-reading layer and no ctx.getCredential vault lookup here: both paths are already identical.
//
// SendGridManager reaches the database directly, which pulls in better-sqlite3 and Node builtins —
// fine for execute(), which only ever runs server-side, but this file is still statically imported
// client-side too (for the node-creation menu), so a plain top-level import here would drag that
// whole chain into the browser bundle. Loaded with a runtime `import()` instead, ignored by both
// bundlers, so it's never even resolved for the client build; only ever actually called
// server-side, where it resolves normally.
async function loadSendGridManager(): Promise<typeof import("@hermione/core/lib/sendGridManager").SendGridManager> {
  const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "@hermione/core/lib/sendGridManager");
  return mod.SendGridManager;
}

const GROUP_NAME = "Request.SendGrid";

function credentialNamePin() {
  return { id: "credentialName", label: i18n.nodes.sendgrid.__shared.pin_credential_name, type: "string" as const, direction: "input" as const, defaultValue: "" };
}

const emptyContact = { id: "", email: "", firstName: "", lastName: "" };

registerNode({
  type: "sendgrid.sendEmail",
  label: i18n.nodes.sendgrid.sendEmail.label,
  description: i18n.nodes.sendgrid.sendEmail.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "to", label: i18n.nodes.sendgrid.sendEmail.pin_to, type: "string", direction: "input", defaultValue: "" },
    { id: "from", label: i18n.nodes.sendgrid.sendEmail.pin_from, type: "string", direction: "input", defaultValue: "" },
    { id: "subject", label: i18n.nodes.sendgrid.sendEmail.pin_subject, type: "string", direction: "input", defaultValue: "" },
    { id: "text", label: i18n.nodes.sendgrid.sendEmail.pin_text, type: "string", direction: "input", defaultValue: "" },
    { id: "html", label: i18n.nodes.sendgrid.sendEmail.pin_html, type: "string", direction: "input", defaultValue: "" },
    { id: "cc", label: i18n.nodes.sendgrid.sendEmail.pin_cc, type: "string", direction: "input", defaultValue: "" },
    { id: "bcc", label: i18n.nodes.sendgrid.sendEmail.pin_bcc, type: "string", direction: "input", defaultValue: "" },
    { id: "replyTo", label: i18n.nodes.sendgrid.sendEmail.pin_reply_to, type: "string", direction: "input", defaultValue: "" },
    retryCountPin(),
    retryDelayMsPin(),
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "messageId", label: i18n.nodes.sendgrid.sendEmail.pin_message_id, type: "string", direction: "output" },
    attemptsPin(),
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await withRetry(
      async () =>
        (await loadSendGridManager()).sendEmail(
          String(inputs.credentialName ?? ""),
          String(inputs.to ?? ""),
          String(inputs.from ?? ""),
          String(inputs.subject ?? ""),
          String(inputs.text ?? ""),
          String(inputs.html ?? ""),
          String(inputs.cc ?? ""),
          String(inputs.bcc ?? ""),
          String(inputs.replyTo ?? ""),
        ),
      Number(inputs.retryCount ?? 0),
      Number(inputs.retryDelayMs ?? 0),
    );
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await withRetry(() => SendGridManager.sendEmail(${inputs.credentialName}, ${inputs.to}, ${inputs.from}, ${inputs.subject}, ${inputs.text}, ${inputs.html}, ${inputs.cc}, ${inputs.bcc}, ${inputs.replyTo}), ${inputs.retryCount}, ${inputs.retryDelayMs});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, messageId: `${v}.messageId`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [SENDGRID_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
});

registerNode({
  type: "sendgrid.sendTemplateEmail",
  label: i18n.nodes.sendgrid.sendTemplateEmail.label,
  description: i18n.nodes.sendgrid.sendTemplateEmail.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "to", label: i18n.nodes.sendgrid.sendTemplateEmail.pin_to, type: "string", direction: "input", defaultValue: "" },
    { id: "from", label: i18n.nodes.sendgrid.sendTemplateEmail.pin_from, type: "string", direction: "input", defaultValue: "" },
    { id: "templateId", label: i18n.nodes.sendgrid.sendTemplateEmail.pin_template_id, type: "string", direction: "input", defaultValue: "" },
    { id: "dynamicTemplateDataJson", label: i18n.nodes.sendgrid.sendTemplateEmail.pin_dynamic_template_data_json, type: "string", direction: "input", defaultValue: "" },
    retryCountPin(),
    retryDelayMsPin(),
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "messageId", label: i18n.nodes.sendgrid.sendTemplateEmail.pin_message_id, type: "string", direction: "output" },
    attemptsPin(),
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await withRetry(
      async () => (await loadSendGridManager()).sendTemplateEmail(String(inputs.credentialName ?? ""), String(inputs.to ?? ""), String(inputs.from ?? ""), String(inputs.templateId ?? ""), String(inputs.dynamicTemplateDataJson ?? "")),
      Number(inputs.retryCount ?? 0),
      Number(inputs.retryDelayMs ?? 0),
    );
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await withRetry(() => SendGridManager.sendTemplateEmail(${inputs.credentialName}, ${inputs.to}, ${inputs.from}, ${inputs.templateId}, ${inputs.dynamicTemplateDataJson}), ${inputs.retryCount}, ${inputs.retryDelayMs});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, messageId: `${v}.messageId`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [SENDGRID_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
});

registerNode({
  type: "sendgrid.sendMultiple",
  label: i18n.nodes.sendgrid.sendMultiple.label,
  description: i18n.nodes.sendgrid.sendMultiple.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "toEmailsJson", label: i18n.nodes.sendgrid.sendMultiple.pin_to_emails_json, type: "string", direction: "input", defaultValue: "" },
    { id: "from", label: i18n.nodes.sendgrid.sendMultiple.pin_from, type: "string", direction: "input", defaultValue: "" },
    { id: "subject", label: i18n.nodes.sendgrid.sendMultiple.pin_subject, type: "string", direction: "input", defaultValue: "" },
    { id: "text", label: i18n.nodes.sendgrid.sendMultiple.pin_text, type: "string", direction: "input", defaultValue: "" },
    { id: "html", label: i18n.nodes.sendgrid.sendMultiple.pin_html, type: "string", direction: "input", defaultValue: "" },
    retryCountPin(),
    retryDelayMsPin(),
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "messageId", label: i18n.nodes.sendgrid.sendMultiple.pin_message_id, type: "string", direction: "output" },
    attemptsPin(),
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await withRetry(
      async () => (await loadSendGridManager()).sendMultiple(String(inputs.credentialName ?? ""), String(inputs.toEmailsJson ?? ""), String(inputs.from ?? ""), String(inputs.subject ?? ""), String(inputs.text ?? ""), String(inputs.html ?? "")),
      Number(inputs.retryCount ?? 0),
      Number(inputs.retryDelayMs ?? 0),
    );
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await withRetry(() => SendGridManager.sendMultiple(${inputs.credentialName}, ${inputs.toEmailsJson}, ${inputs.from}, ${inputs.subject}, ${inputs.text}, ${inputs.html}), ${inputs.retryCount}, ${inputs.retryDelayMs});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, messageId: `${v}.messageId`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [SENDGRID_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
});

registerNode({
  type: "sendgrid.createApiKey",
  label: i18n.nodes.sendgrid.createApiKey.label,
  description: i18n.nodes.sendgrid.createApiKey.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "name", label: i18n.nodes.sendgrid.createApiKey.pin_name, type: "string", direction: "input", defaultValue: "" },
    { id: "scopesJson", label: i18n.nodes.sendgrid.createApiKey.pin_scopes_json, type: "string", direction: "input", defaultValue: "" },
    retryCountPin(),
    retryDelayMsPin(),
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "apiKeyId", label: i18n.nodes.sendgrid.createApiKey.pin_api_key_id, type: "string", direction: "output" },
    { id: "apiKeyValue", label: i18n.nodes.sendgrid.createApiKey.pin_api_key_value, type: "string", direction: "output" },
    attemptsPin(),
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await withRetry(async () => (await loadSendGridManager()).createApiKey(String(inputs.credentialName ?? ""), String(inputs.name ?? ""), String(inputs.scopesJson ?? "")), Number(inputs.retryCount ?? 0), Number(inputs.retryDelayMs ?? 0));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await withRetry(() => SendGridManager.createApiKey(${inputs.credentialName}, ${inputs.name}, ${inputs.scopesJson}), ${inputs.retryCount}, ${inputs.retryDelayMs});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, apiKeyId: `${v}.apiKeyId`, apiKeyValue: `${v}.apiKeyValue`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [SENDGRID_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
});

registerNode({
  type: "sendgrid.listApiKeys",
  label: i18n.nodes.sendgrid.listApiKeys.label,
  description: i18n.nodes.sendgrid.listApiKeys.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    retryCountPin(),
    retryDelayMsPin(),
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "apiKeys", label: i18n.nodes.sendgrid.listApiKeys.pin_api_keys, type: "struct", subType: API_KEY_STRUCT_TYPE, container: "array", direction: "output" },
    attemptsPin(),
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await withRetry(async () => (await loadSendGridManager()).listApiKeys(String(inputs.credentialName ?? "")), Number(inputs.retryCount ?? 0), Number(inputs.retryDelayMs ?? 0));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await withRetry(() => SendGridManager.listApiKeys(${inputs.credentialName}), ${inputs.retryCount}, ${inputs.retryDelayMs});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, apiKeys: `${v}.apiKeys`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [SENDGRID_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
});

registerNode({
  type: "sendgrid.deleteApiKey",
  label: i18n.nodes.sendgrid.deleteApiKey.label,
  description: i18n.nodes.sendgrid.deleteApiKey.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "apiKeyId", label: i18n.nodes.sendgrid.deleteApiKey.pin_api_key_id, type: "string", direction: "input", defaultValue: "" },
    retryCountPin(),
    retryDelayMsPin(),
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    attemptsPin(),
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await withRetry(async () => (await loadSendGridManager()).deleteApiKey(String(inputs.credentialName ?? ""), String(inputs.apiKeyId ?? "")), Number(inputs.retryCount ?? 0), Number(inputs.retryDelayMs ?? 0));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await withRetry(() => SendGridManager.deleteApiKey(${inputs.credentialName}, ${inputs.apiKeyId}), ${inputs.retryCount}, ${inputs.retryDelayMs});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [SENDGRID_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
});

registerNode({
  type: "sendgrid.upsertContacts",
  label: i18n.nodes.sendgrid.upsertContacts.label,
  description: i18n.nodes.sendgrid.upsertContacts.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "contactsJson", label: i18n.nodes.sendgrid.upsertContacts.pin_contacts_json, type: "string", direction: "input", defaultValue: "" },
    { id: "listIdsJson", label: i18n.nodes.sendgrid.upsertContacts.pin_list_ids_json, type: "string", direction: "input", defaultValue: "" },
    retryCountPin(),
    retryDelayMsPin(),
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "jobId", label: i18n.nodes.sendgrid.upsertContacts.pin_job_id, type: "string", direction: "output" },
    attemptsPin(),
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await withRetry(async () => (await loadSendGridManager()).upsertContacts(String(inputs.credentialName ?? ""), String(inputs.contactsJson ?? ""), String(inputs.listIdsJson ?? "")), Number(inputs.retryCount ?? 0), Number(inputs.retryDelayMs ?? 0));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await withRetry(() => SendGridManager.upsertContacts(${inputs.credentialName}, ${inputs.contactsJson}, ${inputs.listIdsJson}), ${inputs.retryCount}, ${inputs.retryDelayMs});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, jobId: `${v}.jobId`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [SENDGRID_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
});

registerNode({
  type: "sendgrid.getContactByEmail",
  label: i18n.nodes.sendgrid.getContactByEmail.label,
  description: i18n.nodes.sendgrid.getContactByEmail.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "email", label: i18n.nodes.sendgrid.getContactByEmail.pin_email, type: "string", direction: "input", defaultValue: "" },
    retryCountPin(),
    retryDelayMsPin(),
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "contact", label: i18n.nodes.sendgrid.getContactByEmail.pin_contact, type: "struct", subType: CONTACT_STRUCT_TYPE, direction: "output" },
    attemptsPin(),
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await withRetry(async () => (await loadSendGridManager()).getContactByEmail(String(inputs.credentialName ?? ""), String(inputs.email ?? "")), Number(inputs.retryCount ?? 0), Number(inputs.retryDelayMs ?? 0));
    return { nextExec: "exec-out", outputs: { success: result.success, contact: result.success ? result.contact : emptyContact, attempts: result.attempts, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await withRetry(() => SendGridManager.getContactByEmail(${inputs.credentialName}, ${inputs.email}), ${inputs.retryCount}, ${inputs.retryDelayMs});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, contact: `${v}.contact`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [SENDGRID_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
});

registerNode({
  type: "sendgrid.deleteContacts",
  label: i18n.nodes.sendgrid.deleteContacts.label,
  description: i18n.nodes.sendgrid.deleteContacts.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "contactIdsJson", label: i18n.nodes.sendgrid.deleteContacts.pin_contact_ids_json, type: "string", direction: "input", defaultValue: "" },
    { id: "deleteAll", label: i18n.nodes.sendgrid.deleteContacts.pin_delete_all, type: "boolean", direction: "input", defaultValue: false },
    retryCountPin(),
    retryDelayMsPin(),
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "jobId", label: i18n.nodes.sendgrid.deleteContacts.pin_job_id, type: "string", direction: "output" },
    attemptsPin(),
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await withRetry(async () => (await loadSendGridManager()).deleteContacts(String(inputs.credentialName ?? ""), String(inputs.contactIdsJson ?? ""), Boolean(inputs.deleteAll)), Number(inputs.retryCount ?? 0), Number(inputs.retryDelayMs ?? 0));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await withRetry(() => SendGridManager.deleteContacts(${inputs.credentialName}, ${inputs.contactIdsJson}, ${inputs.deleteAll}), ${inputs.retryCount}, ${inputs.retryDelayMs});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, jobId: `${v}.jobId`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [SENDGRID_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
});

registerNode({
  type: "sendgrid.createList",
  label: i18n.nodes.sendgrid.createList.label,
  description: i18n.nodes.sendgrid.createList.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "name", label: i18n.nodes.sendgrid.createList.pin_name, type: "string", direction: "input", defaultValue: "" },
    retryCountPin(),
    retryDelayMsPin(),
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "listId", label: i18n.nodes.sendgrid.createList.pin_list_id, type: "string", direction: "output" },
    { id: "listName", label: i18n.nodes.sendgrid.createList.pin_list_name, type: "string", direction: "output" },
    attemptsPin(),
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await withRetry(async () => (await loadSendGridManager()).createList(String(inputs.credentialName ?? ""), String(inputs.name ?? "")), Number(inputs.retryCount ?? 0), Number(inputs.retryDelayMs ?? 0));
    return { nextExec: "exec-out", outputs: { success: result.success, listId: result.listId, listName: result.name, attempts: result.attempts, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await withRetry(() => SendGridManager.createList(${inputs.credentialName}, ${inputs.name}), ${inputs.retryCount}, ${inputs.retryDelayMs});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, listId: `${v}.listId`, listName: `${v}.name`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [SENDGRID_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
});

registerNode({
  type: "sendgrid.listContactLists",
  label: i18n.nodes.sendgrid.listContactLists.label,
  description: i18n.nodes.sendgrid.listContactLists.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    retryCountPin(),
    retryDelayMsPin(),
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "lists", label: i18n.nodes.sendgrid.listContactLists.pin_lists, type: "struct", subType: CONTACT_LIST_STRUCT_TYPE, container: "array", direction: "output" },
    attemptsPin(),
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await withRetry(async () => (await loadSendGridManager()).listContactLists(String(inputs.credentialName ?? "")), Number(inputs.retryCount ?? 0), Number(inputs.retryDelayMs ?? 0));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await withRetry(() => SendGridManager.listContactLists(${inputs.credentialName}), ${inputs.retryCount}, ${inputs.retryDelayMs});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, lists: `${v}.lists`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [SENDGRID_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
});

registerNode({
  type: "sendgrid.deleteList",
  label: i18n.nodes.sendgrid.deleteList.label,
  description: i18n.nodes.sendgrid.deleteList.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "listId", label: i18n.nodes.sendgrid.deleteList.pin_list_id, type: "string", direction: "input", defaultValue: "" },
    retryCountPin(),
    retryDelayMsPin(),
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    attemptsPin(),
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await withRetry(async () => (await loadSendGridManager()).deleteList(String(inputs.credentialName ?? ""), String(inputs.listId ?? "")), Number(inputs.retryCount ?? 0), Number(inputs.retryDelayMs ?? 0));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await withRetry(() => SendGridManager.deleteList(${inputs.credentialName}, ${inputs.listId}), ${inputs.retryCount}, ${inputs.retryDelayMs});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [SENDGRID_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
});

registerNode({
  type: "sendgrid.getBounces",
  label: i18n.nodes.sendgrid.getBounces.label,
  description: i18n.nodes.sendgrid.getBounces.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "startTime", label: i18n.nodes.sendgrid.getBounces.pin_start_time, type: "number", direction: "input", defaultValue: 0 },
    { id: "endTime", label: i18n.nodes.sendgrid.getBounces.pin_end_time, type: "number", direction: "input", defaultValue: 0 },
    retryCountPin(),
    retryDelayMsPin(),
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "bounces", label: i18n.nodes.sendgrid.getBounces.pin_bounces, type: "struct", subType: BOUNCE_STRUCT_TYPE, container: "array", direction: "output" },
    attemptsPin(),
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await withRetry(async () => (await loadSendGridManager()).getBounces(String(inputs.credentialName ?? ""), Number(inputs.startTime) || 0, Number(inputs.endTime) || 0), Number(inputs.retryCount ?? 0), Number(inputs.retryDelayMs ?? 0));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await withRetry(() => SendGridManager.getBounces(${inputs.credentialName}, ${inputs.startTime}, ${inputs.endTime}), ${inputs.retryCount}, ${inputs.retryDelayMs});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, bounces: `${v}.bounces`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [SENDGRID_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
});

registerNode({
  type: "sendgrid.deleteBounce",
  label: i18n.nodes.sendgrid.deleteBounce.label,
  description: i18n.nodes.sendgrid.deleteBounce.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "email", label: i18n.nodes.sendgrid.deleteBounce.pin_email, type: "string", direction: "input", defaultValue: "" },
    { id: "deleteAll", label: i18n.nodes.sendgrid.deleteBounce.pin_delete_all, type: "boolean", direction: "input", defaultValue: false },
    retryCountPin(),
    retryDelayMsPin(),
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    attemptsPin(),
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await withRetry(async () => (await loadSendGridManager()).deleteBounce(String(inputs.credentialName ?? ""), String(inputs.email ?? ""), Boolean(inputs.deleteAll)), Number(inputs.retryCount ?? 0), Number(inputs.retryDelayMs ?? 0));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await withRetry(() => SendGridManager.deleteBounce(${inputs.credentialName}, ${inputs.email}, ${inputs.deleteAll}), ${inputs.retryCount}, ${inputs.retryDelayMs});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [SENDGRID_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
});

registerNode({
  type: "sendgrid.getSpamReports",
  label: i18n.nodes.sendgrid.getSpamReports.label,
  description: i18n.nodes.sendgrid.getSpamReports.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    retryCountPin(),
    retryDelayMsPin(),
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "spamReports", label: i18n.nodes.sendgrid.getSpamReports.pin_spam_reports, type: "struct", subType: SPAM_REPORT_STRUCT_TYPE, container: "array", direction: "output" },
    attemptsPin(),
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await withRetry(async () => (await loadSendGridManager()).getSpamReports(String(inputs.credentialName ?? "")), Number(inputs.retryCount ?? 0), Number(inputs.retryDelayMs ?? 0));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await withRetry(() => SendGridManager.getSpamReports(${inputs.credentialName}), ${inputs.retryCount}, ${inputs.retryDelayMs});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, spamReports: `${v}.spamReports`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [SENDGRID_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
});

registerNode({
  type: "sendgrid.getGlobalUnsubscribes",
  label: i18n.nodes.sendgrid.getGlobalUnsubscribes.label,
  description: i18n.nodes.sendgrid.getGlobalUnsubscribes.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    retryCountPin(),
    retryDelayMsPin(),
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "unsubscribes", label: i18n.nodes.sendgrid.getGlobalUnsubscribes.pin_unsubscribes, type: "struct", subType: GLOBAL_UNSUBSCRIBE_STRUCT_TYPE, container: "array", direction: "output" },
    attemptsPin(),
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await withRetry(async () => (await loadSendGridManager()).getGlobalUnsubscribes(String(inputs.credentialName ?? "")), Number(inputs.retryCount ?? 0), Number(inputs.retryDelayMs ?? 0));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await withRetry(() => SendGridManager.getGlobalUnsubscribes(${inputs.credentialName}), ${inputs.retryCount}, ${inputs.retryDelayMs});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, unsubscribes: `${v}.unsubscribes`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [SENDGRID_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
});

registerNode({
  type: "sendgrid.getEmailStats",
  label: i18n.nodes.sendgrid.getEmailStats.label,
  description: i18n.nodes.sendgrid.getEmailStats.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "startDate", label: i18n.nodes.sendgrid.getEmailStats.pin_start_date, type: "string", direction: "input", defaultValue: "" },
    { id: "endDate", label: i18n.nodes.sendgrid.getEmailStats.pin_end_date, type: "string", direction: "input", defaultValue: "" },
    retryCountPin(),
    retryDelayMsPin(),
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "stats", label: i18n.nodes.sendgrid.getEmailStats.pin_stats, type: "struct", subType: EMAIL_STAT_STRUCT_TYPE, container: "array", direction: "output" },
    attemptsPin(),
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await withRetry(async () => (await loadSendGridManager()).getEmailStats(String(inputs.credentialName ?? ""), String(inputs.startDate ?? ""), String(inputs.endDate ?? "")), Number(inputs.retryCount ?? 0), Number(inputs.retryDelayMs ?? 0));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await withRetry(() => SendGridManager.getEmailStats(${inputs.credentialName}, ${inputs.startDate}, ${inputs.endDate}), ${inputs.retryCount}, ${inputs.retryDelayMs});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, stats: `${v}.stats`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [SENDGRID_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
});

registerNode({
  type: "sendgrid.getVerifiedSenders",
  label: i18n.nodes.sendgrid.getVerifiedSenders.label,
  description: i18n.nodes.sendgrid.getVerifiedSenders.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    retryCountPin(),
    retryDelayMsPin(),
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "senders", label: i18n.nodes.sendgrid.getVerifiedSenders.pin_senders, type: "struct", subType: VERIFIED_SENDER_STRUCT_TYPE, container: "array", direction: "output" },
    attemptsPin(),
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await withRetry(async () => (await loadSendGridManager()).getVerifiedSenders(String(inputs.credentialName ?? "")), Number(inputs.retryCount ?? 0), Number(inputs.retryDelayMs ?? 0));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await withRetry(() => SendGridManager.getVerifiedSenders(${inputs.credentialName}), ${inputs.retryCount}, ${inputs.retryDelayMs});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, senders: `${v}.senders`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [SENDGRID_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
});
