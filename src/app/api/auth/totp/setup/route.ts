import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { getDatabaseManager } from "../../../../../server/DatabaseManager";
import { getRequestUser } from "../../../../../server/requestAuth";
import { generateTotpEnrollment } from "../../../../../server/totp";

/** Starts (or restarts) enrolling an authenticator app for the signed-in user — the secret is
 * stored but left disabled until /api/auth/totp/confirm proves the user actually scanned/entered
 * it into their app of choice. Requires an existing session (any provider), since we need to know
 * which email to attach the secret to. */
export async function POST(req: Request) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { base32Secret, otpauthUri } = generateTotpEnrollment(user.email);
  getDatabaseManager().setPendingUserTotpSecret(user.email, base32Secret);
  const qrDataUrl = await QRCode.toDataURL(otpauthUri);

  return NextResponse.json({ otpauthUri, qrDataUrl });
}
