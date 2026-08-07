import { GoogleDriveManager } from "../lib/googleDriveManager.ts";
import { GoogleSheetsManager } from "../lib/googleSheetsManager.ts";
import { GoogleDocsManager } from "../lib/googleDocsManager.ts";
import { GoogleGmailManager } from "../lib/googleGmailManager.ts";
import { GoogleCalendarManager } from "../lib/googleCalendarManager.ts";
import { GoogleAdminManager } from "../lib/googleAdminManager.ts";
import { exchangeAuthCode } from "../lib/googleAuthManager.ts";
import type { GoogleServiceAccountCredentialData, GoogleOAuth2CredentialData } from "@hermione/shared/types";

type ResolvedGoogleCredential = { kind: "serviceAccount"; data: GoogleServiceAccountCredentialData } | { kind: "oauth2"; data: GoogleOAuth2CredentialData };

function envPrefix(name: string): string {
  return `HERMIONE_CRED_${String(name)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")}`;
}

/** Compile-time-only counterpart of nodes/google.ts's execute() vault lookup
 * (resolveGoogleCredential) — the compiled/deployed script has no access to the Credential Vault
 * database, only the interpreter does, so it reads the same credential's fields from environment
 * variables instead, keyed by the `_CREDENTIAL_TYPE` suffix credentialEnv.ts's
 * applyCredentialEnvVars also writes (Google, like Jira/GitHub, accepts more than one credential
 * shape). Never called by the interpreter — genuinely different credential-sourcing behavior, not
 * duplicated logic. */
export function googleCredentialFromEnv(name: string): { ok: true; resolved: ResolvedGoogleCredential } | { ok: false; error: string } {
  const prefix = envPrefix(name);
  const type = process.env[`${prefix}_CREDENTIAL_TYPE`];
  if (type === "googleServiceAccount") {
    return { ok: true, resolved: { kind: "serviceAccount", data: { serviceAccountKeyJson: process.env[`${prefix}_SERVICE_ACCOUNT_KEY_JSON`] || "", impersonateUser: process.env[`${prefix}_IMPERSONATE_USER`] || "" } } };
  }
  if (type === "googleOAuth2") {
    return {
      ok: true,
      resolved: {
        kind: "oauth2",
        data: {
          clientId: process.env[`${prefix}_CLIENT_ID`] || "",
          clientSecret: process.env[`${prefix}_CLIENT_SECRET`] || "",
          redirectUri: process.env[`${prefix}_REDIRECT_URI`] || "",
          authCode: process.env[`${prefix}_AUTH_CODE`] || "",
          refreshToken: process.env[`${prefix}_REFRESH_TOKEN`] || "",
        },
      },
    };
  }
  return { ok: false, error: `Credential "${name}" not found in the vault, or is not a Google Service Account/OAuth2 credential` };
}

/** Compile-time-only counterpart of nodes/google.ts's resolveGoogleServiceAccountCredential —
 * narrows googleCredentialFromEnv's result the same way, since the Admin SDK Directory API only
 * ever accepts a service account with domain-wide delegation. */
function googleServiceAccountCredentialFromEnv(name: string): { ok: true; data: GoogleServiceAccountCredentialData } | { ok: false; error: string } {
  const resolved = googleCredentialFromEnv(name);
  if (!resolved.ok) return resolved;
  if (resolved.resolved.kind !== "serviceAccount") return { ok: false, error: `Credential "${name}" must be a Google Service Account credential (Admin SDK requires domain-wide delegation)` };
  return { ok: true, data: resolved.resolved.data };
}

function googleOAuth2CredentialFromEnv(name: string): { ok: true; data: GoogleOAuth2CredentialData } | { ok: false; error: string } {
  const resolved = googleCredentialFromEnv(name);
  if (!resolved.ok) return resolved;
  if (resolved.resolved.kind !== "oauth2") return { ok: false, error: `Credential "${name}" is not a Google OAuth2 credential` };
  return { ok: true, data: resolved.resolved.data };
}

function driveManagerFor(resolved: ResolvedGoogleCredential): GoogleDriveManager {
  return resolved.kind === "serviceAccount" ? GoogleDriveManager.forServiceAccount(resolved.data) : GoogleDriveManager.forOAuth2(resolved.data);
}

function sheetsManagerFor(resolved: ResolvedGoogleCredential): GoogleSheetsManager {
  return resolved.kind === "serviceAccount" ? GoogleSheetsManager.forServiceAccount(resolved.data) : GoogleSheetsManager.forOAuth2(resolved.data);
}

