import twilio from "twilio";
import { getDatabaseManager } from "../server/DatabaseManager.ts";
import { resolveAllCredentials } from "../server/vaultCredentials.ts";
import type { TwilioApiKeyCredentialData } from "@hermione/shared/types";

export interface TwilioAuth {
  accountSid: string;
  authToken: string;
}

export interface TwilioOpResult {
  success: boolean;
  error: string;
  [key: string]: unknown;
}

export interface TwilioMessageResult extends TwilioOpResult {
  sid: string;
  status: string;
}

export interface TwilioGetMessageResult extends TwilioOpResult {
  sid: string;
  status: string;
  body: string;
  to: string;
  from: string;
  dateSent: string;
}

export interface TwilioMessage {
  sid: string;
  status: string;
  body: string;
  to: string;
  from: string;
  dateSent: string;
}

export interface TwilioListMessagesResult extends TwilioOpResult {
  messages: TwilioMessage[];
}

export interface TwilioDeleteMessageResult extends TwilioOpResult {
  deleted: boolean;
}

export interface TwilioCallResult extends TwilioOpResult {
  sid: string;
  status: string;
}

export interface TwilioGetCallResult extends TwilioOpResult {
  sid: string;
  status: string;
  duration: string;
  to: string;
  from: string;
}

export interface TwilioCall {
  sid: string;
  status: string;
  duration: string;
  to: string;
  from: string;
}

export interface TwilioListCallsResult extends TwilioOpResult {
  calls: TwilioCall[];
}

export interface TwilioLookupResult extends TwilioOpResult {
  phoneNumber: string;
  valid: boolean;
  countryCode: string;
  nationalFormat: string;
  callerName: string;
  lineType: string;
}

const managerCache = new Map<string, TwilioManager>();

export class TwilioManager {
  private readonly client: ReturnType<typeof twilio>;

  static getInstance(auth: TwilioAuth): TwilioManager {
    const key = `${auth.accountSid}:${auth.authToken}`;
    let manager = managerCache.get(key);
    if (!manager) {
      manager = new TwilioManager(auth.accountSid, auth.authToken);
      managerCache.set(key, manager);
    }
    return manager;
  }

  private constructor(accountSid: string, authToken: string) {
    this.client = twilio(accountSid, authToken);
  }

  static errorMessage(err: unknown): string {
    if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
    return String(err);
  }

  private static async findCredential(credentialName: string): Promise<{ ok: true; auth: TwilioAuth } | { ok: false; error: string }> {
    const credRecord = (await resolveAllCredentials(getDatabaseManager())).get(credentialName);
    if (!credRecord) return { ok: false, error: `Credential "${credentialName}" not found in the vault` };
    if (credRecord.type !== "twilioApiKey") return { ok: false, error: `Credential "${credentialName}" is not a Twilio API Key credential` };
    const data = credRecord.data as TwilioApiKeyCredentialData;
    return { ok: true, auth: { accountSid: data.accountSid, authToken: data.authToken } };
  }

