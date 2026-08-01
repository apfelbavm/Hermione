import { registerNode } from "../../engine/registry";
import { compileResultVar } from "../../engine/compileUtils";
import { i18n } from "@i18n";

const EXISTING_FILE_MODES = ["Overwrite", "Append", "Fail", "Ignore"];

// Uploads a file to an SFTP server — a real TCP/SSH connection, which a browser tab has no API for
// at all (no raw sockets, no SSH), unlike http.request (`fetch`) or the XML/CSV nodes (pure JS
// parsers): those work identically whether the graph is being interpreted live in this editor or
// run as compiled output under plain Node, but this node structurally CANNOT — there is no browser
// equivalent to fall back to, the way oauth2Saml.ts's live calls merely risk CORS. So this is the
// one node type in this engine so far whose own execute() (below) is a permanent, honest stub: it
// always reports failure with a clear explanation instead of pretending to try, and the REAL
// implementation exists only for the compiled path (compileExecute/compileImports/compileHelpers).
// Auth is plain username/password/privateKey/passphrase pins directly on this node, NOT the
// { header, value } convention http.request's Auth pin uses (see auth.ts) — that shape is
// HTTP-header-specific and doesn't fit SSH credentials.
//
// Written as a plain-JS source string (see http.ts's HTTP_REQUEST_EXECUTE_SOURCE for the same
// "one implementation, not two hand-kept copies" reasoning) contributed verbatim via
// compileHelpers below — unlike every other such helper in this codebase, it is NEVER also
// `new Function`'d for interpreter use (there is no interpreter path to serve, see above), so
// `SftpClient`/`Buffer` only ever need to resolve in the COMPILED file, where compileImports
// (below) puts a real `import SftpClient from "ssh2-sftp-client"` above this source and `Buffer`
// is a plain Node global.
const SFTP_UPLOAD_EXECUTE_SOURCE = `
async function sftpUploadExecute(host, rawPort, username, password, privateKey, passphrase, filePath, content, encoding, createDirectory, existingFileMode, preventDirectoryTraversal, rawMaxReconnectAttempts, rawReconnectDelayMs, rawTimeoutMs) {
  function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

  const normalizedPath = String(filePath ?? "").trim();
  if (!normalizedPath || normalizedPath.endsWith("/")) {
    return { success: false, skipped: false, attempts: 0, error: "File Path must name a file, not just a directory." };
  }
  if (preventDirectoryTraversal && normalizedPath.split("/").some((segment) => segment === "..")) {
    return { success: false, skipped: false, attempts: 0, error: 'File Path contains a ".." segment — rejected because Prevent Directory Traversal is on.' };
  }

  const lastSlash = normalizedPath.lastIndexOf("/");
  const remoteDir = lastSlash > 0 ? normalizedPath.slice(0, lastSlash) : null;
  const buffer = Buffer.from(String(content ?? ""), encoding === "base64" ? "base64" : "utf8");

  const attemptsCap = Math.max(1, Math.round(Number(rawMaxReconnectAttempts) || 0) + 1);
  const reconnectDelayMs = Math.max(0, Math.round(Number(rawReconnectDelayMs) || 0));
  const readyTimeout = Math.round(Number(rawTimeoutMs) || 0) || 10000;
  const port = Math.round(Number(rawPort) || 0) || 22;

  let lastError = "";
  for (let attempt = 1; attempt <= attemptsCap; attempt++) {
    const sftp = new SftpClient();
    try {
      await sftp.connect({
        host: String(host ?? ""),
        port,
        username: String(username ?? ""),
        password: password ? String(password) : undefined,
        privateKey: privateKey ? String(privateKey) : undefined,
        passphrase: passphrase ? String(passphrase) : undefined,
        readyTimeout,
      });

      if (createDirectory && remoteDir) {
        await sftp.mkdir(remoteDir, true);
      }

      const alreadyExists = !!(await sftp.exists(normalizedPath));

      if (alreadyExists && existingFileMode === "Fail") {
        await sftp.end();
        return { success: false, skipped: false, attempts: attempt, error: "File already exists at " + normalizedPath + ' (Existing File is set to "Fail").' };
      }
      if (alreadyExists && existingFileMode === "Ignore") {
        await sftp.end();
        return { success: true, skipped: true, attempts: attempt, error: "" };
      }
      if (alreadyExists && existingFileMode === "Append") {
        await sftp.append(buffer, normalizedPath);
      } else {
        await sftp.put(buffer, normalizedPath);
      }

      await sftp.end();
      return { success: true, skipped: false, attempts: attempt, error: "" };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      try { await sftp.end(); } catch {}
      if (attempt < attemptsCap) await delay(reconnectDelayMs);
    }
  }

  return { success: false, skipped: false, attempts: attemptsCap, error: lastError || "SFTP upload failed" };
}
`;

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
    { id: "encoding", label: i18n.nodes.sftp.upload.pin_encoding, type: "string", direction: "input", defaultValue: "utf8", options: ["utf8", "base64"] },
    { id: "createDirectory", label: i18n.nodes.sftp.upload.pin_create_directory, type: "boolean", direction: "input", defaultValue: true },
    { id: "existingFileMode", label: i18n.nodes.sftp.upload.pin_existing_file, type: "string", direction: "input", defaultValue: EXISTING_FILE_MODES[0], options: EXISTING_FILE_MODES },
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
    `const ${compileResultVar(node.id)} = await sftpUploadExecute(${inputs.host}, ${inputs.port}, ${inputs.username}, ${inputs.password}, ${inputs.privateKey}, ${inputs.passphrase}, ${inputs.filePath}, ${inputs.content}, ${inputs.encoding}, ${inputs.createDirectory}, ${inputs.existingFileMode}, ${inputs.preventDirectoryTraversal}, ${inputs.maxReconnectAttempts}, ${inputs.reconnectDelayMs}, ${inputs.timeoutMs});`,
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
  // run it live) — it only needs to be `npm install`ed alongside the COMPILED .mjs, same convention
  // as fast-xml-parser/fast-xml-builder's compileImports in dataFormatHelpers.ts, except those two
  // are ALSO real dependencies of this project (for live interpreter use) and this one isn't.
  compileImports: ['import SftpClient from "ssh2-sftp-client";'],
  compileHelpers: { sftpUploadExecute: SFTP_UPLOAD_EXECUTE_SOURCE },
});