function docsManagerFor(resolved: ResolvedGoogleCredential): GoogleDocsManager {
  return resolved.kind === "serviceAccount" ? GoogleDocsManager.forServiceAccount(resolved.data) : GoogleDocsManager.forOAuth2(resolved.data);
}

function gmailManagerFor(resolved: ResolvedGoogleCredential): GoogleGmailManager {
  return resolved.kind === "serviceAccount" ? GoogleGmailManager.forServiceAccount(resolved.data) : GoogleGmailManager.forOAuth2(resolved.data);
}

function calendarManagerFor(resolved: ResolvedGoogleCredential): GoogleCalendarManager {
  return resolved.kind === "serviceAccount" ? GoogleCalendarManager.forServiceAccount(resolved.data) : GoogleCalendarManager.forOAuth2(resolved.data);
}

// -------------------------------------------------------------------------------------------
// Auth
// -------------------------------------------------------------------------------------------

export async function googleAuthorize(credentialName: string) {
  const cred = googleOAuth2CredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, tokens: { accessToken: "", refreshToken: "", expiresIn: 0 }, error: cred.error };
  const result = await exchangeAuthCode(cred.data.authCode, cred.data.clientId, cred.data.clientSecret, cred.data.redirectUri);
  return { success: result.success, tokens: { accessToken: result.accessToken, refreshToken: result.refreshToken, expiresIn: result.expiresIn }, error: result.error };
}

// -------------------------------------------------------------------------------------------
// Drive
// -------------------------------------------------------------------------------------------

const emptyDriveFile = { id: "", name: "", mimeType: "", isFolder: false, size: 0, webViewLink: "" };

export async function googleDriveListFiles(credentialName: string, query: string, pageSize: number) {
  const cred = googleCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, files: [], error: cred.error };
  return driveManagerFor(cred.resolved).listFiles(query, pageSize);
}

export async function googleDriveGetFile(credentialName: string, fileId: string) {
  const cred = googleCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, file: emptyDriveFile, error: cred.error };
  const result = await driveManagerFor(cred.resolved).getFile(fileId);
  return { success: result.success, file: { id: result.id ?? "", name: result.name ?? "", mimeType: result.mimeType ?? "", isFolder: result.isFolder ?? false, size: result.size ?? 0, webViewLink: result.webViewLink ?? "" }, error: result.error };
}

export async function googleDriveUploadFile(credentialName: string, name: string, parentFolderId: string, mimeType: string, content: string, encoding: "utf8" | "base64") {
  const cred = googleCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, file: emptyDriveFile, error: cred.error };
  const result = await driveManagerFor(cred.resolved).uploadFile(name, parentFolderId, mimeType, content, encoding);
  return { success: result.success, file: { id: result.id ?? "", name: result.name ?? "", mimeType: result.mimeType ?? "", isFolder: result.isFolder ?? false, size: result.size ?? 0, webViewLink: result.webViewLink ?? "" }, error: result.error };
}

export async function googleDriveUpdateFileContent(credentialName: string, fileId: string, mimeType: string, content: string, encoding: "utf8" | "base64") {
  const cred = googleCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return driveManagerFor(cred.resolved).updateFileContent(fileId, mimeType, content, encoding);
}

export async function googleDriveDownloadFile(credentialName: string, fileId: string, encoding: "utf8" | "base64") {
  const cred = googleCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, content: "", error: cred.error };
  return driveManagerFor(cred.resolved).downloadFile(fileId, encoding);
}

export async function googleDriveCreateFolder(credentialName: string, name: string, parentFolderId: string) {
  const cred = googleCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, file: emptyDriveFile, error: cred.error };
  const result = await driveManagerFor(cred.resolved).createFolder(name, parentFolderId);
  return { success: result.success, file: { id: result.id ?? "", name: result.name ?? "", mimeType: result.mimeType ?? "", isFolder: result.isFolder ?? false, size: result.size ?? 0, webViewLink: result.webViewLink ?? "" }, error: result.error };
}

export async function googleDriveCopyFile(credentialName: string, fileId: string, newName: string, destinationFolderId: string) {
  const cred = googleCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, file: emptyDriveFile, error: cred.error };
  const result = await driveManagerFor(cred.resolved).copyFile(fileId, newName, destinationFolderId);
  return { success: result.success, file: { id: result.id ?? "", name: result.name ?? "", mimeType: result.mimeType ?? "", isFolder: result.isFolder ?? false, size: result.size ?? 0, webViewLink: result.webViewLink ?? "" }, error: result.error };
}

