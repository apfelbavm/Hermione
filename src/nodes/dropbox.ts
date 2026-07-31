import { NodeColorCategory, type ExecutionContext } from "../engine/types";
import { registerNode } from "../engine/registry";
import { DropboxManager } from "../lib/dropboxManager";
import type { DropboxOAuth2CredentialData } from "../credentials/types";
import { i18n } from "@i18n";

// Every operation below is a thin pin-wiring shim over DropboxManager (src/lib/dropboxManager.ts),
// which owns the actual SDK calls and error normalization — this file only ever translates pins to
// method arguments and method results back to pins. Interpreter-only for now (no compileExecute/
// compileImports): same "out of scope for now" deferral auth.oauth2ClientCredentials already
// applies to its own compiled path, since none of these nodes have a compiled equivalent yet.

const ENCODING_OPTIONS = ["utf8", "base64"];
const WRITE_MODE_OPTIONS = ["add", "overwrite"];
const GROUP_NAME = "Request.Dropbox";

function accessTokenPin() {
  return {
    id: "accessToken",
    label: i18n.nodes.dropbox.__shared.pin_access_token,
    type: "string" as const,
    direction: "input" as const,
    defaultValue: "",
  };
}

/** Shared by dropbox.authorize and dropbox.auth — both look up the same named Credential Vault
 * entry and just want at its Dropbox fields, or a clear error if the name is wrong/missing. */
function resolveDropboxCredential(ctx: ExecutionContext, credentialName: string): { ok: true; data: DropboxOAuth2CredentialData } | { ok: false; error: string } {
  const credential = ctx.getCredential?.(credentialName);
  if (!credential)
    return {
      ok: false,
      error: `Credential "${credentialName}" not found in the vault`,
    };
  if (credential.type !== "dropboxOAuth2")
    return {
      ok: false,
      error: `Credential "${credentialName}" is not a Dropbox OAuth2 credential`,
    };
  return { ok: true, data: credential.data as DropboxOAuth2CredentialData };
}

