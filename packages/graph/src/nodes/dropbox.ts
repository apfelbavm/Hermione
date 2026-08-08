import { NodeColorCategory } from "@hermione/graph/engine/types";
import { registerNode } from "@hermione/graph/engine/registry";
import { compileResultVar, DROPBOX_MANAGER_IMPORT } from "@hermione/graph/engine/compileUtils";
import { AUTH_TOKENS_STRUCT_TYPE, METADATA_STRUCT_TYPE, REVISION_STRUCT_TYPE, ACCOUNT_STRUCT_TYPE, SPACE_USAGE_STRUCT_TYPE } from "@hermione/graph/structs/dropbox";
import { DROPBOX_WRITE_MODE_ENUM_TYPE, DROPBOX_ACCESS_LEVEL_ENUM_TYPE } from "@hermione/graph/enum/dropbox";
import { TEXT_ENCODING_ENUM_TYPE } from "@hermione/graph/enum/common";
import { enumOptionIds } from "@hermione/graph/engine/enumRegistry";
import { i18n } from "@i18n";

const GROUP_NAME = "Request.Dropbox";

// Every op below, including dropbox.authorize, delegates straight to the matching DropboxManager
// static method (packages/core/src/lib/dropboxManager.ts), which resolves the named credential
// from the vault database itself — no ctx.getCredential lookup or functionLibraryDropbox
// env-reading layer needed here (see DropboxManager's own findCredential/authorize). DropboxManager
// pulls in better-sqlite3/Node builtins via that DB access, which is fine server-side but not for
// this file's client-side (node-menu) bundle, so it's loaded with a runtime `import()` that both
// bundlers are told to ignore, same as loadTwilioManager/loadFacebookManager.
async function loadDropboxManager(): Promise<typeof import("@hermione/core/lib/dropboxManager").DropboxManager> {
  const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "@hermione/core/lib/dropboxManager");
  return mod.DropboxManager;
}

function credentialNamePin() {
  return {
    id: "credentialName",
    label: i18n.nodes.dropbox.__shared.pin_credential_name,
    type: "string" as const,
    direction: "input" as const,
    defaultValue: "",
  };
}

registerNode({
  type: "dropbox.authorize",
  label: i18n.nodes.dropbox.authorize.label,
  description: i18n.nodes.dropbox.authorize.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    { id: "credentialName", label: i18n.nodes.dropbox.authorize.pin_credential_name, type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "tokens", label: i18n.nodes.dropbox.authTokens.label, type: "struct", subType: AUTH_TOKENS_STRUCT_TYPE, direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadDropboxManager()).authorize(String(inputs.credentialName ?? ""));
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        tokens: {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          expiresIn: result.expiresIn,
        },
        error: result.error,
      },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await DropboxManager.authorize(${inputs.credentialName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, tokens: `{ accessToken: ${v}.accessToken, refreshToken: ${v}.refreshToken, expiresIn: ${v}.expiresIn }`, error: `${v}.error` };
  },
  compileImports: [DROPBOX_MANAGER_IMPORT],
});

registerNode({
  type: "dropbox.upload",
  label: i18n.nodes.dropbox.upload.label,
  description: i18n.nodes.dropbox.upload.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "path", label: i18n.nodes.dropbox.__shared.pin_path, type: "string", direction: "input", defaultValue: "" },
    { id: "content", label: i18n.nodes.dropbox.upload.pin_content, type: "string", direction: "input", defaultValue: "" },
    { id: "encoding", label: i18n.nodes.dropbox.__shared.pin_encoding, type: "enum", subType: TEXT_ENCODING_ENUM_TYPE, direction: "input", defaultValue: "utf8", options: enumOptionIds(TEXT_ENCODING_ENUM_TYPE) },
    { id: "mode", label: i18n.nodes.dropbox.upload.pin_mode, type: "enum", subType: DROPBOX_WRITE_MODE_ENUM_TYPE, direction: "input", defaultValue: "add", options: enumOptionIds(DROPBOX_WRITE_MODE_ENUM_TYPE) },
    { id: "autorename", label: i18n.nodes.dropbox.__shared.pin_autorename, type: "boolean", direction: "input", defaultValue: false },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadDropboxManager()).upload(String(inputs.credentialName ?? ""), String(inputs.path ?? ""), String(inputs.content ?? ""), inputs.encoding === "base64" ? "base64" : "utf8", inputs.mode === "overwrite" ? "overwrite" : "add", Boolean(inputs.autorename));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await DropboxManager.upload(${inputs.credentialName}, ${inputs.path}, ${inputs.content}, ${inputs.encoding}, ${inputs.mode}, ${inputs.autorename});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [DROPBOX_MANAGER_IMPORT],
});

