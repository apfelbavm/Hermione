import { TwilioManager } from "../lib/twilioManager.ts";

/** Compile-time-only counterpart of nodes/twilio.ts's execute() vault lookup (resolveTwilioCredential)
 * — the compiled/deployed script has no access to the Credential Vault database, only the
 * interpreter does, so it reads the same credential's accountSid/authToken back from environment
 * variables instead, the same "HERMIONE_CRED_<NAME>_<FIELD>" naming credentialEnv.ts's
 * applyCredentialEnvVars writes. Never called by the interpreter — genuinely different
 * credential-sourcing behavior, not duplicated logic (see functionLibraryStripe.ts for the same
 * pattern). */
function twilioManagerFromEnv(credentialName: string): { ok: true; manager: TwilioManager } | { ok: false; error: string } {
  const prefix = `HERMIONE_CRED_${String(credentialName)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")}`;
  const type = process.env[`${prefix}_CREDENTIAL_TYPE`];
  if (type !== "twilioApiKey") return { ok: false, error: `Credential "${credentialName}" not found in the vault, or is not a Twilio API Key credential` };
  return { ok: true, manager: new TwilioManager(process.env[`${prefix}_ACCOUNT_SID`] || "", process.env[`${prefix}_AUTH_TOKEN`] || "") };
}

export async function twilioSendSms(credentialName: string, to: string, from: string, body: string) {
  const cred = twilioManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, sid: "", status: "", error: cred.error };
  return cred.manager.sendSms(to, from, body);
}

export async function twilioGetMessage(credentialName: string, messageSid: string) {
  const cred = twilioManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, sid: "", status: "", body: "", to: "", from: "", dateSent: "", error: cred.error };
  return cred.manager.getMessage(messageSid);
}

export async function twilioListMessages(credentialName: string, to: string, from: string, limit: number) {
  const cred = twilioManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, messages: [], error: cred.error };
  return cred.manager.listMessages(to, from, limit);
}

export async function twilioDeleteMessage(credentialName: string, messageSid: string) {
  const cred = twilioManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, deleted: false, error: cred.error };
  return cred.manager.deleteMessage(messageSid);
}

export async function twilioMakeCall(credentialName: string, to: string, from: string, twimlUrl: string) {
  const cred = twilioManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, sid: "", status: "", error: cred.error };
  return cred.manager.makeCall(to, from, twimlUrl);
}

export async function twilioGetCall(credentialName: string, callSid: string) {
  const cred = twilioManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, sid: "", status: "", duration: "", to: "", from: "", error: cred.error };
  return cred.manager.getCall(callSid);
}

export async function twilioListCalls(credentialName: string, to: string, from: string, limit: number) {
  const cred = twilioManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, calls: [], error: cred.error };
  return cred.manager.listCalls(to, from, limit);
}

export async function twilioHangupCall(credentialName: string, callSid: string) {
  const cred = twilioManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, sid: "", status: "", error: cred.error };
  return cred.manager.hangupCall(callSid);
}

export async function twilioSendWhatsApp(credentialName: string, to: string, from: string, body: string) {
  const cred = twilioManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, sid: "", status: "", error: cred.error };
  return cred.manager.sendWhatsApp(to, from, body);
}

export async function twilioLookupPhoneNumber(credentialName: string, phoneNumber: string) {
  const cred = twilioManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, phoneNumber: "", valid: false, countryCode: "", nationalFormat: "", callerName: "", lineType: "", error: cred.error };
  return cred.manager.lookupPhoneNumber(phoneNumber);
}
