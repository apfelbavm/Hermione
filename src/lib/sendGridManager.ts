/** Thin wrapper around the official "@sendgrid/mail" and "@sendgrid/client" Node SDKs
 * (https://github.com/sendgrid/sendgrid-nodejs). Both packages are documented by SendGrid as
 * server-side only — an API key shipped to browser-bundled code is a live credential leak (see
 * nodes/sendgrid.ts's own header comment for how that's enforced, same pattern as the
 * twilio/stripe/smtp connectors). @sendgrid/mail covers Mail Send (send/sendMultiple); every other
 * SendGrid Web API v3 operation goes through @sendgrid/client's generic request() method. Every
 * method turns either a successful SDK response or a thrown SDK error into the same plain
 * {success, error} shape every other provider manager returns (see lib/twilioManager.ts). */
import sgMail from "@sendgrid/mail";
import sgClient from "@sendgrid/client";
import type { MailDataRequired } from "@sendgrid/helpers/classes/mail";

export interface SendGridOpResult {
  success: boolean;
  error: string;
  [key: string]: unknown;
}

export interface SendGridSendResult extends SendGridOpResult {
  messageId: string;
}

export interface SendGridApiKeyResult extends SendGridOpResult {
  apiKeyId: string;
  apiKeyValue: string;
}

export interface SendGridApiKeySummary {
  id: string;
  name: string;
}

export interface SendGridListApiKeysResult extends SendGridOpResult {
  apiKeys: SendGridApiKeySummary[];
}

export interface SendGridDeleteApiKeyResult extends SendGridOpResult {}

export interface SendGridUpsertContactsResult extends SendGridOpResult {
  jobId: string;
}

export interface SendGridContact {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface SendGridGetContactResult extends SendGridOpResult {
  contact: SendGridContact;
}

export interface SendGridDeleteContactsResult extends SendGridOpResult {
  jobId: string;
}

export interface SendGridCreateListResult extends SendGridOpResult {
  listId: string;
  name: string;
}

export interface SendGridContactList {
  id: string;
  name: string;
  contactCount: number;
}

export interface SendGridListContactListsResult extends SendGridOpResult {
  lists: SendGridContactList[];
}

export interface SendGridDeleteListResult extends SendGridOpResult {}

export interface SendGridBounceEvent {
  email: string;
  reason: string;
  status: string;
  createdAt: string;
}

export interface SendGridGetBouncesResult extends SendGridOpResult {
  bounces: SendGridBounceEvent[];
}

export interface SendGridDeleteBounceResult extends SendGridOpResult {}

export interface SendGridSpamReport {
  email: string;
  createdAt: string;
}

export interface SendGridGetSpamReportsResult extends SendGridOpResult {
  spamReports: SendGridSpamReport[];
}

export interface SendGridGlobalUnsubscribe {
  email: string;
  createdAt: string;
}

export interface SendGridGetGlobalUnsubscribesResult extends SendGridOpResult {
  unsubscribes: SendGridGlobalUnsubscribe[];
}

export interface SendGridEmailStat {
  date: string;
  requests: number;
  delivered: number;
  opens: number;
  clicks: number;
  bounces: number;
  spamReports: number;
}

export interface SendGridGetEmailStatsResult extends SendGridOpResult {
  stats: SendGridEmailStat[];
}

export interface SendGridVerifiedSender {
  id: string;
  nickname: string;
  fromEmail: string;
  verified: boolean;
}

export interface SendGridGetVerifiedSendersResult extends SendGridOpResult {
  senders: SendGridVerifiedSender[];
}

function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "response" in err) {
    const response = (err as { response?: { body?: { errors?: { message?: string }[] } } }).response;
    const messages = response?.body?.errors?.map((e) => e.message).filter((m): m is string => !!m);
    if (messages && messages.length > 0) return messages.join("; ");
  }
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

