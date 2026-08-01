import { registerNode } from "../engine/registry";
import { compileResultVar, FUNCTION_LIBRARY_SFTP_IMPORT } from "../engine/compileUtils";
import { enumOptionIds } from "../engine/enumRegistry";
import { SFTP_EXISTING_FILE_MODE_ENUM_TYPE } from "../enum/sftp";
import { TEXT_ENCODING_ENUM_TYPE } from "../enum/common";
import { i18n } from "@i18n";

const EXISTING_FILE_MODES = enumOptionIds(SFTP_EXISTING_FILE_MODE_ENUM_TYPE);

// Uploads a file to an SFTP server — a real TCP/SSH connection, which a browser tab has no API for
// at all (no raw sockets, no SSH), unlike http.request (`fetch`) or the XML/CSV nodes (pure JS
// parsers): those work identically whether the graph is being interpreted live in this editor or
// run as compiled output under plain Node, but this node structurally CANNOT — there is no browser
// equivalent to fall back to, the way oauth2Saml.ts's live calls merely risk CORS. So this is the
// one node type in this engine so far whose own execute() (below) is a permanent, honest stub: it
// always reports failure with a clear explanation instead of pretending to try, and the REAL
// implementation exists only for the compiled path.
// Auth is plain username/password/privateKey/passphrase pins directly on this node, NOT the
// { header, value } convention http.request's Auth pin uses (see auth.ts) — that shape is
// HTTP-header-specific and doesn't fit SSH credentials.
//
// The real logic lives in src/server/functionLibrarySftp.ts, NOT the shared functionLibrary.ts every
// other node uses — deliberately, since it depends on "ssh2-sftp-client", a package this project
// itself never needs installed (nothing here can run it live) and doesn't want pulled into the
// interpreter/browser bundle. This file therefore never statically imports it; the compiled path
// reaches it purely via compileImports below, resolved only when the deployed script itself runs.
registerNode({
  type: "sftp.upload",
  label: i18n.nodes.sftp.upload.label,
  description: i18n.nodes.sftp.upload.description,
  group: "Request",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    { id: "host", label: i18n.nodes.sftp.upload.pin_host, type: "string", direction: "input", defaultValue: "" },
    { id: "port", label: i18n.nodes.sftp.upload.pin_port, type: "number", direction: "input", defaultValue: 22, integer: true },
    { id: "username", label: i18n.nodes.sftp.upload.pin_username, type: "string", direction: "input", defaultValue: "" },
    { id: "password", label: i18n.nodes.sftp.upload.pin_password, type: "string", direction: "input", defaultValue: "" },
    { id: "privateKey", label: i18n.nodes.__shared.pin_private_key, type: "string", direction: "input", defaultValue: "" },
    { id: "passphrase", label: i18n.nodes.sftp.upload.pin_passphrase, type: "string", direction: "input", defaultValue: "" },
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
  // Always fails, honestly and immediately — see this file's own header comment for why a real
  // attempt is never possible here, unlike e.g. oauth2Saml.ts's live CORS gamble. Still fires
  // exec-out exactly once (never throws), same convention as every other latent node in this engine.
  execute: async () => ({
    nextExec: "exec-out",
    outputs: {
      success: false,
      skipped: false,
      attempts: 0,
      error: 'SFTP Upload only runs in the compiled output (under Node.js) — the in-browser "Run" button has no way to open a real SSH/SFTP connection. Compile this graph and run the generated script to actually upload.',
    },
  }),
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await functionLibrarySftp.sftpUpload({ host: ${inputs.host}, port: ${inputs.port}, username: ${inputs.username}, password: ${inputs.password}, privateKey: ${inputs.privateKey}, passphrase: ${inputs.passphrase}, filePath: ${inputs.filePath}, content: ${inputs.content}, encoding: ${inputs.encoding}, createDirectory: ${inputs.createDirectory}, existingFileMode: ${inputs.existingFileMode}, preventDirectoryTraversal: ${inputs.preventDirectoryTraversal}, maxReconnectAttempts: ${inputs.maxReconnectAttempts}, reconnectDelayMs: ${inputs.reconnectDelayMs}, timeoutMs: ${inputs.timeoutMs} });`,
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
  // run it live) — it only needs to be `npm install`ed alongside the COMPILED .mjs. functionLibrarySftp.ts
  // itself imports it directly; this line just makes that module reachable from the compiled script.
  compileImports: [FUNCTION_LIBRARY_SFTP_IMPORT],
});
