import { NextResponse } from "next/server";
import { getDatabaseManager } from "../../../../server/DatabaseManager";
import { getRequestUser } from "../../../../server/requestAuth";

async function requireAdmin(req: Request) {
  const user = await getRequestUser(req);
  return user?.isAdmin ? user : null;
}

export async function GET(req: Request) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  return NextResponse.json({ users: getDatabaseManager().listUsers() });
}