function parseJsonArray<T>(json: string): T[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export class SendGridManager {
  constructor(apiKey: string) {
    sgMail.setApiKey(apiKey);
    sgClient.setApiKey(apiKey);
  }

  async sendEmail(to: string, from: string, subject: string, text: string, html: string, cc: string, bcc: string, replyTo: string): Promise<SendGridSendResult> {
    try {
      const msg: MailDataRequired = { to, from, subject, text, html, ...(cc ? { cc } : {}), ...(bcc ? { bcc } : {}), ...(replyTo ? { replyTo } : {}) };
      const response = await sgMail.send(msg);
      return { success: true, messageId: String(response[0].headers["x-message-id"] ?? ""), error: "" };
    } catch (err) {
      return { success: false, messageId: "", error: errorMessage(err) };
    }
  }

  async sendTemplateEmail(to: string, from: string, templateId: string, dynamicTemplateDataJson: string): Promise<SendGridSendResult> {
    try {
      let dynamicTemplateData: Record<string, unknown> = {};
      try {
        dynamicTemplateData = dynamicTemplateDataJson ? JSON.parse(dynamicTemplateDataJson) : {};
      } catch {
        dynamicTemplateData = {};
      }
      const msg: MailDataRequired = { to, from, templateId, dynamicTemplateData };
      const response = await sgMail.send(msg);
      return { success: true, messageId: String(response[0].headers["x-message-id"] ?? ""), error: "" };
    } catch (err) {
      return { success: false, messageId: "", error: errorMessage(err) };
    }
  }

  async sendMultiple(toEmailsJson: string, from: string, subject: string, text: string, html: string): Promise<SendGridSendResult> {
    try {
      const emails = parseJsonArray<string>(toEmailsJson);
      const msg: MailDataRequired = { to: emails, from, subject, text, html };
      const response = await sgMail.sendMultiple(msg);
      return { success: true, messageId: String(response[0].headers["x-message-id"] ?? ""), error: "" };
    } catch (err) {
      return { success: false, messageId: "", error: errorMessage(err) };
    }
  }

  async createApiKey(name: string, scopesJson: string): Promise<SendGridApiKeyResult> {
    try {
      const scopes = parseJsonArray<string>(scopesJson);
      const [, body] = await sgClient.request({ method: "POST", url: "/v3/api_keys", body: { name, ...(scopes.length ? { scopes } : {}) } });
      return { success: true, apiKeyId: String(body.api_key_id ?? ""), apiKeyValue: String(body.api_key ?? ""), error: "" };
    } catch (err) {
      return { success: false, apiKeyId: "", apiKeyValue: "", error: errorMessage(err) };
    }
  }

  async listApiKeys(): Promise<SendGridListApiKeysResult> {
    try {
      const [, body] = await sgClient.request({ method: "GET", url: "/v3/api_keys" });
      const result: { api_key_id?: string; name?: string }[] = Array.isArray(body.result) ? body.result : [];
      return { success: true, apiKeys: result.map((k) => ({ id: String(k.api_key_id ?? ""), name: String(k.name ?? "") })), error: "" };
    } catch (err) {
      return { success: false, apiKeys: [], error: errorMessage(err) };
    }
  }

  async deleteApiKey(apiKeyId: string): Promise<SendGridDeleteApiKeyResult> {
    try {
      await sgClient.request({ method: "DELETE", url: `/v3/api_keys/${apiKeyId}` });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }

  async upsertContacts(contactsJson: string, listIdsJson: string): Promise<SendGridUpsertContactsResult> {
    try {
      const rawContacts = parseJsonArray<Record<string, unknown>>(contactsJson);
      const contacts = rawContacts.map((c) => {
        const { firstName, lastName, ...rest } = c as { firstName?: unknown; lastName?: unknown; [key: string]: unknown };
        return { ...rest, ...(firstName !== undefined ? { first_name: firstName } : {}), ...(lastName !== undefined ? { last_name: lastName } : {}) };
      });
      const listIds = parseJsonArray<string>(listIdsJson);
      const [, body] = await sgClient.request({ method: "PUT", url: "/v3/marketing/contacts", body: { ...(listIds.length ? { list_ids: listIds } : {}), contacts } });
      return { success: true, jobId: String(body.job_id ?? ""), error: "" };
    } catch (err) {
      return { success: false, jobId: "", error: errorMessage(err) };
    }
  }

  async getContactByEmail(email: string): Promise<SendGridGetContactResult> {
    try {
      const query = `email LIKE '${email.replace(/'/g, "''")}'`;
      const [, body] = await sgClient.request({ method: "POST", url: "/v3/marketing/contacts/search", body: { query } });
      const found: { id?: string; email_address?: string; first_name?: string; last_name?: string } | undefined = Array.isArray(body.result) ? body.result[0] : undefined;
      const contact = found ? { id: String(found.id ?? ""), email: String(found.email_address ?? ""), firstName: String(found.first_name ?? ""), lastName: String(found.last_name ?? "") } : { id: "", email: "", firstName: "", lastName: "" };
      return { success: true, contact, error: "" };
    } catch (err) {
      return { success: false, contact: { id: "", email: "", firstName: "", lastName: "" }, error: errorMessage(err) };
    }
  }

  async deleteContacts(contactIdsJson: string, deleteAll: boolean): Promise<SendGridDeleteContactsResult> {
    try {
      if (deleteAll) {
        const [, body] = await sgClient.request({ method: "DELETE", url: "/v3/marketing/contacts?delete_all_contacts=true" });
        return { success: true, jobId: String(body.job_id ?? ""), error: "" };
      }
      const ids = parseJsonArray<string>(contactIdsJson);
      const [, body] = await sgClient.request({ method: "DELETE", url: `/v3/marketing/contacts?ids=${encodeURIComponent(ids.join(","))}` });
      return { success: true, jobId: String(body.job_id ?? ""), error: "" };
    } catch (err) {
      return { success: false, jobId: "", error: errorMessage(err) };
    }
  }

  async createList(name: string): Promise<SendGridCreateListResult> {
    try {
      const [, body] = await sgClient.request({ method: "POST", url: "/v3/marketing/lists", body: { name } });
      return { success: true, listId: String(body.id ?? ""), name: String(body.name ?? ""), error: "" };
    } catch (err) {
      return { success: false, listId: "", name: "", error: errorMessage(err) };
    }
  }

  async listContactLists(): Promise<SendGridListContactListsResult> {
    try {
      const [, body] = await sgClient.request({ method: "GET", url: "/v3/marketing/lists" });
      const result: { id?: string; name?: string; contact_count?: number }[] = Array.isArray(body.result) ? body.result : [];
      return { success: true, lists: result.map((l) => ({ id: String(l.id ?? ""), name: String(l.name ?? ""), contactCount: Number(l.contact_count ?? 0) })), error: "" };
    } catch (err) {
      return { success: false, lists: [], error: errorMessage(err) };
    }
  }

  async deleteList(listId: string): Promise<SendGridDeleteListResult> {
    try {
      await sgClient.request({ method: "DELETE", url: `/v3/marketing/lists/${listId}` });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }

  async getBounces(startTime: number, endTime: number): Promise<SendGridGetBouncesResult> {
    try {
      const qs: { start_time?: number; end_time?: number } = {};
      if (startTime > 0) qs.start_time = startTime;
      if (endTime > 0) qs.end_time = endTime;
      const [, body] = await sgClient.request({ method: "GET", url: "/v3/suppression/bounces", qs });
      const result: { email?: string; reason?: string; status?: string; created?: number }[] = Array.isArray(body) ? body : [];
      return { success: true, bounces: result.map((b) => ({ email: String(b.email ?? ""), reason: String(b.reason ?? ""), status: String(b.status ?? ""), createdAt: b.created ? new Date(b.created * 1000).toISOString() : "" })), error: "" };
    } catch (err) {
      return { success: false, bounces: [], error: errorMessage(err) };
    }
  }

  async deleteBounce(email: string, deleteAll: boolean): Promise<SendGridDeleteBounceResult> {
    try {
      if (deleteAll) {
        await sgClient.request({ method: "DELETE", url: "/v3/suppression/bounces", body: { delete_all: true } });
      } else {
        await sgClient.request({ method: "DELETE", url: `/v3/suppression/bounces/${email}` });
      }
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }

  async getSpamReports(): Promise<SendGridGetSpamReportsResult> {
    try {
      const [, body] = await sgClient.request({ method: "GET", url: "/v3/suppression/spam_reports" });
      const result: { email?: string; created?: number }[] = Array.isArray(body) ? body : [];
      return { success: true, spamReports: result.map((s) => ({ email: String(s.email ?? ""), createdAt: s.created ? new Date(s.created * 1000).toISOString() : "" })), error: "" };
    } catch (err) {
      return { success: false, spamReports: [], error: errorMessage(err) };
    }
  }

  async getGlobalUnsubscribes(): Promise<SendGridGetGlobalUnsubscribesResult> {
    try {
      const [, body] = await sgClient.request({ method: "GET", url: "/v3/suppression/unsubscribes" });
      const result: { email?: string; created?: number }[] = Array.isArray(body) ? body : [];
      return { success: true, unsubscribes: result.map((u) => ({ email: String(u.email ?? ""), createdAt: u.created ? new Date(u.created * 1000).toISOString() : "" })), error: "" };
    } catch (err) {
      return { success: false, unsubscribes: [], error: errorMessage(err) };
    }
  }

  async getEmailStats(startDate: string, endDate: string): Promise<SendGridGetEmailStatsResult> {
    try {
      const qs: { start_date: string; end_date?: string; aggregated_by: string } = { start_date: startDate, aggregated_by: "day", ...(endDate ? { end_date: endDate } : {}) };
      const [, body] = await sgClient.request({ method: "GET", url: "/v3/stats", qs });
      type StatsMetrics = { requests?: number; delivered?: number; opens?: number; clicks?: number; bounces?: number; spam_reports?: number };
      const result: { date?: string; stats?: { metrics?: StatsMetrics }[] }[] = Array.isArray(body) ? body : [];
      const stats = result.map((row) => {
        const metrics: StatsMetrics = row.stats?.[0]?.metrics ?? {};
        return {
          date: String(row.date ?? ""),
          requests: Number(metrics.requests ?? 0),
          delivered: Number(metrics.delivered ?? 0),
          opens: Number(metrics.opens ?? 0),
          clicks: Number(metrics.clicks ?? 0),
          bounces: Number(metrics.bounces ?? 0),
          spamReports: Number(metrics.spam_reports ?? 0),
        };
      });
      return { success: true, stats, error: "" };
    } catch (err) {
      return { success: false, stats: [], error: errorMessage(err) };
    }
  }

  async getVerifiedSenders(): Promise<SendGridGetVerifiedSendersResult> {
    try {
      const [, body] = await sgClient.request({ method: "GET", url: "/v3/verified_senders" });
      const result: { id?: string | number; nickname?: string; from_email?: string; verified?: boolean }[] = Array.isArray(body.results) ? body.results : [];
      return { success: true, senders: result.map((s) => ({ id: String(s.id ?? ""), nickname: String(s.nickname ?? ""), fromEmail: String(s.from_email ?? ""), verified: !!s.verified })), error: "" };
    } catch (err) {
      return { success: false, senders: [], error: errorMessage(err) };
    }
  }
}
