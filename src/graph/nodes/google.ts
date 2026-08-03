import { NodeColorCategory, type ExecutionContext } from "../engine/types";
import { registerNode } from "../engine/registry";
import { compileResultVar, FUNCTION_LIBRARY_GOOGLE_IMPORT } from "../engine/compileUtils";
import { GoogleDriveManager } from "../../lib/googleDriveManager";
import { GoogleSheetsManager } from "../../lib/googleSheetsManager";
import { GoogleDocsManager } from "../../lib/googleDocsManager";
import { GoogleGmailManager } from "../../lib/googleGmailManager";
import { GoogleCalendarManager } from "../../lib/googleCalendarManager";
import { GoogleAdminManager } from "../../lib/googleAdminManager";
import { exchangeAuthCode } from "../../lib/googleAuthManager";
import type { GoogleServiceAccountCredentialData, GoogleOAuth2CredentialData } from "../../credentials/types";
import { AUTH_TOKENS_STRUCT_TYPE, DRIVE_FILE_STRUCT_TYPE, DRIVE_PERMISSION_STRUCT_TYPE, GMAIL_MESSAGE_STRUCT_TYPE, GMAIL_LABEL_STRUCT_TYPE, CALENDAR_EVENT_STRUCT_TYPE, CALENDAR_ENTRY_STRUCT_TYPE, ADMIN_USER_STRUCT_TYPE, ADMIN_GROUP_STRUCT_TYPE } from "../structs/google";
import { GOOGLE_DRIVE_ROLE_ENUM_TYPE, GOOGLE_DRIVE_PERMISSION_TYPE_ENUM_TYPE } from "../enum/google";
import { TEXT_ENCODING_ENUM_TYPE } from "../enum/common";
import { enumOptionIds } from "../engine/enumRegistry";
import { i18n } from "@i18n";

// Every operation below is a thin pin-wiring shim over the lib/google*Manager.ts classes, which
// own the actual googleapis SDK calls, auth client construction, and error normalization — this
// file only ever translates pins to method arguments and method results back to pins.
//
// Every node here also has a compileExecute: the compiled path calls a same-named
// `functionLibraryGoogle.google*` wrapper (see server/functionLibraryGoogle.ts), which reads the
// credential back from environment variables via `googleCredentialFromEnv` instead of the vault —
// same split as github.ts's execute()/compileExecute().
//
// Every operation node (other than google.authorize) takes a Credential Name directly: each
// resolves the named vault entry, accepting either a Google Service Account or Google OAuth2
// credential (see resolveGoogleCredential) — mirrors github.ts's dual githubToken/githubApp
// resolution. Admin SDK nodes are the one exception (service account with domain-wide delegation
// only, see resolveGoogleServiceAccountCredential's own doc comment).

const GROUP_NAME = "Request.Google";
const GROUP_NAME_DRIVE = "Request.Google Drive";
const GROUP_NAME_SHEETS = "Request.Google Sheets";
const GROUP_NAME_DOCS = "Request.Google Docs";
const GROUP_NAME_GMAIL = "Request.Google Gmail";
const GROUP_NAME_CALENDAR = "Request.Google Calendar";
const GROUP_NAME_ADMIN = "Request.Google Admin";

type ResolvedGoogleCredential = { kind: "serviceAccount"; data: GoogleServiceAccountCredentialData } | { kind: "oauth2"; data: GoogleOAuth2CredentialData };

function credentialNamePin() {
  return {
    id: "credentialName",
    label: i18n.nodes.google.__shared.pin_credential_name,
    type: "string" as const,
    direction: "input" as const,
    defaultValue: "",
  };
}

/** Shared by every Google node except the Admin SDK group — looks up a named Credential Vault
 * entry and accepts either a Google Service Account or a Google OAuth2 credential, since every
 * non-Admin API here (Drive, Sheets, Docs, Gmail, Calendar) works fine under either auth flow. */
function resolveGoogleCredential(ctx: ExecutionContext, credentialName: string): { ok: true; resolved: ResolvedGoogleCredential } | { ok: false; error: string } {
  const credential = ctx.getCredential?.(credentialName);
  if (!credential) return { ok: false, error: `Credential "${credentialName}" not found in the vault` };
  if (credential.type === "googleServiceAccount") return { ok: true, resolved: { kind: "serviceAccount", data: credential.data as GoogleServiceAccountCredentialData } };
  if (credential.type === "googleOAuth2") return { ok: true, resolved: { kind: "oauth2", data: credential.data as GoogleOAuth2CredentialData } };
  return { ok: false, error: `Credential "${credentialName}" is not a Google Service Account or Google OAuth2 credential` };
}

/** Admin SDK Directory API only accepts a service account impersonating a super admin (Google
 * rejects domain-wide-delegation-less calls entirely) — see lib/googleAdminManager.ts's own doc
 * comment — so this narrows resolveGoogleCredential's result instead of duplicating the vault
 * lookup. */
function resolveGoogleServiceAccountCredential(ctx: ExecutionContext, credentialName: string): { ok: true; data: GoogleServiceAccountCredentialData } | { ok: false; error: string } {
  const resolved = resolveGoogleCredential(ctx, credentialName);
  if (!resolved.ok) return resolved;
  if (resolved.resolved.kind !== "serviceAccount") return { ok: false, error: `Credential "${credentialName}" must be a Google Service Account credential (Admin SDK requires domain-wide delegation)` };
  return { ok: true, data: resolved.resolved.data };
}

/** Only accepts a Google OAuth2 credential — used solely by google.authorize, which exchanges that
 * credential's staging authCode field for a refresh token (see nodes/dropbox.ts's authorize node
 * for the identical pattern). */
