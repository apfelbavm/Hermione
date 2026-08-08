/** Thin wrapper around the official "@sendgrid/mail" and "@sendgrid/client" Node SDKs
 * (https://github.com/sendgrid/sendgrid-nodejs). Both packages are documented by SendGrid as
 * server-side only — an API key shipped to browser-bundled code is a live credential leak (see
 * nodes/sendgrid.ts's own header comment for how that's enforced, same pattern as the
 * twilio/stripe/smtp connectors). @sendgrid/mail covers Mail Send (send/sendMultiple); every other
 * SendGrid Web API v3 operation goes through @sendgrid/client's generic request() method. Every
 * method turns either a successful SDK response or a thrown SDK error into the same plain
 * {success, error} shape every other provider manager returns. Resolves credentials straight from
 * the database itself (see findCredential), matching lib/twilioManager.ts's single-layer pattern —
 * no separate functionLibrarySendGrid.ts env-var-reading layer, no ctx.getCredential vault lookup
 * in nodes/sendgrid.ts. */
import sgMail from "@sendgrid/mail";
import sgClient from "@sendgrid/client";
import type { MailDataRequired } from "@sendgrid/helpers/classes/mail";
import { getDatabaseManager } from "../server/DatabaseManager.ts";
import { resolveAllCredentials } from "../server/vaultCredentials.ts";
import type { SendGridApiKeyCredentialData } from "@hermione/shared/types";

export interface SendGridAuth {
  apiKey: string;
}

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

