import { registerNode } from "@hermione/graph/engine/registry";
import { compileResultVar, SFTP_MANAGER_IMPORT } from "@hermione/graph/engine/compileUtils";
import { enumOptionIds } from "@hermione/graph/engine/enumRegistry";
import { SFTP_EXISTING_FILE_MODE_ENUM_TYPE } from "@hermione/graph/enum/sftp";
import { TEXT_ENCODING_ENUM_TYPE } from "@hermione/graph/enum/common";
import { i18n } from "@i18n";

const EXISTING_FILE_MODES = enumOptionIds(SFTP_EXISTING_FILE_MODE_ENUM_TYPE);

// Every operation below calls the exact same SftpManager static method (packages/core/src/lib/
// sftpManager.ts) from both execute() (interpreter path) and compileExecute() (compiled/deployed
// path) — SftpManager resolves the named credential straight from the database itself (see its
// findCredential), so unlike most other providers there is no separate functionLibrarySftp.ts
// env-var-reading layer and no ctx.getCredential vault lookup here: both paths are already identical.
//
// SftpManager reaches the database directly (see its own header comment), which pulls in
// better-sqlite3 and Node builtins — fine for execute(), which only ever runs server-side, but this
// file is still statically imported client-side too (for the node-creation menu), so a plain
// top-level import here would drag that whole chain (plus "ssh2-sftp-client" itself) into the
// browser bundle. Loaded with a runtime `import()` instead, ignored by both bundlers, so it's never
// even resolved for the client build; only ever actually called server-side, where it resolves
// normally.
async function loadSftpManager(): Promise<typeof import("@hermione/core/lib/sftpManager").SftpManager> {
  const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "@hermione/core/lib/sftpManager");
  return mod.SftpManager;
}

function credentialNamePin() {
  return { id: "credentialName", label: i18n.nodes.sftp.__shared.pin_credential_name, type: "string" as const, direction: "input" as const, defaultValue: "" };
}

registerNode({
  type: "sftp.upload",
  label: i18n.nodes.sftp.upload.label,
  description: i18n.nodes.sftp.upload.description,
  group: "Request",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    credentialNamePin(),
    { id: "filePath", label: i18n.nodes.sftp.upload.pin_file_path, type: "string", direction: "input", defaultValue: "" },
    { id: "content", label: i18n.nodes.sftp.upload.pin_content, type: "string", direction: "input", defaultValue: "" },
    { id: "encoding", label: i18n.nodes.sftp.upload.pin_encoding, type: "enum", subType: TEXT_ENCODING_ENUM_TYPE, direction: "input", defaultValue: "utf8", options: enumOptionIds(TEXT_ENCODING_ENUM_TYPE) },
    { id: "createDirectory", label: i18n.nodes.sftp.upload.pin_create_directory, type: "boolean", direction: "input", defaultValue: true },
    { id: "existingFileMode", label: i18n.nodes.sftp.upload.pin_existing_file, type: "enum", subType: SFTP_EXISTING_FILE_MODE_ENUM_TYPE, direction: "input", defaultValue: EXISTING_FILE_MODES[0], options: EXISTING_FILE_MODES },
    { id: "preventDirectoryTraversal", label: i18n.nodes.sftp.upload.pin_prevent_traversal, type: "boolean", direction: "input", defaultValue: true },
    { id: "maxReconnectAttempts", label: i18n.nodes.sftp.upload.pin_max_reconnect, type: "number", direction: "input", defaultValue: 3, integer: true },
    { id: "reconnectDelayMs", label: i18n.nodes.sftp.upload.pin_reconnect_delay, type: "number", direction: "input", defaultValue: 1000, integer: true },
    { id: "timeoutMs", label: i18n.nodes.__shared.pin_timeout, type: "number", direction: "input", defaultValue: 10000, integer: true },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "skipped", label: i18n.nodes.sftp.upload.pin_skipped, type: "boolean", direction: "output" },
    { id: "attempts", label: i18n.nodes.sftp.upload.pin_attempts, type: "number", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (
      await loadSftpManager()
    ).upload(
      String(inputs.credentialName ?? ""),
      String(inputs.filePath ?? ""),
      String(inputs.content ?? ""),
      String(inputs.encoding ?? ""),
      Boolean(inputs.createDirectory),
      String(inputs.existingFileMode ?? ""),
      Boolean(inputs.preventDirectoryTraversal),
      Number(inputs.maxReconnectAttempts) || 0,
      Number(inputs.reconnectDelayMs) || 0,
      Number(inputs.timeoutMs) || 0,
    );
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await SftpManager.upload(${inputs.credentialName}, ${inputs.filePath}, ${inputs.content}, ${inputs.encoding}, ${inputs.createDirectory}, ${inputs.existingFileMode}, ${inputs.preventDirectoryTraversal}, ${inputs.maxReconnectAttempts}, ${inputs.reconnectDelayMs}, ${inputs.timeoutMs});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return {
      success: `${v}.success`,
      skipped: `${v}.skipped`,
      attempts: `${v}.attempts`,
      error: `${v}.error`,
    };
  },
  // "ssh2-sftp-client" is a real Node dependency this project itself never needs (nothing here can
  // run it live) — it only needs to be `npm install`ed alongside the COMPILED .mjs. sftpManager.ts
  // itself imports it directly; this line just makes that module reachable from the compiled script.
  compileImports: [SFTP_MANAGER_IMPORT],
});
