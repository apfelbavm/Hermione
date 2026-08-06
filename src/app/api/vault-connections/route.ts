import type { VaultProviderId } from "../../../credentials/vaultProviders";
import { getDatabaseManager } from "../../../server/DatabaseManager";

export const runtime = "nodejs";

/** Never includes `config` (server URL, tokens/keys) — the Credential Vault page's tab strip only
 * needs enough to render one tab per connection (see api/vault-connections/[id]/route.ts for the
 * full record, and .../secrets for actually browsing that vault's own secrets). */
export async function GET(): Promise<Response> {
  return Response.json(getDatabaseManager().listVaultConnections());
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as { name?: string; provider?: VaultProviderId; config?: Record<string, string> };
  if (!body.name || !body.name.trim() || !body.provider || !body.config) {
    return Response.json({ error: "name, provider, and config are required" }, { status: 400 });
  }
  return Response.json(getDatabaseManager().createVaultConnection(body.name.trim(), body.provider, body.config), { status: 201 });
}
