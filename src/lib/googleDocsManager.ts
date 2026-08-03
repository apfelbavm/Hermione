import { google, type docs_v1 } from "googleapis";
import { googleErrorMessage, serviceAccountClient, oauth2Client, type GoogleAuthClient } from "./googleAuthManager.ts";
import type { GoogleServiceAccountCredentialData, GoogleOAuth2CredentialData } from "../credentials/types";

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

  static forServiceAccount(data: GoogleServiceAccountCredentialData): GoogleDocsManager {
    const key = `sa:${data.serviceAccountKeyJson}:${data.impersonateUser}`;
    let manager = managerCache.get(key);
    if (!manager) {
      manager = new GoogleDocsManager(serviceAccountClient(data, SCOPES));
      managerCache.set(key, manager);
    }
    return manager;
  }

  static forOAuth2(data: GoogleOAuth2CredentialData): GoogleDocsManager {
    const key = `oauth2:${data.clientId}:${data.refreshToken}`;
    let manager = managerCache.get(key);
    if (!manager) {
      manager = new GoogleDocsManager(oauth2Client(data));
      managerCache.set(key, manager);
    }
    return manager;
  }

  async createDocument(title: string): Promise<GoogleDocsCreateResult> {
    try {
      const res = await this.client.documents.create({ requestBody: { title } });
      return { success: true, documentId: res.data.documentId ?? "", error: "" };
    } catch (err) {
      return { success: false, documentId: "", error: googleErrorMessage(err) };
    }
  }

  async getText(documentId: string): Promise<GoogleDocsTextResult> {
    try {
      const res = await this.client.documents.get({ documentId });
      return { success: true, text: extractText(res.data), error: "" };
    } catch (err) {
      return { success: false, text: "", error: googleErrorMessage(err) };
    }
  }

  async appendText(documentId: string, text: string): Promise<GoogleDocsOpResult> {
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

  async insertText(documentId: string, text: string, index: number): Promise<GoogleDocsOpResult> {
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

  async replaceAllText(documentId: string, find: string, replacement: string, matchCase: boolean): Promise<GoogleDocsOpResult> {
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
