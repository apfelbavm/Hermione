import { getDatabaseManager } from "@hermione/core/server/DatabaseManager";
import { listVaultSecrets } from "@hermione/core/server/vaultProviders/index";

export const runtime = "nodejs";

type Params = Promise<{ id: string }>;

/** Live-browses this vault connection's own secrets (read-only — see this feature's own scoping:
 * external vaults are for browsing/selecting existing secrets, never created/edited from here). */
export async function GET(_request: Request, { params }: { params: Params }): Promise<Response> {
  const { id } = await params;
  const connection = getDatabaseManager().getVaultConnection(id);
  if (!connection) return Response.json({ error: "Not found" }, { status: 404 });
  try {
    return Response.json(await listVaultSecrets(connection));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 502 });
  }
}
