import type { DatabaseManager } from "./DatabaseManager";
import type { CredentialRecord } from "../credentials/types";
import { getVaultSecret, listVaultSecrets } from "./vaultProviders/index.ts";

/** Merges the built-in vault's own credentials with every connected external vault's secrets into
 * one name-keyed lookup — the single place both the interpreter (api/simulate/route.ts's
 * `getCredential`) and the compiled/deployed path (credentialEnv.ts's `applyCredentialEnvVars`)
 * resolve a credential BY NAME from, so a node like oauth2Saml can't tell whether the name it's
 * looking up came from the built-in vault or a connected external one (see the clarifying
 * questions this feature was scoped against: external vaults are read-only and fully
 * interchangeable with built-in credentials at Flow-execution time).
 *
 * Built-in credentials always win a name collision; among external vaults, whichever vault
 * connection was created first wins. A vault connection that fails to reach (network/auth error,
 * or one bad secret within it) is skipped rather than failing the whole resolution — a Flow that
 * doesn't reference that vault's secrets shouldn't fail to run just because that vault happens to
 * be unreachable right now. */
export async function resolveAllCredentials(db: DatabaseManager): Promise<Map<string, CredentialRecord>> {
  const byName = new Map<string, CredentialRecord>();

  for (const summary of db.listCredentials()) {
    const record = db.getCredential(summary.id);
    if (record) byName.set(record.name, record);
  }

  for (const connectionSummary of db.listVaultConnections()) {
    const connection = db.getVaultConnection(connectionSummary.id);
    if (!connection) continue;
    try {
      const secrets = await listVaultSecrets(connection);
      for (const secret of secrets) {
        if (byName.has(secret.name)) continue;
        try {
          const data = await getVaultSecret(connection, secret.id);
          byName.set(secret.name, {
            id: `${connection.id}:${secret.id}`,
            name: secret.name,
            type: "externalVaultSecret",
            data,
            createdAt: connection.createdAt,
            updatedAt: connection.updatedAt,
          });
        } catch {
          // One bad secret shouldn't block the rest of this vault (or any other).
        }
      }
    } catch {
      // This vault connection is unreachable right now — skip it, don't fail the whole run.
    }
  }

  return byName;
}
