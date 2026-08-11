import { registerNode } from "@hermione/graph/engine/registry";
import { compileResultVar, SMTP_MANAGER_IMPORT, RETRY_HELPER_IMPORT } from "@hermione/graph/engine/compileUtils";
import { withRetry } from "@hermione/core/lib/retry";
import { retryCountPin, retryDelayMsPin, attemptsPin } from "@hermione/graph/nodes/shared/retryPins";
import { i18n } from "@i18n";

// SmtpManager (packages/core/src/lib/smtpManager.ts) wraps nodemailer, which opens a raw TCP socket
// (net.Socket) to talk SMTP directly — no browser API for that at all, unlike http.request (`fetch`)
// or the XML/CSV nodes (pure JS parsers). So although this file's execute() below now resolves the
// credential and calls SmtpManager exactly like every other provider node (see twilio.ts), it can
// never actually succeed in-browser — nodemailer itself throws immediately with no Node TCP stack to
// use. It's loaded via a runtime `import()` (see loadSmtpManager below), the exact same pattern as
// twilio.ts's loadTwilioManager, so the browser bundle never even resolves the nodemailer dependency
// chain; only the compiled/deployed path (compileExecute, always server-side under Node.js) can ever
// really send mail.
async function loadSmtpManager(): Promise<typeof import("@hermione/core/lib/smtpManager").SmtpManager> {
  const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "@hermione/core/lib/smtpManager");
  return mod.SmtpManager;
}

function credentialNamePin() {
  return { id: "credentialName", label: i18n.nodes.smtp.__shared.pin_credential_name, type: "string" as const, direction: "input" as const, defaultValue: "" };
}

registerNode({
  type: "smtp.sendMail",
  label: i18n.nodes.smtp.sendMail.label,
  description: i18n.nodes.smtp.sendMail.description,
  group: "Request",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "to", label: i18n.nodes.smtp.sendMail.pin_to, type: "string", direction: "input", defaultValue: "" },
    { id: "subject", label: i18n.nodes.smtp.sendMail.pin_subject, type: "string", direction: "input", defaultValue: "" },
    { id: "text", label: i18n.nodes.smtp.sendMail.pin_text, type: "string", direction: "input", defaultValue: "" },
    { id: "html", label: i18n.nodes.smtp.sendMail.pin_html, type: "string", direction: "input", defaultValue: "" },
    { id: "cc", label: i18n.nodes.smtp.sendMail.pin_cc, type: "string", direction: "input", defaultValue: "" },
    { id: "bcc", label: i18n.nodes.smtp.sendMail.pin_bcc, type: "string", direction: "input", defaultValue: "" },
    { id: "from", label: i18n.nodes.smtp.sendMail.pin_from, type: "string", direction: "input", defaultValue: "" },
    retryCountPin(),
    retryDelayMsPin(),
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "messageId", label: i18n.nodes.smtp.sendMail.pin_message_id, type: "string", direction: "output" },
    attemptsPin(),
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await withRetry(
      async () => (await loadSmtpManager()).sendMail(String(inputs.credentialName ?? ""), String(inputs.to ?? ""), String(inputs.subject ?? ""), String(inputs.text ?? ""), String(inputs.html ?? ""), String(inputs.cc ?? ""), String(inputs.bcc ?? ""), String(inputs.from ?? "")),
      Number(inputs.retryCount ?? 0),
      Number(inputs.retryDelayMs ?? 0),
    );
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await withRetry(() => SmtpManager.sendMail(${inputs.credentialName}, ${inputs.to}, ${inputs.subject}, ${inputs.text}, ${inputs.html}, ${inputs.cc}, ${inputs.bcc}, ${inputs.from}), ${inputs.retryCount}, ${inputs.retryDelayMs});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return {
      success: `${v}.success`,
      messageId: `${v}.messageId`,
      attempts: `${v}.attempts`,
      error: `${v}.error`,
    };
  },
  compileImports: [SMTP_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
});

registerNode({
  type: "smtp.verifyConnection",
  label: i18n.nodes.smtp.verifyConnection.label,
  description: i18n.nodes.smtp.verifyConnection.description,
  group: "Request",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    retryCountPin(),
    retryDelayMsPin(),
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    attemptsPin(),
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await withRetry(async () => (await loadSmtpManager()).verifyConnection(String(inputs.credentialName ?? "")), Number(inputs.retryCount ?? 0), Number(inputs.retryDelayMs ?? 0));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await withRetry(() => SmtpManager.verifyConnection(${inputs.credentialName}), ${inputs.retryCount}, ${inputs.retryDelayMs});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return {
      success: `${v}.success`,
      attempts: `${v}.attempts`,
      error: `${v}.error`,
    };
  },
  compileImports: [SMTP_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
});
