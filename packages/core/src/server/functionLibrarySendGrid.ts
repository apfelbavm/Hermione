import { SendGridManager } from "../lib/sendGridManager.ts";

/** Compile-time-only counterpart of nodes/sendgrid.ts's execute() vault lookup — the compiled/
 * deployed script has no access to the Credential Vault database, only the interpreter does, so it
 * reads the same credential's apiKey back from environment variables instead, the same
 * "HERMIONE_CRED_<NAME>_<FIELD>" naming credentialEnv.ts's applyCredentialEnvVars writes. Never
 * called by the interpreter — genuinely different credential-sourcing behavior, not duplicated logic
 * (see functionLibraryTwilio.ts for the same pattern). */
function sendGridManagerFromEnv(credentialName: string): { ok: true; manager: SendGridManager } | { ok: false; error: string } {
  const prefix = `HERMIONE_CRED_${String(credentialName)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")}`;
  const type = process.env[`${prefix}_CREDENTIAL_TYPE`];
  if (type !== "sendGridApiKey") return { ok: false, error: `Credential "${credentialName}" not found in the vault, or is not a SendGrid API Key credential` };
  return { ok: true, manager: new SendGridManager(process.env[`${prefix}_API_KEY`] || "") };
}

export async function sendGridSendEmail(credentialName: string, to: string, from: string, subject: string, text: string, html: string, cc: string, bcc: string, replyTo: string) {
  const cred = sendGridManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, messageId: "", error: cred.error };
  return cred.manager.sendEmail(to, from, subject, text, html, cc, bcc, replyTo);
}

export async function sendGridSendTemplateEmail(credentialName: string, to: string, from: string, templateId: string, dynamicTemplateDataJson: string) {
  const cred = sendGridManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, messageId: "", error: cred.error };
  return cred.manager.sendTemplateEmail(to, from, templateId, dynamicTemplateDataJson);
}

export async function sendGridSendMultiple(credentialName: string, toEmailsJson: string, from: string, subject: string, text: string, html: string) {
  const cred = sendGridManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, messageId: "", error: cred.error };
  return cred.manager.sendMultiple(toEmailsJson, from, subject, text, html);
}

export async function sendGridCreateApiKey(credentialName: string, name: string, scopesJson: string) {
  const cred = sendGridManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, apiKeyId: "", apiKeyValue: "", error: cred.error };
  return cred.manager.createApiKey(name, scopesJson);
}

export async function sendGridListApiKeys(credentialName: string) {
  const cred = sendGridManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, apiKeys: [], error: cred.error };
  return cred.manager.listApiKeys();
}

export async function sendGridDeleteApiKey(credentialName: string, apiKeyId: string) {
  const cred = sendGridManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.deleteApiKey(apiKeyId);
}

export async function sendGridUpsertContacts(credentialName: string, contactsJson: string, listIdsJson: string) {
  const cred = sendGridManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, jobId: "", error: cred.error };
  return cred.manager.upsertContacts(contactsJson, listIdsJson);
}

export async function sendGridGetContactByEmail(credentialName: string, email: string) {
  const cred = sendGridManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, contact: { id: "", email: "", firstName: "", lastName: "" }, error: cred.error };
  return cred.manager.getContactByEmail(email);
}

export async function sendGridDeleteContacts(credentialName: string, contactIdsJson: string, deleteAll: boolean) {
  const cred = sendGridManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, jobId: "", error: cred.error };
  return cred.manager.deleteContacts(contactIdsJson, deleteAll);
}

export async function sendGridCreateList(credentialName: string, name: string) {
  const cred = sendGridManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, listId: "", name: "", error: cred.error };
  return cred.manager.createList(name);
}

export async function sendGridListContactLists(credentialName: string) {
  const cred = sendGridManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, lists: [], error: cred.error };
  return cred.manager.listContactLists();
}

export async function sendGridDeleteList(credentialName: string, listId: string) {
  const cred = sendGridManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.deleteList(listId);
}

export async function sendGridGetBounces(credentialName: string, startTime: number, endTime: number) {
  const cred = sendGridManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, bounces: [], error: cred.error };
  return cred.manager.getBounces(startTime, endTime);
}

export async function sendGridDeleteBounce(credentialName: string, email: string, deleteAll: boolean) {
  const cred = sendGridManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.deleteBounce(email, deleteAll);
}

export async function sendGridGetSpamReports(credentialName: string) {
  const cred = sendGridManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, spamReports: [], error: cred.error };
  return cred.manager.getSpamReports();
}

export async function sendGridGetGlobalUnsubscribes(credentialName: string) {
  const cred = sendGridManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, unsubscribes: [], error: cred.error };
  return cred.manager.getGlobalUnsubscribes();
}

export async function sendGridGetEmailStats(credentialName: string, startDate: string, endDate: string) {
  const cred = sendGridManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, stats: [], error: cred.error };
  return cred.manager.getEmailStats(startDate, endDate);
}

export async function sendGridGetVerifiedSenders(credentialName: string) {
  const cred = sendGridManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, senders: [], error: cred.error };
  return cred.manager.getVerifiedSenders();
}
