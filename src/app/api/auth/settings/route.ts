import { NextResponse } from "next/server";
import { getDatabaseManager } from "../../../../server/DatabaseManager";
import { getRequestUser } from "../../../../server/requestAuth";

/** GET is intentionally public (no session required) — AuthGate.tsx needs to know the session
 * scope before it knows whether the visitor is signed in at all, and the setting itself isn't
 * sensitive. PUT is admin-only. */
export async function GET() {
  return NextResponse.json(getDatabaseManager().getAuthSettings());
}

export async function PUT(req: Request) {
  const user = await getRequestUser(req);
  if (!user?.isAdmin) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const { sessionScope } = (await req.json().catch(() => ({}))) as { sessionScope?: string };
  if (sessionScope !== "browser" && sessionScope !== "tab") {
    return NextResponse.json({ error: "sessionScope must be 'browser' or 'tab'" }, { status: 400 });
  }

  getDatabaseManager().setSessionScope(sessionScope);
  return NextResponse.json(getDatabaseManager().getAuthSettings());
}
