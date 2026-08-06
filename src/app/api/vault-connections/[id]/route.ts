import { getDatabaseManager } from "../../../../server/DatabaseManager";

export const runtime = "nodejs";

type Params = Promise<{ id: string }>;

/** Includes `config` (the real connection secrets) — used only to prefill an edit dialog, unlike
 * the list route (GET /api/vault-connections), which never returns it. */
export async function GET(_request: Request, { params }: { params: Params }): Promise<Response> {
  const { id } = await params;
  const connection = getDatabaseManager().getVaultConnection(id);
  if (!connection) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(connection);
}

export async function PATCH(request: Request, { params }: { params: Params }): Promise<Response> {
  const { id } = await params;
  const body = (await request.json()) as { name?: string; config?: Record<string, string> };
  if (!body.name || !body.name.trim() || !body.config) {
    return Response.json({ error: "name and config are required" }, { status: 400 });
  }
  const db = getDatabaseManager();
  db.updateVaultConnection(id, body.name.trim(), body.config);
  return Response.json(db.getVaultConnection(id));
}

export async function DELETE(_request: Request, { params }: { params: Params }): Promise<Response> {
  const { id } = await params;
  getDatabaseManager().deleteVaultConnection(id);
  return new Response(null, { status: 204 });
}
