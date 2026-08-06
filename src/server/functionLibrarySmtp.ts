import { SmtpManager } from "../lib/smtpManager.ts";

/** Compile-time-only counterpart of a live vault lookup — the compiled/deployed script has no
 * access to the Credential Vault database, only the interpreter would, so this reads the same
 * credential's host/port/secure/username/password back from environment variables instead, the
 * same "HERMIONE_CRED_<NAME>_<FIELD>" naming credentialEnv.ts's applyCredentialEnvVars writes (see
 * functionLibraryTwilio.ts for the same pattern). `port` and `secure` arrive from env vars as plain
 * strings (every credential field does), so they're parsed here with Number(...) and === "true".
 * Unlike functionLibraryTwilio.ts, this file's own manager (lib/smtpManager.ts) wraps nodemailer —
 * a real TCP-socket dependency the browser bundle must never see — so nodes/smtp.ts's own execute()
 * never resolves a credential or calls into this file at all; it's a permanent honest stub (see that
 * file's header comment). This file is reachable only via compileImports, resolved at compiled-script
 * runtime. */
function smtpManagerFromEnv(credentialName: string): { ok: true; manager: SmtpManager } | { ok: false; error: string } {
  const prefix = `HERMIONE_CRED_${String(credentialName)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")}`;
  const type = process.env[`${prefix}_CREDENTIAL_TYPE`];
  if (type !== "smtpCredential") return { ok: false, error: `Credential "${credentialName}" not found in the vault, or is not an SMTP credential` };
  const host = process.env[`${prefix}_HOST`] || "";
  const port = Number(process.env[`${prefix}_PORT`]) || 0;
  const secure = process.env[`${prefix}_SECURE`] === "true";
  const username = process.env[`${prefix}_USERNAME`] || "";
  const password = process.env[`${prefix}_PASSWORD`] || "";
  return { ok: true, manager: new SmtpManager(host, port, secure, username, password) };
}

export async function smtpSendMail(credentialName: string, to: string, subject: string, text: string, html: string, cc: string, bcc: string, from: string) {
  const cred = smtpManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, messageId: "", error: cred.error };
  return cred.manager.sendMail(to, subject, text, html, cc, bcc, from);
}

export async function smtpVerifyConnection(credentialName: string) {
  const cred = smtpManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.verifyConnection();
}
