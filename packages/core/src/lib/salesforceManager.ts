import { getDatabaseManager } from "../server/DatabaseManager.ts";
import { resolveAllCredentials } from "../server/vaultCredentials.ts";
import type { SalesforceOAuth2PasswordFlowCredentialData } from "@hermione/shared/types";

const API_VERSION = "v59.0";

export interface SalesforceOpResult {
  success: boolean;
  error: string;
  [key: string]: unknown;
}

export interface SalesforceQueryResult extends SalesforceOpResult {
  records: Record<string, unknown>[];
  totalSize: number;
  done: boolean;
}

export interface SalesforceCreateRecordResult extends SalesforceOpResult {
  id: string;
}

export interface SalesforceGetRecordResult extends SalesforceOpResult {
  record: Record<string, unknown>;
}

export interface SalesforceUpsertRecordResult extends SalesforceOpResult {
  id: string;
}

export interface SalesforceDescribeField {
  name: string;
  label: string;
  type: string;
}

export interface SalesforceDescribeSobjectResult extends SalesforceOpResult {
  fields: SalesforceDescribeField[];
}

export interface SalesforceAuth {
  loginUrl: string;
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  securityToken: string;
}

/** Identifies one Salesforce login (org + running user), used to key the token cache below —
 * mirrors JiraManager's cacheKey/JiraAuth pair. */
function cacheKey(auth: SalesforceAuth): string {
  return `${auth.loginUrl}:${auth.clientId}:${auth.username}`;
}

const managerCache = new Map<string, SalesforceManager>();

export class SalesforceManager {
  constructor(
    private readonly instanceUrl: string,
    private readonly accessToken: string,
  ) {}