registerNode({
  type: "dropbox.download",
  label: i18n.nodes.dropbox.download.label,
  description: i18n.nodes.dropbox.download.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "path", label: i18n.nodes.dropbox.__shared.pin_path, type: "string", direction: "input", defaultValue: "" },
    { id: "encoding", label: i18n.nodes.dropbox.__shared.pin_encoding, type: "enum", subType: TEXT_ENCODING_ENUM_TYPE, direction: "input", defaultValue: "utf8", options: enumOptionIds(TEXT_ENCODING_ENUM_TYPE) },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "content", label: i18n.nodes.dropbox.download.pin_content, type: "string", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadDropboxManager()).download(String(inputs.credentialName ?? ""), String(inputs.path ?? ""), inputs.encoding === "base64" ? "base64" : "utf8");
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await DropboxManager.download(${inputs.credentialName}, ${inputs.path}, ${inputs.encoding});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, content: `${v}.content`, error: `${v}.error` };
  },
  compileImports: [DROPBOX_MANAGER_IMPORT],
});

registerNode({
  type: "dropbox.listFolders",
  label: i18n.nodes.dropbox.listFolders.label,
  description: i18n.nodes.dropbox.listFolders.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "path", label: i18n.nodes.dropbox.__shared.pin_path, type: "string", direction: "input", defaultValue: "" },
    { id: "recursive", label: i18n.nodes.dropbox.listFolders.pin_recursive, type: "boolean", direction: "input", defaultValue: false },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "folders", label: i18n.nodes.dropbox.listFolders.pin_folders, type: "string", container: "array", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadDropboxManager()).listFolders(String(inputs.credentialName ?? ""), String(inputs.path ?? ""), Boolean(inputs.recursive));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await DropboxManager.listFolders(${inputs.credentialName}, ${inputs.path}, ${inputs.recursive});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, folders: `${v}.folders`, error: `${v}.error` };
  },
  compileImports: [DROPBOX_MANAGER_IMPORT],
});