export async function googleDriveMoveFile(credentialName: string, fileId: string, destinationFolderId: string) {
  const cred = googleCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return driveManagerFor(cred.resolved).moveFile(fileId, destinationFolderId);
}

export async function googleDriveRenameFile(credentialName: string, fileId: string, newName: string) {
  const cred = googleCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return driveManagerFor(cred.resolved).renameFile(fileId, newName);
}

export async function googleDriveDeleteFile(credentialName: string, fileId: string) {
  const cred = googleCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return driveManagerFor(cred.resolved).deleteFile(fileId);
}

export async function googleDriveShareFile(credentialName: string, fileId: string, role: string, type: string, emailAddress: string) {
  const cred = googleCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, id: "", error: cred.error };
  return driveManagerFor(cred.resolved).shareFile(fileId, role, type, emailAddress);
}

export async function googleDriveListPermissions(credentialName: string, fileId: string) {
  const cred = googleCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, permissions: [], error: cred.error };
  return driveManagerFor(cred.resolved).listPermissions(fileId);
}

export async function googleDriveDeletePermission(credentialName: string, fileId: string, permissionId: string) {
  const cred = googleCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return driveManagerFor(cred.resolved).deletePermission(fileId, permissionId);
}

// -------------------------------------------------------------------------------------------
// Sheets
// -------------------------------------------------------------------------------------------

export async function googleSheetsGetValues(credentialName: string, spreadsheetId: string, range: string) {
  const cred = googleCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, valuesJson: "[]", error: cred.error };
  return sheetsManagerFor(cred.resolved).getValues(spreadsheetId, range);
}

export async function googleSheetsUpdateValues(credentialName: string, spreadsheetId: string, range: string, valuesJson: string) {
  const cred = googleCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, updatedCells: 0, error: cred.error };
  return sheetsManagerFor(cred.resolved).updateValues(spreadsheetId, range, valuesJson);
}

export async function googleSheetsAppendValues(credentialName: string, spreadsheetId: string, range: string, valuesJson: string) {
  const cred = googleCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, updatedCells: 0, error: cred.error };
  return sheetsManagerFor(cred.resolved).appendValues(spreadsheetId, range, valuesJson);
}

export async function googleSheetsClearValues(credentialName: string, spreadsheetId: string, range: string) {
  const cred = googleCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return sheetsManagerFor(cred.resolved).clearValues(spreadsheetId, range);
}

export async function googleSheetsCreateSpreadsheet(credentialName: string, title: string) {
  const cred = googleCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, spreadsheetId: "", spreadsheetUrl: "", error: cred.error };
  return sheetsManagerFor(cred.resolved).createSpreadsheet(title);
}

export async function googleSheetsAddSheet(credentialName: string, spreadsheetId: string, title: string) {
  const cred = googleCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, sheetId: 0, error: cred.error };
  return sheetsManagerFor(cred.resolved).addSheet(spreadsheetId, title);
}

export async function googleSheetsDeleteSheet(credentialName: string, spreadsheetId: string, sheetId: number) {
  const cred = googleCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return sheetsManagerFor(cred.resolved).deleteSheet(spreadsheetId, sheetId);
}

export async function googleSheetsGetMetadata(credentialName: string, spreadsheetId: string) {
  const cred = googleCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, title: "", sheetTitlesJson: "[]", error: cred.error };
  return sheetsManagerFor(cred.resolved).getMetadata(spreadsheetId);
}

// -------------------------------------------------------------------------------------------
// Docs
// -------------------------------------------------------------------------------------------

export async function googleDocsCreateDocument(credentialName: string, title: string) {
  const cred = googleCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, documentId: "", error: cred.error };
  return docsManagerFor(cred.resolved).createDocument(title);
}

export async function googleDocsGetText(credentialName: string, documentId: string) {
  const cred = googleCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, text: "", error: cred.error };
  return docsManagerFor(cred.resolved).getText(documentId);
}

export async function googleDocsAppendText(credentialName: string, documentId: string, text: string) {
  const cred = googleCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return docsManagerFor(cred.resolved).appendText(documentId, text);
}

export async function googleDocsInsertText(credentialName: string, documentId: string, text: string, index: number) {
  const cred = googleCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return docsManagerFor(cred.resolved).insertText(documentId, text, index);
}

