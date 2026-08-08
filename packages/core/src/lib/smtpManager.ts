import nodemailer from "nodemailer";
import { getDatabaseManager } from "../server/DatabaseManager.ts";
import { resolveAllCredentials } from "../server/vaultCredentials.ts";
import type { SmtpCredentialData } from "@hermione/shared/types";

/** Thin wrapper around nodemailer's SMTP transport. Unlike every other lib/*Manager.ts (which wrap
 * a provider's HTTP API via `fetch` and are safe to import from an interpreter-facing node file),
 * nodemailer opens a raw TCP socket (`net.Socket`) to talk SMTP directly — there is no browser
 * equivalent, so this file is Node-only. It must NEVER be imported by graph/nodes/smtp.ts (or any
 * other browser-bundled file) except via the runtime `import()` pattern that file uses (mirroring
 * lib/twilioManager.ts's own header comment). */

export interface SmtpAuth {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
}

export interface SmtpOpResult {
  success: boolean;
  error: string;
  [key: string]: unknown;
}

export interface SmtpSendMailResult extends SmtpOpResult {
  messageId: string;
}

export type SmtpVerifyResult = SmtpOpResult;

const managerCache = new Map<string, SmtpManager>();

export class SmtpManager {
  private readonly transporter: nodemailer.Transporter;
  private readonly username: string;

  static getInstance(auth: SmtpAuth): SmtpManager {
    const key = `${auth.host}:${auth.port}:${auth.secure}:${auth.username}:${auth.password}`;
    let manager = managerCache.get(key);
    if (!manager) {
      manager = new SmtpManager(auth.host, auth.port, auth.secure, auth.username, auth.password);
      managerCache.set(key, manager);
    }
    return manager;
  }

  private constructor(host: string, port: number, secure: boolean, username: string, password: string) {
    this.username = username;
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user: username, pass: password },
    });
  }

  static errorMessage(err: unknown): string {
    if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
    return String(err);
  }

  private static async findCredential(credentialName: string): Promise<{ ok: true; auth: SmtpAuth } | { ok: false; error: string }> {
    const credRecord = (await resolveAllCredentials(getDatabaseManager())).get(credentialName);
    if (!credRecord) return { ok: false, error: `Credential "${credentialName}" not found in the vault` };
    if (credRecord.type !== "smtpCredential") return { ok: false, error: `Credential "${credentialName}" is not an SMTP credential` };
    const data = credRecord.data as SmtpCredentialData;
    return { ok: true, auth: { host: data.host, port: Number(data.port) || 0, secure: data.secure === "true", username: data.username, password: data.password } };
  }

  static async sendMail(credentialName: string, to: string, subject: string, text: string, html: string, cc: string, bcc: string, from: string): Promise<SmtpSendMailResult> {
    const cred = await SmtpManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, messageId: "", error: cred.error };
    return SmtpManager.getInstance(cred.auth).sendMail(to, subject, text, html, cc, bcc, from);
  }

  static async verifyConnection(credentialName: string): Promise<SmtpVerifyResult> {
    const cred = await SmtpManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return SmtpManager.getInstance(cred.auth).verifyConnection();
  }

  private async sendMail(to: string, subject: string, text: string, html: string, cc: string, bcc: string, from: string): Promise<SmtpSendMailResult> {
    try {
      const info = await this.transporter.sendMail({
        from: from || this.username,
        to,
        cc: cc || undefined,
        bcc: bcc || undefined,
        subject,
        text: text || undefined,
        html: html || undefined,
      });
      return { success: true, error: "", messageId: String(info.messageId ?? "") };
    } catch (err) {
      return { success: false, error: SmtpManager.errorMessage(err), messageId: "" };
    }
  }

  private async verifyConnection(): Promise<SmtpVerifyResult> {
    try {
      await this.transporter.verify();
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: SmtpManager.errorMessage(err) };
    }
  }
}
