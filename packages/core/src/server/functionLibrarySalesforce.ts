import { SalesforceManager } from "../lib/salesforceManager.ts";

/** Compile-time-only counterpart of nodes/salesforce.ts's execute() vault lookup
 * (resolveSalesforceCredential) — the compiled/deployed script has no access to the Credential
 * Vault database, only the interpreter does, so it reads the same credential's fields back from
 * environment variables instead, the same "HERMIONE_CRED_<NAME>_<FIELD>" naming
 * credentialEnv.ts's applyCredentialEnvVars writes. Never called by the interpreter — genuinely
 * different credential-sourcing behavior, not duplicated logic (see functionLibrarySlack.ts for
 * the same pattern). */
async function salesforceManagerFromEnv(credentialName: string): Promise<{ ok: true; manager: SalesforceManager } | { ok: false; error: string }> {
  const prefix = `HERMIONE_CRED_${String(credentialName)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")}`;
  const type = process.env[`${prefix}_CREDENTIAL_TYPE`];
  if (type !== "salesforceOAuth2PasswordFlow") return { ok: false, error: `Credential "${credentialName}" not found in the vault, or is not a Salesforce OAuth2 (Password Flow) credential` };
  return SalesforceManager.forCredential({
    loginUrl: process.env[`${prefix}_LOGIN_URL`] || "",
    clientId: process.env[`${prefix}_CLIENT_ID`] || "",
    clientSecret: process.env[`${prefix}_CLIENT_SECRET`] || "",
    username: process.env[`${prefix}_USERNAME`] || "",
    password: process.env[`${prefix}_PASSWORD`] || "",
    securityToken: process.env[`${prefix}_SECURITY_TOKEN`] || "",
  });
}

export async function salesforceQuery(credentialName: string, soql: string) {
  const cred = await salesforceManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, records: [], totalSize: 0, done: true, error: cred.error };
  return cred.manager.query(soql);
}

export async function salesforceCreateRecord(credentialName: string, sobjectType: string, fields: Record<string, unknown>) {
  const cred = await salesforceManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, id: "", error: cred.error };
  return cred.manager.createRecord(sobjectType, fields);
}

export async function salesforceGetRecord(credentialName: string, sobjectType: string, id: string, fields: string) {
  const cred = await salesforceManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, record: {}, error: cred.error };
  return cred.manager.getRecord(sobjectType, id, fields);
}

export async function salesforceUpdateRecord(credentialName: string, sobjectType: string, id: string, fields: Record<string, unknown>) {
  const cred = await salesforceManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.updateRecord(sobjectType, id, fields);
}

export async function salesforceDeleteRecord(credentialName: string, sobjectType: string, id: string) {
  const cred = await salesforceManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.deleteRecord(sobjectType, id);
}

export async function salesforceUpsertRecord(credentialName: string, sobjectType: string, externalIdField: string, externalIdValue: string, fields: Record<string, unknown>) {
  const cred = await salesforceManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, id: "", error: cred.error };
  return cred.manager.upsertRecord(sobjectType, externalIdField, externalIdValue, fields);
}

export async function salesforceDescribeSobject(credentialName: string, sobjectType: string) {
  const cred = await salesforceManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, fields: [], error: cred.error };
  return cred.manager.describeSobject(sobjectType);
}
