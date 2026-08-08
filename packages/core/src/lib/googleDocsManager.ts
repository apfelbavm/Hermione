import { google, type docs_v1 } from "googleapis";
import { googleErrorMessage, serviceAccountClient, oauth2Client, type GoogleAuthClient } from "./googleAuthManager.ts";
import { getDatabaseManager } from "../server/DatabaseManager.ts";
import { resolveAllCredentials } from "../server/vaultCredentials.ts";
import type { GoogleServiceAccountCredentialData, GoogleOAuth2CredentialData } from "@hermione/shared/types";

/** Every Google Docs node (create, get text, insert/append/replace text) needs the same
 * boilerplate: call one googleapis Docs v1 route and turn either a result or a thrown GaxiosError
 * into a plain {success, error} shape. Centralized here once instead of repeated per node (see
 * nodes/google.ts). */

const SCOPES = ["https://www.googleapis.com/auth/documents"];

export interface GoogleDocsOpResult {
  success: boolean;
  error: string;
  [key: string]: unknown;
}

export interface GoogleDocsCreateResult extends GoogleDocsOpResult {
  documentId: string;
}

export interface GoogleDocsTextResult extends GoogleDocsOpResult {
  text: string;
}

type ResolvedGoogleCredential = { kind: "serviceAccount"; data: GoogleServiceAccountCredentialData } | { kind: "oauth2"; data: GoogleOAuth2CredentialData };

/** Docs represents body text as a tree of structural elements — flattens it to the plain text a
 * node's output pin can show, same simplification jiraManager.ts does for Atlassian Document
 * Format comments/descriptions. */
function extractText(document: docs_v1.Schema$Document): string {
  let text = "";
  for (const element of document.body?.content ?? []) {
    for (const run of element.paragraph?.elements ?? []) {
      text += run.textRun?.content ?? "";
    }
  }
  return text;
}

/** Docs' insert/append routes address positions by character index, not line/paragraph — the end
 * of the document body is always (endIndex of the last structural element) - 1, since the final
 * index is reserved for the implicit trailing newline. */
function endOfDocumentIndex(document: docs_v1.Schema$Document): number {
  const content = document.body?.content ?? [];
  const last = content[content.length - 1];
  return Math.max(1, (last?.endIndex ?? 1) - 1);
}

const managerCache = new Map<string, GoogleDocsManager>();

export class GoogleDocsManager {
  private readonly client: docs_v1.Docs;

  private constructor(auth: GoogleAuthClient) {
    this.client = google.docs({ version: "v1", auth });
  }

  private static forServiceAccount(data: GoogleServiceAccountCredentialData): GoogleDocsManager {
    const key = `sa:${data.serviceAccountKeyJson}:${data.impersonateUser}`;
    let manager = managerCache.get(key);
    if (!manager) {
      manager = new GoogleDocsManager(serviceAccountClient(data, SCOPES));
      managerCache.set(key, manager);
    }
    return manager;
  }

  private static forOAuth2(data: GoogleOAuth2CredentialData): GoogleDocsManager {
    const key = `oauth2:${data.clientId}:${data.refreshToken}`;
    let manager = managerCache.get(key);
    if (!manager) {
      manager = new GoogleDocsManager(oauth2Client(data));
      managerCache.set(key, manager);
    }
    return manager;
  }

  private static getInstance(resolved: ResolvedGoogleCredential): GoogleDocsManager {
    return resolved.kind === "serviceAccount" ? GoogleDocsManager.forServiceAccount(resolved.data) : GoogleDocsManager.forOAuth2(resolved.data);
  }

  /** Looks up a named Credential Vault entry and accepts either a Google Service Account or a
   * Google OAuth2 credential — Docs works fine under either auth flow. */
  private static async findCredential(credentialName: string): Promise<{ ok: true; resolved: ResolvedGoogleCredential } | { ok: false; error: string }> {
    const credRecord = (await resolveAllCredentials(getDatabaseManager())).get(credentialName);
    if (!credRecord) return { ok: false, error: `Credential "${credentialName}" not found in the vault` };
    if (credRecord.type === "googleServiceAccount") return { ok: true, resolved: { kind: "serviceAccount", data: credRecord.data as GoogleServiceAccountCredentialData } };
    if (credRecord.type === "googleOAuth2") return { ok: true, resolved: { kind: "oauth2", data: credRecord.data as GoogleOAuth2CredentialData } };
    return { ok: false, error: `Credential "${credentialName}" is not a Google Service Account or Google OAuth2 credential` };
  }

  static async createDocument(credentialName: string, title: string): Promise<GoogleDocsCreateResult> {
    const cred = await GoogleDocsManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, documentId: "", error: cred.error };
    return GoogleDocsManager.getInstance(cred.resolved).createDocument(title);
  }

  static async getText(credentialName: string, documentId: string): Promise<GoogleDocsTextResult> {
    const cred = await GoogleDocsManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, text: "", error: cred.error };
    return GoogleDocsManager.getInstance(cred.resolved).getText(documentId);
  }

  static async appendText(credentialName: string, documentId: string, text: string): Promise<GoogleDocsOpResult> {
    const cred = await GoogleDocsManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return GoogleDocsManager.getInstance(cred.resolved).appendText(documentId, text);
  }

  static async insertText(credentialName: string, documentId: string, text: string, index: number): Promise<GoogleDocsOpResult> {
    const cred = await GoogleDocsManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return GoogleDocsManager.getInstance(cred.resolved).insertText(documentId, text, index);
  }

  static async replaceAllText(credentialName: string, documentId: string, find: string, replacement: string, matchCase: boolean): Promise<GoogleDocsOpResult> {
    const cred = await GoogleDocsManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return GoogleDocsManager.getInstance(cred.resolved).replaceAllText(documentId, find, replacement, matchCase);
  }

  private async createDocument(title: string): Promise<GoogleDocsCreateResult> {
    try {
      const res = await this.client.documents.create({ requestBody: { title } });
      return { success: true, documentId: res.data.documentId ?? "", error: "" };
    } catch (err) {
      return { success: false, documentId: "", error: googleErrorMessage(err) };
    }
  }

  private async getText(documentId: string): Promise<GoogleDocsTextResult> {
    try {
      const res = await this.client.documents.get({ documentId });
      return { success: true, text: extractText(res.data), error: "" };
    } catch (err) {
      return { success: false, text: "", error: googleErrorMessage(err) };
    }
  }

  private async appendText(documentId: string, text: string): Promise<GoogleDocsOpResult> {
    try {
      const doc = await this.client.documents.get({ documentId });
      await this.client.documents.batchUpdate({
        documentId,
        requestBody: { requests: [{ insertText: { text, location: { index: endOfDocumentIndex(doc.data) } } }] },
      });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: googleErrorMessage(err) };
    }
  }

  private async insertText(documentId: string, text: string, index: number): Promise<GoogleDocsOpResult> {
    try {
      await this.client.documents.batchUpdate({
        documentId,
        requestBody: { requests: [{ insertText: { text, location: { index } } }] },
      });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: googleErrorMessage(err) };
    }
  }

  private async replaceAllText(documentId: string, find: string, replacement: string, matchCase: boolean): Promise<GoogleDocsOpResult> {
    try {
      await this.client.documents.batchUpdate({
        documentId,
        requestBody: { requests: [{ replaceAllText: { containsText: { text: find, matchCase }, replaceText: replacement } }] },
      });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: googleErrorMessage(err) };
    }
  }
}