function registerRelocationNode(type: "move" | "copy" | "rename") {
  registerNode({
    type: `dropbox.${type}`,
    label: i18n.nodes.dropbox[type].label,
    description: i18n.nodes.dropbox[type].description,
    group: GROUP_NAME,
    colorCategory: NodeColorCategory.Integration,
    pins: [
      { id: "exec-in", label: "", type: "exec", direction: "input" },
      credentialNamePin(),
      { id: "fromPath", label: i18n.nodes.dropbox.__shared.pin_from_path, type: "string", direction: "input", defaultValue: "" },
      { id: "toPath", label: i18n.nodes.dropbox.__shared.pin_to_path, type: "string", direction: "input", defaultValue: "" },
      { id: "autorename", label: i18n.nodes.dropbox.__shared.pin_autorename, type: "boolean", direction: "input", defaultValue: false },
      { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
      { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
      { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
    ],
    latent: true,
    execute: async ({ inputs }) => {
      const manager = await loadDropboxManager();
      const result = await manager[type](String(inputs.credentialName ?? ""), String(inputs.fromPath ?? ""), String(inputs.toPath ?? ""), Boolean(inputs.autorename));
      return { nextExec: "exec-out", outputs: result };
    },
    compileExecute: ({ node, inputs, compileFrom }) => {
      const fn = type === "move" ? "move" : type === "copy" ? "copy" : "rename";
      return [`const ${compileResultVar(node.id)} = await DropboxManager.${fn}(${inputs.credentialName}, ${inputs.fromPath}, ${inputs.toPath}, ${inputs.autorename});`, ...compileFrom("exec-out")];
    },
    compileExecuteOutputs: ({ node }) => {
      const v = compileResultVar(node.id);
      return { success: `${v}.success`, error: `${v}.error` };
    },
    compileImports: [DROPBOX_MANAGER_IMPORT],
  });
}

registerRelocationNode("move");
registerRelocationNode("copy");
registerRelocationNode("rename");

registerNode({
  type: "dropbox.delete",
  label: i18n.nodes.dropbox.delete.label,
  description: i18n.nodes.dropbox.delete.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "path", label: i18n.nodes.dropbox.__shared.pin_path, type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadDropboxManager()).delete(String(inputs.credentialName ?? ""), String(inputs.path ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await DropboxManager.delete(${inputs.credentialName}, ${inputs.path});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [DROPBOX_MANAGER_IMPORT],
});

registerNode({
  type: "dropbox.createFolder",
  label: i18n.nodes.dropbox.createFolder.label,
  description: i18n.nodes.dropbox.createFolder.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "path", label: i18n.nodes.dropbox.__shared.pin_path, type: "string", direction: "input", defaultValue: "" },
    { id: "autorename", label: i18n.nodes.dropbox.__shared.pin_autorename, type: "boolean", direction: "input", defaultValue: false },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadDropboxManager()).createFolder(String(inputs.credentialName ?? ""), String(inputs.path ?? ""), Boolean(inputs.autorename));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await DropboxManager.createFolder(${inputs.credentialName}, ${inputs.path}, ${inputs.autorename});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [DROPBOX_MANAGER_IMPORT],
});

registerNode({
  type: "dropbox.getMetadata",
  label: i18n.nodes.dropbox.getMetadata.label,
  description: i18n.nodes.dropbox.getMetadata.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "path", label: i18n.nodes.dropbox.__shared.pin_path, type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "metadata", label: i18n.nodes.dropbox.metadata.label, type: "struct", subType: METADATA_STRUCT_TYPE, direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadDropboxManager()).getMetadata(String(inputs.credentialName ?? ""), String(inputs.path ?? ""));
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        metadata: {
          isFolder: result.isFolder,
          size: result.size,
          contentHash: result.contentHash,
          serverModified: result.serverModified,
        },
        error: result.error,
      },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await DropboxManager.getMetadata(${inputs.credentialName}, ${inputs.path});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, metadata: `{ isFolder: ${v}.isFolder, size: ${v}.size, contentHash: ${v}.contentHash, serverModified: ${v}.serverModified }`, error: `${v}.error` };
  },
  compileImports: [DROPBOX_MANAGER_IMPORT],
});

registerNode({
  type: "dropbox.search",
  label: i18n.nodes.dropbox.search.label,
  description: i18n.nodes.dropbox.search.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "query", label: i18n.nodes.dropbox.search.pin_query, type: "string", direction: "input", defaultValue: "" },
    { id: "path", label: i18n.nodes.dropbox.__shared.pin_path, type: "string", direction: "input", defaultValue: "" },
    { id: "maxResults", label: i18n.nodes.dropbox.search.pin_max_results, type: "number", direction: "input", defaultValue: 100, integer: true },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "paths", label: i18n.nodes.dropbox.search.pin_paths, type: "string", container: "array", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadDropboxManager()).search(String(inputs.credentialName ?? ""), String(inputs.query ?? ""), String(inputs.path ?? ""), Number(inputs.maxResults ?? 100));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await DropboxManager.search(${inputs.credentialName}, ${inputs.query}, ${inputs.path}, ${inputs.maxResults});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, paths: `${v}.paths`, error: `${v}.error` };
  },
  compileImports: [DROPBOX_MANAGER_IMPORT],
});

