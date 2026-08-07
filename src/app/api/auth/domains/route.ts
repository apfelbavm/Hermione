import { NextResponse } from "next/server";
import { getDatabaseManager } from "@hermione/core/server/DatabaseManager";
import { getRequestUser } from "@hermione/core/server/requestAuth";

async function requireAdmin(req: Request) {
  const user = await getRequestUser(req);
  return user?.isAdmin ? user : null;
}

export async function GET(req: Request) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  return NextResponse.json({ domains: getDatabaseManager().listAllowedDomains() });
}

export async function POST(req: Request) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const { domain } = (await req.json().catch(() => ({}))) as { domain?: string };
  if (!domain?.trim()) return NextResponse.json({ error: "domain is required" }, { status: 400 });
  getDatabaseManager().addAllowedDomain(domain);
  return NextResponse.json({ domains: getDatabaseManager().listAllowedDomains() });
}

export async function DELETE(req: Request) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const { domain } = (await req.json().catch(() => ({}))) as { domain?: string };
  if (!domain?.trim()) return NextResponse.json({ error: "domain is required" }, { status: 400 });
  getDatabaseManager().removeAllowedDomain(domain);
  return NextResponse.json({ domains: getDatabaseManager().listAllowedDomains() });
}
