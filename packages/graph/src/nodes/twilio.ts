import { NodeColorCategory } from "@hermione/graph/engine/types";
import { registerNode } from "@hermione/graph/engine/registry";
import { compileResultVar, TWILIO_MANAGER_IMPORT } from "@hermione/graph/engine/compileUtils";
import { MESSAGE_STRUCT_TYPE, CALL_STRUCT_TYPE } from "@hermione/graph/structs/twilio";
import { i18n } from "@i18n";

// Every operation below calls the exact same TwilioManager static method (packages/core/src/lib/
// twilioManager.ts) from both execute() (interpreter path) and compileExecute() (compiled/deployed
// path) — TwilioManager resolves the named credential straight from the database itself (see its
// resolveCredential), so unlike most other providers there is no separate functionLibraryTwilio.ts
// env-var-reading layer and no ctx.getCredential vault lookup here: both paths are already identical.
//
// TwilioManager now reaches the database directly (see its own header comment), which pulls in
// better-sqlite3 and Node builtins — fine for execute(), which only ever runs server-side, but this
// file is still statically imported client-side too (for the node-creation menu), so a plain
// top-level import here would drag that whole chain into the browser bundle. Loaded with a runtime
// `import()` instead, ignored by both bundlers, so it's never even resolved for the client build;
// only ever actually called server-side, where it resolves normally.
async function loadTwilioManager(): Promise<typeof import("@hermione/core/lib/twilioManager").TwilioManager> {
  const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "@hermione/core/lib/twilioManager");
  return mod.TwilioManager;
}

const GROUP_NAME = "Request.Twilio";

function credentialNamePin() {
  return { id: "credentialName", label: i18n.nodes.twilio.__shared.pin_credential_name, type: "string" as const, direction: "input" as const, defaultValue: "" };
}

const emptyMessage = { sid: "", status: "", body: "", to: "", from: "", dateSent: "" };

registerNode({
  type: "twilio.sendSms",
  label: i18n.nodes.twilio.sendSms.label,
  description: i18n.nodes.twilio.sendSms.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "to", label: i18n.nodes.twilio.sendSms.pin_to, type: "string", direction: "input", defaultValue: "" },
    { id: "from", label: i18n.nodes.twilio.sendSms.pin_from, type: "string", direction: "input", defaultValue: "" },
    { id: "body", label: i18n.nodes.twilio.sendSms.pin_body, type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "sid", label: i18n.nodes.twilio.sendSms.pin_sid, type: "string", direction: "output" },
    { id: "status", label: i18n.nodes.twilio.sendSms.pin_status, type: "string", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadTwilioManager()).sendSms(String(inputs.credentialName ?? ""), String(inputs.to ?? ""), String(inputs.from ?? ""), String(inputs.body ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await TwilioManager.sendSms(${inputs.credentialName}, ${inputs.to}, ${inputs.from}, ${inputs.body});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, sid: `${v}.sid`, status: `${v}.status`, error: `${v}.error` };
  },
  compileImports: [TWILIO_MANAGER_IMPORT],
});

registerNode({
  type: "twilio.getMessage",
  label: i18n.nodes.twilio.getMessage.label,
  description: i18n.nodes.twilio.getMessage.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "messageSid", label: i18n.nodes.twilio.getMessage.pin_message_sid, type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "message", label: i18n.nodes.twilio.getMessage.pin_message, type: "struct", subType: MESSAGE_STRUCT_TYPE, direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadTwilioManager()).getMessage(String(inputs.credentialName ?? ""), String(inputs.messageSid ?? ""));
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        message: result.success ? { sid: result.sid, status: result.status, body: result.body, to: result.to, from: result.from, dateSent: result.dateSent } : emptyMessage,
        error: result.error,
      },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await TwilioManager.getMessage(${inputs.credentialName}, ${inputs.messageSid});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return {
      success: `${v}.success`,
      message: `(${v}.success ? { sid: ${v}.sid, status: ${v}.status, body: ${v}.body, to: ${v}.to, from: ${v}.from, dateSent: ${v}.dateSent } : { sid: "", status: "", body: "", to: "", from: "", dateSent: "" })`,
      error: `${v}.error`,
    };
  },
  compileImports: [TWILIO_MANAGER_IMPORT],
});

