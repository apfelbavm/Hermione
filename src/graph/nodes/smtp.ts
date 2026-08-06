import { registerNode } from "../engine/registry";
import { compileResultVar, FUNCTION_LIBRARY_SMTP_IMPORT } from "../engine/compileUtils";
import { i18n } from "@i18n";

function credentialNamePin() {
  return { id: "credentialName", label: i18n.nodes.smtp.__shared.pin_credential_name, type: "string" as const, direction: "input" as const, defaultValue: "" };
}

// Sends mail over raw SMTP (via nodemailer) — a real TCP socket connection, which a browser tab has
// no API for at all (no raw sockets), unlike http.request (`fetch`) or the XML/CSV nodes (pure JS
// parsers). Exactly the same situation as sftp.ts's upload node (see that file's own header
// comment for the fuller explanation): there is no browser equivalent to fall back to, so this is
// another node type whose own execute() below is a permanent, honest stub — it always reports
// failure with a clear explanation instead of pretending to try, and the REAL implementation exists
// only for the compiled path.
// Auth is the credentialName vault-lookup convention every other provider node uses (see twilio.ts),
// NOT raw pins like sftp.ts — SMTP servers are still just host/port/user/pass, so the credential
// vault fits naturally, unlike SFTP's optional privateKey/passphrase combination. But because the
// real send only ever happens compiled (never live in this editor), execute() never resolves the
// credential at all, unlike twilio.ts's live vault lookup.
//
// The real logic lives in src/server/functionLibrarySmtp.ts, NOT the shared functionLibrary.ts every
// other live-capable node uses — deliberately, since it depends on "nodemailer" (via
// lib/smtpManager.ts), a package this project itself never needs installed for its own live use
// (nothing here can run it live) and doesn't want pulled into the interpreter/browser bundle. This
// file therefore never statically imports it; the compiled path reaches it purely via compileImports
// below, resolved only when the deployed script itself runs.
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
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "messageId", label: i18n.nodes.smtp.sendMail.pin_message_id, type: "string", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  // Always fails, honestly and immediately — see this file's own header comment for why a real
  // attempt is never possible here. Still fires exec-out exactly once (never throws), same
  // convention as every other latent node in this engine.
  execute: async () => ({
    nextExec: "exec-out",
    outputs: {
      success: false,
      messageId: "",
      error: 'SMTP Send Mail only runs in the compiled output (under Node.js) — the in-browser "Run" button cannot open a raw SMTP socket. Compile this graph and run the generated script to actually send mail.',
    },
  }),
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmtp.smtpSendMail(${inputs.credentialName}, ${inputs.to}, ${inputs.subject}, ${inputs.text}, ${inputs.html}, ${inputs.cc}, ${inputs.bcc}, ${inputs.from});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return {
      success: `${v}.success`,
      messageId: `${v}.messageId`,
      error: `${v}.error`,
    };
  },
  // "nodemailer" is a real Node dependency this project itself never needs (nothing here can run it
  // live) — it only needs to be `npm install`ed alongside the COMPILED .mjs. functionLibrarySmtp.ts
  // itself imports it (via lib/smtpManager.ts); this line just makes that module reachable from the
  // compiled script.
  compileImports: [FUNCTION_LIBRARY_SMTP_IMPORT],
});

registerNode({
  type: "smtp.verifyConnection",
  label: i18n.nodes.smtp.verifyConnection.label,
  description: i18n.nodes.smtp.verifyConnection.description,
  group: "Request",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  // Always fails, honestly and immediately — same reasoning as smtp.sendMail above.
  execute: async () => ({
    nextExec: "exec-out",
    outputs: {
      success: false,
      error: 'SMTP Verify Connection only runs in the compiled output (under Node.js) — the in-browser "Run" button cannot open a raw SMTP socket. Compile this graph and run the generated script to actually test the credentials.',
    },
  }),
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmtp.smtpVerifyConnection(${inputs.credentialName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return {
      success: `${v}.success`,
      error: `${v}.error`,
    };
  },
  compileImports: [FUNCTION_LIBRARY_SMTP_IMPORT],
});
