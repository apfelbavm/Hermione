import { NextResponse } from "next/server";
import { getDatabaseManager } from "@hermione/core/server/DatabaseManager";
import { getRequestUser } from "@hermione/core/server/requestAuth";

/** Feeds the account security page (TOTP enrollment) and the admin security page (isAdmin gate) —
 * the current signed-in user's own profile, looked up fresh from the DB (not just the token) so
 * totpEnabled always reflects the latest state. */
export async function GET(req: Request) {
  const requestUser = await getRequestUser(req);
  if (!requestUser) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const user = getDatabaseManager().getUserByEmail(requestUser.email);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  return NextResponse.json(user);
}