export async function googleDocsReplaceAllText(credentialName: string, documentId: string, find: string, replacement: string, matchCase: boolean) {
  const cred = googleCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return docsManagerFor(cred.resolved).replaceAllText(documentId, find, replacement, matchCase);
}

// -------------------------------------------------------------------------------------------
// Gmail
// -------------------------------------------------------------------------------------------

export async function googleGmailListMessages(credentialName: string, query: string, maxResults: number) {
  const cred = googleCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, messages: [], error: cred.error };
  return gmailManagerFor(cred.resolved).listMessages(query, maxResults);
}

export async function googleGmailGetMessage(credentialName: string, messageId: string) {
  const cred = googleCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, subject: "", from: "", snippet: "", body: "", error: cred.error };
  const result = await gmailManagerFor(cred.resolved).getMessage(messageId);
  return { success: result.success, subject: result.subject ?? "", from: result.from ?? "", snippet: result.snippet ?? "", body: result.body, error: result.error };
}

export async function googleGmailSendMessage(credentialName: string, to: string, subject: string, body: string) {
  const cred = googleCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, id: "", error: cred.error };
  return gmailManagerFor(cred.resolved).sendMessage(to, subject, body);
}

export async function googleGmailTrashMessage(credentialName: string, messageId: string) {
  const cred = googleCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return gmailManagerFor(cred.resolved).trashMessage(messageId);
}

export async function googleGmailListLabels(credentialName: string) {
  const cred = googleCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, labels: [], error: cred.error };
  return gmailManagerFor(cred.resolved).listLabels();
}

export async function googleGmailCreateLabel(credentialName: string, name: string) {
  const cred = googleCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, id: "", error: cred.error };
  return gmailManagerFor(cred.resolved).createLabel(name);
}

export async function googleGmailModifyMessageLabels(credentialName: string, messageId: string, addLabelIds: string, removeLabelIds: string) {
  const cred = googleCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  const parseIds = (value: string) =>
    String(value ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id !== "");
  return gmailManagerFor(cred.resolved).modifyMessageLabels(messageId, parseIds(addLabelIds), parseIds(removeLabelIds));
}

// -------------------------------------------------------------------------------------------
// Calendar
// -------------------------------------------------------------------------------------------

const emptyCalendarEvent = { id: "", summary: "", start: "", end: "", htmlLink: "" };

export async function googleCalendarListEvents(credentialName: string, calendarId: string, timeMin: string, timeMax: string, maxResults: number) {
  const cred = googleCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, events: [], error: cred.error };
  return calendarManagerFor(cred.resolved).listEvents(calendarId, timeMin, timeMax, maxResults);
}

export async function googleCalendarGetEvent(credentialName: string, calendarId: string, eventId: string) {
  const cred = googleCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, event: emptyCalendarEvent, error: cred.error };
  const result = await calendarManagerFor(cred.resolved).getEvent(calendarId, eventId);
  return { success: result.success, event: { id: result.id ?? "", summary: result.summary ?? "", start: result.start ?? "", end: result.end ?? "", htmlLink: result.htmlLink ?? "" }, error: result.error };
}

export async function googleCalendarCreateEvent(credentialName: string, calendarId: string, summary: string, start: string, end: string, description: string) {
  const cred = googleCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, event: emptyCalendarEvent, error: cred.error };
  const result = await calendarManagerFor(cred.resolved).createEvent(calendarId, summary, start, end, description);
  return { success: result.success, event: { id: result.id ?? "", summary: result.summary ?? "", start: result.start ?? "", end: result.end ?? "", htmlLink: result.htmlLink ?? "" }, error: result.error };
}

export async function googleCalendarUpdateEvent(credentialName: string, calendarId: string, eventId: string, summary: string, start: string, end: string, description: string) {
  const cred = googleCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, event: emptyCalendarEvent, error: cred.error };
  const result = await calendarManagerFor(cred.resolved).updateEvent(calendarId, eventId, summary, start, end, description);
  return { success: result.success, event: { id: result.id ?? "", summary: result.summary ?? "", start: result.start ?? "", end: result.end ?? "", htmlLink: result.htmlLink ?? "" }, error: result.error };
}

export async function googleCalendarDeleteEvent(credentialName: string, calendarId: string, eventId: string) {
  const cred = googleCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return calendarManagerFor(cred.resolved).deleteEvent(calendarId, eventId);
}

