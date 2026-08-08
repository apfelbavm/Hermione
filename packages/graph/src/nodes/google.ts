import { NodeColorCategory } from "@hermione/graph/engine/types";
import { registerNode } from "@hermione/graph/engine/registry";
import { compileResultVar, GOOGLE_ADMIN_MANAGER_IMPORT, GOOGLE_CALENDAR_MANAGER_IMPORT, GOOGLE_DOCS_MANAGER_IMPORT, GOOGLE_DRIVE_MANAGER_IMPORT, GOOGLE_GMAIL_MANAGER_IMPORT, GOOGLE_SHEETS_MANAGER_IMPORT, GOOGLE_AUTH_MANAGER_IMPORT } from "@hermione/graph/engine/compileUtils";
import { AUTH_TOKENS_STRUCT_TYPE, DRIVE_FILE_STRUCT_TYPE, DRIVE_PERMISSION_STRUCT_TYPE, GMAIL_MESSAGE_STRUCT_TYPE, GMAIL_LABEL_STRUCT_TYPE, CALENDAR_EVENT_STRUCT_TYPE, CALENDAR_ENTRY_STRUCT_TYPE, ADMIN_USER_STRUCT_TYPE, ADMIN_GROUP_STRUCT_TYPE } from "@hermione/graph/structs/google";
import { GOOGLE_DRIVE_ROLE_ENUM_TYPE, GOOGLE_DRIVE_PERMISSION_TYPE_ENUM_TYPE } from "@hermione/graph/enum/google";
import { TEXT_ENCODING_ENUM_TYPE } from "@hermione/graph/enum/common";
import { enumOptionIds } from "@hermione/graph/engine/enumRegistry";
import { i18n } from "@i18n";

// Every operation below calls the exact same lib/google*Manager.ts static method from both
// execute() (interpreter path) and compileExecute() (compiled/deployed path) — every manager now
// resolves its own named credential straight from the database (see each manager's own
// findCredential), accepting either a Google Service Account or a Google OAuth2 credential (Drive/
// Sheets/Docs/Gmail/Calendar) or a Service Account only (Admin SDK, domain-wide delegation only —
// see googleAdminManager.ts's own doc comment). No ctx.getCredential vault lookup or
// functionLibraryGoogle env-reading layer is needed here anymore — mirrors nodes/twilio.ts/
// nodes/dropbox.ts.
//
// Every manager pulls in better-sqlite3/Node builtins via that DB access, which is fine
// server-side (where execute() always runs) but not for this file's client-side (node-menu)
// bundle, so each is loaded with a runtime `import()` that both bundlers are told to ignore, same
// as loadTwilioManager/loadDropboxManager.

async function loadDriveManager(): Promise<typeof import("@hermione/core/lib/googleDriveManager").GoogleDriveManager> {
  const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "@hermione/core/lib/googleDriveManager");
  return mod.GoogleDriveManager;
}

async function loadSheetsManager(): Promise<typeof import("@hermione/core/lib/googleSheetsManager").GoogleSheetsManager> {
  const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "@hermione/core/lib/googleSheetsManager");
  return mod.GoogleSheetsManager;
}

async function loadDocsManager(): Promise<typeof import("@hermione/core/lib/googleDocsManager").GoogleDocsManager> {
  const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "@hermione/core/lib/googleDocsManager");
  return mod.GoogleDocsManager;
}

async function loadGmailManager(): Promise<typeof import("@hermione/core/lib/googleGmailManager").GoogleGmailManager> {
  const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "@hermione/core/lib/googleGmailManager");
  return mod.GoogleGmailManager;
}

async function loadCalendarManager(): Promise<typeof import("@hermione/core/lib/googleCalendarManager").GoogleCalendarManager> {
  const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "@hermione/core/lib/googleCalendarManager");
  return mod.GoogleCalendarManager;
}

async function loadAdminManager(): Promise<typeof import("@hermione/core/lib/googleAdminManager").GoogleAdminManager> {
  const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "@hermione/core/lib/googleAdminManager");
  return mod.GoogleAdminManager;
}

async function loadAuthManager(): Promise<typeof import("@hermione/core/lib/googleAuthManager").authorize> {
  const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "@hermione/core/lib/googleAuthManager");
  return mod.authorize;
}

const emptyEvent = { id: "", summary: "", start: "", end: "", htmlLink: "" };
const emptyAdminUser = { id: "", primaryEmail: "", fullName: "", suspended: false };
const emptyAdminGroup = { id: "", email: "", name: "" };