  /** Authenticates via the OAuth2 Resource Owner Password Credentials grant (or reuses a manager
   * already cached for this exact org+user, since minting a token is a network round-trip every
   * node call would otherwise repeat — see managerCache above). Unlike Twilio/Facebook's synchronous
   * getInstance, this one is async: filling the cache requires the OAuth token exchange itself. */
  static async getInstance(auth: SalesforceAuth): Promise<SalesforceManager> {
    const key = cacheKey(auth);
    const cached = managerCache.get(key);
    if (cached) return cached;

    const body = new URLSearchParams({
      grant_type: "password",
      client_id: auth.clientId,
      client_secret: auth.clientSecret,
      username: auth.username,
      password: `${auth.password}${auth.securityToken}`,
    });
    const res = await fetch(`${auth.loginUrl.replace(/\/+$/, "")}/services/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const json = (await res.json()) as { access_token?: string; instance_url?: string; error?: string; error_description?: string };
    if (!res.ok || !json.access_token || !json.instance_url) {
      throw new Error(json.error_description ?? json.error ?? `Salesforce authentication failed (status ${res.status})`);
    }
    const manager = new SalesforceManager(json.instance_url, json.access_token);
    managerCache.set(key, manager);
    return manager;
  }

  /** Salesforce's non-2xx error bodies are a JSON array of `{message, errorCode}` objects rather than
   * a single object (see SlackManager's slackErrorMessage for the single-object equivalent). */
  static async errorMessage(res: Response): Promise<string> {
    try {
      const body = (await res.json()) as Array<{ message?: string; errorCode?: string }> | { error?: string; error_description?: string };
      if (Array.isArray(body)) return body.map((e) => e.message ?? e.errorCode ?? "Unknown error").join("; ");
      if (body?.error_description) return body.error_description;
      if (body?.error) return body.error;
    } catch {
      // Body wasn't JSON (or was empty) — fall through to the generic status message below.
    }
    return `Salesforce API error (status ${res.status})`;
  }

  private static async findCredential(credentialName: string): Promise<{ ok: true; auth: SalesforceAuth } | { ok: false; error: string }> {
    const credRecord = (await resolveAllCredentials(getDatabaseManager())).get(credentialName);
    if (!credRecord) return { ok: false, error: `Credential "${credentialName}" not found in the vault` };
    if (credRecord.type !== "salesforceOAuth2PasswordFlow") return { ok: false, error: `Credential "${credentialName}" is not a Salesforce OAuth2 (Password Flow) credential` };
    const data = credRecord.data as SalesforceOAuth2PasswordFlowCredentialData;
    return { ok: true, auth: { loginUrl: data.loginUrl, clientId: data.clientId, clientSecret: data.clientSecret, username: data.username, password: data.password, securityToken: data.securityToken } };
  }

  static async query(credentialName: string, soql: string): Promise<SalesforceQueryResult> {
    const cred = await SalesforceManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, records: [], totalSize: 0, done: true, error: cred.error };
    try {
      return (await SalesforceManager.getInstance(cred.auth)).query(soql);
    } catch (err) {
      return { success: false, records: [], totalSize: 0, done: true, error: err instanceof Error ? err.message : String(err) };
    }
  }

  static async createRecord(credentialName: string, sobjectType: string, fields: Record<string, unknown>): Promise<SalesforceCreateRecordResult> {
    const cred = await SalesforceManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, id: "", error: cred.error };
    try {
      return (await SalesforceManager.getInstance(cred.auth)).createRecord(sobjectType, fields);
    } catch (err) {
      return { success: false, id: "", error: err instanceof Error ? err.message : String(err) };
    }
  }

  static async getRecord(credentialName: string, sobjectType: string, id: string, fields: string): Promise<SalesforceGetRecordResult> {
    const cred = await SalesforceManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, record: {}, error: cred.error };
    try {
      return (await SalesforceManager.getInstance(cred.auth)).getRecord(sobjectType, id, fields);
    } catch (err) {
      return { success: false, record: {}, error: err instanceof Error ? err.message : String(err) };
    }
  }

  static async updateRecord(credentialName: string, sobjectType: string, id: string, fields: Record<string, unknown>): Promise<SalesforceOpResult> {
    const cred = await SalesforceManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    try {
      return (await SalesforceManager.getInstance(cred.auth)).updateRecord(sobjectType, id, fields);
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  static async deleteRecord(credentialName: string, sobjectType: string, id: string): Promise<SalesforceOpResult> {
    const cred = await SalesforceManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    try {
      return (await SalesforceManager.getInstance(cred.auth)).deleteRecord(sobjectType, id);
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  static async upsertRecord(credentialName: string, sobjectType: string, externalIdField: string, externalIdValue: string, fields: Record<string, unknown>): Promise<SalesforceUpsertRecordResult> {
    const cred = await SalesforceManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, id: "", error: cred.error };
    try {
      return (await SalesforceManager.getInstance(cred.auth)).upsertRecord(sobjectType, externalIdField, externalIdValue, fields);
    } catch (err) {
      return { success: false, id: "", error: err instanceof Error ? err.message : String(err) };
    }
  }

  static async describeSobject(credentialName: string, sobjectType: string): Promise<SalesforceDescribeSobjectResult> {
    const cred = await SalesforceManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, fields: [], error: cred.error };
    try {
      return (await SalesforceManager.getInstance(cred.auth)).describeSobject(sobjectType);
    } catch (err) {
      return { success: false, fields: [], error: err instanceof Error ? err.message : String(err) };
    }
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.accessToken}` };
  }

  private apiUrl(path: string): string {
    return `${this.instanceUrl}/services/data/${API_VERSION}${path}`;
  }