export async function googleCalendarQuickAddEvent(credentialName: string, calendarId: string, text: string) {
  const cred = googleCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, event: emptyCalendarEvent, error: cred.error };
  const result = await calendarManagerFor(cred.resolved).quickAddEvent(calendarId, text);
  return { success: result.success, event: { id: result.id ?? "", summary: result.summary ?? "", start: result.start ?? "", end: result.end ?? "", htmlLink: result.htmlLink ?? "" }, error: result.error };
}

export async function googleCalendarListCalendars(credentialName: string) {
  const cred = googleCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, calendars: [], error: cred.error };
  return calendarManagerFor(cred.resolved).listCalendars();
}

// -------------------------------------------------------------------------------------------
// Admin (Directory API — service account with domain-wide delegation only)
// -------------------------------------------------------------------------------------------

const emptyAdminUser = { id: "", primaryEmail: "", fullName: "", suspended: false };
const emptyAdminGroup = { id: "", email: "", name: "" };

export async function googleAdminListUsers(credentialName: string, domain: string, query: string, maxResults: number) {
  const cred = googleServiceAccountCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, users: [], error: cred.error };
  return GoogleAdminManager.forServiceAccount(cred.data).listUsers(domain, query, maxResults);
}

export async function googleAdminGetUser(credentialName: string, userKey: string) {
  const cred = googleServiceAccountCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, user: emptyAdminUser, error: cred.error };
  const result = await GoogleAdminManager.forServiceAccount(cred.data).getUser(userKey);
  return { success: result.success, user: { id: result.id ?? "", primaryEmail: result.primaryEmail ?? "", fullName: result.fullName ?? "", suspended: result.suspended ?? false }, error: result.error };
}

export async function googleAdminCreateUser(credentialName: string, primaryEmail: string, givenName: string, familyName: string, password: string) {
  const cred = googleServiceAccountCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, user: emptyAdminUser, error: cred.error };
  const result = await GoogleAdminManager.forServiceAccount(cred.data).createUser(primaryEmail, givenName, familyName, password);
  return { success: result.success, user: { id: result.id ?? "", primaryEmail: result.primaryEmail ?? "", fullName: result.fullName ?? "", suspended: result.suspended ?? false }, error: result.error };
}

export async function googleAdminUpdateUser(credentialName: string, userKey: string, propertiesJson: string) {
  const cred = googleServiceAccountCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  const result = await GoogleAdminManager.forServiceAccount(cred.data).updateUser(userKey, propertiesJson);
  return { success: result.success, error: result.error };
}

export async function googleAdminDeleteUser(credentialName: string, userKey: string) {
  const cred = googleServiceAccountCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return GoogleAdminManager.forServiceAccount(cred.data).deleteUser(userKey);
}

export async function googleAdminListGroups(credentialName: string, domain: string, maxResults: number) {
  const cred = googleServiceAccountCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, groups: [], error: cred.error };
  return GoogleAdminManager.forServiceAccount(cred.data).listGroups(domain, maxResults);
}

export async function googleAdminGetGroup(credentialName: string, groupKey: string) {
  const cred = googleServiceAccountCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, group: emptyAdminGroup, error: cred.error };
  const result = await GoogleAdminManager.forServiceAccount(cred.data).getGroup(groupKey);
  return { success: result.success, group: { id: result.id ?? "", email: result.email ?? "", name: result.name ?? "" }, error: result.error };
}

export async function googleAdminCreateGroup(credentialName: string, email: string, name: string, description: string) {
  const cred = googleServiceAccountCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, group: emptyAdminGroup, error: cred.error };
  const result = await GoogleAdminManager.forServiceAccount(cred.data).createGroup(email, name, description);
  return { success: result.success, group: { id: result.id ?? "", email: result.email ?? "", name: result.name ?? "" }, error: result.error };
}

export async function googleAdminDeleteGroup(credentialName: string, groupKey: string) {
  const cred = googleServiceAccountCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return GoogleAdminManager.forServiceAccount(cred.data).deleteGroup(groupKey);
}

export async function googleAdminAddGroupMember(credentialName: string, groupKey: string, email: string, role: string) {
  const cred = googleServiceAccountCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return GoogleAdminManager.forServiceAccount(cred.data).addGroupMember(groupKey, email, role);
}

export async function googleAdminRemoveGroupMember(credentialName: string, groupKey: string, memberKey: string) {
  const cred = googleServiceAccountCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return GoogleAdminManager.forServiceAccount(cred.data).removeGroupMember(groupKey, memberKey);
}
