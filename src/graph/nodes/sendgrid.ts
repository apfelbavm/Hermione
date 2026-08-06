import { NodeColorCategory } from "../engine/types";
import { registerNode } from "../engine/registry";
import { compileResultVar, FUNCTION_LIBRARY_SENDGRID_IMPORT } from "../engine/compileUtils";
import { CONTACT_STRUCT_TYPE, API_KEY_STRUCT_TYPE, CONTACT_LIST_STRUCT_TYPE, BOUNCE_STRUCT_TYPE, SPAM_REPORT_STRUCT_TYPE, GLOBAL_UNSUBSCRIBE_STRUCT_TYPE, EMAIL_STAT_STRUCT_TYPE, VERIFIED_SENDER_STRUCT_TYPE } from "../structs/sendgrid";
import { i18n } from "@i18n";

const GROUP_NAME = "Request.SendGrid";

// Calls SendGrid via the official "@sendgrid/mail" and "@sendgrid/client" Node SDKs — real REST
// clients that talk to the SendGrid Web API over Node's own https module, which SendGrid itself
// documents as server-side only (embedding an API Key in browser-shipped code is a real
// credential-leak risk, not just a bundler technicality). Same structural situation as twilio.ts's
// nodes and smtp.ts's Send Mail node (see those files' own header comments): every node below
// therefore has a permanent, honest stub execute() reporting that only the compiled output can
// actually reach SendGrid; the REAL implementation lives in src/server/functionLibrarySendGrid.ts
// (backed by src/lib/sendGridManager.ts), reached only via compileImports, never statically
// imported here.
function credentialNamePin() {
  return { id: "credentialName", label: i18n.nodes.sendgrid.__shared.pin_credential_name, type: "string" as const, direction: "input" as const, defaultValue: "" };
}

