import { google, type gmail_v1 } from "googleapis";
import { googleErrorMessage, serviceAccountClient, oauth2Client, type GoogleAuthClient } from "./googleAuthManager.ts";
import { getDatabaseManager } from "../server/DatabaseManager.ts";
import { resolveAllCredentials } from "../server/vaultCredentials.ts";
import type { GoogleServiceAccountCredentialData, GoogleOAuth2CredentialData } from "@hermione/shared/types";

/** Every Gmail node (list/get/send/trash messages, list/create labels, modify labels) needs the
 * same boilerplate: call one googleapis Gmail v1 route and turn either a result or a thrown
 * GaxiosError into a plain {success, error} shape. Centralized here once instead of repeated per
 * node (see nodes/google.ts). */

const SCOPES = ["https://www.googleapis.com/auth/gmail.modify"];

export interface GoogleGmailOpResult {
  success: boolean;
  error: string;
  [key: string]: unknown;
}

export interface GoogleGmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  snippet: string;
}

export interface GoogleGmailListMessagesResult extends GoogleGmailOpResult {
  messages: GoogleGmailMessage[];
}

export interface GoogleGmailMessageResult extends GoogleGmailOpResult, Partial<GoogleGmailMessage> {
  body: string;
}

export interface GoogleGmailSendResult extends GoogleGmailOpResult {
  id: string;
}

export interface GoogleGmailLabel {
  id: string;
  name: string;
}

export interface GoogleGmailListLabelsResult extends GoogleGmailOpResult {
  labels: GoogleGmailLabel[];
}

export interface GoogleGmailLabelResult extends GoogleGmailOpResult {
  id: string;
}

type ResolvedGoogleCredential = { kind: "serviceAccount"; data: GoogleServiceAccountCredentialData } | { kind: "oauth2"; data: GoogleOAuth2CredentialData };

function headerValue(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

/** A message's plain-text body may be the top-level part or nested one level under a
 * multipart/alternative wrapper — walks both cases and returns the first text/plain part found,
 * same simplification as googleDocsManager.ts's extractText. */
function extractPlainTextBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) return Buffer.from(payload.body.data, "base64").toString("utf8");
  for (const part of payload.parts ?? []) {
    const found = extractPlainTextBody(part);
    if (found) return found;
  }
  return "";
}

/** Builds an RFC 2822 message and base64url-encodes it — the raw format Gmail's messages.send
 * route requires (see https://developers.google.com/gmail/api/guides/sending). */
function buildRawMessage(to: string, subject: string, body: string): string {
  const message = [`To: ${to}`, `Subject: ${subject}`, "Content-Type: text/plain; charset=utf-8", "", body].join("\r\n");
  return Buffer.from(message).toString("base64url");
}

const managerCache = new Map<string, GoogleGmailManager>();

export class GoogleGmailManager {
  private readonly client: gmail_v1.Gmail;

  private constructor(auth: GoogleAuthClient) {
    this.client = google.gmail({ version: "v1", auth });
  }

  private static forServiceAccount(data: GoogleServiceAccountCredentialData): GoogleGmailManager {
    const key = `sa:${data.serviceAccountKeyJson}:${data.impersonateUser}`;
    let manager = managerCache.get(key);
    if (!manager) {
      manager = new GoogleGmailManager(serviceAccountClient(data, SCOPES));
      managerCache.set(key, manager);
    }
    return manager;
  }

  private static forOAuth2(data: GoogleOAuth2CredentialData): GoogleGmailManager {
    const key = `oauth2:${data.clientId}:${data.refreshToken}`;
    let manager = managerCache.get(key);
    if (!manager) {
      manager = new GoogleGmailManager(oauth2Client(data));
      managerCache.set(key, manager);
    }
    return manager;
  }

  private static getInstance(resolved: ResolvedGoogleCredential): GoogleGmailManager {
    return resolved.kind === "serviceAccount" ? GoogleGmailManager.forServiceAccount(resolved.data) : GoogleGmailManager.forOAuth2(resolved.data);
  }

  /** Looks up a named Credential Vault entry and accepts either a Google Service Account or a
   * Google OAuth2 credential — Gmail works fine under either auth flow. */
  private static async findCredential(credentialName: string): Promise<{ ok: true; resolved: ResolvedGoogleCredential } | { ok: false; error: string }> {
    const credRecord = (await resolveAllCredentials(getDatabaseManager())).get(credentialName);
    if (!credRecord) return { ok: false, error: `Credential "${credentialName}" not found in the vault` };
    if (credRecord.type === "googleServiceAccount") return { ok: true, resolved: { kind: "serviceAccount", data: credRecord.data as GoogleServiceAccountCredentialData } };
    if (credRecord.type === "googleOAuth2") return { ok: true, resolved: { kind: "oauth2", data: credRecord.data as GoogleOAuth2CredentialData } };
    return { ok: false, error: `Credential "${credentialName}" is not a Google Service Account or Google OAuth2 credential` };
  }

