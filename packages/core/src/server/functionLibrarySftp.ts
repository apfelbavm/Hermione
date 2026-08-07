import SftpClient from "ssh2-sftp-client";

/** Uploads a file to an SFTP server — a real TCP/SSH connection, which a browser tab has no API for
 * at all (no raw sockets, no SSH), unlike http.request (`fetch`) or the XML/CSV nodes (pure JS
 * parsers). Kept in its OWN file, separate from functionLibrary.ts, specifically so no
 * interpreter-facing code ever statically imports it: "ssh2-sftp-client" is deliberately NOT a real
 * dependency of this project (see package.json) — it's only ever needed alongside a COMPILED script
 * (see compileImports in graph/nodes/sftp.ts) — so if this file's import of it were reachable from
 * functionLibrary.ts (which crypto.ts/http.ts/debug.ts import for their own real interpreter use),
 * Next's browser bundle would try to resolve "ssh2-sftp-client" too and fail to build, since module
 * resolution happens before any tree-shaking, regardless of whether the function is ever called. */

export interface SftpUploadInputs {
  host: string;
  port: number;
  username: string;
  password: string;
  privateKey: string;
  passphrase: string;
  filePath: string;
  content: string;
  encoding: string;
  createDirectory: boolean;
  existingFileMode: string;
  preventDirectoryTraversal: boolean;
  maxReconnectAttempts: number;
  reconnectDelayMs: number;
  timeoutMs: number;
}

export interface SftpUploadOutputs {
  success: boolean;
  skipped: boolean;
  attempts: number;
  error: string;
  [key: string]: unknown;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sftpUpload(inputs: SftpUploadInputs): Promise<SftpUploadOutputs> {
  const normalizedPath = String(inputs.filePath ?? "").trim();
  if (!normalizedPath || normalizedPath.endsWith("/")) {
    return { success: false, skipped: false, attempts: 0, error: "File Path must name a file, not just a directory." };
  }
  if (inputs.preventDirectoryTraversal && normalizedPath.split("/").some((segment) => segment === "..")) {
    return { success: false, skipped: false, attempts: 0, error: 'File Path contains a ".." segment — rejected because Prevent Directory Traversal is on.' };
  }

  const lastSlash = normalizedPath.lastIndexOf("/");
  const remoteDir = lastSlash > 0 ? normalizedPath.slice(0, lastSlash) : null;
  const buffer = Buffer.from(String(inputs.content ?? ""), inputs.encoding === "base64" ? "base64" : "utf8");

  const attemptsCap = Math.max(1, Math.round(Number(inputs.maxReconnectAttempts) || 0) + 1);
  const reconnectDelayMs = Math.max(0, Math.round(Number(inputs.reconnectDelayMs) || 0));
  const readyTimeout = Math.round(Number(inputs.timeoutMs) || 0) || 10000;
  const port = Math.round(Number(inputs.port) || 0) || 22;

  let lastError = "";
  for (let attempt = 1; attempt <= attemptsCap; attempt++) {
    const sftp = new SftpClient();
    try {
      await sftp.connect({
        host: String(inputs.host ?? ""),
        port,
        username: String(inputs.username ?? ""),
        password: inputs.password ? String(inputs.password) : undefined,
        privateKey: inputs.privateKey ? String(inputs.privateKey) : undefined,
        passphrase: inputs.passphrase ? String(inputs.passphrase) : undefined,
        readyTimeout,
      });

      if (inputs.createDirectory && remoteDir) {
        await sftp.mkdir(remoteDir, true);
      }

      const alreadyExists = !!(await sftp.exists(normalizedPath));

      if (alreadyExists && inputs.existingFileMode === "Fail") {
        await sftp.end();
        return { success: false, skipped: false, attempts: attempt, error: `File already exists at ${normalizedPath} (Existing File is set to "Fail").` };
      }
      if (alreadyExists && inputs.existingFileMode === "Ignore") {
        await sftp.end();
        return { success: true, skipped: true, attempts: attempt, error: "" };
      }
      if (alreadyExists && inputs.existingFileMode === "Append") {
        await sftp.append(buffer, normalizedPath);
      } else {
        await sftp.put(buffer, normalizedPath);
      }

      await sftp.end();
      return { success: true, skipped: false, attempts: attempt, error: "" };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      try {
        await sftp.end();
      } catch {
        // already disconnected/never connected — nothing to clean up
      }
      if (attempt < attemptsCap) await delay(reconnectDelayMs);
    }
  }

  return { success: false, skipped: false, attempts: attemptsCap, error: lastError || "SFTP upload failed" };
}