const STUB_ERROR = 'This SendGrid node only runs in the compiled output (under Node.js) — the in-browser "Run" button cannot use the official SendGrid SDKs client-side (they are server-only and would expose your API Key). Compile this graph and run the generated script to actually call SendGrid.';

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
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "messageId", label: i18n.nodes.sendgrid.sendEmail.pin_message_id, type: "string", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async () => ({ nextExec: "exec-out", outputs: { success: false, messageId: "", error: STUB_ERROR } }),
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await functionLibrarySendGrid.sendGridSendEmail(${inputs.credentialName}, ${inputs.to}, ${inputs.from}, ${inputs.subject}, ${inputs.text}, ${inputs.html}, ${inputs.cc}, ${inputs.bcc}, ${inputs.replyTo});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, messageId: `${v}.messageId`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SENDGRID_IMPORT],
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
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "messageId", label: i18n.nodes.sendgrid.sendTemplateEmail.pin_message_id, type: "string", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async () => ({ nextExec: "exec-out", outputs: { success: false, messageId: "", error: STUB_ERROR } }),
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySendGrid.sendGridSendTemplateEmail(${inputs.credentialName}, ${inputs.to}, ${inputs.from}, ${inputs.templateId}, ${inputs.dynamicTemplateDataJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, messageId: `${v}.messageId`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SENDGRID_IMPORT],
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
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "messageId", label: i18n.nodes.sendgrid.sendMultiple.pin_message_id, type: "string", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async () => ({ nextExec: "exec-out", outputs: { success: false, messageId: "", error: STUB_ERROR } }),
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySendGrid.sendGridSendMultiple(${inputs.credentialName}, ${inputs.toEmailsJson}, ${inputs.from}, ${inputs.subject}, ${inputs.text}, ${inputs.html});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, messageId: `${v}.messageId`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SENDGRID_IMPORT],
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
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "apiKeyId", label: i18n.nodes.sendgrid.createApiKey.pin_api_key_id, type: "string", direction: "output" },
    { id: "apiKeyValue", label: i18n.nodes.sendgrid.createApiKey.pin_api_key_value, type: "string", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async () => ({ nextExec: "exec-out", outputs: { success: false, apiKeyId: "", apiKeyValue: "", error: STUB_ERROR } }),
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySendGrid.sendGridCreateApiKey(${inputs.credentialName}, ${inputs.name}, ${inputs.scopesJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, apiKeyId: `${v}.apiKeyId`, apiKeyValue: `${v}.apiKeyValue`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SENDGRID_IMPORT],
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
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "apiKeys", label: i18n.nodes.sendgrid.listApiKeys.pin_api_keys, type: "struct", subType: API_KEY_STRUCT_TYPE, container: "array", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async () => ({ nextExec: "exec-out", outputs: { success: false, apiKeys: [], error: STUB_ERROR } }),
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySendGrid.sendGridListApiKeys(${inputs.credentialName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, apiKeys: `${v}.apiKeys`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SENDGRID_IMPORT],
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
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async () => ({ nextExec: "exec-out", outputs: { success: false, error: STUB_ERROR } }),
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySendGrid.sendGridDeleteApiKey(${inputs.credentialName}, ${inputs.apiKeyId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SENDGRID_IMPORT],
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
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "jobId", label: i18n.nodes.sendgrid.upsertContacts.pin_job_id, type: "string", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async () => ({ nextExec: "exec-out", outputs: { success: false, jobId: "", error: STUB_ERROR } }),
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySendGrid.sendGridUpsertContacts(${inputs.credentialName}, ${inputs.contactsJson}, ${inputs.listIdsJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, jobId: `${v}.jobId`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SENDGRID_IMPORT],
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
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "contact", label: i18n.nodes.sendgrid.getContactByEmail.pin_contact, type: "struct", subType: CONTACT_STRUCT_TYPE, direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async () => ({ nextExec: "exec-out", outputs: { success: false, contact: emptyContact, error: STUB_ERROR } }),
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySendGrid.sendGridGetContactByEmail(${inputs.credentialName}, ${inputs.email});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, contact: `${v}.contact`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SENDGRID_IMPORT],
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
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "jobId", label: i18n.nodes.sendgrid.deleteContacts.pin_job_id, type: "string", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async () => ({ nextExec: "exec-out", outputs: { success: false, jobId: "", error: STUB_ERROR } }),
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySendGrid.sendGridDeleteContacts(${inputs.credentialName}, ${inputs.contactIdsJson}, ${inputs.deleteAll});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, jobId: `${v}.jobId`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SENDGRID_IMPORT],
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
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "listId", label: i18n.nodes.sendgrid.createList.pin_list_id, type: "string", direction: "output" },
    { id: "listName", label: i18n.nodes.sendgrid.createList.pin_list_name, type: "string", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async () => ({ nextExec: "exec-out", outputs: { success: false, listId: "", listName: "", error: STUB_ERROR } }),
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySendGrid.sendGridCreateList(${inputs.credentialName}, ${inputs.name});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, listId: `${v}.listId`, listName: `${v}.name`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SENDGRID_IMPORT],
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
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "lists", label: i18n.nodes.sendgrid.listContactLists.pin_lists, type: "struct", subType: CONTACT_LIST_STRUCT_TYPE, container: "array", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async () => ({ nextExec: "exec-out", outputs: { success: false, lists: [], error: STUB_ERROR } }),
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySendGrid.sendGridListContactLists(${inputs.credentialName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, lists: `${v}.lists`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SENDGRID_IMPORT],
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
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async () => ({ nextExec: "exec-out", outputs: { success: false, error: STUB_ERROR } }),
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySendGrid.sendGridDeleteList(${inputs.credentialName}, ${inputs.listId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SENDGRID_IMPORT],
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
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "bounces", label: i18n.nodes.sendgrid.getBounces.pin_bounces, type: "struct", subType: BOUNCE_STRUCT_TYPE, container: "array", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async () => ({ nextExec: "exec-out", outputs: { success: false, bounces: [], error: STUB_ERROR } }),
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySendGrid.sendGridGetBounces(${inputs.credentialName}, ${inputs.startTime}, ${inputs.endTime});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, bounces: `${v}.bounces`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SENDGRID_IMPORT],
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
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async () => ({ nextExec: "exec-out", outputs: { success: false, error: STUB_ERROR } }),
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySendGrid.sendGridDeleteBounce(${inputs.credentialName}, ${inputs.email}, ${inputs.deleteAll});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SENDGRID_IMPORT],
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
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "spamReports", label: i18n.nodes.sendgrid.getSpamReports.pin_spam_reports, type: "struct", subType: SPAM_REPORT_STRUCT_TYPE, container: "array", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async () => ({ nextExec: "exec-out", outputs: { success: false, spamReports: [], error: STUB_ERROR } }),
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySendGrid.sendGridGetSpamReports(${inputs.credentialName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, spamReports: `${v}.spamReports`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SENDGRID_IMPORT],
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
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "unsubscribes", label: i18n.nodes.sendgrid.getGlobalUnsubscribes.pin_unsubscribes, type: "struct", subType: GLOBAL_UNSUBSCRIBE_STRUCT_TYPE, container: "array", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async () => ({ nextExec: "exec-out", outputs: { success: false, unsubscribes: [], error: STUB_ERROR } }),
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySendGrid.sendGridGetGlobalUnsubscribes(${inputs.credentialName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, unsubscribes: `${v}.unsubscribes`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SENDGRID_IMPORT],
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
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "stats", label: i18n.nodes.sendgrid.getEmailStats.pin_stats, type: "struct", subType: EMAIL_STAT_STRUCT_TYPE, container: "array", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async () => ({ nextExec: "exec-out", outputs: { success: false, stats: [], error: STUB_ERROR } }),
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySendGrid.sendGridGetEmailStats(${inputs.credentialName}, ${inputs.startDate}, ${inputs.endDate});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, stats: `${v}.stats`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SENDGRID_IMPORT],
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
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "senders", label: i18n.nodes.sendgrid.getVerifiedSenders.pin_senders, type: "struct", subType: VERIFIED_SENDER_STRUCT_TYPE, container: "array", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async () => ({ nextExec: "exec-out", outputs: { success: false, senders: [], error: STUB_ERROR } }),
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySendGrid.sendGridGetVerifiedSenders(${inputs.credentialName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, senders: `${v}.senders`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SENDGRID_IMPORT],
});
