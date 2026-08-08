import SftpClient from "ssh2-sftp-client";
import { getDatabaseManager } from "../server/DatabaseManager.ts";
import { resolveAllCredentials } from "../server/vaultCredentials.ts";
import type { SftpCredentialData } from "@hermione/shared/types";

/** Uploads a file to an SFTP server — a real TCP/SSH connection, which a browser tab has no API for
 * at all (no raw sockets, no SSH), unlike http.request (`fetch`) or the XML/CSV nodes (pure JS
 * parsers) — see nodes/sftp.ts's own header comment for how that's kept out of the interpreter/
 * browser bundle.
 *
 * Credential resolution mirrors twilioManager.ts: this manager reaches the Credential Vault
 * database directly via findCredential/resolveAllCredentials, so both the interpreter (nodes/sftp.ts)
 * and the compiled/deployed path call the exact same static methods here — there is no separate
 * functionLibrarySftp.ts env-var-reading layer. Unlike Twilio's persistent REST client, an instance
 * here just holds the resolved connection details and opens a fresh SSH/SFTP connection per call
 * (with its own reconnect-attempt loop) — a real socket, not something worth pooling across calls. */

export interface SftpAuth {
  host: string;
  port: string;
  username: string;
  password: string;
  privateKey: string;
  passphrase: string;
}

export interface SftpUploadResult {
  success: boolean;
  skipped: boolean;
  attempts: number;
  error: string;
  [key: string]: unknown;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const managerCache = new Map<string, SftpManager>();

export class SftpManager {
  private readonly host: string;
  private readonly port: string;
  private readonly username: string;
  private readonly password: string;
  private readonly privateKey: string;
  private readonly passphrase: string;

  static getInstance(auth: SftpAuth): SftpManager {
    const key = `${auth.host}:${auth.port}:${auth.username}:${auth.password}:${auth.privateKey}:${auth.passphrase}`;
    let manager = managerCache.get(key);
    if (!manager) {
      manager = new SftpManager(auth.host, auth.port, auth.username, auth.password, auth.privateKey, auth.passphrase);
      managerCache.set(key, manager);
    }
    return manager;
  }

  private constructor(host: string, port: string, username: string, password: string, privateKey: string, passphrase: string) {
    this.host = host;
    this.port = port;
    this.username = username;
    this.password = password;
    this.privateKey = privateKey;
    this.passphrase = passphrase;
  }

  static errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  private static async findCredential(credentialName: string): Promise<{ ok: true; auth: SftpAuth } | { ok: false; error: string }> {
    const credRecord = (await resolveAllCredentials(getDatabaseManager())).get(credentialName);
    if (!credRecord) return { ok: false, error: `Credential "${credentialName}" not found in the vault` };
    if (credRecord.type !== "sftpCredential") return { ok: false, error: `Credential "${credentialName}" is not an SFTP Server credential` };
    const data = credRecord.data as SftpCredentialData;
    return { ok: true, auth: { host: data.host, port: data.port, username: data.username, password: data.password, privateKey: data.privateKey, passphrase: data.passphrase } };
  }

  static async upload(credentialName: string, filePath: string, content: string, encoding: string, createDirectory: boolean, existingFileMode: string, preventDirectoryTraversal: boolean, maxReconnectAttempts: number, reconnectDelayMs: number, timeoutMs: number): Promise<SftpUploadResult> {
    const cred = await SftpManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, skipped: false, attempts: 0, error: cred.error };
    return SftpManager.getInstance(cred.auth).upload(filePath, content, encoding, createDirectory, existingFileMode, preventDirectoryTraversal, maxReconnectAttempts, reconnectDelayMs, timeoutMs);
  }

  private async upload(filePath: string, content: string, encoding: string, createDirectory: boolean, existingFileMode: string, preventDirectoryTraversal: boolean, maxReconnectAttempts: number, reconnectDelayMs: number, timeoutMs: number): Promise<SftpUploadResult> {
    const normalizedPath = filePath.trim();
    if (!normalizedPath || normalizedPath.endsWith("/")) {
      return { success: false, skipped: false, attempts: 0, error: "File Path must name a file, not just a directory." };
    }
    if (preventDirectoryTraversal && normalizedPath.split("/").some((segment) => segment === "..")) {
      return { success: false, skipped: false, attempts: 0, error: 'File Path contains a ".." segment — rejected because Prevent Directory Traversal is on.' };
    }

    const lastSlash = normalizedPath.lastIndexOf("/");
    const remoteDir = lastSlash > 0 ? normalizedPath.slice(0, lastSlash) : null;
    const buffer = Buffer.from(content, encoding === "base64" ? "base64" : "utf8");

    const attemptsCap = Math.max(1, Math.round(maxReconnectAttempts || 0) + 1);
    const normalizedReconnectDelayMs = Math.max(0, Math.round(reconnectDelayMs || 0));
    const readyTimeout = Math.round(timeoutMs || 0) || 10000;
    const port = Math.round(Number(this.port) || 0) || 22;

    let lastError = "";
    for (let attempt = 1; attempt <= attemptsCap; attempt++) {
      const sftp = new SftpClient();
      try {
        await sftp.connect({
          host: this.host,
          port,
          username: this.username,
          password: this.password ? this.password : undefined,
          privateKey: this.privateKey ? this.privateKey : undefined,
          passphrase: this.passphrase ? this.passphrase : undefined,
          readyTimeout,
        });

        if (createDirectory && remoteDir) {
          await sftp.mkdir(remoteDir, true);
        }

        const alreadyExists = !!(await sftp.exists(normalizedPath));

        if (alreadyExists && existingFileMode === "Fail") {
          await sftp.end();
          return { success: false, skipped: false, attempts: attempt, error: `File already exists at ${normalizedPath} (Existing File is set to "Fail").` };
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
        lastError = SftpManager.errorMessage(err);
        try {
          await sftp.end();
        } catch {
          // already disconnected/never connected — nothing to clean up
        }
        if (attempt < attemptsCap) await delay(normalizedReconnectDelayMs);
      }
    }

    return { success: false, skipped: false, attempts: attemptsCap, error: lastError || "SFTP upload failed" };
  }
}
