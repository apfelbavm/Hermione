import { NextResponse } from "next/server";
import { getDatabaseManager } from "../../../../../server/DatabaseManager";
import { getRequestUser } from "../../../../../server/requestAuth";
import { verifyTotpCode } from "../../../../../server/totp";

/** Second step of enrolling an authenticator app: proves the user's app actually produces valid
 * codes for the pending secret before turning totp_enabled on. */
export async function POST(req: Request) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { code } = (await req.json().catch(() => ({}))) as { code?: string };
  const db = getDatabaseManager();
  const secret = db.getUserTotpSecret(user.email);
  if (!secret || !code || !verifyTotpCode(secret, String(code).trim())) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  db.confirmUserTotpEnabled(user.email);
  return NextResponse.json({ ok: true });
}
