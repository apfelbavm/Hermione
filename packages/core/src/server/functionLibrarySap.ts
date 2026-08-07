import { SapManager } from "../lib/sapManager.ts";

/** Compile-time-only counterpart of nodes/sap.ts's execute() vault lookup (resolveSapCredential) —
 * the compiled/deployed script has no access to the Credential Vault database, only the interpreter
 * does, so it reads the same credential's fields back from environment variables instead, the same
 * "HERMIONE_CRED_<NAME>_<FIELD>" naming credentialEnv.ts's applyCredentialEnvVars writes. Never
 * called by the interpreter — genuinely different credential-sourcing behavior, not duplicated logic
 * (see functionLibraryWorkday.ts for the same pattern). */
function sapManagerFromEnv(credentialName: string): { ok: true; manager: SapManager } | { ok: false; error: string } {
  const prefix = `HERMIONE_CRED_${String(credentialName)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")}`;
  const type = process.env[`${prefix}_CREDENTIAL_TYPE`];
  if (type !== "sapBasicAuth") return { ok: false, error: `Credential "${credentialName}" not found in the vault, or is not a SAP Basic Auth credential` };
  return { ok: true, manager: new SapManager(process.env[`${prefix}_BASE_URL`] || "", process.env[`${prefix}_CLIENT`] || "", process.env[`${prefix}_USERNAME`] || "", process.env[`${prefix}_PASSWORD`] || "") };
}

export async function sapGetEntitySet(credentialName: string, servicePath: string, entitySet: string, queryOptions: string) {
  const cred = sapManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, results: [], error: cred.error };
  return cred.manager.getEntitySet(servicePath, entitySet, queryOptions);
}

export async function sapGetEntity(credentialName: string, servicePath: string, entitySet: string, keyPredicate: string) {
  const cred = sapManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, entity: {}, error: cred.error };
  return cred.manager.getEntity(servicePath, entitySet, keyPredicate);
}

export async function sapCreateEntity(credentialName: string, servicePath: string, entitySet: string, bodyJson: Record<string, unknown>) {
  const cred = sapManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, entity: {}, error: cred.error };
  return cred.manager.createEntity(servicePath, entitySet, bodyJson);
}

export async function sapUpdateEntity(credentialName: string, servicePath: string, entitySet: string, keyPredicate: string, bodyJson: Record<string, unknown>) {
  const cred = sapManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.updateEntity(servicePath, entitySet, keyPredicate, bodyJson);
}

export async function sapDeleteEntity(credentialName: string, servicePath: string, entitySet: string, keyPredicate: string) {
  const cred = sapManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.deleteEntity(servicePath, entitySet, keyPredicate);
}
