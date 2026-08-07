import { getDatabaseManager } from "@hermione/core/server/DatabaseManager";
import { getVaultSecret } from "@hermione/core/server/vaultProviders/index";

export const runtime = "nodejs";

type Params = Promise<{ id: string; secretId: string }>;

/** Fetches one secret's own fields from this vault connection, read-only (see .../secrets/route.ts
 * for the list this feeds). Used only to let a user inspect a secret's fields in the vault tab — a
 * Flow itself resolves these independently at run time (see server/vaultCredentials.ts). */
export async function GET(_request: Request, { params }: { params: Params }): Promise<Response> {
  const { id, secretId } = await params;
  const connection = getDatabaseManager().getVaultConnection(id);
  if (!connection) return Response.json({ error: "Not found" }, { status: 404 });
  try {
    return Response.json(await getVaultSecret(connection, secretId));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 502 });
  }
}
