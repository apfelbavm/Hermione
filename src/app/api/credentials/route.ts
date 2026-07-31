import type { CredentialData, CredentialTypeId } from "../../../credentials/types";
import { getDatabaseManager } from "../../../server/DatabaseManager";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return Response.json(getDatabaseManager().listCredentials());
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as { name?: string; type?: CredentialTypeId; data?: CredentialData };
  if (!body.name || !body.name.trim() || !body.type || !body.data) {
    return Response.json({ error: "name, type, and data are required" }, { status: 400 });
  }
  return Response.json(getDatabaseManager().createCredential(body.name.trim(), body.type, body.data), { status: 201 });
}