function parseJsonArray<T>(json: string): T[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const managerCache = new Map<string, SendGridManager>();

export class SendGridManager {
  static getInstance(auth: SendGridAuth): SendGridManager {
    const key = auth.apiKey;
    let manager = managerCache.get(key);
    if (!manager) {
      manager = new SendGridManager(auth.apiKey);
      managerCache.set(key, manager);
    }
    return manager;
  }

  private constructor(apiKey: string) {
    sgMail.setApiKey(apiKey);
    sgClient.setApiKey(apiKey);
  }

  static errorMessage(err: unknown): string {
    if (err && typeof err === "object" && "response" in err) {
      const response = (err as { response?: { body?: { errors?: { message?: string }[] } } }).response;
      const messages = response?.body?.errors?.map((e) => e.message).filter((m): m is string => !!m);
      if (messages && messages.length > 0) return messages.join("; ");
    }
    if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
    return String(err);
  }

  private static async findCredential(credentialName: string): Promise<{ ok: true; auth: SendGridAuth } | { ok: false; error: string }> {
    const credRecord = (await resolveAllCredentials(getDatabaseManager())).get(credentialName);
    if (!credRecord) return { ok: false, error: `Credential "${credentialName}" not found in the vault` };
    if (credRecord.type !== "sendGridApiKey") return { ok: false, error: `Credential "${credentialName}" is not a SendGrid API Key credential` };
    const data = credRecord.data as SendGridApiKeyCredentialData;
    return { ok: true, auth: { apiKey: data.apiKey } };
  }

  static async sendEmail(credentialName: string, to: string, from: string, subject: string, text: string, html: string, cc: string, bcc: string, replyTo: string): Promise<SendGridSendResult> {
    const cred = await SendGridManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, messageId: "", error: cred.error };
    return SendGridManager.getInstance(cred.auth).sendEmail(to, from, subject, text, html, cc, bcc, replyTo);
  }

  static async sendTemplateEmail(credentialName: string, to: string, from: string, templateId: string, dynamicTemplateDataJson: string): Promise<SendGridSendResult> {
    const cred = await SendGridManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, messageId: "", error: cred.error };
    return SendGridManager.getInstance(cred.auth).sendTemplateEmail(to, from, templateId, dynamicTemplateDataJson);
  }

  static async sendMultiple(credentialName: string, toEmailsJson: string, from: string, subject: string, text: string, html: string): Promise<SendGridSendResult> {
    const cred = await SendGridManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, messageId: "", error: cred.error };
    return SendGridManager.getInstance(cred.auth).sendMultiple(toEmailsJson, from, subject, text, html);
  }

  static async createApiKey(credentialName: string, name: string, scopesJson: string): Promise<SendGridApiKeyResult> {
    const cred = await SendGridManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, apiKeyId: "", apiKeyValue: "", error: cred.error };
    return SendGridManager.getInstance(cred.auth).createApiKey(name, scopesJson);
  }

  static async listApiKeys(credentialName: string): Promise<SendGridListApiKeysResult> {
    const cred = await SendGridManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, apiKeys: [], error: cred.error };
    return SendGridManager.getInstance(cred.auth).listApiKeys();
  }

  static async deleteApiKey(credentialName: string, apiKeyId: string): Promise<SendGridDeleteApiKeyResult> {
    const cred = await SendGridManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return SendGridManager.getInstance(cred.auth).deleteApiKey(apiKeyId);
  }

  static async upsertContacts(credentialName: string, contactsJson: string, listIdsJson: string): Promise<SendGridUpsertContactsResult> {
    const cred = await SendGridManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, jobId: "", error: cred.error };
    return SendGridManager.getInstance(cred.auth).upsertContacts(contactsJson, listIdsJson);
  }

  static async getContactByEmail(credentialName: string, email: string): Promise<SendGridGetContactResult> {
    const cred = await SendGridManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, contact: { id: "", email: "", firstName: "", lastName: "" }, error: cred.error };
    return SendGridManager.getInstance(cred.auth).getContactByEmail(email);
  }

  static async deleteContacts(credentialName: string, contactIdsJson: string, deleteAll: boolean): Promise<SendGridDeleteContactsResult> {
    const cred = await SendGridManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, jobId: "", error: cred.error };
    return SendGridManager.getInstance(cred.auth).deleteContacts(contactIdsJson, deleteAll);
  }

  static async createList(credentialName: string, name: string): Promise<SendGridCreateListResult> {
    const cred = await SendGridManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, listId: "", name: "", error: cred.error };
    return SendGridManager.getInstance(cred.auth).createList(name);
  }

  static async listContactLists(credentialName: string): Promise<SendGridListContactListsResult> {
    const cred = await SendGridManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, lists: [], error: cred.error };
    return SendGridManager.getInstance(cred.auth).listContactLists();
  }

  static async deleteList(credentialName: string, listId: string): Promise<SendGridDeleteListResult> {
    const cred = await SendGridManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return SendGridManager.getInstance(cred.auth).deleteList(listId);
  }

  static async getBounces(credentialName: string, startTime: number, endTime: number): Promise<SendGridGetBouncesResult> {
    const cred = await SendGridManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, bounces: [], error: cred.error };
    return SendGridManager.getInstance(cred.auth).getBounces(startTime, endTime);
  }

  static async deleteBounce(credentialName: string, email: string, deleteAll: boolean): Promise<SendGridDeleteBounceResult> {
    const cred = await SendGridManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return SendGridManager.getInstance(cred.auth).deleteBounce(email, deleteAll);
  }

  static async getSpamReports(credentialName: string): Promise<SendGridGetSpamReportsResult> {
    const cred = await SendGridManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, spamReports: [], error: cred.error };
    return SendGridManager.getInstance(cred.auth).getSpamReports();
  }

  static async getGlobalUnsubscribes(credentialName: string): Promise<SendGridGetGlobalUnsubscribesResult> {
    const cred = await SendGridManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, unsubscribes: [], error: cred.error };
    return SendGridManager.getInstance(cred.auth).getGlobalUnsubscribes();
  }

  static async getEmailStats(credentialName: string, startDate: string, endDate: string): Promise<SendGridGetEmailStatsResult> {
    const cred = await SendGridManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, stats: [], error: cred.error };
    return SendGridManager.getInstance(cred.auth).getEmailStats(startDate, endDate);
  }

  static async getVerifiedSenders(credentialName: string): Promise<SendGridGetVerifiedSendersResult> {
    const cred = await SendGridManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, senders: [], error: cred.error };
    return SendGridManager.getInstance(cred.auth).getVerifiedSenders();
  }

  private async sendEmail(to: string, from: string, subject: string, text: string, html: string, cc: string, bcc: string, replyTo: string): Promise<SendGridSendResult> {
    try {
      const msg: MailDataRequired = { to, from, subject, text, html, ...(cc ? { cc } : {}), ...(bcc ? { bcc } : {}), ...(replyTo ? { replyTo } : {}) };
      const response = await sgMail.send(msg);
      return { success: true, messageId: String(response[0].headers["x-message-id"] ?? ""), error: "" };
    } catch (err) {
      return { success: false, messageId: "", error: SendGridManager.errorMessage(err) };
    }
  }

  private async sendTemplateEmail(to: string, from: string, templateId: string, dynamicTemplateDataJson: string): Promise<SendGridSendResult> {
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
      return { success: false, messageId: "", error: SendGridManager.errorMessage(err) };
    }
  }

  private async sendMultiple(toEmailsJson: string, from: string, subject: string, text: string, html: string): Promise<SendGridSendResult> {
    try {
      const emails = parseJsonArray<string>(toEmailsJson);
      const msg: MailDataRequired = { to: emails, from, subject, text, html };
      const response = await sgMail.sendMultiple(msg);
      return { success: true, messageId: String(response[0].headers["x-message-id"] ?? ""), error: "" };
    } catch (err) {
      return { success: false, messageId: "", error: SendGridManager.errorMessage(err) };
    }
  }

  private async createApiKey(name: string, scopesJson: string): Promise<SendGridApiKeyResult> {
    try {
      const scopes = parseJsonArray<string>(scopesJson);
      const [, body] = await sgClient.request({ method: "POST", url: "/v3/api_keys", body: { name, ...(scopes.length ? { scopes } : {}) } });
      return { success: true, apiKeyId: String(body.api_key_id ?? ""), apiKeyValue: String(body.api_key ?? ""), error: "" };
    } catch (err) {
      return { success: false, apiKeyId: "", apiKeyValue: "", error: SendGridManager.errorMessage(err) };
    }
  }

  private async listApiKeys(): Promise<SendGridListApiKeysResult> {
    try {
      const [, body] = await sgClient.request({ method: "GET", url: "/v3/api_keys" });
      const result: { api_key_id?: string; name?: string }[] = Array.isArray(body.result) ? body.result : [];
      return { success: true, apiKeys: result.map((k) => ({ id: String(k.api_key_id ?? ""), name: String(k.name ?? "") })), error: "" };
    } catch (err) {
      return { success: false, apiKeys: [], error: SendGridManager.errorMessage(err) };
    }
  }

  private async deleteApiKey(apiKeyId: string): Promise<SendGridDeleteApiKeyResult> {
    try {
      await sgClient.request({ method: "DELETE", url: `/v3/api_keys/${apiKeyId}` });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: SendGridManager.errorMessage(err) };
    }
  }

  private async upsertContacts(contactsJson: string, listIdsJson: string): Promise<SendGridUpsertContactsResult> {
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
      return { success: false, jobId: "", error: SendGridManager.errorMessage(err) };
    }
  }

  private async getContactByEmail(email: string): Promise<SendGridGetContactResult> {
    try {
      const query = `email LIKE '${email.replace(/'/g, "''")}'`;
      const [, body] = await sgClient.request({ method: "POST", url: "/v3/marketing/contacts/search", body: { query } });
      const found: { id?: string; email_address?: string; first_name?: string; last_name?: string } | undefined = Array.isArray(body.result) ? body.result[0] : undefined;
      const contact = found ? { id: String(found.id ?? ""), email: String(found.email_address ?? ""), firstName: String(found.first_name ?? ""), lastName: String(found.last_name ?? "") } : { id: "", email: "", firstName: "", lastName: "" };
      return { success: true, contact, error: "" };
    } catch (err) {
      return { success: false, contact: { id: "", email: "", firstName: "", lastName: "" }, error: SendGridManager.errorMessage(err) };
    }
  }

  private async deleteContacts(contactIdsJson: string, deleteAll: boolean): Promise<SendGridDeleteContactsResult> {
    try {
      if (deleteAll) {
        const [, body] = await sgClient.request({ method: "DELETE", url: "/v3/marketing/contacts?delete_all_contacts=true" });
        return { success: true, jobId: String(body.job_id ?? ""), error: "" };
      }
      const ids = parseJsonArray<string>(contactIdsJson);
      const [, body] = await sgClient.request({ method: "DELETE", url: `/v3/marketing/contacts?ids=${encodeURIComponent(ids.join(","))}` });
      return { success: true, jobId: String(body.job_id ?? ""), error: "" };
    } catch (err) {
      return { success: false, jobId: "", error: SendGridManager.errorMessage(err) };
    }
  }

  private async createList(name: string): Promise<SendGridCreateListResult> {
    try {
      const [, body] = await sgClient.request({ method: "POST", url: "/v3/marketing/lists", body: { name } });
      return { success: true, listId: String(body.id ?? ""), name: String(body.name ?? ""), error: "" };
    } catch (err) {
      return { success: false, listId: "", name: "", error: SendGridManager.errorMessage(err) };
    }
  }

  private async listContactLists(): Promise<SendGridListContactListsResult> {
    try {
      const [, body] = await sgClient.request({ method: "GET", url: "/v3/marketing/lists" });
      const result: { id?: string; name?: string; contact_count?: number }[] = Array.isArray(body.result) ? body.result : [];
      return { success: true, lists: result.map((l) => ({ id: String(l.id ?? ""), name: String(l.name ?? ""), contactCount: Number(l.contact_count ?? 0) })), error: "" };
    } catch (err) {
      return { success: false, lists: [], error: SendGridManager.errorMessage(err) };
    }
  }

  private async deleteList(listId: string): Promise<SendGridDeleteListResult> {
    try {
      await sgClient.request({ method: "DELETE", url: `/v3/marketing/lists/${listId}` });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: SendGridManager.errorMessage(err) };
    }
  }

  private async getBounces(startTime: number, endTime: number): Promise<SendGridGetBouncesResult> {
    try {
      const qs: { start_time?: number; end_time?: number } = {};
      if (startTime > 0) qs.start_time = startTime;
      if (endTime > 0) qs.end_time = endTime;
      const [, body] = await sgClient.request({ method: "GET", url: "/v3/suppression/bounces", qs });
      const result: { email?: string; reason?: string; status?: string; created?: number }[] = Array.isArray(body) ? body : [];
      return { success: true, bounces: result.map((b) => ({ email: String(b.email ?? ""), reason: String(b.reason ?? ""), status: String(b.status ?? ""), createdAt: b.created ? new Date(b.created * 1000).toISOString() : "" })), error: "" };
    } catch (err) {
      return { success: false, bounces: [], error: SendGridManager.errorMessage(err) };
    }
  }

  private async deleteBounce(email: string, deleteAll: boolean): Promise<SendGridDeleteBounceResult> {
    try {
      if (deleteAll) {
        await sgClient.request({ method: "DELETE", url: "/v3/suppression/bounces", body: { delete_all: true } });
      } else {
        await sgClient.request({ method: "DELETE", url: `/v3/suppression/bounces/${email}` });
      }
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: SendGridManager.errorMessage(err) };
    }
  }

  private async getSpamReports(): Promise<SendGridGetSpamReportsResult> {
    try {
      const [, body] = await sgClient.request({ method: "GET", url: "/v3/suppression/spam_reports" });
      const result: { email?: string; created?: number }[] = Array.isArray(body) ? body : [];
      return { success: true, spamReports: result.map((s) => ({ email: String(s.email ?? ""), createdAt: s.created ? new Date(s.created * 1000).toISOString() : "" })), error: "" };
    } catch (err) {
      return { success: false, spamReports: [], error: SendGridManager.errorMessage(err) };
    }
  }

  private async getGlobalUnsubscribes(): Promise<SendGridGetGlobalUnsubscribesResult> {
    try {
      const [, body] = await sgClient.request({ method: "GET", url: "/v3/suppression/unsubscribes" });
      const result: { email?: string; created?: number }[] = Array.isArray(body) ? body : [];
      return { success: true, unsubscribes: result.map((u) => ({ email: String(u.email ?? ""), createdAt: u.created ? new Date(u.created * 1000).toISOString() : "" })), error: "" };
    } catch (err) {
      return { success: false, unsubscribes: [], error: SendGridManager.errorMessage(err) };
    }
  }

  private async getEmailStats(startDate: string, endDate: string): Promise<SendGridGetEmailStatsResult> {
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
      return { success: false, stats: [], error: SendGridManager.errorMessage(err) };
    }
  }

  private async getVerifiedSenders(): Promise<SendGridGetVerifiedSendersResult> {
    try {
      const [, body] = await sgClient.request({ method: "GET", url: "/v3/verified_senders" });
      const result: { id?: string | number; nickname?: string; from_email?: string; verified?: boolean }[] = Array.isArray(body.results) ? body.results : [];
      return { success: true, senders: result.map((s) => ({ id: String(s.id ?? ""), nickname: String(s.nickname ?? ""), fromEmail: String(s.from_email ?? ""), verified: !!s.verified })), error: "" };
    } catch (err) {
      return { success: false, senders: [], error: SendGridManager.errorMessage(err) };
    }
  }
}
