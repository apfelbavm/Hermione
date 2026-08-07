import nodemailer from "nodemailer";

/** Dedicated mailer for auth emails (one-time login codes) — deliberately separate from the
 * user-configurable SMTP credential in the Credential Vault (src/lib/smtpManager.ts), since that
 * one is per-Flow/per-project data and shouldn't gate the ability to log in at all. Configured
 * purely via env vars (see docs/auth.md), read lazily so a missing config only breaks the
 * email-code login path, not app startup. */

let cachedTransporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (cachedTransporter) return cachedTransporter;
  const host = process.env.AUTH_SMTP_HOST;
  const port = Number(process.env.AUTH_SMTP_PORT ?? "587");
  const user = process.env.AUTH_SMTP_USER;
  const pass = process.env.AUTH_SMTP_PASS;
  if (!host || !user || !pass) {
    throw new Error("Email login is not configured: set AUTH_SMTP_HOST, AUTH_SMTP_USER and AUTH_SMTP_PASS (see docs/auth.md).");
  }
  cachedTransporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  return cachedTransporter;
}

export async function sendLoginCodeEmail(to: string, code: string): Promise<void> {
  const from = process.env.AUTH_SMTP_FROM || process.env.AUTH_SMTP_USER || "";
  await getTransporter().sendMail({
    from,
    to,
    subject: "Your Hermione sign-in code",
    text: `Your sign-in code is ${code}. It expires in 10 minutes. If you didn't request this, you can ignore this email.`,
    html: `<p>Your sign-in code is <strong style="font-size:1.25em;letter-spacing:0.15em">${code}</strong>.</p><p>It expires in 10 minutes. If you didn't request this, you can ignore this email.</p>`,
  });
}