registerNode({
  type: "dropbox.listRevisions",
  label: i18n.nodes.dropbox.listRevisions.label,
  description: i18n.nodes.dropbox.listRevisions.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "path", label: i18n.nodes.dropbox.__shared.pin_path, type: "string", direction: "input", defaultValue: "" },
    { id: "limit", label: i18n.nodes.dropbox.listRevisions.pin_limit, type: "number", direction: "input", defaultValue: 10, integer: true },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "revisions", label: i18n.nodes.dropbox.listRevisions.pin_revisions, type: "struct", subType: REVISION_STRUCT_TYPE, container: "array", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadDropboxManager()).listRevisions(String(inputs.credentialName ?? ""), String(inputs.path ?? ""), Number(inputs.limit ?? 10));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await DropboxManager.listRevisions(${inputs.credentialName}, ${inputs.path}, ${inputs.limit});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, revisions: `${v}.revisions`, error: `${v}.error` };
  },
  compileImports: [DROPBOX_MANAGER_IMPORT],
});

registerNode({
  type: "dropbox.restore",
  label: i18n.nodes.dropbox.restore.label,
  description: i18n.nodes.dropbox.restore.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "path", label: i18n.nodes.dropbox.__shared.pin_path, type: "string", direction: "input", defaultValue: "" },
    { id: "rev", label: i18n.nodes.dropbox.restore.pin_rev, type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadDropboxManager()).restore(String(inputs.credentialName ?? ""), String(inputs.path ?? ""), String(inputs.rev ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await DropboxManager.restore(${inputs.credentialName}, ${inputs.path}, ${inputs.rev});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [DROPBOX_MANAGER_IMPORT],
});

registerNode({
  type: "dropbox.permanentlyDelete",
  label: i18n.nodes.dropbox.permanentlyDelete.label,
  description: i18n.nodes.dropbox.permanentlyDelete.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "path", label: i18n.nodes.dropbox.__shared.pin_path, type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadDropboxManager()).permanentlyDelete(String(inputs.credentialName ?? ""), String(inputs.path ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await DropboxManager.permanentlyDelete(${inputs.credentialName}, ${inputs.path});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [DROPBOX_MANAGER_IMPORT],
});

registerNode({
  type: "dropbox.getTemporaryLink",
  label: i18n.nodes.dropbox.getTemporaryLink.label,
  description: i18n.nodes.dropbox.getTemporaryLink.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "path", label: i18n.nodes.dropbox.__shared.pin_path, type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "link", label: i18n.nodes.dropbox.__shared.pin_link, type: "string", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadDropboxManager()).getTemporaryLink(String(inputs.credentialName ?? ""), String(inputs.path ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await DropboxManager.getTemporaryLink(${inputs.credentialName}, ${inputs.path});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, link: `${v}.link`, error: `${v}.error` };
  },
  compileImports: [DROPBOX_MANAGER_IMPORT],
});

registerNode({
  type: "dropbox.getTemporaryUploadLink",
  label: i18n.nodes.dropbox.getTemporaryUploadLink.label,
  description: i18n.nodes.dropbox.getTemporaryUploadLink.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "path", label: i18n.nodes.dropbox.__shared.pin_path, type: "string", direction: "input", defaultValue: "" },
    { id: "durationSeconds", label: i18n.nodes.dropbox.getTemporaryUploadLink.pin_duration_seconds, type: "number", direction: "input", defaultValue: 14400, integer: true },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "link", label: i18n.nodes.dropbox.__shared.pin_link, type: "string", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadDropboxManager()).getTemporaryUploadLink(String(inputs.credentialName ?? ""), String(inputs.path ?? ""), Number(inputs.durationSeconds ?? 14400));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await DropboxManager.getTemporaryUploadLink(${inputs.credentialName}, ${inputs.path}, ${inputs.durationSeconds});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, link: `${v}.link`, error: `${v}.error` };
  },
  compileImports: [DROPBOX_MANAGER_IMPORT],
});