  static async listMessages(credentialName: string, query: string, maxResults: number): Promise<GoogleGmailListMessagesResult> {
    const cred = await GoogleGmailManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, messages: [], error: cred.error };
    return GoogleGmailManager.getInstance(cred.resolved).listMessages(query, maxResults);
  }

  static async getMessage(credentialName: string, messageId: string): Promise<GoogleGmailMessageResult> {
    const cred = await GoogleGmailManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, body: "", error: cred.error };
    return GoogleGmailManager.getInstance(cred.resolved).getMessage(messageId);
  }

  static async sendMessage(credentialName: string, to: string, subject: string, body: string): Promise<GoogleGmailSendResult> {
    const cred = await GoogleGmailManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, id: "", error: cred.error };
    return GoogleGmailManager.getInstance(cred.resolved).sendMessage(to, subject, body);
  }

  static async trashMessage(credentialName: string, messageId: string): Promise<GoogleGmailOpResult> {
    const cred = await GoogleGmailManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return GoogleGmailManager.getInstance(cred.resolved).trashMessage(messageId);
  }

  static async listLabels(credentialName: string): Promise<GoogleGmailListLabelsResult> {
    const cred = await GoogleGmailManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, labels: [], error: cred.error };
    return GoogleGmailManager.getInstance(cred.resolved).listLabels();
  }

  static async createLabel(credentialName: string, name: string): Promise<GoogleGmailLabelResult> {
    const cred = await GoogleGmailManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, id: "", error: cred.error };
    return GoogleGmailManager.getInstance(cred.resolved).createLabel(name);
  }

  static async modifyMessageLabels(credentialName: string, messageId: string, addLabelIds: string[], removeLabelIds: string[]): Promise<GoogleGmailOpResult> {
    const cred = await GoogleGmailManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return GoogleGmailManager.getInstance(cred.resolved).modifyMessageLabels(messageId, addLabelIds, removeLabelIds);
  }

  private async listMessages(query: string, maxResults: number): Promise<GoogleGmailListMessagesResult> {
    try {
      const list = await this.client.users.messages.list({ userId: "me", q: query || undefined, maxResults });
      const messages: GoogleGmailMessage[] = [];
      for (const ref of list.data.messages ?? []) {
        const msg = await this.client.users.messages.get({ userId: "me", id: ref.id!, format: "metadata", metadataHeaders: ["Subject", "From"] });
        messages.push({
          id: msg.data.id ?? "",
          threadId: msg.data.threadId ?? "",
          subject: headerValue(msg.data.payload?.headers, "Subject"),
          from: headerValue(msg.data.payload?.headers, "From"),
          snippet: msg.data.snippet ?? "",
        });
      }
      return { success: true, messages, error: "" };
    } catch (err) {
      return { success: false, messages: [], error: googleErrorMessage(err) };
    }
  }

  private async getMessage(messageId: string): Promise<GoogleGmailMessageResult> {
    try {
      const res = await this.client.users.messages.get({ userId: "me", id: messageId, format: "full" });
      return {
        success: true,
        id: res.data.id ?? "",
        threadId: res.data.threadId ?? "",
        subject: headerValue(res.data.payload?.headers, "Subject"),
        from: headerValue(res.data.payload?.headers, "From"),
        snippet: res.data.snippet ?? "",
        body: extractPlainTextBody(res.data.payload),
        error: "",
      };
    } catch (err) {
      return { success: false, body: "", error: googleErrorMessage(err) };
    }
  }

  private async sendMessage(to: string, subject: string, body: string): Promise<GoogleGmailSendResult> {
    try {
      const res = await this.client.users.messages.send({
        userId: "me",
        requestBody: { raw: buildRawMessage(to, subject, body) },
      });
      return { success: true, id: res.data.id ?? "", error: "" };
    } catch (err) {
      return { success: false, id: "", error: googleErrorMessage(err) };
    }
  }

  private async trashMessage(messageId: string): Promise<GoogleGmailOpResult> {
    try {
      await this.client.users.messages.trash({ userId: "me", id: messageId });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: googleErrorMessage(err) };
    }
  }

  private async listLabels(): Promise<GoogleGmailListLabelsResult> {
    try {
      const res = await this.client.users.labels.list({ userId: "me" });
      const labels = (res.data.labels ?? []).map((l) => ({ id: l.id ?? "", name: l.name ?? "" }));
      return { success: true, labels, error: "" };
    } catch (err) {
      return { success: false, labels: [], error: googleErrorMessage(err) };
    }
  }

  private async createLabel(name: string): Promise<GoogleGmailLabelResult> {
    try {
      const res = await this.client.users.labels.create({ userId: "me", requestBody: { name } });
      return { success: true, id: res.data.id ?? "", error: "" };
    } catch (err) {
      return { success: false, id: "", error: googleErrorMessage(err) };
    }
  }

  private async modifyMessageLabels(messageId: string, addLabelIds: string[], removeLabelIds: string[]): Promise<GoogleGmailOpResult> {
    try {
      await this.client.users.messages.modify({
        userId: "me",
        id: messageId,
        requestBody: { addLabelIds, removeLabelIds },
      });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: googleErrorMessage(err) };
    }
  }
}