const GROUP_NAME = "Request.Google";
const GROUP_NAME_DRIVE = "Request.Google Drive";
const GROUP_NAME_SHEETS = "Request.Google Sheets";
const GROUP_NAME_DOCS = "Request.Google Docs";
const GROUP_NAME_GMAIL = "Request.Google Gmail";
const GROUP_NAME_CALENDAR = "Request.Google Calendar";
const GROUP_NAME_ADMIN = "Request.Google Admin";

function credentialNamePin() {
  return {
    id: "credentialName",
    label: i18n.nodes.google.__shared.pin_credential_name,
    type: "string" as const,
    direction: "input" as const,
    defaultValue: "",
  };
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
  execute: async ({ inputs }) => {
    const authorize = await loadAuthManager();
    const result = await authorize(String(inputs.credentialName ?? ""));
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        tokens: { accessToken: result.accessToken, refreshToken: result.refreshToken, expiresIn: result.expiresIn },
        error: result.error,
      },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await googleAuthorize(${inputs.credentialName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, tokens: `{ accessToken: ${v}.accessToken, refreshToken: ${v}.refreshToken, expiresIn: ${v}.expiresIn }`, error: `${v}.error` };
  },
  compileImports: [GOOGLE_AUTH_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadDriveManager()).listFiles(String(inputs.credentialName ?? ""), String(inputs.query ?? ""), Number(inputs.pageSize ?? 100));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleDriveManager.listFiles(${inputs.credentialName}, ${inputs.query}, ${inputs.pageSize});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, files: `${v}.files`, error: `${v}.error` };
  },
  compileImports: [GOOGLE_DRIVE_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const emptyFile = { id: "", name: "", mimeType: "", isFolder: false, size: 0, webViewLink: "" };
    const result = await (await loadDriveManager()).getFile(String(inputs.credentialName ?? ""), String(inputs.fileId ?? ""));
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        file: result.success ? { id: result.id ?? "", name: result.name ?? "", mimeType: result.mimeType ?? "", isFolder: result.isFolder ?? false, size: result.size ?? 0, webViewLink: result.webViewLink ?? "" } : emptyFile,
        error: result.error,
      },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleDriveManager.getFile(${inputs.credentialName}, ${inputs.fileId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return {
      success: `${v}.success`,
      file: `(${v}.success ? { id: ${v}.id ?? "", name: ${v}.name ?? "", mimeType: ${v}.mimeType ?? "", isFolder: ${v}.isFolder ?? false, size: ${v}.size ?? 0, webViewLink: ${v}.webViewLink ?? "" } : { id: "", name: "", mimeType: "", isFolder: false, size: 0, webViewLink: "" })`,
      error: `${v}.error`,
    };
  },
  compileImports: [GOOGLE_DRIVE_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const emptyFile = { id: "", name: "", mimeType: "", isFolder: false, size: 0, webViewLink: "" };
    const result = await (await loadDriveManager()).uploadFile(String(inputs.credentialName ?? ""), String(inputs.name ?? ""), String(inputs.parentFolderId ?? ""), String(inputs.mimeType ?? ""), String(inputs.content ?? ""), (inputs.encoding as "utf8" | "base64") ?? "utf8");
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        file: result.success ? { id: result.id ?? "", name: result.name ?? "", mimeType: result.mimeType ?? "", isFolder: result.isFolder ?? false, size: result.size ?? 0, webViewLink: result.webViewLink ?? "" } : emptyFile,
        error: result.error,
      },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleDriveManager.uploadFile(${inputs.credentialName}, ${inputs.name}, ${inputs.parentFolderId}, ${inputs.mimeType}, ${inputs.content}, ${inputs.encoding});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return {
      success: `${v}.success`,
      file: `(${v}.success ? { id: ${v}.id ?? "", name: ${v}.name ?? "", mimeType: ${v}.mimeType ?? "", isFolder: ${v}.isFolder ?? false, size: ${v}.size ?? 0, webViewLink: ${v}.webViewLink ?? "" } : { id: "", name: "", mimeType: "", isFolder: false, size: 0, webViewLink: "" })`,
      error: `${v}.error`,
    };
  },
  compileImports: [GOOGLE_DRIVE_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadDriveManager()).updateFileContent(String(inputs.credentialName ?? ""), String(inputs.fileId ?? ""), String(inputs.mimeType ?? ""), String(inputs.content ?? ""), (inputs.encoding as "utf8" | "base64") ?? "utf8");
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleDriveManager.updateFileContent(${inputs.credentialName}, ${inputs.fileId}, ${inputs.mimeType}, ${inputs.content}, ${inputs.encoding});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [GOOGLE_DRIVE_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadDriveManager()).downloadFile(String(inputs.credentialName ?? ""), String(inputs.fileId ?? ""), (inputs.encoding as "utf8" | "base64") ?? "utf8");
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleDriveManager.downloadFile(${inputs.credentialName}, ${inputs.fileId}, ${inputs.encoding});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, content: `${v}.content`, error: `${v}.error` };
  },
  compileImports: [GOOGLE_DRIVE_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const emptyFile = { id: "", name: "", mimeType: "", isFolder: false, size: 0, webViewLink: "" };
    const result = await (await loadDriveManager()).createFolder(String(inputs.credentialName ?? ""), String(inputs.name ?? ""), String(inputs.parentFolderId ?? ""));
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        file: result.success ? { id: result.id ?? "", name: result.name ?? "", mimeType: result.mimeType ?? "", isFolder: result.isFolder ?? false, size: result.size ?? 0, webViewLink: result.webViewLink ?? "" } : emptyFile,
        error: result.error,
      },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleDriveManager.createFolder(${inputs.credentialName}, ${inputs.name}, ${inputs.parentFolderId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return {
      success: `${v}.success`,
      file: `(${v}.success ? { id: ${v}.id ?? "", name: ${v}.name ?? "", mimeType: ${v}.mimeType ?? "", isFolder: ${v}.isFolder ?? false, size: ${v}.size ?? 0, webViewLink: ${v}.webViewLink ?? "" } : { id: "", name: "", mimeType: "", isFolder: false, size: 0, webViewLink: "" })`,
      error: `${v}.error`,
    };
  },
  compileImports: [GOOGLE_DRIVE_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const emptyFile = { id: "", name: "", mimeType: "", isFolder: false, size: 0, webViewLink: "" };
    const result = await (await loadDriveManager()).copyFile(String(inputs.credentialName ?? ""), String(inputs.fileId ?? ""), String(inputs.newName ?? ""), String(inputs.destinationFolderId ?? ""));
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        file: result.success ? { id: result.id ?? "", name: result.name ?? "", mimeType: result.mimeType ?? "", isFolder: result.isFolder ?? false, size: result.size ?? 0, webViewLink: result.webViewLink ?? "" } : emptyFile,
        error: result.error,
      },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleDriveManager.copyFile(${inputs.credentialName}, ${inputs.fileId}, ${inputs.newName}, ${inputs.destinationFolderId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return {
      success: `${v}.success`,
      file: `(${v}.success ? { id: ${v}.id ?? "", name: ${v}.name ?? "", mimeType: ${v}.mimeType ?? "", isFolder: ${v}.isFolder ?? false, size: ${v}.size ?? 0, webViewLink: ${v}.webViewLink ?? "" } : { id: "", name: "", mimeType: "", isFolder: false, size: 0, webViewLink: "" })`,
      error: `${v}.error`,
    };
  },
  compileImports: [GOOGLE_DRIVE_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadDriveManager()).moveFile(String(inputs.credentialName ?? ""), String(inputs.fileId ?? ""), String(inputs.destinationFolderId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleDriveManager.moveFile(${inputs.credentialName}, ${inputs.fileId}, ${inputs.destinationFolderId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [GOOGLE_DRIVE_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadDriveManager()).renameFile(String(inputs.credentialName ?? ""), String(inputs.fileId ?? ""), String(inputs.newName ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleDriveManager.renameFile(${inputs.credentialName}, ${inputs.fileId}, ${inputs.newName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [GOOGLE_DRIVE_MANAGER_IMPORT],
});

registerNode({
  type: "google.driveDeleteFile",
  label: i18n.nodes.google.driveDeleteFile.label,
  description: i18n.nodes.google.driveDeleteFile.description,
  group: GROUP_NAME_DRIVE,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInOutPins().execIn, credentialNamePin(), { id: "fileId", label: i18n.nodes.google.__shared.pin_file_id, type: "string", direction: "input", defaultValue: "" }, execInOutPins().execOut, execInOutPins().success, execInOutPins().error],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadDriveManager()).deleteFile(String(inputs.credentialName ?? ""), String(inputs.fileId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleDriveManager.deleteFile(${inputs.credentialName}, ${inputs.fileId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [GOOGLE_DRIVE_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadDriveManager()).shareFile(String(inputs.credentialName ?? ""), String(inputs.fileId ?? ""), String(inputs.role ?? "reader"), String(inputs.type ?? "user"), String(inputs.emailAddress ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleDriveManager.shareFile(${inputs.credentialName}, ${inputs.fileId}, ${inputs.role}, ${inputs.type}, ${inputs.emailAddress});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, id: `${v}.id`, error: `${v}.error` };
  },
  compileImports: [GOOGLE_DRIVE_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadDriveManager()).listPermissions(String(inputs.credentialName ?? ""), String(inputs.fileId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleDriveManager.listPermissions(${inputs.credentialName}, ${inputs.fileId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, permissions: `${v}.permissions`, error: `${v}.error` };
  },
  compileImports: [GOOGLE_DRIVE_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadDriveManager()).deletePermission(String(inputs.credentialName ?? ""), String(inputs.fileId ?? ""), String(inputs.permissionId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleDriveManager.deletePermission(${inputs.credentialName}, ${inputs.fileId}, ${inputs.permissionId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [GOOGLE_DRIVE_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadSheetsManager()).getValues(String(inputs.credentialName ?? ""), String(inputs.spreadsheetId ?? ""), String(inputs.range ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleSheetsManager.getValues(${inputs.credentialName}, ${inputs.spreadsheetId}, ${inputs.range});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, valuesJson: `${v}.valuesJson`, error: `${v}.error` };
  },
  compileImports: [GOOGLE_SHEETS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadSheetsManager()).updateValues(String(inputs.credentialName ?? ""), String(inputs.spreadsheetId ?? ""), String(inputs.range ?? ""), String(inputs.valuesJson ?? "[]"));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleSheetsManager.updateValues(${inputs.credentialName}, ${inputs.spreadsheetId}, ${inputs.range}, ${inputs.valuesJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, updatedCells: `${v}.updatedCells`, error: `${v}.error` };
  },
  compileImports: [GOOGLE_SHEETS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadSheetsManager()).appendValues(String(inputs.credentialName ?? ""), String(inputs.spreadsheetId ?? ""), String(inputs.range ?? ""), String(inputs.valuesJson ?? "[]"));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleSheetsManager.appendValues(${inputs.credentialName}, ${inputs.spreadsheetId}, ${inputs.range}, ${inputs.valuesJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, updatedCells: `${v}.updatedCells`, error: `${v}.error` };
  },
  compileImports: [GOOGLE_SHEETS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadSheetsManager()).clearValues(String(inputs.credentialName ?? ""), String(inputs.spreadsheetId ?? ""), String(inputs.range ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleSheetsManager.clearValues(${inputs.credentialName}, ${inputs.spreadsheetId}, ${inputs.range});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [GOOGLE_SHEETS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadSheetsManager()).createSpreadsheet(String(inputs.credentialName ?? ""), String(inputs.title ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleSheetsManager.createSpreadsheet(${inputs.credentialName}, ${inputs.title});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, spreadsheetId: `${v}.spreadsheetId`, spreadsheetUrl: `${v}.spreadsheetUrl`, error: `${v}.error` };
  },
  compileImports: [GOOGLE_SHEETS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadSheetsManager()).addSheet(String(inputs.credentialName ?? ""), String(inputs.spreadsheetId ?? ""), String(inputs.title ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleSheetsManager.addSheet(${inputs.credentialName}, ${inputs.spreadsheetId}, ${inputs.title});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, sheetId: `${v}.sheetId`, error: `${v}.error` };
  },
  compileImports: [GOOGLE_SHEETS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadSheetsManager()).deleteSheet(String(inputs.credentialName ?? ""), String(inputs.spreadsheetId ?? ""), Number(inputs.sheetId ?? 0));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleSheetsManager.deleteSheet(${inputs.credentialName}, ${inputs.spreadsheetId}, ${inputs.sheetId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [GOOGLE_SHEETS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadSheetsManager()).getMetadata(String(inputs.credentialName ?? ""), String(inputs.spreadsheetId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleSheetsManager.getMetadata(${inputs.credentialName}, ${inputs.spreadsheetId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, title: `${v}.title`, sheetTitlesJson: `${v}.sheetTitlesJson`, error: `${v}.error` };
  },
  compileImports: [GOOGLE_SHEETS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadDocsManager()).createDocument(String(inputs.credentialName ?? ""), String(inputs.title ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleDocsManager.createDocument(${inputs.credentialName}, ${inputs.title});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, documentId: `${v}.documentId`, error: `${v}.error` };
  },
  compileImports: [GOOGLE_DOCS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadDocsManager()).getText(String(inputs.credentialName ?? ""), String(inputs.documentId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleDocsManager.getText(${inputs.credentialName}, ${inputs.documentId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, text: `${v}.text`, error: `${v}.error` };
  },
  compileImports: [GOOGLE_DOCS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadDocsManager()).appendText(String(inputs.credentialName ?? ""), String(inputs.documentId ?? ""), String(inputs.text ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleDocsManager.appendText(${inputs.credentialName}, ${inputs.documentId}, ${inputs.text});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [GOOGLE_DOCS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadDocsManager()).insertText(String(inputs.credentialName ?? ""), String(inputs.documentId ?? ""), String(inputs.text ?? ""), Number(inputs.index ?? 1));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleDocsManager.insertText(${inputs.credentialName}, ${inputs.documentId}, ${inputs.text}, ${inputs.index});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [GOOGLE_DOCS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadDocsManager()).replaceAllText(String(inputs.credentialName ?? ""), String(inputs.documentId ?? ""), String(inputs.find ?? ""), String(inputs.replacement ?? ""), Boolean(inputs.matchCase));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleDocsManager.replaceAllText(${inputs.credentialName}, ${inputs.documentId}, ${inputs.find}, ${inputs.replacement}, ${inputs.matchCase});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [GOOGLE_DOCS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadGmailManager()).listMessages(String(inputs.credentialName ?? ""), String(inputs.query ?? ""), Number(inputs.maxResults ?? 20));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleGmailManager.listMessages(${inputs.credentialName}, ${inputs.query}, ${inputs.maxResults});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, messages: `${v}.messages`, error: `${v}.error` };
  },
  compileImports: [GOOGLE_GMAIL_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadGmailManager()).getMessage(String(inputs.credentialName ?? ""), String(inputs.messageId ?? ""));
    return {
      nextExec: "exec-out",
      outputs: { success: result.success, subject: result.subject ?? "", from: result.from ?? "", snippet: result.snippet ?? "", body: result.body, error: result.error },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleGmailManager.getMessage(${inputs.credentialName}, ${inputs.messageId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, subject: `(${v}.subject ?? "")`, from: `(${v}.from ?? "")`, snippet: `(${v}.snippet ?? "")`, body: `${v}.body`, error: `${v}.error` };
  },
  compileImports: [GOOGLE_GMAIL_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadGmailManager()).sendMessage(String(inputs.credentialName ?? ""), String(inputs.to ?? ""), String(inputs.subject ?? ""), String(inputs.body ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleGmailManager.sendMessage(${inputs.credentialName}, ${inputs.to}, ${inputs.subject}, ${inputs.body});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, id: `${v}.id`, error: `${v}.error` };
  },
  compileImports: [GOOGLE_GMAIL_MANAGER_IMPORT],
});

registerNode({
  type: "google.gmailTrashMessage",
  label: i18n.nodes.google.gmailTrashMessage.label,
  description: i18n.nodes.google.gmailTrashMessage.description,
  group: GROUP_NAME_GMAIL,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInOutPins().execIn, credentialNamePin(), { id: "messageId", label: i18n.nodes.google.__shared.pin_message_id, type: "string", direction: "input", defaultValue: "" }, execInOutPins().execOut, execInOutPins().success, execInOutPins().error],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadGmailManager()).trashMessage(String(inputs.credentialName ?? ""), String(inputs.messageId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleGmailManager.trashMessage(${inputs.credentialName}, ${inputs.messageId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [GOOGLE_GMAIL_MANAGER_IMPORT],
});

registerNode({
  type: "google.gmailListLabels",
  label: i18n.nodes.google.gmailListLabels.label,
  description: i18n.nodes.google.gmailListLabels.description,
  group: GROUP_NAME_GMAIL,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInOutPins().execIn, credentialNamePin(), execInOutPins().execOut, execInOutPins().success, { id: "labels", label: i18n.nodes.google.gmailListLabels.pin_labels, type: "struct", subType: GMAIL_LABEL_STRUCT_TYPE, container: "array", direction: "output" }, execInOutPins().error],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadGmailManager()).listLabels(String(inputs.credentialName ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleGmailManager.listLabels(${inputs.credentialName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, labels: `${v}.labels`, error: `${v}.error` };
  },
  compileImports: [GOOGLE_GMAIL_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadGmailManager()).createLabel(String(inputs.credentialName ?? ""), String(inputs.name ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleGmailManager.createLabel(${inputs.credentialName}, ${inputs.name});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, id: `${v}.id`, error: `${v}.error` };
  },
  compileImports: [GOOGLE_GMAIL_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const parseIds = (value: unknown) =>
      String(value ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id !== "");
    const result = await (await loadGmailManager()).modifyMessageLabels(String(inputs.credentialName ?? ""), String(inputs.messageId ?? ""), parseIds(inputs.addLabelIds), parseIds(inputs.removeLabelIds));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleGmailManager.modifyMessageLabels(${inputs.credentialName}, ${inputs.messageId}, ${inputs.addLabelIds}, ${inputs.removeLabelIds});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [GOOGLE_GMAIL_MANAGER_IMPORT],
});

// ---------------------------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------------------------

function calendarIdPin() {
  return { id: "calendarId", label: i18n.nodes.google.__shared.pin_calendar_id, type: "string" as const, direction: "input" as const, defaultValue: "primary" };
}

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
  execute: async ({ inputs }) => {
    const result = await (await loadCalendarManager()).listEvents(String(inputs.credentialName ?? ""), String(inputs.calendarId ?? "primary"), String(inputs.timeMin ?? ""), String(inputs.timeMax ?? ""), Number(inputs.maxResults ?? 20));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleCalendarManager.listEvents(${inputs.credentialName}, ${inputs.calendarId}, ${inputs.timeMin}, ${inputs.timeMax}, ${inputs.maxResults});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, events: `${v}.events`, error: `${v}.error` };
  },
  compileImports: [GOOGLE_CALENDAR_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadCalendarManager()).getEvent(String(inputs.credentialName ?? ""), String(inputs.calendarId ?? "primary"), String(inputs.eventId ?? ""));
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        event: result.success ? { id: result.id ?? "", summary: result.summary ?? "", start: result.start ?? "", end: result.end ?? "", htmlLink: result.htmlLink ?? "" } : emptyEvent,
        error: result.error,
      },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleCalendarManager.getEvent(${inputs.credentialName}, ${inputs.calendarId}, ${inputs.eventId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return {
      success: `${v}.success`,
      event: `(${v}.success ? { id: ${v}.id ?? "", summary: ${v}.summary ?? "", start: ${v}.start ?? "", end: ${v}.end ?? "", htmlLink: ${v}.htmlLink ?? "" } : { id: "", summary: "", start: "", end: "", htmlLink: "" })`,
      error: `${v}.error`,
    };
  },
  compileImports: [GOOGLE_CALENDAR_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadCalendarManager()).createEvent(String(inputs.credentialName ?? ""), String(inputs.calendarId ?? "primary"), String(inputs.summary ?? ""), String(inputs.start ?? ""), String(inputs.end ?? ""), String(inputs.description ?? ""));
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        event: result.success ? { id: result.id ?? "", summary: result.summary ?? "", start: result.start ?? "", end: result.end ?? "", htmlLink: result.htmlLink ?? "" } : emptyEvent,
        error: result.error,
      },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleCalendarManager.createEvent(${inputs.credentialName}, ${inputs.calendarId}, ${inputs.summary}, ${inputs.start}, ${inputs.end}, ${inputs.description});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return {
      success: `${v}.success`,
      event: `(${v}.success ? { id: ${v}.id ?? "", summary: ${v}.summary ?? "", start: ${v}.start ?? "", end: ${v}.end ?? "", htmlLink: ${v}.htmlLink ?? "" } : { id: "", summary: "", start: "", end: "", htmlLink: "" })`,
      error: `${v}.error`,
    };
  },
  compileImports: [GOOGLE_CALENDAR_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadCalendarManager()).updateEvent(String(inputs.credentialName ?? ""), String(inputs.calendarId ?? "primary"), String(inputs.eventId ?? ""), String(inputs.summary ?? ""), String(inputs.start ?? ""), String(inputs.end ?? ""), String(inputs.description ?? ""));
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        event: result.success ? { id: result.id ?? "", summary: result.summary ?? "", start: result.start ?? "", end: result.end ?? "", htmlLink: result.htmlLink ?? "" } : emptyEvent,
        error: result.error,
      },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await GoogleCalendarManager.updateEvent(${inputs.credentialName}, ${inputs.calendarId}, ${inputs.eventId}, ${inputs.summary}, ${inputs.start}, ${inputs.end}, ${inputs.description});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return {
      success: `${v}.success`,
      event: `(${v}.success ? { id: ${v}.id ?? "", summary: ${v}.summary ?? "", start: ${v}.start ?? "", end: ${v}.end ?? "", htmlLink: ${v}.htmlLink ?? "" } : { id: "", summary: "", start: "", end: "", htmlLink: "" })`,
      error: `${v}.error`,
    };
  },
  compileImports: [GOOGLE_CALENDAR_MANAGER_IMPORT],
});

registerNode({
  type: "google.calendarDeleteEvent",
  label: i18n.nodes.google.calendarDeleteEvent.label,
  description: i18n.nodes.google.calendarDeleteEvent.description,
  group: GROUP_NAME_CALENDAR,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInOutPins().execIn, credentialNamePin(), calendarIdPin(), { id: "eventId", label: i18n.nodes.google.__shared.pin_event_id, type: "string", direction: "input", defaultValue: "" }, execInOutPins().execOut, execInOutPins().success, execInOutPins().error],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadCalendarManager()).deleteEvent(String(inputs.credentialName ?? ""), String(inputs.calendarId ?? "primary"), String(inputs.eventId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleCalendarManager.deleteEvent(${inputs.credentialName}, ${inputs.calendarId}, ${inputs.eventId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [GOOGLE_CALENDAR_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadCalendarManager()).quickAddEvent(String(inputs.credentialName ?? ""), String(inputs.calendarId ?? "primary"), String(inputs.text ?? ""));
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        event: result.success ? { id: result.id ?? "", summary: result.summary ?? "", start: result.start ?? "", end: result.end ?? "", htmlLink: result.htmlLink ?? "" } : emptyEvent,
        error: result.error,
      },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleCalendarManager.quickAddEvent(${inputs.credentialName}, ${inputs.calendarId}, ${inputs.text});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return {
      success: `${v}.success`,
      event: `(${v}.success ? { id: ${v}.id ?? "", summary: ${v}.summary ?? "", start: ${v}.start ?? "", end: ${v}.end ?? "", htmlLink: ${v}.htmlLink ?? "" } : { id: "", summary: "", start: "", end: "", htmlLink: "" })`,
      error: `${v}.error`,
    };
  },
  compileImports: [GOOGLE_CALENDAR_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadCalendarManager()).listCalendars(String(inputs.credentialName ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleCalendarManager.listCalendars(${inputs.credentialName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, calendars: `${v}.calendars`, error: `${v}.error` };
  },
  compileImports: [GOOGLE_CALENDAR_MANAGER_IMPORT],
});

// ---------------------------------------------------------------------------------------------
// Admin (Directory API — service account with domain-wide delegation only)
// ---------------------------------------------------------------------------------------------

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
  execute: async ({ inputs }) => {
    const result = await (await loadAdminManager()).listUsers(String(inputs.credentialName ?? ""), String(inputs.domain ?? ""), String(inputs.query ?? ""), Number(inputs.maxResults ?? 100));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleAdminManager.listUsers(${inputs.credentialName}, ${inputs.domain}, ${inputs.query}, ${inputs.maxResults});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, users: `${v}.users`, error: `${v}.error` };
  },
  compileImports: [GOOGLE_ADMIN_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadAdminManager()).getUser(String(inputs.credentialName ?? ""), String(inputs.userKey ?? ""));
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        user: result.success ? { id: result.id ?? "", primaryEmail: result.primaryEmail ?? "", fullName: result.fullName ?? "", suspended: result.suspended ?? false } : emptyAdminUser,
        error: result.error,
      },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleAdminManager.getUser(${inputs.credentialName}, ${inputs.userKey});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return {
      success: `${v}.success`,
      user: `(${v}.success ? { id: ${v}.id ?? "", primaryEmail: ${v}.primaryEmail ?? "", fullName: ${v}.fullName ?? "", suspended: ${v}.suspended ?? false } : { id: "", primaryEmail: "", fullName: "", suspended: false })`,
      error: `${v}.error`,
    };
  },
  compileImports: [GOOGLE_ADMIN_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadAdminManager()).createUser(String(inputs.credentialName ?? ""), String(inputs.primaryEmail ?? ""), String(inputs.givenName ?? ""), String(inputs.familyName ?? ""), String(inputs.password ?? ""));
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        user: result.success ? { id: result.id ?? "", primaryEmail: result.primaryEmail ?? "", fullName: result.fullName ?? "", suspended: result.suspended ?? false } : emptyAdminUser,
        error: result.error,
      },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleAdminManager.createUser(${inputs.credentialName}, ${inputs.primaryEmail}, ${inputs.givenName}, ${inputs.familyName}, ${inputs.password});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return {
      success: `${v}.success`,
      user: `(${v}.success ? { id: ${v}.id ?? "", primaryEmail: ${v}.primaryEmail ?? "", fullName: ${v}.fullName ?? "", suspended: ${v}.suspended ?? false } : { id: "", primaryEmail: "", fullName: "", suspended: false })`,
      error: `${v}.error`,
    };
  },
  compileImports: [GOOGLE_ADMIN_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadAdminManager()).updateUser(String(inputs.credentialName ?? ""), String(inputs.userKey ?? ""), String(inputs.propertiesJson ?? "{}"));
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleAdminManager.updateUser(${inputs.credentialName}, ${inputs.userKey}, ${inputs.propertiesJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [GOOGLE_ADMIN_MANAGER_IMPORT],
});

registerNode({
  type: "google.adminDeleteUser",
  label: i18n.nodes.google.adminDeleteUser.label,
  description: i18n.nodes.google.adminDeleteUser.description,
  group: GROUP_NAME_ADMIN,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInOutPins().execIn, credentialNamePin(), { id: "userKey", label: i18n.nodes.google.__shared.pin_user_key, type: "string", direction: "input", defaultValue: "" }, execInOutPins().execOut, execInOutPins().success, execInOutPins().error],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadAdminManager()).deleteUser(String(inputs.credentialName ?? ""), String(inputs.userKey ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleAdminManager.deleteUser(${inputs.credentialName}, ${inputs.userKey});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [GOOGLE_ADMIN_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadAdminManager()).listGroups(String(inputs.credentialName ?? ""), String(inputs.domain ?? ""), Number(inputs.maxResults ?? 100));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleAdminManager.listGroups(${inputs.credentialName}, ${inputs.domain}, ${inputs.maxResults});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, groups: `${v}.groups`, error: `${v}.error` };
  },
  compileImports: [GOOGLE_ADMIN_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadAdminManager()).getGroup(String(inputs.credentialName ?? ""), String(inputs.groupKey ?? ""));
    return {
      nextExec: "exec-out",
      outputs: { success: result.success, group: result.success ? { id: result.id ?? "", email: result.email ?? "", name: result.name ?? "" } : emptyAdminGroup, error: result.error },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleAdminManager.getGroup(${inputs.credentialName}, ${inputs.groupKey});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return {
      success: `${v}.success`,
      group: `(${v}.success ? { id: ${v}.id ?? "", email: ${v}.email ?? "", name: ${v}.name ?? "" } : { id: "", email: "", name: "" })`,
      error: `${v}.error`,
    };
  },
  compileImports: [GOOGLE_ADMIN_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadAdminManager()).createGroup(String(inputs.credentialName ?? ""), String(inputs.email ?? ""), String(inputs.name ?? ""), String(inputs.description ?? ""));
    return {
      nextExec: "exec-out",
      outputs: { success: result.success, group: result.success ? { id: result.id ?? "", email: result.email ?? "", name: result.name ?? "" } : emptyAdminGroup, error: result.error },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleAdminManager.createGroup(${inputs.credentialName}, ${inputs.email}, ${inputs.name}, ${inputs.description});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return {
      success: `${v}.success`,
      group: `(${v}.success ? { id: ${v}.id ?? "", email: ${v}.email ?? "", name: ${v}.name ?? "" } : { id: "", email: "", name: "" })`,
      error: `${v}.error`,
    };
  },
  compileImports: [GOOGLE_ADMIN_MANAGER_IMPORT],
});

registerNode({
  type: "google.adminDeleteGroup",
  label: i18n.nodes.google.adminDeleteGroup.label,
  description: i18n.nodes.google.adminDeleteGroup.description,
  group: GROUP_NAME_ADMIN,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInOutPins().execIn, credentialNamePin(), { id: "groupKey", label: i18n.nodes.google.__shared.pin_group_key, type: "string", direction: "input", defaultValue: "" }, execInOutPins().execOut, execInOutPins().success, execInOutPins().error],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadAdminManager()).deleteGroup(String(inputs.credentialName ?? ""), String(inputs.groupKey ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleAdminManager.deleteGroup(${inputs.credentialName}, ${inputs.groupKey});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [GOOGLE_ADMIN_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadAdminManager()).addGroupMember(String(inputs.credentialName ?? ""), String(inputs.groupKey ?? ""), String(inputs.email ?? ""), String(inputs.role ?? "MEMBER"));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleAdminManager.addGroupMember(${inputs.credentialName}, ${inputs.groupKey}, ${inputs.email}, ${inputs.role});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [GOOGLE_ADMIN_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadAdminManager()).removeGroupMember(String(inputs.credentialName ?? ""), String(inputs.groupKey ?? ""), String(inputs.memberKey ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GoogleAdminManager.removeGroupMember(${inputs.credentialName}, ${inputs.groupKey}, ${inputs.memberKey});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [GOOGLE_ADMIN_MANAGER_IMPORT],
});