function registerRelocationBatchNode(type: "moveBatch" | "copyBatch") {
  registerNode({
    type: `dropbox.${type}`,
    label: i18n.nodes.dropbox[type].label,
    description: i18n.nodes.dropbox[type].description,
    group: GROUP_NAME,
    colorCategory: NodeColorCategory.Integration,
    pins: [
      { id: "exec-in", label: "", type: "exec", direction: "input" },
      credentialNamePin(),
      { id: "fromPaths", label: i18n.nodes.dropbox.__shared.pin_from_path, type: "string", container: "array", direction: "input" },
      { id: "toPaths", label: i18n.nodes.dropbox.__shared.pin_to_path, type: "string", container: "array", direction: "input" },
      { id: "autorename", label: i18n.nodes.dropbox.__shared.pin_autorename, type: "boolean", direction: "input", defaultValue: false },
      { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
      { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
      { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
    ],
    latent: true,
    execute: async ({ inputs }) => {
      const manager = await loadDropboxManager();
      const result = await manager[type](String(inputs.credentialName ?? ""), (inputs.fromPaths as string[]) ?? [], (inputs.toPaths as string[]) ?? [], Boolean(inputs.autorename));
      return { nextExec: "exec-out", outputs: result };
    },
    compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await DropboxManager.${type}(${inputs.credentialName}, ${inputs.fromPaths}, ${inputs.toPaths}, ${inputs.autorename});`, ...compileFrom("exec-out")],
    compileExecuteOutputs: ({ node }) => {
      const v = compileResultVar(node.id);
      return { success: `${v}.success`, error: `${v}.error` };
    },
    compileImports: [DROPBOX_MANAGER_IMPORT],
  });
}

registerRelocationBatchNode("moveBatch");
registerRelocationBatchNode("copyBatch");

registerNode({
  type: "dropbox.deleteBatch",
  label: i18n.nodes.dropbox.deleteBatch.label,
  description: i18n.nodes.dropbox.deleteBatch.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "paths", label: i18n.nodes.dropbox.__shared.pin_path, type: "string", container: "array", direction: "input" },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadDropboxManager()).deleteBatch(String(inputs.credentialName ?? ""), (inputs.paths as string[]) ?? []);
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await DropboxManager.deleteBatch(${inputs.credentialName}, ${inputs.paths});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [DROPBOX_MANAGER_IMPORT],
});

registerNode({
  type: "dropbox.createSharedLink",
  label: i18n.nodes.dropbox.createSharedLink.label,
  description: i18n.nodes.dropbox.createSharedLink.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "path", label: i18n.nodes.dropbox.__shared.pin_path, type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "link", label: i18n.nodes.dropbox.__shared.pin_link, type: "string", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadDropboxManager()).createSharedLink(String(inputs.credentialName ?? ""), String(inputs.path ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await DropboxManager.createSharedLink(${inputs.credentialName}, ${inputs.path});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, link: `${v}.link`, error: `${v}.error` };
  },
  compileImports: [DROPBOX_MANAGER_IMPORT],
});

registerNode({
  type: "dropbox.listSharedLinks",
  label: i18n.nodes.dropbox.listSharedLinks.label,
  description: i18n.nodes.dropbox.listSharedLinks.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "path", label: i18n.nodes.dropbox.__shared.pin_path, type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "urls", label: i18n.nodes.dropbox.listSharedLinks.pin_urls, type: "string", container: "array", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadDropboxManager()).listSharedLinks(String(inputs.credentialName ?? ""), String(inputs.path ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await DropboxManager.listSharedLinks(${inputs.credentialName}, ${inputs.path});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, urls: `${v}.urls`, error: `${v}.error` };
  },
  compileImports: [DROPBOX_MANAGER_IMPORT],
});

registerNode({
  type: "dropbox.shareFolder",
  label: i18n.nodes.dropbox.shareFolder.label,
  description: i18n.nodes.dropbox.shareFolder.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "path", label: i18n.nodes.dropbox.__shared.pin_path, type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "sharedFolderId", label: i18n.nodes.dropbox.shareFolder.pin_shared_folder_id, type: "string", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadDropboxManager()).shareFolder(String(inputs.credentialName ?? ""), String(inputs.path ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await DropboxManager.shareFolder(${inputs.credentialName}, ${inputs.path});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, sharedFolderId: `${v}.sharedFolderId`, error: `${v}.error` };
  },
  compileImports: [DROPBOX_MANAGER_IMPORT],
});

registerNode({
  type: "dropbox.addFolderMember",
  label: i18n.nodes.dropbox.addFolderMember.label,
  description: i18n.nodes.dropbox.addFolderMember.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "sharedFolderId", label: i18n.nodes.dropbox.shareFolder.pin_shared_folder_id, type: "string", direction: "input", defaultValue: "" },
    { id: "email", label: i18n.nodes.dropbox.addFolderMember.pin_email, type: "string", direction: "input", defaultValue: "" },
    { id: "accessLevel", label: i18n.nodes.dropbox.addFolderMember.pin_access_level, type: "enum", subType: DROPBOX_ACCESS_LEVEL_ENUM_TYPE, direction: "input", defaultValue: "editor", options: enumOptionIds(DROPBOX_ACCESS_LEVEL_ENUM_TYPE) },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadDropboxManager()).addFolderMember(String(inputs.credentialName ?? ""), String(inputs.sharedFolderId ?? ""), String(inputs.email ?? ""), String(inputs.accessLevel ?? "editor"));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await DropboxManager.addFolderMember(${inputs.credentialName}, ${inputs.sharedFolderId}, ${inputs.email}, ${inputs.accessLevel});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [DROPBOX_MANAGER_IMPORT],
});

registerNode({
  type: "dropbox.getCurrentAccount",
  label: i18n.nodes.dropbox.getCurrentAccount.label,
  description: i18n.nodes.dropbox.getCurrentAccount.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "account", label: i18n.nodes.dropbox.account.label, type: "struct", subType: ACCOUNT_STRUCT_TYPE, direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadDropboxManager()).getCurrentAccount(String(inputs.credentialName ?? ""));
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        account: {
          accountId: result.accountId,
          name: result.name,
          email: result.email,
        },
        error: result.error,
      },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await DropboxManager.getCurrentAccount(${inputs.credentialName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, account: `{ accountId: ${v}.accountId, name: ${v}.name, email: ${v}.email }`, error: `${v}.error` };
  },
  compileImports: [DROPBOX_MANAGER_IMPORT],
});

registerNode({
  type: "dropbox.getSpaceUsage",
  label: i18n.nodes.dropbox.getSpaceUsage.label,
  description: i18n.nodes.dropbox.getSpaceUsage.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "spaceUsage", label: i18n.nodes.dropbox.spaceUsage.label, type: "struct", subType: SPACE_USAGE_STRUCT_TYPE, direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadDropboxManager()).getSpaceUsage(String(inputs.credentialName ?? ""));
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        spaceUsage: { used: result.used, allocated: result.allocated },
        error: result.error,
      },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await DropboxManager.getSpaceUsage(${inputs.credentialName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, spaceUsage: `{ used: ${v}.used, allocated: ${v}.allocated }`, error: `${v}.error` };
  },
  compileImports: [DROPBOX_MANAGER_IMPORT],
});
