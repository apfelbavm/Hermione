/** Thin wrapper around the official "twilio" Node SDK (https://www.twilio.com/docs/libraries/node).
 * The SDK transitively depends on Node-only packages (https-proxy-agent, jsonwebtoken, etc.) and is
 * documented by Twilio as server-side only — it must never be imported by browser-bundled code (see
 * nodes/twilio.ts's own header comment for how that's enforced, same pattern as the sftp/soap/smtp
 * connectors). Every method turns either a successful SDK response or a thrown SDK error into the
 * same plain {success, error} shape every other provider manager returns (see lib/stripeManager.ts). */
import twilio from "twilio";

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

function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

export class TwilioManager {
  private readonly client: ReturnType<typeof twilio>;

  constructor(accountSid: string, authToken: string) {
    this.client = twilio(accountSid, authToken);
  }

  async sendSms(to: string, from: string, body: string): Promise<TwilioMessageResult> {
    try {
      const msg = await this.client.messages.create({ to, from, body });
      return { success: true, sid: msg.sid, status: msg.status ?? "", error: "" };
    } catch (err) {
      return { success: false, sid: "", status: "", error: errorMessage(err) };
    }
  }

  async getMessage(messageSid: string): Promise<TwilioGetMessageResult> {
    try {
      const msg = await this.client.messages(messageSid).fetch();
      return { success: true, sid: msg.sid, status: msg.status ?? "", body: msg.body ?? "", to: msg.to ?? "", from: msg.from ?? "", dateSent: msg.dateSent ? msg.dateSent.toISOString() : "", error: "" };
    } catch (err) {
      return { success: false, sid: "", status: "", body: "", to: "", from: "", dateSent: "", error: errorMessage(err) };
    }
  }

  async listMessages(to: string, from: string, limit: number): Promise<TwilioListMessagesResult> {
    try {
      const messages = await this.client.messages.list({ ...(to ? { to } : {}), ...(from ? { from } : {}), limit: limit || 20 });
      return {
        success: true,
        messages: messages.map((m) => ({ sid: m.sid, status: m.status ?? "", body: m.body ?? "", to: m.to ?? "", from: m.from ?? "", dateSent: m.dateSent ? m.dateSent.toISOString() : "" })),
        error: "",
      };
    } catch (err) {
      return { success: false, messages: [], error: errorMessage(err) };
    }
  }

  async deleteMessage(messageSid: string): Promise<TwilioDeleteMessageResult> {
    try {
      const deleted = await this.client.messages(messageSid).remove();
      return { success: true, deleted, error: "" };
    } catch (err) {
      return { success: false, deleted: false, error: errorMessage(err) };
    }
  }

  async sendWhatsApp(to: string, from: string, body: string): Promise<TwilioMessageResult> {
    try {
      const msg = await this.client.messages.create({ to: `whatsapp:${to}`, from: `whatsapp:${from}`, body });
      return { success: true, sid: msg.sid, status: msg.status ?? "", error: "" };
    } catch (err) {
      return { success: false, sid: "", status: "", error: errorMessage(err) };
    }
  }

  async makeCall(to: string, from: string, twimlUrl: string): Promise<TwilioCallResult> {
    try {
      const call = await this.client.calls.create({ to, from, url: twimlUrl });
      return { success: true, sid: call.sid, status: call.status ?? "", error: "" };
    } catch (err) {
      return { success: false, sid: "", status: "", error: errorMessage(err) };
    }
  }

  async getCall(callSid: string): Promise<TwilioGetCallResult> {
    try {
      const call = await this.client.calls(callSid).fetch();
      return { success: true, sid: call.sid, status: call.status ?? "", duration: call.duration ?? "", to: call.to ?? "", from: call.from ?? "", error: "" };
    } catch (err) {
      return { success: false, sid: "", status: "", duration: "", to: "", from: "", error: errorMessage(err) };
    }
  }

  async listCalls(to: string, from: string, limit: number): Promise<TwilioListCallsResult> {
    try {
      const calls = await this.client.calls.list({ ...(to ? { to } : {}), ...(from ? { from } : {}), limit: limit || 20 });
      return { success: true, calls: calls.map((c) => ({ sid: c.sid, status: c.status ?? "", duration: c.duration ?? "", to: c.to ?? "", from: c.from ?? "" })), error: "" };
    } catch (err) {
      return { success: false, calls: [], error: errorMessage(err) };
    }
  }

  /** Ends an in-progress call — the Twilio SDK models "hang up" as a status update, not a
   * dedicated endpoint (see CallContextUpdateOptions's `status: "completed"`). */
  async hangupCall(callSid: string): Promise<TwilioCallResult> {
    try {
      const call = await this.client.calls(callSid).update({ status: "completed" });
      return { success: true, sid: call.sid, status: call.status ?? "", error: "" };
    } catch (err) {
      return { success: false, sid: "", status: "", error: errorMessage(err) };
    }
  }

  async lookupPhoneNumber(phoneNumber: string): Promise<TwilioLookupResult> {
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
      return { success: false, phoneNumber: "", valid: false, countryCode: "", nationalFormat: "", callerName: "", lineType: "", error: errorMessage(err) };
    }
  }
}