registerNode({
  type: "dropbox.authorize",
  label: i18n.nodes.dropbox.authorize.label,
  description: i18n.nodes.dropbox.authorize.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    {
      id: "credentialName",
      label: i18n.nodes.dropbox.authorize.pin_credential_name,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "exec-out",
      label: i18n.nodes.__shared.pin_completed,
      type: "exec",
      direction: "output",
    },
    {
      id: "success",
      label: i18n.nodes.__shared.pin_success,
      type: "boolean",
      direction: "output",
    },
    {
      id: "accessToken",
      label: i18n.nodes.dropbox.__shared.pin_access_token,
      type: "string",
      direction: "output",
    },
    {
      id: "refreshToken",
      label: i18n.nodes.dropbox.authorize.pin_refresh_token,
      type: "string",
      direction: "output",
    },
    {
      id: "expiresIn",
      label: i18n.nodes.dropbox.authorize.pin_expires_in,
      type: "number",
      direction: "output",
    },
    {
      id: "error",
      label: i18n.nodes.__shared.pin_error,
      type: "string",
      direction: "output",
    },
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveDropboxCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: {
          success: false,
          accessToken: "",
          refreshToken: "",
          expiresIn: 0,
          error: resolved.error,
        },
      };
    }
    const result = await DropboxManager.exchangeAuthCode(resolved.data.authCode, resolved.data.appKey, resolved.data.appSecret);
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "dropbox.auth",
  label: i18n.nodes.dropbox.auth.label,
  description: i18n.nodes.dropbox.auth.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    {
      id: "credentialName",
      label: i18n.nodes.dropbox.auth.pin_credential_name,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "exec-out",
      label: i18n.nodes.__shared.pin_completed,
      type: "exec",
      direction: "output",
    },
    {
      id: "success",
      label: i18n.nodes.__shared.pin_success,
      type: "boolean",
      direction: "output",
    },
    {
      id: "accessToken",
      label: i18n.nodes.dropbox.__shared.pin_access_token,
      type: "string",
      direction: "output",
    },
    {
      id: "expiresIn",
      label: i18n.nodes.dropbox.auth.pin_expires_in,
      type: "number",
      direction: "output",
    },
    {
      id: "error",
      label: i18n.nodes.__shared.pin_error,
      type: "string",
      direction: "output",
    },
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveDropboxCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) {
      return {
        nextExec: "exec-out",
        outputs: {
          success: false,
          accessToken: "",
          expiresIn: 0,
          error: resolved.error,
        },
      };
    }
    const result = await DropboxManager.refreshAccessToken(resolved.data.refreshToken, resolved.data.appKey, resolved.data.appSecret);
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "dropbox.upload",
  label: i18n.nodes.dropbox.upload.label,
  description: i18n.nodes.dropbox.upload.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    accessTokenPin(),
    {
      id: "path",
      label: i18n.nodes.dropbox.__shared.pin_path,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "content",
      label: i18n.nodes.dropbox.upload.pin_content,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "encoding",
      label: i18n.nodes.dropbox.__shared.pin_encoding,
      type: "string",
      direction: "input",
      defaultValue: ENCODING_OPTIONS[0],
      options: ENCODING_OPTIONS,
    },
    {
      id: "mode",
      label: i18n.nodes.dropbox.upload.pin_mode,
      type: "string",
      direction: "input",
      defaultValue: WRITE_MODE_OPTIONS[0],
      options: WRITE_MODE_OPTIONS,
    },
    {
      id: "autorename",
      label: i18n.nodes.dropbox.__shared.pin_autorename,
      type: "boolean",
      direction: "input",
      defaultValue: false,
    },
    {
      id: "exec-out",
      label: i18n.nodes.__shared.pin_completed,
      type: "exec",
      direction: "output",
    },
    {
      id: "success",
      label: i18n.nodes.__shared.pin_success,
      type: "boolean",
      direction: "output",
    },
    {
      id: "error",
      label: i18n.nodes.__shared.pin_error,
      type: "string",
      direction: "output",
    },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const manager = new DropboxManager(String(inputs.accessToken ?? ""));
    const result = await manager.upload(String(inputs.path ?? ""), String(inputs.content ?? ""), inputs.encoding === "base64" ? "base64" : "utf8", inputs.mode === "overwrite" ? "overwrite" : "add", Boolean(inputs.autorename));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "dropbox.download",
  label: i18n.nodes.dropbox.download.label,
  description: i18n.nodes.dropbox.download.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    accessTokenPin(),
    {
      id: "path",
      label: i18n.nodes.dropbox.__shared.pin_path,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "encoding",
      label: i18n.nodes.dropbox.__shared.pin_encoding,
      type: "string",
      direction: "input",
      defaultValue: ENCODING_OPTIONS[0],
      options: ENCODING_OPTIONS,
    },
    {
      id: "exec-out",
      label: i18n.nodes.__shared.pin_completed,
      type: "exec",
      direction: "output",
    },
    {
      id: "success",
      label: i18n.nodes.__shared.pin_success,
      type: "boolean",
      direction: "output",
    },
    {
      id: "content",
      label: i18n.nodes.dropbox.download.pin_content,
      type: "string",
      direction: "output",
    },
    {
      id: "error",
      label: i18n.nodes.__shared.pin_error,
      type: "string",
      direction: "output",
    },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const manager = new DropboxManager(String(inputs.accessToken ?? ""));
    const result = await manager.download(String(inputs.path ?? ""), inputs.encoding === "base64" ? "base64" : "utf8");
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "dropbox.listFolders",
  label: i18n.nodes.dropbox.listFolders.label,
  description: i18n.nodes.dropbox.listFolders.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    accessTokenPin(),
    {
      id: "path",
      label: i18n.nodes.dropbox.__shared.pin_path,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "recursive",
      label: i18n.nodes.dropbox.listFolders.pin_recursive,
      type: "boolean",
      direction: "input",
      defaultValue: false,
    },
    {
      id: "exec-out",
      label: i18n.nodes.__shared.pin_completed,
      type: "exec",
      direction: "output",
    },
    {
      id: "success",
      label: i18n.nodes.__shared.pin_success,
      type: "boolean",
      direction: "output",
    },
    {
      id: "folders",
      label: i18n.nodes.dropbox.listFolders.pin_folders,
      type: "string",
      container: "array",
      direction: "output",
    },
    {
      id: "error",
      label: i18n.nodes.__shared.pin_error,
      type: "string",
      direction: "output",
    },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const manager = new DropboxManager(String(inputs.accessToken ?? ""));
    const result = await manager.listFolders(String(inputs.path ?? ""), Boolean(inputs.recursive));
    return { nextExec: "exec-out", outputs: result };
  },
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
      accessTokenPin(),
      {
        id: "fromPath",
        label: i18n.nodes.dropbox.__shared.pin_from_path,
        type: "string",
        direction: "input",
        defaultValue: "",
      },
      {
        id: "toPath",
        label: i18n.nodes.dropbox.__shared.pin_to_path,
        type: "string",
        direction: "input",
        defaultValue: "",
      },
      {
        id: "autorename",
        label: i18n.nodes.dropbox.__shared.pin_autorename,
        type: "boolean",
        direction: "input",
        defaultValue: false,
      },
      {
        id: "exec-out",
        label: i18n.nodes.__shared.pin_completed,
        type: "exec",
        direction: "output",
      },
      {
        id: "success",
        label: i18n.nodes.__shared.pin_success,
        type: "boolean",
        direction: "output",
      },
      {
        id: "error",
        label: i18n.nodes.__shared.pin_error,
        type: "string",
        direction: "output",
      },
    ],
    latent: true,
    execute: async ({ inputs }) => {
      const manager = new DropboxManager(String(inputs.accessToken ?? ""));
      const result = await manager[type](String(inputs.fromPath ?? ""), String(inputs.toPath ?? ""), Boolean(inputs.autorename));
      return { nextExec: "exec-out", outputs: result };
    },
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
    accessTokenPin(),
    {
      id: "path",
      label: i18n.nodes.dropbox.__shared.pin_path,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "exec-out",
      label: i18n.nodes.__shared.pin_completed,
      type: "exec",
      direction: "output",
    },
    {
      id: "success",
      label: i18n.nodes.__shared.pin_success,
      type: "boolean",
      direction: "output",
    },
    {
      id: "error",
      label: i18n.nodes.__shared.pin_error,
      type: "string",
      direction: "output",
    },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const manager = new DropboxManager(String(inputs.accessToken ?? ""));
    const result = await manager.delete(String(inputs.path ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});
