import { NextResponse } from "next/server";
import { getDatabaseManager } from "../../../../../server/DatabaseManager";
import { sendLoginCodeEmail } from "../../../../../server/authMailer";

const CODE_TTL_MS = 10 * 60 * 1000;
const REQUEST_COOLDOWN_MS = 30 * 1000;

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** First step of the "code per email" login option: emails a fresh 6-digit code, which the login
 * page then submits (together with the email) to the "email-code" Credentials provider. Domain
 * allowlist is enforced here too (not just in the provider) so we never email anyone outside it. */
export async function POST(req: Request) {
  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  const normalizedEmail = String(email ?? "")
    .toLowerCase()
    .trim();
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  const db = getDatabaseManager();
  if (!db.isEmailDomainAllowed(normalizedEmail)) {
    return NextResponse.json({ error: "This email domain isn't authorized to sign in" }, { status: 403 });
  }
  if (db.wasEmailLoginCodeRequestedRecently(normalizedEmail, REQUEST_COOLDOWN_MS)) {
    return NextResponse.json({ error: "A code was already sent recently — check your inbox or try again shortly" }, { status: 429 });
  }

  const code = generateCode();
  db.createEmailLoginCode(normalizedEmail, code, CODE_TTL_MS);
  try {
    await sendLoginCodeEmail(normalizedEmail, code);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to send email" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