  private async query(soql: string): Promise<SalesforceQueryResult> {
    try {
      const res = await fetch(this.apiUrl(`/query?q=${encodeURIComponent(soql)}`), { headers: this.authHeaders() });
      if (!res.ok) return { success: false, records: [], totalSize: 0, done: true, error: await SalesforceManager.errorMessage(res) };
      const json = (await res.json()) as { records?: Record<string, unknown>[]; totalSize?: number; done?: boolean };
      return { success: true, records: json.records ?? [], totalSize: json.totalSize ?? 0, done: Boolean(json.done), error: "" };
    } catch (err) {
      return { success: false, records: [], totalSize: 0, done: true, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async createRecord(sobjectType: string, fields: Record<string, unknown>): Promise<SalesforceCreateRecordResult> {
    try {
      const res = await fetch(this.apiUrl(`/sobjects/${sobjectType}`), {
        method: "POST",
        headers: { ...this.authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) return { success: false, id: "", error: await SalesforceManager.errorMessage(res) };
      const json = (await res.json()) as { id?: string };
      return { success: true, id: json.id ?? "", error: "" };
    } catch (err) {
      return { success: false, id: "", error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async getRecord(sobjectType: string, id: string, fields: string): Promise<SalesforceGetRecordResult> {
    try {
      const query = fields ? `?fields=${encodeURIComponent(fields)}` : "";
      const res = await fetch(this.apiUrl(`/sobjects/${sobjectType}/${id}${query}`), { headers: this.authHeaders() });
      if (!res.ok) return { success: false, record: {}, error: await SalesforceManager.errorMessage(res) };
      const record = (await res.json()) as Record<string, unknown>;
      return { success: true, record, error: "" };
    } catch (err) {
      return { success: false, record: {}, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async updateRecord(sobjectType: string, id: string, fields: Record<string, unknown>): Promise<SalesforceOpResult> {
    try {
      const res = await fetch(this.apiUrl(`/sobjects/${sobjectType}/${id}`), {
        method: "PATCH",
        headers: { ...this.authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      // Salesforce returns 204 No Content on a successful update — nothing to parse.
      if (!res.ok) return { success: false, error: await SalesforceManager.errorMessage(res) };
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async deleteRecord(sobjectType: string, id: string): Promise<SalesforceOpResult> {
    try {
      const res = await fetch(this.apiUrl(`/sobjects/${sobjectType}/${id}`), { method: "DELETE", headers: this.authHeaders() });
      // Salesforce returns 204 No Content on a successful delete — nothing to parse.
      if (!res.ok) return { success: false, error: await SalesforceManager.errorMessage(res) };
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async upsertRecord(sobjectType: string, externalIdField: string, externalIdValue: string, fields: Record<string, unknown>): Promise<SalesforceUpsertRecordResult> {
    try {
      const res = await fetch(this.apiUrl(`/sobjects/${sobjectType}/${externalIdField}/${encodeURIComponent(externalIdValue)}`), {
        method: "PATCH",
        headers: { ...this.authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) return { success: false, id: "", error: await SalesforceManager.errorMessage(res) };
      // Salesforce returns 204 No Content on an update-via-upsert, or 201 with the new id on a create-via-upsert.
      if (res.status === 204) return { success: true, id: "", error: "" };
      const json = (await res.json()) as { id?: string };
      return { success: true, id: json.id ?? "", error: "" };
    } catch (err) {
      return { success: false, id: "", error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async describeSobject(sobjectType: string): Promise<SalesforceDescribeSobjectResult> {
    try {
      const res = await fetch(this.apiUrl(`/sobjects/${sobjectType}/describe`), { headers: this.authHeaders() });
      if (!res.ok) return { success: false, fields: [], error: await SalesforceManager.errorMessage(res) };
      const json = (await res.json()) as { fields?: Array<{ name?: string; label?: string; type?: string }> };
      const fields = (json.fields ?? []).map((f) => ({ name: f.name ?? "", label: f.label ?? "", type: f.type ?? "" }));
      return { success: true, fields, error: "" };
    } catch (err) {
      return { success: false, fields: [], error: err instanceof Error ? err.message : String(err) };
    }
  }

  // executeApex is intentionally not implemented: Salesforce has no simple anonymous-Apex REST
  // endpoint suitable for a single fetch() call (the Tooling API's executeAnonymous requires a
  // SOAP-style envelope), so it's out of scope for this fetch()-only connector.
}
