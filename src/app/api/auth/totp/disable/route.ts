import { NextResponse } from "next/server";
import { getDatabaseManager } from "../../../../../server/DatabaseManager";
import { getRequestUser } from "../../../../../server/requestAuth";

/** Turns the authenticator-app login option back off for the signed-in user — they fall back to
 * emailed one-time codes. */
export async function POST(req: Request) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  getDatabaseManager().disableUserTotp(user.email);
  return NextResponse.json({ ok: true });
}