registerNode({
  type: "twilio.listMessages",
  label: i18n.nodes.twilio.listMessages.label,
  description: i18n.nodes.twilio.listMessages.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "to", label: i18n.nodes.twilio.listMessages.pin_to, type: "string", direction: "input", defaultValue: "" },
    { id: "from", label: i18n.nodes.twilio.listMessages.pin_from, type: "string", direction: "input", defaultValue: "" },
    { id: "limit", label: i18n.nodes.twilio.listMessages.pin_limit, type: "number", direction: "input", defaultValue: 20 },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "messages", label: i18n.nodes.twilio.listMessages.pin_messages, type: "struct", subType: MESSAGE_STRUCT_TYPE, container: "array", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadTwilioManager()).listMessages(String(inputs.credentialName ?? ""), String(inputs.to ?? ""), String(inputs.from ?? ""), Number(inputs.limit) || 20);
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await TwilioManager.listMessages(${inputs.credentialName}, ${inputs.to}, ${inputs.from}, ${inputs.limit});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, messages: `${v}.messages`, error: `${v}.error` };
  },
  compileImports: [TWILIO_MANAGER_IMPORT],
});

registerNode({
  type: "twilio.deleteMessage",
  label: i18n.nodes.twilio.deleteMessage.label,
  description: i18n.nodes.twilio.deleteMessage.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "messageSid", label: i18n.nodes.twilio.deleteMessage.pin_message_sid, type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "deleted", label: i18n.nodes.twilio.deleteMessage.pin_deleted, type: "boolean", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadTwilioManager()).deleteMessage(String(inputs.credentialName ?? ""), String(inputs.messageSid ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await TwilioManager.deleteMessage(${inputs.credentialName}, ${inputs.messageSid});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, deleted: `${v}.deleted`, error: `${v}.error` };
  },
  compileImports: [TWILIO_MANAGER_IMPORT],
});

registerNode({
  type: "twilio.makeCall",
  label: i18n.nodes.twilio.makeCall.label,
  description: i18n.nodes.twilio.makeCall.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "to", label: i18n.nodes.twilio.makeCall.pin_to, type: "string", direction: "input", defaultValue: "" },
    { id: "from", label: i18n.nodes.twilio.makeCall.pin_from, type: "string", direction: "input", defaultValue: "" },
    { id: "twimlUrl", label: i18n.nodes.twilio.makeCall.pin_twiml_url, type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "sid", label: i18n.nodes.twilio.makeCall.pin_sid, type: "string", direction: "output" },
    { id: "status", label: i18n.nodes.twilio.makeCall.pin_status, type: "string", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadTwilioManager()).makeCall(String(inputs.credentialName ?? ""), String(inputs.to ?? ""), String(inputs.from ?? ""), String(inputs.twimlUrl ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await TwilioManager.makeCall(${inputs.credentialName}, ${inputs.to}, ${inputs.from}, ${inputs.twimlUrl});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, sid: `${v}.sid`, status: `${v}.status`, error: `${v}.error` };
  },
  compileImports: [TWILIO_MANAGER_IMPORT],
});

registerNode({
  type: "twilio.getCall",
  label: i18n.nodes.twilio.getCall.label,
  description: i18n.nodes.twilio.getCall.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "callSid", label: i18n.nodes.twilio.getCall.pin_call_sid, type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "status", label: i18n.nodes.twilio.getCall.pin_status, type: "string", direction: "output" },
    { id: "duration", label: i18n.nodes.twilio.getCall.pin_duration, type: "number", direction: "output" },
    { id: "to", label: i18n.nodes.twilio.getCall.pin_to, type: "string", direction: "output" },
    { id: "from", label: i18n.nodes.twilio.getCall.pin_from, type: "string", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadTwilioManager()).getCall(String(inputs.credentialName ?? ""), String(inputs.callSid ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, status: result.status, duration: Number(result.duration) || 0, to: result.to, from: result.from, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await TwilioManager.getCall(${inputs.credentialName}, ${inputs.callSid});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, status: `${v}.status`, duration: `(Number(${v}.duration) || 0)`, to: `${v}.to`, from: `${v}.from`, error: `${v}.error` };
  },
  compileImports: [TWILIO_MANAGER_IMPORT],
});