function resolveGoogleOAuth2Credential(ctx: ExecutionContext, credentialName: string): { ok: true; data: GoogleOAuth2CredentialData } | { ok: false; error: string } {
  const credential = ctx.getCredential?.(credentialName);
  if (!credential) return { ok: false, error: `Credential "${credentialName}" not found in the vault` };
  if (credential.type !== "googleOAuth2") return { ok: false, error: `Credential "${credentialName}" is not a Google OAuth2 credential` };
  return { ok: true, data: credential.data as GoogleOAuth2CredentialData };
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

function execInOutPins() {
  return {
    execIn: { id: "exec-in", label: "", type: "exec" as const, direction: "input" as const },
    execOut: { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec" as const, direction: "output" as const },
    success: { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean" as const, direction: "output" as const },
    error: { id: "error", label: i18n.nodes.__shared.pin_error, type: "string" as const, direction: "output" as const },
  };
}

// ---------------------------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------------------------

registerNode({
  type: "google.authorize",
  label: i18n.nodes.google.authorize.label,
  description: i18n.nodes.google.authorize.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    { id: "credentialName", label: i18n.nodes.google.authorize.pin_credential_name, type: "string", direction: "input", defaultValue: "" },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "tokens", label: i18n.nodes.google.authTokens.label, type: "struct", subType: AUTH_TOKENS_STRUCT_TYPE, direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleOAuth2Credential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: { success: false, tokens: { accessToken: "", refreshToken: "", expiresIn: 0 }, error: resolved.error },
      };
    }
    const result = await exchangeAuthCode(resolved.data.authCode, resolved.data.clientId, resolved.data.clientSecret, resolved.data.redirectUri);
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        tokens: { accessToken: result.accessToken, refreshToken: result.refreshToken, expiresIn: result.expiresIn },
        error: result.error,
      },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleAuthorize(${inputs.credentialName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, tokens: `${v}.tokens`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

// ---------------------------------------------------------------------------------------------
// Drive
// ---------------------------------------------------------------------------------------------

registerNode({
  type: "google.driveListFiles",
  label: i18n.nodes.google.driveListFiles.label,
  description: i18n.nodes.google.driveListFiles.description,
  group: GROUP_NAME_DRIVE,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    { id: "query", label: i18n.nodes.google.driveListFiles.pin_query, type: "string", direction: "input", defaultValue: "" },
    { id: "pageSize", label: i18n.nodes.google.__shared.pin_page_size, type: "number", direction: "input", defaultValue: 100 },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "files", label: i18n.nodes.google.driveListFiles.pin_files, type: "struct", subType: DRIVE_FILE_STRUCT_TYPE, container: "array", direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, files: [], error: resolved.error } };
    const result = await driveManagerFor(resolved.resolved).listFiles(String(inputs.query ?? ""), Number(inputs.pageSize ?? 100));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleDriveListFiles(${inputs.credentialName}, ${inputs.query}, ${inputs.pageSize});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, files: `${v}.files`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

registerNode({
  type: "google.driveGetFile",
  label: i18n.nodes.google.driveGetFile.label,
  description: i18n.nodes.google.driveGetFile.description,
  group: GROUP_NAME_DRIVE,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    { id: "fileId", label: i18n.nodes.google.__shared.pin_file_id, type: "string", direction: "input", defaultValue: "" },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "file", label: i18n.nodes.google.googleDriveFile.label, type: "struct", subType: DRIVE_FILE_STRUCT_TYPE, direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleCredential(ctx, String(inputs.credentialName ?? ""));
    const emptyFile = { id: "", name: "", mimeType: "", isFolder: false, size: 0, webViewLink: "" };
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, file: emptyFile, error: resolved.error } };
    const result = await driveManagerFor(resolved.resolved).getFile(String(inputs.fileId ?? ""));
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        file: { id: result.id ?? "", name: result.name ?? "", mimeType: result.mimeType ?? "", isFolder: result.isFolder ?? false, size: result.size ?? 0, webViewLink: result.webViewLink ?? "" },
        error: result.error,
      },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleDriveGetFile(${inputs.credentialName}, ${inputs.fileId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, file: `${v}.file`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

registerNode({
  type: "google.driveUploadFile",
  label: i18n.nodes.google.driveUploadFile.label,
  description: i18n.nodes.google.driveUploadFile.description,
  group: GROUP_NAME_DRIVE,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    { id: "name", label: i18n.nodes.google.__shared.pin_name, type: "string", direction: "input", defaultValue: "" },
    { id: "parentFolderId", label: i18n.nodes.google.__shared.pin_parent_folder_id, type: "string", direction: "input", defaultValue: "" },
    { id: "mimeType", label: i18n.nodes.google.__shared.pin_mime_type, type: "string", direction: "input", defaultValue: "text/plain" },
    { id: "content", label: i18n.nodes.google.__shared.pin_content, type: "string", direction: "input", defaultValue: "" },
    { id: "encoding", label: i18n.nodes.google.__shared.pin_encoding, type: "enum", subType: TEXT_ENCODING_ENUM_TYPE, direction: "input", defaultValue: "utf8", options: enumOptionIds(TEXT_ENCODING_ENUM_TYPE) },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "file", label: i18n.nodes.google.googleDriveFile.label, type: "struct", subType: DRIVE_FILE_STRUCT_TYPE, direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleCredential(ctx, String(inputs.credentialName ?? ""));
    const emptyFile = { id: "", name: "", mimeType: "", isFolder: false, size: 0, webViewLink: "" };
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, file: emptyFile, error: resolved.error } };
    const result = await driveManagerFor(resolved.resolved).uploadFile(String(inputs.name ?? ""), String(inputs.parentFolderId ?? ""), String(inputs.mimeType ?? ""), String(inputs.content ?? ""), (inputs.encoding as "utf8" | "base64") ?? "utf8");
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        file: { id: result.id ?? "", name: result.name ?? "", mimeType: result.mimeType ?? "", isFolder: result.isFolder ?? false, size: result.size ?? 0, webViewLink: result.webViewLink ?? "" },
        error: result.error,
      },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleDriveUploadFile(${inputs.credentialName}, ${inputs.name}, ${inputs.parentFolderId}, ${inputs.mimeType}, ${inputs.content}, ${inputs.encoding});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, file: `${v}.file`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

registerNode({
  type: "google.driveUpdateFileContent",
  label: i18n.nodes.google.driveUpdateFileContent.label,
  description: i18n.nodes.google.driveUpdateFileContent.description,
  group: GROUP_NAME_DRIVE,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    { id: "fileId", label: i18n.nodes.google.__shared.pin_file_id, type: "string", direction: "input", defaultValue: "" },
    { id: "mimeType", label: i18n.nodes.google.__shared.pin_mime_type, type: "string", direction: "input", defaultValue: "text/plain" },
    { id: "content", label: i18n.nodes.google.__shared.pin_content, type: "string", direction: "input", defaultValue: "" },
    { id: "encoding", label: i18n.nodes.google.__shared.pin_encoding, type: "enum", subType: TEXT_ENCODING_ENUM_TYPE, direction: "input", defaultValue: "utf8", options: enumOptionIds(TEXT_ENCODING_ENUM_TYPE) },
    execInOutPins().execOut,
    execInOutPins().success,
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const result = await driveManagerFor(resolved.resolved).updateFileContent(String(inputs.fileId ?? ""), String(inputs.mimeType ?? ""), String(inputs.content ?? ""), (inputs.encoding as "utf8" | "base64") ?? "utf8");
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleDriveUpdateFileContent(${inputs.credentialName}, ${inputs.fileId}, ${inputs.mimeType}, ${inputs.content}, ${inputs.encoding});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

registerNode({
  type: "google.driveDownloadFile",
  label: i18n.nodes.google.driveDownloadFile.label,
  description: i18n.nodes.google.driveDownloadFile.description,
  group: GROUP_NAME_DRIVE,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    { id: "fileId", label: i18n.nodes.google.__shared.pin_file_id, type: "string", direction: "input", defaultValue: "" },
    { id: "encoding", label: i18n.nodes.google.__shared.pin_encoding, type: "enum", subType: TEXT_ENCODING_ENUM_TYPE, direction: "input", defaultValue: "utf8", options: enumOptionIds(TEXT_ENCODING_ENUM_TYPE) },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "content", label: i18n.nodes.google.__shared.pin_content, type: "string", direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, content: "", error: resolved.error } };
    const result = await driveManagerFor(resolved.resolved).downloadFile(String(inputs.fileId ?? ""), (inputs.encoding as "utf8" | "base64") ?? "utf8");
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleDriveDownloadFile(${inputs.credentialName}, ${inputs.fileId}, ${inputs.encoding});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, content: `${v}.content`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

registerNode({
  type: "google.driveCreateFolder",
  label: i18n.nodes.google.driveCreateFolder.label,
  description: i18n.nodes.google.driveCreateFolder.description,
  group: GROUP_NAME_DRIVE,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    { id: "name", label: i18n.nodes.google.__shared.pin_name, type: "string", direction: "input", defaultValue: "" },
    { id: "parentFolderId", label: i18n.nodes.google.__shared.pin_parent_folder_id, type: "string", direction: "input", defaultValue: "" },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "file", label: i18n.nodes.google.googleDriveFile.label, type: "struct", subType: DRIVE_FILE_STRUCT_TYPE, direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleCredential(ctx, String(inputs.credentialName ?? ""));
    const emptyFile = { id: "", name: "", mimeType: "", isFolder: false, size: 0, webViewLink: "" };
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, file: emptyFile, error: resolved.error } };
    const result = await driveManagerFor(resolved.resolved).createFolder(String(inputs.name ?? ""), String(inputs.parentFolderId ?? ""));
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        file: { id: result.id ?? "", name: result.name ?? "", mimeType: result.mimeType ?? "", isFolder: result.isFolder ?? false, size: result.size ?? 0, webViewLink: result.webViewLink ?? "" },
        error: result.error,
      },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleDriveCreateFolder(${inputs.credentialName}, ${inputs.name}, ${inputs.parentFolderId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, file: `${v}.file`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

registerNode({
  type: "google.driveCopyFile",
  label: i18n.nodes.google.driveCopyFile.label,
  description: i18n.nodes.google.driveCopyFile.description,
  group: GROUP_NAME_DRIVE,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    { id: "fileId", label: i18n.nodes.google.__shared.pin_file_id, type: "string", direction: "input", defaultValue: "" },
    { id: "newName", label: i18n.nodes.google.driveCopyFile.pin_new_name, type: "string", direction: "input", defaultValue: "" },
    { id: "destinationFolderId", label: i18n.nodes.google.__shared.pin_destination_folder_id, type: "string", direction: "input", defaultValue: "" },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "file", label: i18n.nodes.google.googleDriveFile.label, type: "struct", subType: DRIVE_FILE_STRUCT_TYPE, direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleCredential(ctx, String(inputs.credentialName ?? ""));
    const emptyFile = { id: "", name: "", mimeType: "", isFolder: false, size: 0, webViewLink: "" };
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, file: emptyFile, error: resolved.error } };
    const result = await driveManagerFor(resolved.resolved).copyFile(String(inputs.fileId ?? ""), String(inputs.newName ?? ""), String(inputs.destinationFolderId ?? ""));
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        file: { id: result.id ?? "", name: result.name ?? "", mimeType: result.mimeType ?? "", isFolder: result.isFolder ?? false, size: result.size ?? 0, webViewLink: result.webViewLink ?? "" },
        error: result.error,
      },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleDriveCopyFile(${inputs.credentialName}, ${inputs.fileId}, ${inputs.newName}, ${inputs.destinationFolderId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, file: `${v}.file`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

registerNode({
  type: "google.driveMoveFile",
  label: i18n.nodes.google.driveMoveFile.label,
  description: i18n.nodes.google.driveMoveFile.description,
  group: GROUP_NAME_DRIVE,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    { id: "fileId", label: i18n.nodes.google.__shared.pin_file_id, type: "string", direction: "input", defaultValue: "" },
    { id: "destinationFolderId", label: i18n.nodes.google.__shared.pin_destination_folder_id, type: "string", direction: "input", defaultValue: "" },
    execInOutPins().execOut,
    execInOutPins().success,
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const result = await driveManagerFor(resolved.resolved).moveFile(String(inputs.fileId ?? ""), String(inputs.destinationFolderId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleDriveMoveFile(${inputs.credentialName}, ${inputs.fileId}, ${inputs.destinationFolderId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

registerNode({
  type: "google.driveRenameFile",
  label: i18n.nodes.google.driveRenameFile.label,
  description: i18n.nodes.google.driveRenameFile.description,
  group: GROUP_NAME_DRIVE,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    { id: "fileId", label: i18n.nodes.google.__shared.pin_file_id, type: "string", direction: "input", defaultValue: "" },
    { id: "newName", label: i18n.nodes.google.driveCopyFile.pin_new_name, type: "string", direction: "input", defaultValue: "" },
    execInOutPins().execOut,
    execInOutPins().success,
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const result = await driveManagerFor(resolved.resolved).renameFile(String(inputs.fileId ?? ""), String(inputs.newName ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleDriveRenameFile(${inputs.credentialName}, ${inputs.fileId}, ${inputs.newName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

registerNode({
  type: "google.driveDeleteFile",
  label: i18n.nodes.google.driveDeleteFile.label,
  description: i18n.nodes.google.driveDeleteFile.description,
  group: GROUP_NAME_DRIVE,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInOutPins().execIn, credentialNamePin(), { id: "fileId", label: i18n.nodes.google.__shared.pin_file_id, type: "string", direction: "input", defaultValue: "" }, execInOutPins().execOut, execInOutPins().success, execInOutPins().error],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const result = await driveManagerFor(resolved.resolved).deleteFile(String(inputs.fileId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleDriveDeleteFile(${inputs.credentialName}, ${inputs.fileId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

registerNode({
  type: "google.driveShareFile",
  label: i18n.nodes.google.driveShareFile.label,
  description: i18n.nodes.google.driveShareFile.description,
  group: GROUP_NAME_DRIVE,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    { id: "fileId", label: i18n.nodes.google.__shared.pin_file_id, type: "string", direction: "input", defaultValue: "" },
    { id: "role", label: i18n.nodes.google.__shared.pin_role, type: "enum", subType: GOOGLE_DRIVE_ROLE_ENUM_TYPE, direction: "input", defaultValue: "reader", options: enumOptionIds(GOOGLE_DRIVE_ROLE_ENUM_TYPE) },
    { id: "type", label: i18n.nodes.google.__shared.pin_type, type: "enum", subType: GOOGLE_DRIVE_PERMISSION_TYPE_ENUM_TYPE, direction: "input", defaultValue: "user", options: enumOptionIds(GOOGLE_DRIVE_PERMISSION_TYPE_ENUM_TYPE) },
    { id: "emailAddress", label: i18n.nodes.google.__shared.pin_email, type: "string", direction: "input", defaultValue: "" },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "id", label: i18n.nodes.google.__shared.pin_id, type: "string", direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, id: "", error: resolved.error } };
    const result = await driveManagerFor(resolved.resolved).shareFile(String(inputs.fileId ?? ""), String(inputs.role ?? "reader"), String(inputs.type ?? "user"), String(inputs.emailAddress ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleDriveShareFile(${inputs.credentialName}, ${inputs.fileId}, ${inputs.role}, ${inputs.type}, ${inputs.emailAddress});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, id: `${v}.id`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

registerNode({
  type: "google.driveListPermissions",
  label: i18n.nodes.google.driveListPermissions.label,
  description: i18n.nodes.google.driveListPermissions.description,
  group: GROUP_NAME_DRIVE,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    { id: "fileId", label: i18n.nodes.google.__shared.pin_file_id, type: "string", direction: "input", defaultValue: "" },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "permissions", label: i18n.nodes.google.driveListPermissions.pin_permissions, type: "struct", subType: DRIVE_PERMISSION_STRUCT_TYPE, container: "array", direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, permissions: [], error: resolved.error } };
    const result = await driveManagerFor(resolved.resolved).listPermissions(String(inputs.fileId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleDriveListPermissions(${inputs.credentialName}, ${inputs.fileId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, permissions: `${v}.permissions`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

registerNode({
  type: "google.driveDeletePermission",
  label: i18n.nodes.google.driveDeletePermission.label,
  description: i18n.nodes.google.driveDeletePermission.description,
  group: GROUP_NAME_DRIVE,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    { id: "fileId", label: i18n.nodes.google.__shared.pin_file_id, type: "string", direction: "input", defaultValue: "" },
    { id: "permissionId", label: i18n.nodes.google.__shared.pin_id, type: "string", direction: "input", defaultValue: "" },
    execInOutPins().execOut,
    execInOutPins().success,
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const result = await driveManagerFor(resolved.resolved).deletePermission(String(inputs.fileId ?? ""), String(inputs.permissionId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleDriveDeletePermission(${inputs.credentialName}, ${inputs.fileId}, ${inputs.permissionId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

// ---------------------------------------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------------------------------------

registerNode({
  type: "google.sheetsGetValues",
  label: i18n.nodes.google.sheetsGetValues.label,
  description: i18n.nodes.google.sheetsGetValues.description,
  group: GROUP_NAME_SHEETS,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    { id: "spreadsheetId", label: i18n.nodes.google.__shared.pin_spreadsheet_id, type: "string", direction: "input", defaultValue: "" },
    { id: "range", label: i18n.nodes.google.__shared.pin_range, type: "string", direction: "input", defaultValue: "" },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "valuesJson", label: i18n.nodes.google.__shared.pin_values_json, type: "string", direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, valuesJson: "[]", error: resolved.error } };
    const result = await sheetsManagerFor(resolved.resolved).getValues(String(inputs.spreadsheetId ?? ""), String(inputs.range ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleSheetsGetValues(${inputs.credentialName}, ${inputs.spreadsheetId}, ${inputs.range});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, valuesJson: `${v}.valuesJson`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

registerNode({
  type: "google.sheetsUpdateValues",
  label: i18n.nodes.google.sheetsUpdateValues.label,
  description: i18n.nodes.google.sheetsUpdateValues.description,
  group: GROUP_NAME_SHEETS,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    { id: "spreadsheetId", label: i18n.nodes.google.__shared.pin_spreadsheet_id, type: "string", direction: "input", defaultValue: "" },
    { id: "range", label: i18n.nodes.google.__shared.pin_range, type: "string", direction: "input", defaultValue: "" },
    { id: "valuesJson", label: i18n.nodes.google.__shared.pin_values_json, type: "string", direction: "input", defaultValue: "[]" },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "updatedCells", label: i18n.nodes.google.__shared.pin_updated_cells, type: "number", direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, updatedCells: 0, error: resolved.error } };
    const result = await sheetsManagerFor(resolved.resolved).updateValues(String(inputs.spreadsheetId ?? ""), String(inputs.range ?? ""), String(inputs.valuesJson ?? "[]"));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleSheetsUpdateValues(${inputs.credentialName}, ${inputs.spreadsheetId}, ${inputs.range}, ${inputs.valuesJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, updatedCells: `${v}.updatedCells`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

registerNode({
  type: "google.sheetsAppendValues",
  label: i18n.nodes.google.sheetsAppendValues.label,
  description: i18n.nodes.google.sheetsAppendValues.description,
  group: GROUP_NAME_SHEETS,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    { id: "spreadsheetId", label: i18n.nodes.google.__shared.pin_spreadsheet_id, type: "string", direction: "input", defaultValue: "" },
    { id: "range", label: i18n.nodes.google.__shared.pin_range, type: "string", direction: "input", defaultValue: "" },
    { id: "valuesJson", label: i18n.nodes.google.__shared.pin_values_json, type: "string", direction: "input", defaultValue: "[]" },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "updatedCells", label: i18n.nodes.google.__shared.pin_updated_cells, type: "number", direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, updatedCells: 0, error: resolved.error } };
    const result = await sheetsManagerFor(resolved.resolved).appendValues(String(inputs.spreadsheetId ?? ""), String(inputs.range ?? ""), String(inputs.valuesJson ?? "[]"));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleSheetsAppendValues(${inputs.credentialName}, ${inputs.spreadsheetId}, ${inputs.range}, ${inputs.valuesJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, updatedCells: `${v}.updatedCells`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

registerNode({
  type: "google.sheetsClearValues",
  label: i18n.nodes.google.sheetsClearValues.label,
  description: i18n.nodes.google.sheetsClearValues.description,
  group: GROUP_NAME_SHEETS,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    { id: "spreadsheetId", label: i18n.nodes.google.__shared.pin_spreadsheet_id, type: "string", direction: "input", defaultValue: "" },
    { id: "range", label: i18n.nodes.google.__shared.pin_range, type: "string", direction: "input", defaultValue: "" },
    execInOutPins().execOut,
    execInOutPins().success,
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const result = await sheetsManagerFor(resolved.resolved).clearValues(String(inputs.spreadsheetId ?? ""), String(inputs.range ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleSheetsClearValues(${inputs.credentialName}, ${inputs.spreadsheetId}, ${inputs.range});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

registerNode({
  type: "google.sheetsCreateSpreadsheet",
  label: i18n.nodes.google.sheetsCreateSpreadsheet.label,
  description: i18n.nodes.google.sheetsCreateSpreadsheet.description,
  group: GROUP_NAME_SHEETS,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    { id: "title", label: i18n.nodes.google.__shared.pin_title, type: "string", direction: "input", defaultValue: "" },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "spreadsheetId", label: i18n.nodes.google.__shared.pin_spreadsheet_id, type: "string", direction: "output" },
    { id: "spreadsheetUrl", label: i18n.nodes.google.__shared.pin_web_view_link, type: "string", direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, spreadsheetId: "", spreadsheetUrl: "", error: resolved.error } };
    const result = await sheetsManagerFor(resolved.resolved).createSpreadsheet(String(inputs.title ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleSheetsCreateSpreadsheet(${inputs.credentialName}, ${inputs.title});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, spreadsheetId: `${v}.spreadsheetId`, spreadsheetUrl: `${v}.spreadsheetUrl`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

registerNode({
  type: "google.sheetsAddSheet",
  label: i18n.nodes.google.sheetsAddSheet.label,
  description: i18n.nodes.google.sheetsAddSheet.description,
  group: GROUP_NAME_SHEETS,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    { id: "spreadsheetId", label: i18n.nodes.google.__shared.pin_spreadsheet_id, type: "string", direction: "input", defaultValue: "" },
    { id: "title", label: i18n.nodes.google.__shared.pin_title, type: "string", direction: "input", defaultValue: "" },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "sheetId", label: i18n.nodes.google.__shared.pin_sheet_id, type: "number", direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, sheetId: 0, error: resolved.error } };
    const result = await sheetsManagerFor(resolved.resolved).addSheet(String(inputs.spreadsheetId ?? ""), String(inputs.title ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleSheetsAddSheet(${inputs.credentialName}, ${inputs.spreadsheetId}, ${inputs.title});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, sheetId: `${v}.sheetId`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

registerNode({
  type: "google.sheetsDeleteSheet",
  label: i18n.nodes.google.sheetsDeleteSheet.label,
  description: i18n.nodes.google.sheetsDeleteSheet.description,
  group: GROUP_NAME_SHEETS,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    { id: "spreadsheetId", label: i18n.nodes.google.__shared.pin_spreadsheet_id, type: "string", direction: "input", defaultValue: "" },
    { id: "sheetId", label: i18n.nodes.google.__shared.pin_sheet_id, type: "number", direction: "input", defaultValue: 0 },
    execInOutPins().execOut,
    execInOutPins().success,
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const result = await sheetsManagerFor(resolved.resolved).deleteSheet(String(inputs.spreadsheetId ?? ""), Number(inputs.sheetId ?? 0));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleSheetsDeleteSheet(${inputs.credentialName}, ${inputs.spreadsheetId}, ${inputs.sheetId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

registerNode({
  type: "google.sheetsGetMetadata",
  label: i18n.nodes.google.sheetsGetMetadata.label,
  description: i18n.nodes.google.sheetsGetMetadata.description,
  group: GROUP_NAME_SHEETS,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    { id: "spreadsheetId", label: i18n.nodes.google.__shared.pin_spreadsheet_id, type: "string", direction: "input", defaultValue: "" },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "title", label: i18n.nodes.google.__shared.pin_title, type: "string", direction: "output" },
    { id: "sheetTitlesJson", label: i18n.nodes.google.sheetsGetMetadata.pin_sheet_titles_json, type: "string", direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, title: "", sheetTitlesJson: "[]", error: resolved.error } };
    const result = await sheetsManagerFor(resolved.resolved).getMetadata(String(inputs.spreadsheetId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleSheetsGetMetadata(${inputs.credentialName}, ${inputs.spreadsheetId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, title: `${v}.title`, sheetTitlesJson: `${v}.sheetTitlesJson`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

// ---------------------------------------------------------------------------------------------
// Docs
// ---------------------------------------------------------------------------------------------

registerNode({
  type: "google.docsCreateDocument",
  label: i18n.nodes.google.docsCreateDocument.label,
  description: i18n.nodes.google.docsCreateDocument.description,
  group: GROUP_NAME_DOCS,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    { id: "title", label: i18n.nodes.google.__shared.pin_title, type: "string", direction: "input", defaultValue: "" },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "documentId", label: i18n.nodes.google.__shared.pin_document_id, type: "string", direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, documentId: "", error: resolved.error } };
    const result = await docsManagerFor(resolved.resolved).createDocument(String(inputs.title ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleDocsCreateDocument(${inputs.credentialName}, ${inputs.title});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, documentId: `${v}.documentId`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

registerNode({
  type: "google.docsGetText",
  label: i18n.nodes.google.docsGetText.label,
  description: i18n.nodes.google.docsGetText.description,
  group: GROUP_NAME_DOCS,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    { id: "documentId", label: i18n.nodes.google.__shared.pin_document_id, type: "string", direction: "input", defaultValue: "" },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "text", label: i18n.nodes.google.__shared.pin_text, type: "string", direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, text: "", error: resolved.error } };
    const result = await docsManagerFor(resolved.resolved).getText(String(inputs.documentId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleDocsGetText(${inputs.credentialName}, ${inputs.documentId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, text: `${v}.text`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

registerNode({
  type: "google.docsAppendText",
  label: i18n.nodes.google.docsAppendText.label,
  description: i18n.nodes.google.docsAppendText.description,
  group: GROUP_NAME_DOCS,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    { id: "documentId", label: i18n.nodes.google.__shared.pin_document_id, type: "string", direction: "input", defaultValue: "" },
    { id: "text", label: i18n.nodes.google.__shared.pin_text, type: "string", direction: "input", defaultValue: "" },
    execInOutPins().execOut,
    execInOutPins().success,
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const result = await docsManagerFor(resolved.resolved).appendText(String(inputs.documentId ?? ""), String(inputs.text ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleDocsAppendText(${inputs.credentialName}, ${inputs.documentId}, ${inputs.text});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

registerNode({
  type: "google.docsInsertText",
  label: i18n.nodes.google.docsInsertText.label,
  description: i18n.nodes.google.docsInsertText.description,
  group: GROUP_NAME_DOCS,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    { id: "documentId", label: i18n.nodes.google.__shared.pin_document_id, type: "string", direction: "input", defaultValue: "" },
    { id: "text", label: i18n.nodes.google.__shared.pin_text, type: "string", direction: "input", defaultValue: "" },
    { id: "index", label: i18n.nodes.google.docsInsertText.pin_index, type: "number", direction: "input", defaultValue: 1, integer: true },
    execInOutPins().execOut,
    execInOutPins().success,
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const result = await docsManagerFor(resolved.resolved).insertText(String(inputs.documentId ?? ""), String(inputs.text ?? ""), Number(inputs.index ?? 1));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleDocsInsertText(${inputs.credentialName}, ${inputs.documentId}, ${inputs.text}, ${inputs.index});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

registerNode({
  type: "google.docsReplaceAllText",
  label: i18n.nodes.google.docsReplaceAllText.label,
  description: i18n.nodes.google.docsReplaceAllText.description,
  group: GROUP_NAME_DOCS,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    { id: "documentId", label: i18n.nodes.google.__shared.pin_document_id, type: "string", direction: "input", defaultValue: "" },
    { id: "find", label: i18n.nodes.google.docsReplaceAllText.pin_find, type: "string", direction: "input", defaultValue: "" },
    { id: "replacement", label: i18n.nodes.google.docsReplaceAllText.pin_replacement, type: "string", direction: "input", defaultValue: "" },
    { id: "matchCase", label: i18n.nodes.google.docsReplaceAllText.pin_match_case, type: "boolean", direction: "input", defaultValue: false },
    execInOutPins().execOut,
    execInOutPins().success,
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const result = await docsManagerFor(resolved.resolved).replaceAllText(String(inputs.documentId ?? ""), String(inputs.find ?? ""), String(inputs.replacement ?? ""), Boolean(inputs.matchCase));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleDocsReplaceAllText(${inputs.credentialName}, ${inputs.documentId}, ${inputs.find}, ${inputs.replacement}, ${inputs.matchCase});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

// ---------------------------------------------------------------------------------------------
// Gmail
// ---------------------------------------------------------------------------------------------

registerNode({
  type: "google.gmailListMessages",
  label: i18n.nodes.google.gmailListMessages.label,
  description: i18n.nodes.google.gmailListMessages.description,
  group: GROUP_NAME_GMAIL,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    { id: "query", label: i18n.nodes.google.gmailListMessages.pin_query, type: "string", direction: "input", defaultValue: "" },
    { id: "maxResults", label: i18n.nodes.google.__shared.pin_max_results, type: "number", direction: "input", defaultValue: 20 },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "messages", label: i18n.nodes.google.gmailListMessages.pin_messages, type: "struct", subType: GMAIL_MESSAGE_STRUCT_TYPE, container: "array", direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, messages: [], error: resolved.error } };
    const result = await gmailManagerFor(resolved.resolved).listMessages(String(inputs.query ?? ""), Number(inputs.maxResults ?? 20));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleGmailListMessages(${inputs.credentialName}, ${inputs.query}, ${inputs.maxResults});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, messages: `${v}.messages`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

registerNode({
  type: "google.gmailGetMessage",
  label: i18n.nodes.google.gmailGetMessage.label,
  description: i18n.nodes.google.gmailGetMessage.description,
  group: GROUP_NAME_GMAIL,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    { id: "messageId", label: i18n.nodes.google.__shared.pin_message_id, type: "string", direction: "input", defaultValue: "" },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "subject", label: i18n.nodes.google.__shared.pin_subject, type: "string", direction: "output" },
    { id: "from", label: i18n.nodes.google.__shared.pin_from, type: "string", direction: "output" },
    { id: "snippet", label: i18n.nodes.google.__shared.pin_snippet, type: "string", direction: "output" },
    { id: "body", label: i18n.nodes.google.__shared.pin_body, type: "string", direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, subject: "", from: "", snippet: "", body: "", error: resolved.error } };
    const result = await gmailManagerFor(resolved.resolved).getMessage(String(inputs.messageId ?? ""));
    return {
      nextExec: "exec-out",
      outputs: { success: result.success, subject: result.subject ?? "", from: result.from ?? "", snippet: result.snippet ?? "", body: result.body, error: result.error },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleGmailGetMessage(${inputs.credentialName}, ${inputs.messageId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, subject: `${v}.subject`, from: `${v}.from`, snippet: `${v}.snippet`, body: `${v}.body`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

registerNode({
  type: "google.gmailSendMessage",
  label: i18n.nodes.google.gmailSendMessage.label,
  description: i18n.nodes.google.gmailSendMessage.description,
  group: GROUP_NAME_GMAIL,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    { id: "to", label: i18n.nodes.google.gmailSendMessage.pin_to, type: "string", direction: "input", defaultValue: "" },
    { id: "subject", label: i18n.nodes.google.__shared.pin_subject, type: "string", direction: "input", defaultValue: "" },
    { id: "body", label: i18n.nodes.google.__shared.pin_body, type: "string", direction: "input", defaultValue: "" },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "id", label: i18n.nodes.google.__shared.pin_id, type: "string", direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, id: "", error: resolved.error } };
    const result = await gmailManagerFor(resolved.resolved).sendMessage(String(inputs.to ?? ""), String(inputs.subject ?? ""), String(inputs.body ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleGmailSendMessage(${inputs.credentialName}, ${inputs.to}, ${inputs.subject}, ${inputs.body});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, id: `${v}.id`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

registerNode({
  type: "google.gmailTrashMessage",
  label: i18n.nodes.google.gmailTrashMessage.label,
  description: i18n.nodes.google.gmailTrashMessage.description,
  group: GROUP_NAME_GMAIL,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInOutPins().execIn, credentialNamePin(), { id: "messageId", label: i18n.nodes.google.__shared.pin_message_id, type: "string", direction: "input", defaultValue: "" }, execInOutPins().execOut, execInOutPins().success, execInOutPins().error],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const result = await gmailManagerFor(resolved.resolved).trashMessage(String(inputs.messageId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleGmailTrashMessage(${inputs.credentialName}, ${inputs.messageId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

registerNode({
  type: "google.gmailListLabels",
  label: i18n.nodes.google.gmailListLabels.label,
  description: i18n.nodes.google.gmailListLabels.description,
  group: GROUP_NAME_GMAIL,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInOutPins().execIn, credentialNamePin(), execInOutPins().execOut, execInOutPins().success, { id: "labels", label: i18n.nodes.google.gmailListLabels.pin_labels, type: "struct", subType: GMAIL_LABEL_STRUCT_TYPE, container: "array", direction: "output" }, execInOutPins().error],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, labels: [], error: resolved.error } };
    const result = await gmailManagerFor(resolved.resolved).listLabels();
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleGmailListLabels(${inputs.credentialName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, labels: `${v}.labels`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

registerNode({
  type: "google.gmailCreateLabel",
  label: i18n.nodes.google.gmailCreateLabel.label,
  description: i18n.nodes.google.gmailCreateLabel.description,
  group: GROUP_NAME_GMAIL,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    { id: "name", label: i18n.nodes.google.__shared.pin_name, type: "string", direction: "input", defaultValue: "" },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "id", label: i18n.nodes.google.__shared.pin_id, type: "string", direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, id: "", error: resolved.error } };
    const result = await gmailManagerFor(resolved.resolved).createLabel(String(inputs.name ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleGmailCreateLabel(${inputs.credentialName}, ${inputs.name});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, id: `${v}.id`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

registerNode({
  type: "google.gmailModifyMessageLabels",
  label: i18n.nodes.google.gmailModifyMessageLabels.label,
  description: i18n.nodes.google.gmailModifyMessageLabels.description,
  group: GROUP_NAME_GMAIL,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    { id: "messageId", label: i18n.nodes.google.__shared.pin_message_id, type: "string", direction: "input", defaultValue: "" },
    { id: "addLabelIds", label: i18n.nodes.google.gmailModifyMessageLabels.pin_add_label_ids, type: "string", direction: "input", defaultValue: "" },
    { id: "removeLabelIds", label: i18n.nodes.google.gmailModifyMessageLabels.pin_remove_label_ids, type: "string", direction: "input", defaultValue: "" },
    execInOutPins().execOut,
    execInOutPins().success,
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const parseIds = (value: unknown) =>
      String(value ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id !== "");
    const result = await gmailManagerFor(resolved.resolved).modifyMessageLabels(String(inputs.messageId ?? ""), parseIds(inputs.addLabelIds), parseIds(inputs.removeLabelIds));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleGmailModifyMessageLabels(${inputs.credentialName}, ${inputs.messageId}, ${inputs.addLabelIds}, ${inputs.removeLabelIds});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

// ---------------------------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------------------------

function calendarIdPin() {
  return { id: "calendarId", label: i18n.nodes.google.__shared.pin_calendar_id, type: "string" as const, direction: "input" as const, defaultValue: "primary" };
}

const emptyEvent = { id: "", summary: "", start: "", end: "", htmlLink: "" };

registerNode({
  type: "google.calendarListEvents",
  label: i18n.nodes.google.calendarListEvents.label,
  description: i18n.nodes.google.calendarListEvents.description,
  group: GROUP_NAME_CALENDAR,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    calendarIdPin(),
    { id: "timeMin", label: i18n.nodes.google.calendarListEvents.pin_time_min, type: "string", direction: "input", defaultValue: "" },
    { id: "timeMax", label: i18n.nodes.google.calendarListEvents.pin_time_max, type: "string", direction: "input", defaultValue: "" },
    { id: "maxResults", label: i18n.nodes.google.__shared.pin_max_results, type: "number", direction: "input", defaultValue: 20 },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "events", label: i18n.nodes.google.calendarListEvents.pin_events, type: "struct", subType: CALENDAR_EVENT_STRUCT_TYPE, container: "array", direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, events: [], error: resolved.error } };
    const result = await calendarManagerFor(resolved.resolved).listEvents(String(inputs.calendarId ?? "primary"), String(inputs.timeMin ?? ""), String(inputs.timeMax ?? ""), Number(inputs.maxResults ?? 20));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleCalendarListEvents(${inputs.credentialName}, ${inputs.calendarId}, ${inputs.timeMin}, ${inputs.timeMax}, ${inputs.maxResults});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, events: `${v}.events`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

registerNode({
  type: "google.calendarGetEvent",
  label: i18n.nodes.google.calendarGetEvent.label,
  description: i18n.nodes.google.calendarGetEvent.description,
  group: GROUP_NAME_CALENDAR,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    calendarIdPin(),
    { id: "eventId", label: i18n.nodes.google.__shared.pin_event_id, type: "string", direction: "input", defaultValue: "" },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "event", label: i18n.nodes.google.googleCalendarEvent.label, type: "struct", subType: CALENDAR_EVENT_STRUCT_TYPE, direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, event: emptyEvent, error: resolved.error } };
    const result = await calendarManagerFor(resolved.resolved).getEvent(String(inputs.calendarId ?? "primary"), String(inputs.eventId ?? ""));
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        event: { id: result.id ?? "", summary: result.summary ?? "", start: result.start ?? "", end: result.end ?? "", htmlLink: result.htmlLink ?? "" },
        error: result.error,
      },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleCalendarGetEvent(${inputs.credentialName}, ${inputs.calendarId}, ${inputs.eventId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, event: `${v}.event`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

registerNode({
  type: "google.calendarCreateEvent",
  label: i18n.nodes.google.calendarCreateEvent.label,
  description: i18n.nodes.google.calendarCreateEvent.description,
  group: GROUP_NAME_CALENDAR,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    calendarIdPin(),
    { id: "summary", label: i18n.nodes.google.__shared.pin_summary, type: "string", direction: "input", defaultValue: "" },
    { id: "start", label: i18n.nodes.google.__shared.pin_start, type: "string", direction: "input", defaultValue: "" },
    { id: "end", label: i18n.nodes.google.__shared.pin_end, type: "string", direction: "input", defaultValue: "" },
    { id: "description", label: i18n.nodes.google.__shared.pin_description, type: "string", direction: "input", defaultValue: "" },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "event", label: i18n.nodes.google.googleCalendarEvent.label, type: "struct", subType: CALENDAR_EVENT_STRUCT_TYPE, direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, event: emptyEvent, error: resolved.error } };
    const result = await calendarManagerFor(resolved.resolved).createEvent(String(inputs.calendarId ?? "primary"), String(inputs.summary ?? ""), String(inputs.start ?? ""), String(inputs.end ?? ""), String(inputs.description ?? ""));
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        event: { id: result.id ?? "", summary: result.summary ?? "", start: result.start ?? "", end: result.end ?? "", htmlLink: result.htmlLink ?? "" },
        error: result.error,
      },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleCalendarCreateEvent(${inputs.credentialName}, ${inputs.calendarId}, ${inputs.summary}, ${inputs.start}, ${inputs.end}, ${inputs.description});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, event: `${v}.event`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

registerNode({
  type: "google.calendarUpdateEvent",
  label: i18n.nodes.google.calendarUpdateEvent.label,
  description: i18n.nodes.google.calendarUpdateEvent.description,
  group: GROUP_NAME_CALENDAR,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    calendarIdPin(),
    { id: "eventId", label: i18n.nodes.google.__shared.pin_event_id, type: "string", direction: "input", defaultValue: "" },
    { id: "summary", label: i18n.nodes.google.__shared.pin_summary, type: "string", direction: "input", defaultValue: "" },
    { id: "start", label: i18n.nodes.google.__shared.pin_start, type: "string", direction: "input", defaultValue: "" },
    { id: "end", label: i18n.nodes.google.__shared.pin_end, type: "string", direction: "input", defaultValue: "" },
    { id: "description", label: i18n.nodes.google.__shared.pin_description, type: "string", direction: "input", defaultValue: "" },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "event", label: i18n.nodes.google.googleCalendarEvent.label, type: "struct", subType: CALENDAR_EVENT_STRUCT_TYPE, direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, event: emptyEvent, error: resolved.error } };
    const result = await calendarManagerFor(resolved.resolved).updateEvent(String(inputs.calendarId ?? "primary"), String(inputs.eventId ?? ""), String(inputs.summary ?? ""), String(inputs.start ?? ""), String(inputs.end ?? ""), String(inputs.description ?? ""));
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        event: { id: result.id ?? "", summary: result.summary ?? "", start: result.start ?? "", end: result.end ?? "", htmlLink: result.htmlLink ?? "" },
        error: result.error,
      },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleCalendarUpdateEvent(${inputs.credentialName}, ${inputs.calendarId}, ${inputs.eventId}, ${inputs.summary}, ${inputs.start}, ${inputs.end}, ${inputs.description});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, event: `${v}.event`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

registerNode({
  type: "google.calendarDeleteEvent",
  label: i18n.nodes.google.calendarDeleteEvent.label,
  description: i18n.nodes.google.calendarDeleteEvent.description,
  group: GROUP_NAME_CALENDAR,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInOutPins().execIn, credentialNamePin(), calendarIdPin(), { id: "eventId", label: i18n.nodes.google.__shared.pin_event_id, type: "string", direction: "input", defaultValue: "" }, execInOutPins().execOut, execInOutPins().success, execInOutPins().error],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const result = await calendarManagerFor(resolved.resolved).deleteEvent(String(inputs.calendarId ?? "primary"), String(inputs.eventId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleCalendarDeleteEvent(${inputs.credentialName}, ${inputs.calendarId}, ${inputs.eventId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

registerNode({
  type: "google.calendarQuickAddEvent",
  label: i18n.nodes.google.calendarQuickAddEvent.label,
  description: i18n.nodes.google.calendarQuickAddEvent.description,
  group: GROUP_NAME_CALENDAR,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    calendarIdPin(),
    { id: "text", label: i18n.nodes.google.__shared.pin_text, type: "string", direction: "input", defaultValue: "" },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "event", label: i18n.nodes.google.googleCalendarEvent.label, type: "struct", subType: CALENDAR_EVENT_STRUCT_TYPE, direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, event: emptyEvent, error: resolved.error } };
    const result = await calendarManagerFor(resolved.resolved).quickAddEvent(String(inputs.calendarId ?? "primary"), String(inputs.text ?? ""));
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        event: { id: result.id ?? "", summary: result.summary ?? "", start: result.start ?? "", end: result.end ?? "", htmlLink: result.htmlLink ?? "" },
        error: result.error,
      },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleCalendarQuickAddEvent(${inputs.credentialName}, ${inputs.calendarId}, ${inputs.text});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, event: `${v}.event`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

registerNode({
  type: "google.calendarListCalendars",
  label: i18n.nodes.google.calendarListCalendars.label,
  description: i18n.nodes.google.calendarListCalendars.description,
  group: GROUP_NAME_CALENDAR,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "calendars", label: i18n.nodes.google.calendarListCalendars.pin_calendars, type: "struct", subType: CALENDAR_ENTRY_STRUCT_TYPE, container: "array", direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, calendars: [], error: resolved.error } };
    const result = await calendarManagerFor(resolved.resolved).listCalendars();
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleCalendarListCalendars(${inputs.credentialName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, calendars: `${v}.calendars`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

// ---------------------------------------------------------------------------------------------
// Admin (Directory API — service account with domain-wide delegation only)
// ---------------------------------------------------------------------------------------------

const emptyAdminUser = { id: "", primaryEmail: "", fullName: "", suspended: false };
const emptyAdminGroup = { id: "", email: "", name: "" };

registerNode({
  type: "google.adminListUsers",
  label: i18n.nodes.google.adminListUsers.label,
  description: i18n.nodes.google.adminListUsers.description,
  group: GROUP_NAME_ADMIN,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    { id: "domain", label: i18n.nodes.google.__shared.pin_domain, type: "string", direction: "input", defaultValue: "" },
    { id: "query", label: i18n.nodes.google.adminListUsers.pin_query, type: "string", direction: "input", defaultValue: "" },
    { id: "maxResults", label: i18n.nodes.google.__shared.pin_max_results, type: "number", direction: "input", defaultValue: 100 },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "users", label: i18n.nodes.google.adminListUsers.pin_users, type: "struct", subType: ADMIN_USER_STRUCT_TYPE, container: "array", direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleServiceAccountCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, users: [], error: resolved.error } };
    const result = await GoogleAdminManager.forServiceAccount(resolved.data).listUsers(String(inputs.domain ?? ""), String(inputs.query ?? ""), Number(inputs.maxResults ?? 100));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleAdminListUsers(${inputs.credentialName}, ${inputs.domain}, ${inputs.query}, ${inputs.maxResults});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, users: `${v}.users`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

registerNode({
  type: "google.adminGetUser",
  label: i18n.nodes.google.adminGetUser.label,
  description: i18n.nodes.google.adminGetUser.description,
  group: GROUP_NAME_ADMIN,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    { id: "userKey", label: i18n.nodes.google.__shared.pin_user_key, type: "string", direction: "input", defaultValue: "" },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "user", label: i18n.nodes.google.googleAdminUser.label, type: "struct", subType: ADMIN_USER_STRUCT_TYPE, direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleServiceAccountCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, user: emptyAdminUser, error: resolved.error } };
    const result = await GoogleAdminManager.forServiceAccount(resolved.data).getUser(String(inputs.userKey ?? ""));
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        user: { id: result.id ?? "", primaryEmail: result.primaryEmail ?? "", fullName: result.fullName ?? "", suspended: result.suspended ?? false },
        error: result.error,
      },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleAdminGetUser(${inputs.credentialName}, ${inputs.userKey});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, user: `${v}.user`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

registerNode({
  type: "google.adminCreateUser",
  label: i18n.nodes.google.adminCreateUser.label,
  description: i18n.nodes.google.adminCreateUser.description,
  group: GROUP_NAME_ADMIN,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    { id: "primaryEmail", label: i18n.nodes.google.__shared.pin_email, type: "string", direction: "input", defaultValue: "" },
    { id: "givenName", label: i18n.nodes.google.adminCreateUser.pin_given_name, type: "string", direction: "input", defaultValue: "" },
    { id: "familyName", label: i18n.nodes.google.adminCreateUser.pin_family_name, type: "string", direction: "input", defaultValue: "" },
    { id: "password", label: i18n.nodes.google.adminCreateUser.pin_password, type: "string", direction: "input", defaultValue: "" },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "user", label: i18n.nodes.google.googleAdminUser.label, type: "struct", subType: ADMIN_USER_STRUCT_TYPE, direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleServiceAccountCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, user: emptyAdminUser, error: resolved.error } };
    const result = await GoogleAdminManager.forServiceAccount(resolved.data).createUser(String(inputs.primaryEmail ?? ""), String(inputs.givenName ?? ""), String(inputs.familyName ?? ""), String(inputs.password ?? ""));
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        user: { id: result.id ?? "", primaryEmail: result.primaryEmail ?? "", fullName: result.fullName ?? "", suspended: result.suspended ?? false },
        error: result.error,
      },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleAdminCreateUser(${inputs.credentialName}, ${inputs.primaryEmail}, ${inputs.givenName}, ${inputs.familyName}, ${inputs.password});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, user: `${v}.user`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

registerNode({
  type: "google.adminUpdateUser",
  label: i18n.nodes.google.adminUpdateUser.label,
  description: i18n.nodes.google.adminUpdateUser.description,
  group: GROUP_NAME_ADMIN,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    { id: "userKey", label: i18n.nodes.google.__shared.pin_user_key, type: "string", direction: "input", defaultValue: "" },
    { id: "propertiesJson", label: i18n.nodes.google.adminUpdateUser.pin_properties_json, type: "string", direction: "input", defaultValue: "{}" },
    execInOutPins().execOut,
    execInOutPins().success,
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleServiceAccountCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const result = await GoogleAdminManager.forServiceAccount(resolved.data).updateUser(String(inputs.userKey ?? ""), String(inputs.propertiesJson ?? "{}"));
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleAdminUpdateUser(${inputs.credentialName}, ${inputs.userKey}, ${inputs.propertiesJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

registerNode({
  type: "google.adminDeleteUser",
  label: i18n.nodes.google.adminDeleteUser.label,
  description: i18n.nodes.google.adminDeleteUser.description,
  group: GROUP_NAME_ADMIN,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInOutPins().execIn, credentialNamePin(), { id: "userKey", label: i18n.nodes.google.__shared.pin_user_key, type: "string", direction: "input", defaultValue: "" }, execInOutPins().execOut, execInOutPins().success, execInOutPins().error],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleServiceAccountCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const result = await GoogleAdminManager.forServiceAccount(resolved.data).deleteUser(String(inputs.userKey ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleAdminDeleteUser(${inputs.credentialName}, ${inputs.userKey});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

registerNode({
  type: "google.adminListGroups",
  label: i18n.nodes.google.adminListGroups.label,
  description: i18n.nodes.google.adminListGroups.description,
  group: GROUP_NAME_ADMIN,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    { id: "domain", label: i18n.nodes.google.__shared.pin_domain, type: "string", direction: "input", defaultValue: "" },
    { id: "maxResults", label: i18n.nodes.google.__shared.pin_max_results, type: "number", direction: "input", defaultValue: 100 },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "groups", label: i18n.nodes.google.adminListGroups.pin_groups, type: "struct", subType: ADMIN_GROUP_STRUCT_TYPE, container: "array", direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleServiceAccountCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, groups: [], error: resolved.error } };
    const result = await GoogleAdminManager.forServiceAccount(resolved.data).listGroups(String(inputs.domain ?? ""), Number(inputs.maxResults ?? 100));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleAdminListGroups(${inputs.credentialName}, ${inputs.domain}, ${inputs.maxResults});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, groups: `${v}.groups`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

registerNode({
  type: "google.adminGetGroup",
  label: i18n.nodes.google.adminGetGroup.label,
  description: i18n.nodes.google.adminGetGroup.description,
  group: GROUP_NAME_ADMIN,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    { id: "groupKey", label: i18n.nodes.google.__shared.pin_group_key, type: "string", direction: "input", defaultValue: "" },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "group", label: i18n.nodes.google.googleAdminGroup.label, type: "struct", subType: ADMIN_GROUP_STRUCT_TYPE, direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleServiceAccountCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, group: emptyAdminGroup, error: resolved.error } };
    const result = await GoogleAdminManager.forServiceAccount(resolved.data).getGroup(String(inputs.groupKey ?? ""));
    return {
      nextExec: "exec-out",
      outputs: { success: result.success, group: { id: result.id ?? "", email: result.email ?? "", name: result.name ?? "" }, error: result.error },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleAdminGetGroup(${inputs.credentialName}, ${inputs.groupKey});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, group: `${v}.group`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

registerNode({
  type: "google.adminCreateGroup",
  label: i18n.nodes.google.adminCreateGroup.label,
  description: i18n.nodes.google.adminCreateGroup.description,
  group: GROUP_NAME_ADMIN,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    { id: "email", label: i18n.nodes.google.__shared.pin_email, type: "string", direction: "input", defaultValue: "" },
    { id: "name", label: i18n.nodes.google.__shared.pin_name, type: "string", direction: "input", defaultValue: "" },
    { id: "description", label: i18n.nodes.google.__shared.pin_description, type: "string", direction: "input", defaultValue: "" },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "group", label: i18n.nodes.google.googleAdminGroup.label, type: "struct", subType: ADMIN_GROUP_STRUCT_TYPE, direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleServiceAccountCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, group: emptyAdminGroup, error: resolved.error } };
    const result = await GoogleAdminManager.forServiceAccount(resolved.data).createGroup(String(inputs.email ?? ""), String(inputs.name ?? ""), String(inputs.description ?? ""));
    return {
      nextExec: "exec-out",
      outputs: { success: result.success, group: { id: result.id ?? "", email: result.email ?? "", name: result.name ?? "" }, error: result.error },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleAdminCreateGroup(${inputs.credentialName}, ${inputs.email}, ${inputs.name}, ${inputs.description});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, group: `${v}.group`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

registerNode({
  type: "google.adminDeleteGroup",
  label: i18n.nodes.google.adminDeleteGroup.label,
  description: i18n.nodes.google.adminDeleteGroup.description,
  group: GROUP_NAME_ADMIN,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInOutPins().execIn, credentialNamePin(), { id: "groupKey", label: i18n.nodes.google.__shared.pin_group_key, type: "string", direction: "input", defaultValue: "" }, execInOutPins().execOut, execInOutPins().success, execInOutPins().error],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleServiceAccountCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const result = await GoogleAdminManager.forServiceAccount(resolved.data).deleteGroup(String(inputs.groupKey ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleAdminDeleteGroup(${inputs.credentialName}, ${inputs.groupKey});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

registerNode({
  type: "google.adminAddGroupMember",
  label: i18n.nodes.google.adminAddGroupMember.label,
  description: i18n.nodes.google.adminAddGroupMember.description,
  group: GROUP_NAME_ADMIN,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    { id: "groupKey", label: i18n.nodes.google.__shared.pin_group_key, type: "string", direction: "input", defaultValue: "" },
    { id: "email", label: i18n.nodes.google.__shared.pin_email, type: "string", direction: "input", defaultValue: "" },
    { id: "role", label: i18n.nodes.google.adminAddGroupMember.pin_role, type: "string", direction: "input", defaultValue: "MEMBER" },
    execInOutPins().execOut,
    execInOutPins().success,
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleServiceAccountCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const result = await GoogleAdminManager.forServiceAccount(resolved.data).addGroupMember(String(inputs.groupKey ?? ""), String(inputs.email ?? ""), String(inputs.role ?? "MEMBER"));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleAdminAddGroupMember(${inputs.credentialName}, ${inputs.groupKey}, ${inputs.email}, ${inputs.role});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});

registerNode({
  type: "google.adminRemoveGroupMember",
  label: i18n.nodes.google.adminRemoveGroupMember.label,
  description: i18n.nodes.google.adminRemoveGroupMember.description,
  group: GROUP_NAME_ADMIN,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    { id: "groupKey", label: i18n.nodes.google.__shared.pin_group_key, type: "string", direction: "input", defaultValue: "" },
    { id: "memberKey", label: i18n.nodes.google.adminRemoveGroupMember.pin_member_key, type: "string", direction: "input", defaultValue: "" },
    execInOutPins().execOut,
    execInOutPins().success,
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGoogleServiceAccountCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const result = await GoogleAdminManager.forServiceAccount(resolved.data).removeGroupMember(String(inputs.groupKey ?? ""), String(inputs.memberKey ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryGoogle.googleAdminRemoveGroupMember(${inputs.credentialName}, ${inputs.groupKey}, ${inputs.memberKey});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_GOOGLE_IMPORT],
});
