import { WorkdayManager } from "../lib/workdayManager.ts";

/** Compile-time-only counterpart of nodes/workday.ts's execute() vault lookup
 * (resolveWorkdayCredential) — the compiled/deployed script has no access to the Credential
 * Vault database, only the interpreter does, so it reads the same credential's fields back from
 * environment variables instead, the same "HERMIONE_CRED_<NAME>_<FIELD>" naming
 * credentialEnv.ts's applyCredentialEnvVars writes. Never called by the interpreter — genuinely
 * different credential-sourcing behavior, not duplicated logic (see functionLibrarySlack.ts for
 * the same pattern). */
function workdayManagerFromEnv(credentialName: string): { ok: true; manager: WorkdayManager } | { ok: false; error: string } {
  const prefix = `HERMIONE_CRED_${String(credentialName)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")}`;
  const type = process.env[`${prefix}_CREDENTIAL_TYPE`];
  if (type !== "workdayBasicAuth") return { ok: false, error: `Credential "${credentialName}" not found in the vault, or is not a Workday Basic Auth credential` };
  return { ok: true, manager: new WorkdayManager(process.env[`${prefix}_TENANT_URL`] || "", process.env[`${prefix}_USERNAME`] || "", process.env[`${prefix}_PASSWORD`] || "") };
}

export async function workdayGetWorkers(credentialName: string, limit: number, offset: number, searchTerm: string) {
  const cred = workdayManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, workers: [], total: 0, error: cred.error };
  return cred.manager.getWorkers(limit, offset, searchTerm);
}

export async function workdayGetWorker(credentialName: string, workerId: string) {
  const cred = workdayManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, worker: {}, error: cred.error };
  return cred.manager.getWorker(workerId);
}

export async function workdaySearchWorkers(credentialName: string, query: string, limit: number) {
  const cred = workdayManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, workers: [], total: 0, error: cred.error };
  return cred.manager.searchWorkers(query, limit);
}

export async function workdayGetStaffingOrganizations(credentialName: string, limit: number, offset: number) {
  const cred = workdayManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, organizations: [], total: 0, error: cred.error };
  return cred.manager.getStaffingOrganizations(limit, offset);
}

export async function workdayGetOrganization(credentialName: string, organizationId: string) {
  const cred = workdayManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, organization: {}, error: cred.error };
  return cred.manager.getOrganization(organizationId);
}