  static async sendSms(credentialName: string, to: string, from: string, body: string): Promise<TwilioMessageResult> {
    const cred = await TwilioManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, sid: "", status: "", error: cred.error };
    return TwilioManager.getInstance(cred.auth).sendSms(to, from, body);
  }

  static async getMessage(credentialName: string, messageSid: string): Promise<TwilioGetMessageResult> {
    const cred = await TwilioManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, sid: "", status: "", body: "", to: "", from: "", dateSent: "", error: cred.error };
    return TwilioManager.getInstance(cred.auth).getMessage(messageSid);
  }

  static async listMessages(credentialName: string, to: string, from: string, limit: number): Promise<TwilioListMessagesResult> {
    const cred = await TwilioManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, messages: [], error: cred.error };
    return TwilioManager.getInstance(cred.auth).listMessages(to, from, limit);
  }

  static async deleteMessage(credentialName: string, messageSid: string): Promise<TwilioDeleteMessageResult> {
    const cred = await TwilioManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, deleted: false, error: cred.error };
    return TwilioManager.getInstance(cred.auth).deleteMessage(messageSid);
  }

  static async sendWhatsApp(credentialName: string, to: string, from: string, body: string): Promise<TwilioMessageResult> {
    const cred = await TwilioManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, sid: "", status: "", error: cred.error };
    return TwilioManager.getInstance(cred.auth).sendWhatsApp(to, from, body);
  }

  static async makeCall(credentialName: string, to: string, from: string, twimlUrl: string): Promise<TwilioCallResult> {
    const cred = await TwilioManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, sid: "", status: "", error: cred.error };
    return TwilioManager.getInstance(cred.auth).makeCall(to, from, twimlUrl);
  }

  static async getCall(credentialName: string, callSid: string): Promise<TwilioGetCallResult> {
    const cred = await TwilioManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, sid: "", status: "", duration: "", to: "", from: "", error: cred.error };
    return TwilioManager.getInstance(cred.auth).getCall(callSid);
  }

  static async listCalls(credentialName: string, to: string, from: string, limit: number): Promise<TwilioListCallsResult> {
    const cred = await TwilioManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, calls: [], error: cred.error };
    return TwilioManager.getInstance(cred.auth).listCalls(to, from, limit);
  }

  static async hangupCall(credentialName: string, callSid: string): Promise<TwilioCallResult> {
    const cred = await TwilioManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, sid: "", status: "", error: cred.error };
    return TwilioManager.getInstance(cred.auth).hangupCall(callSid);
  }

  static async lookupPhoneNumber(credentialName: string, phoneNumber: string): Promise<TwilioLookupResult> {
    const cred = await TwilioManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, phoneNumber: "", valid: false, countryCode: "", nationalFormat: "", callerName: "", lineType: "", error: cred.error };
    return TwilioManager.getInstance(cred.auth).lookupPhoneNumber(phoneNumber);
  }

  private async sendSms(to: string, from: string, body: string): Promise<TwilioMessageResult> {
    try {
      const msg = await this.client.messages.create({ to, from, body });
      return { success: true, sid: msg.sid, status: msg.status ?? "", error: "" };
    } catch (err) {
      return { success: false, sid: "", status: "", error: TwilioManager.errorMessage(err) };
    }
  }

  private async getMessage(messageSid: string): Promise<TwilioGetMessageResult> {
    try {
      const msg = await this.client.messages(messageSid).fetch();
      return { success: true, sid: msg.sid, status: msg.status ?? "", body: msg.body ?? "", to: msg.to ?? "", from: msg.from ?? "", dateSent: msg.dateSent ? msg.dateSent.toISOString() : "", error: "" };
    } catch (err) {
      return { success: false, sid: "", status: "", body: "", to: "", from: "", dateSent: "", error: TwilioManager.errorMessage(err) };
    }
  }

  private async listMessages(to: string, from: string, limit: number): Promise<TwilioListMessagesResult> {
    try {
      const messages = await this.client.messages.list({ ...(to ? { to } : {}), ...(from ? { from } : {}), limit: limit || 20 });
      return {
        success: true,
        messages: messages.map((m) => ({ sid: m.sid, status: m.status ?? "", body: m.body ?? "", to: m.to ?? "", from: m.from ?? "", dateSent: m.dateSent ? m.dateSent.toISOString() : "" })),
        error: "",
      };
    } catch (err) {
      return { success: false, messages: [], error: TwilioManager.errorMessage(err) };
    }
  }

  private async deleteMessage(messageSid: string): Promise<TwilioDeleteMessageResult> {
    try {
      const deleted = await this.client.messages(messageSid).remove();
      return { success: true, deleted, error: "" };
    } catch (err) {
      return { success: false, deleted: false, error: TwilioManager.errorMessage(err) };
    }
  }

  private async sendWhatsApp(to: string, from: string, body: string): Promise<TwilioMessageResult> {
    try {
      const msg = await this.client.messages.create({ to: `whatsapp:${to}`, from: `whatsapp:${from}`, body });
      return { success: true, sid: msg.sid, status: msg.status ?? "", error: "" };
    } catch (err) {
      return { success: false, sid: "", status: "", error: TwilioManager.errorMessage(err) };
    }
  }

  private async makeCall(to: string, from: string, twimlUrl: string): Promise<TwilioCallResult> {
    try {
      const call = await this.client.calls.create({ to, from, url: twimlUrl });
      return { success: true, sid: call.sid, status: call.status ?? "", error: "" };
    } catch (err) {
      return { success: false, sid: "", status: "", error: TwilioManager.errorMessage(err) };
    }
  }

  private async getCall(callSid: string): Promise<TwilioGetCallResult> {
    try {
      const call = await this.client.calls(callSid).fetch();
      return { success: true, sid: call.sid, status: call.status ?? "", duration: call.duration ?? "", to: call.to ?? "", from: call.from ?? "", error: "" };
    } catch (err) {
      return { success: false, sid: "", status: "", duration: "", to: "", from: "", error: TwilioManager.errorMessage(err) };
    }
  }

  private async listCalls(to: string, from: string, limit: number): Promise<TwilioListCallsResult> {
    try {
      const calls = await this.client.calls.list({ ...(to ? { to } : {}), ...(from ? { from } : {}), limit: limit || 20 });
      return { success: true, calls: calls.map((c) => ({ sid: c.sid, status: c.status ?? "", duration: c.duration ?? "", to: c.to ?? "", from: c.from ?? "" })), error: "" };
    } catch (err) {
      return { success: false, calls: [], error: TwilioManager.errorMessage(err) };
    }
  }

  /** Ends an in-progress call — the Twilio SDK models "hang up" as a status update, not a
   * dedicated endpoint (see CallContextUpdateOptions's `status: "completed"`). */
  private async hangupCall(callSid: string): Promise<TwilioCallResult> {
    try {
      const call = await this.client.calls(callSid).update({ status: "completed" });
      return { success: true, sid: call.sid, status: call.status ?? "", error: "" };
    } catch (err) {
      return { success: false, sid: "", status: "", error: TwilioManager.errorMessage(err) };
    }
  }

  private async lookupPhoneNumber(phoneNumber: string): Promise<TwilioLookupResult> {
    try {
      const result = await this.client.lookups.v2.phoneNumbers(phoneNumber).fetch({ fields: "caller_name,line_type_intelligence" });
      return {
        success: true,
        phoneNumber: result.phoneNumber ?? "",
        valid: result.valid ?? false,
        countryCode: result.countryCode ?? "",
        nationalFormat: result.nationalFormat ?? "",
        callerName: result.callerName?.callerName ?? "",
        lineType: result.lineTypeIntelligence?.type ?? "",
        error: "",
      };
    } catch (err) {
      return { success: false, phoneNumber: "", valid: false, countryCode: "", nationalFormat: "", callerName: "", lineType: "", error: TwilioManager.errorMessage(err) };
    }
  }
}
