import nodemailer from "nodemailer";

/** Thin wrapper around nodemailer's SMTP transport. Unlike every other lib/*Manager.ts (which wrap
 * a provider's HTTP API via `fetch` and are safe to import from an interpreter-facing node file),
 * nodemailer opens a raw TCP socket (`net.Socket`) to talk SMTP directly — there is no browser
 * equivalent, so this file is Node-only. It must NEVER be imported by graph/nodes/smtp.ts (or any
 * other browser-bundled file); only src/server/functionLibrarySmtp.ts imports it, reached solely via
 * the compileImports string constant resolved at compiled-script runtime (see graph/nodes/smtp.ts's
 * own header comment, mirroring lib/twilioManager.ts's plain {success, error} result shape). */

export interface SmtpSendMailResult {
  success: boolean;
  error: string;
  messageId: string;
}

export interface SmtpVerifyResult {
  success: boolean;
  error: string;
}

export class SmtpManager {
  private readonly transporter: nodemailer.Transporter;
  private readonly username: string;

  constructor(host: string, port: number, secure: boolean, username: string, password: string) {
    this.username = username;
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user: username, pass: password },
    });
  }

  async sendMail(to: string, subject: string, text: string, html: string, cc: string, bcc: string, from: string): Promise<SmtpSendMailResult> {
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
      return { success: false, error: err instanceof Error ? err.message : String(err), messageId: "" };
    }
  }

  async verifyConnection(): Promise<SmtpVerifyResult> {
    try {
      await this.transporter.verify();
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
