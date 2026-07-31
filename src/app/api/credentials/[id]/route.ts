import type { CredentialData, CredentialTypeId } from "../../../../credentials/types";
import { deleteCredential, getCredential, updateCredential } from "../../../../server/credentials";

export const runtime = "nodejs";

type Params = Promise<{ id: string }>;

/** Includes `data` (the real secret values) — used only to prefill the Credential Vault's edit
 * dialog, unlike the list route (GET /api/credentials), which never returns it. */
export async function GET(_request: Request, { params }: { params: Params }): Promise<Response> {
  const { id } = await params;
  const credential = getCredential(id);
  if (!credential) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(credential);
}

export async function PATCH(request: Request, { params }: { params: Params }): Promise<Response> {
  const { id } = await params;
  const body = (await request.json()) as { name?: string; type?: CredentialTypeId; data?: CredentialData };
  if (!body.name || !body.name.trim() || !body.type || !body.data) {
    return Response.json({ error: "name, type, and data are required" }, { status: 400 });
  }
  updateCredential(id, body.name.trim(), body.type, body.data);
  return Response.json(getCredential(id));
}

export async function DELETE(_request: Request, { params }: { params: Params }): Promise<Response> {
  const { id } = await params;
  deleteCredential(id);
  return new Response(null, { status: 204 });
}
