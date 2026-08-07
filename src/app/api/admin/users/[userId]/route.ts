import { NextResponse } from "next/server";
import { getDatabaseManager } from "@hermione/core/server/DatabaseManager";
import { getRequestUser } from "@hermione/core/server/requestAuth";
import type { UserRole } from "@hermione/core/server/models";

type Params = Promise<{ userId: string }>;

const ROLES: UserRole[] = ["viewer", "editor", "admin"];

async function requireAdmin(req: Request) {
  const user = await getRequestUser(req);
  return user?.isAdmin ? user : null;
}

export async function PATCH(req: Request, { params }: { params: Params }): Promise<Response> {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const { userId } = await params;
  if (userId === admin.uid) return NextResponse.json({ error: "You cannot change your own role or blocked status" }, { status: 400 });

  const db = getDatabaseManager();
  if (!db.getUserById(userId)) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { role, blocked } = (await req.json().catch(() => ({}))) as { role?: string; blocked?: boolean };
  if (role !== undefined) {
    if (!ROLES.includes(role as UserRole)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    db.setUserRole(userId, role as UserRole);
  }
  if (blocked !== undefined) {
    db.setUserBlocked(userId, Boolean(blocked));
  }
  return NextResponse.json(db.getUserById(userId));
}

export async function DELETE(req: Request, { params }: { params: Params }): Promise<Response> {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const { userId } = await params;
  if (userId === admin.uid) return NextResponse.json({ error: "You cannot delete yourself" }, { status: 400 });

  const db = getDatabaseManager();
  if (!db.getUserById(userId)) return NextResponse.json({ error: "User not found" }, { status: 404 });
  db.deleteUser(userId);
  return new NextResponse(null, { status: 204 });
}