registerNode({
  type: "twilio.sendWhatsApp",
  label: i18n.nodes.twilio.sendWhatsApp.label,
  description: i18n.nodes.twilio.sendWhatsApp.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "to", label: i18n.nodes.twilio.sendWhatsApp.pin_to, type: "string", direction: "input", defaultValue: "" },
    { id: "from", label: i18n.nodes.twilio.sendWhatsApp.pin_from, type: "string", direction: "input", defaultValue: "" },
    { id: "body", label: i18n.nodes.twilio.sendWhatsApp.pin_body, type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "sid", label: i18n.nodes.twilio.sendWhatsApp.pin_sid, type: "string", direction: "output" },
    { id: "status", label: i18n.nodes.twilio.sendWhatsApp.pin_status, type: "string", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadTwilioManager()).sendWhatsApp(String(inputs.credentialName ?? ""), String(inputs.to ?? ""), String(inputs.from ?? ""), String(inputs.body ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await TwilioManager.sendWhatsApp(${inputs.credentialName}, ${inputs.to}, ${inputs.from}, ${inputs.body});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, sid: `${v}.sid`, status: `${v}.status`, error: `${v}.error` };
  },
  compileImports: [TWILIO_MANAGER_IMPORT],
});

registerNode({
  type: "twilio.listCalls",
  label: i18n.nodes.twilio.listCalls.label,
  description: i18n.nodes.twilio.listCalls.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "to", label: i18n.nodes.twilio.listCalls.pin_to, type: "string", direction: "input", defaultValue: "" },
    { id: "from", label: i18n.nodes.twilio.listCalls.pin_from, type: "string", direction: "input", defaultValue: "" },
    { id: "limit", label: i18n.nodes.twilio.listCalls.pin_limit, type: "number", direction: "input", defaultValue: 20 },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "calls", label: i18n.nodes.twilio.listCalls.pin_calls, type: "struct", subType: CALL_STRUCT_TYPE, container: "array", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadTwilioManager()).listCalls(String(inputs.credentialName ?? ""), String(inputs.to ?? ""), String(inputs.from ?? ""), Number(inputs.limit) || 20);
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await TwilioManager.listCalls(${inputs.credentialName}, ${inputs.to}, ${inputs.from}, ${inputs.limit});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, calls: `${v}.calls`, error: `${v}.error` };
  },
  compileImports: [TWILIO_MANAGER_IMPORT],
});

registerNode({
  type: "twilio.hangupCall",
  label: i18n.nodes.twilio.hangupCall.label,
  description: i18n.nodes.twilio.hangupCall.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "callSid", label: i18n.nodes.twilio.hangupCall.pin_call_sid, type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "status", label: i18n.nodes.twilio.hangupCall.pin_status, type: "string", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadTwilioManager()).hangupCall(String(inputs.credentialName ?? ""), String(inputs.callSid ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, status: result.status, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await TwilioManager.hangupCall(${inputs.credentialName}, ${inputs.callSid});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, status: `${v}.status`, error: `${v}.error` };
  },
  compileImports: [TWILIO_MANAGER_IMPORT],
});

registerNode({
  type: "twilio.lookupPhoneNumber",
  label: i18n.nodes.twilio.lookupPhoneNumber.label,
  description: i18n.nodes.twilio.lookupPhoneNumber.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "phoneNumber", label: i18n.nodes.twilio.lookupPhoneNumber.pin_phone_number, type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "valid", label: i18n.nodes.twilio.lookupPhoneNumber.pin_valid, type: "boolean", direction: "output" },
    { id: "countryCode", label: i18n.nodes.twilio.lookupPhoneNumber.pin_country_code, type: "string", direction: "output" },
    { id: "nationalFormat", label: i18n.nodes.twilio.lookupPhoneNumber.pin_national_format, type: "string", direction: "output" },
    { id: "callerName", label: i18n.nodes.twilio.lookupPhoneNumber.pin_caller_name, type: "string", direction: "output" },
    { id: "lineType", label: i18n.nodes.twilio.lookupPhoneNumber.pin_line_type, type: "string", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadTwilioManager()).lookupPhoneNumber(String(inputs.credentialName ?? ""), String(inputs.phoneNumber ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await TwilioManager.lookupPhoneNumber(${inputs.credentialName}, ${inputs.phoneNumber});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, valid: `${v}.valid`, countryCode: `${v}.countryCode`, nationalFormat: `${v}.nationalFormat`, callerName: `${v}.callerName`, lineType: `${v}.lineType`, error: `${v}.error` };
  },
  compileImports: [TWILIO_MANAGER_IMPORT],
});
