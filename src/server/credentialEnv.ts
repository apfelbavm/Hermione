import type { DatabaseManager } from "./DatabaseManager";

/** Mirrors nodes/oauth2Saml.ts's own hand-written CREDENTIAL_FROM_ENV_SOURCE naming convention —
 * "HERMIONE_CRED_" followed by the credential's own name, uppercased and sanitized to
 * env-var-safe characters. */
function credentialEnvPrefix(name: string): string {
  return `HERMIONE_CRED_${name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")}`;
}

/** "idpUrl" -> "IDP_URL", matching the field-name convention CREDENTIAL_FROM_ENV_SOURCE expects. */
function camelToEnvKey(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
}

/** Populates `process.env` with every stored credential's fields, under the same
 * `HERMIONE_CRED_<SANITIZED NAME>_<FIELD>` names a compiled node's own env-reading helper (see
 * nodes/oauth2Saml.ts's credentialFromEnv) looks them up by — so a Flow whose compiled output reads
 * a credential by name actually finds it when run server-side (see
 * api/localhost-deployment/run/route.ts), the same way it would after being deployed standalone with
 * those env vars set by hand. Derived generically off each credential's own `data` keys rather than
 * hand-listing fields per type, so any future credential type gets this for free the moment its own
 * node type adds a compileExecute that reads env vars the same way. Only meaningful for the one
 * compiled module import that follows — not meant to be a permanent process-wide side effect. */
export function applyCredentialEnvVars(db: DatabaseManager): void {
  for (const summary of db.listCredentials()) {
    const record = db.getCredential(summary.id);
    if (!record) continue;
    const prefix = credentialEnvPrefix(record.name);
    for (const [key, value] of Object.entries(record.data)) {
      process.env[`${prefix}_${camelToEnvKey(key)}`] = String(value ?? "");
    }
  }
}
