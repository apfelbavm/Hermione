/** Thin fetch()-only wrapper around Workday's REST API v1
 * (https://community.workday.com/sites/default/files/file-hosting/productionapi/index.html), authenticated
 * with HTTP Basic auth against an Integration System User (see lib/dropboxManager.ts for the zero-dependency
 * style this mirrors). Every method turns a response into the same plain {success, error} shape every other
 * provider manager in this repo returns, unwrapping Workday's {total, data: [...]} pagination envelope for
 * collection endpoints. */

import { getDatabaseManager } from "../server/DatabaseManager.ts";
import { resolveAllCredentials } from "../server/vaultCredentials.ts";
import type { WorkdayBasicAuthCredentialData } from "@hermione/shared/types";

export interface WorkdayAuth {
  tenantUrl: string;
  username: string;
  password: string;
}

export interface WorkdayOpResult {
  success: boolean;
  error: string;
  [key: string]: unknown;
}

export interface WorkdayGetWorkersResult extends WorkdayOpResult {
  workers: Record<string, unknown>[];
  total: number;
}

export interface WorkdayGetWorkerResult extends WorkdayOpResult {
  worker: Record<string, unknown>;
}

export interface WorkdayGetStaffingOrganizationsResult extends WorkdayOpResult {
  organizations: Record<string, unknown>[];
  total: number;
}

export interface WorkdayGetOrganizationResult extends WorkdayOpResult {
  organization: Record<string, unknown>;
}

const managerCache = new Map<string, WorkdayManager>();

export class WorkdayManager {
  private readonly authHeader: string;

  static getInstance(auth: WorkdayAuth): WorkdayManager {
    const key = `${auth.tenantUrl}:${auth.username}:${auth.password}`;
    let manager = managerCache.get(key);
    if (!manager) {
      manager = new WorkdayManager(auth.tenantUrl, auth.username, auth.password);
      managerCache.set(key, manager);
    }
    return manager;
  }

  private constructor(
    private readonly tenantUrl: string,
    username: string,
    password: string,
  ) {
    this.authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  }

  static errorMessage(status: number, statusText: string, body: unknown): string {
    const err = body as { error?: string; errors?: { error?: string }[] } | undefined;
    const messages = [err?.error, ...(err?.errors?.map((e) => e?.error) ?? [])].filter(Boolean);
    if (messages.length > 0) return messages.join("; ");
    return `Workday API error (status ${status}): ${statusText}`;
  }

  private static async findCredential(credentialName: string): Promise<{ ok: true; auth: WorkdayAuth } | { ok: false; error: string }> {
    const credRecord = (await resolveAllCredentials(getDatabaseManager())).get(credentialName);
    if (!credRecord) return { ok: false, error: `Credential "${credentialName}" not found in the vault` };
    if (credRecord.type !== "workdayBasicAuth") return { ok: false, error: `Credential "${credentialName}" is not a Workday Basic Auth credential` };
    const data = credRecord.data as WorkdayBasicAuthCredentialData;
    return { ok: true, auth: { tenantUrl: data.tenantUrl, username: data.username, password: data.password } };
  }

  static async getWorkers(credentialName: string, limit: number, offset: number, searchTerm: string): Promise<WorkdayGetWorkersResult> {
    const cred = await WorkdayManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, workers: [], total: 0, error: cred.error };
    return WorkdayManager.getInstance(cred.auth).getWorkers(limit, offset, searchTerm);
  }

  static async getWorker(credentialName: string, workerId: string): Promise<WorkdayGetWorkerResult> {
    const cred = await WorkdayManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, worker: {}, error: cred.error };
    return WorkdayManager.getInstance(cred.auth).getWorker(workerId);
  }

  static async searchWorkers(credentialName: string, query: string, limit: number): Promise<WorkdayGetWorkersResult> {
    const cred = await WorkdayManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, workers: [], total: 0, error: cred.error };
    return WorkdayManager.getInstance(cred.auth).searchWorkers(query, limit);
  }

  static async getStaffingOrganizations(credentialName: string, limit: number, offset: number): Promise<WorkdayGetStaffingOrganizationsResult> {
    const cred = await WorkdayManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, organizations: [], total: 0, error: cred.error };
    return WorkdayManager.getInstance(cred.auth).getStaffingOrganizations(limit, offset);
  }

  static async getOrganization(credentialName: string, organizationId: string): Promise<WorkdayGetOrganizationResult> {
    const cred = await WorkdayManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, organization: {}, error: cred.error };
    return WorkdayManager.getInstance(cred.auth).getOrganization(organizationId);
  }

  private headers(): Record<string, string> {
    return { Authorization: this.authHeader, Accept: "application/json" };
  }

  private url(resourcePath: string): string {
    return `${this.tenantUrl.replace(/\/+$/, "")}/${resourcePath.replace(/^\/+/, "")}`;
  }

  private async parseErrorBody(res: Response): Promise<unknown> {
    try {
      return await res.json();
    } catch {
      return undefined;
    }
  }

  private async getWorkers(limit: number, offset: number, searchTerm: string): Promise<WorkdayGetWorkersResult> {
    try {
      const params = `?limit=${limit || 20}&offset=${offset || 0}${searchTerm ? `&search=${encodeURIComponent(searchTerm)}` : ""}`;
      const res = await fetch(this.url(`workers${params}`), { headers: this.headers() });
      if (!res.ok) return { success: false, workers: [], total: 0, error: WorkdayManager.errorMessage(res.status, res.statusText, await this.parseErrorBody(res)) };
      const json = (await res.json()) as { total?: number; data?: Record<string, unknown>[] };
      return { success: true, workers: json.data ?? [], total: json.total ?? 0, error: "" };
    } catch (err) {
      return { success: false, workers: [], total: 0, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async getWorker(workerId: string): Promise<WorkdayGetWorkerResult> {
    try {
      const res = await fetch(this.url(`workers/${encodeURIComponent(workerId)}`), { headers: this.headers() });
      if (!res.ok) return { success: false, worker: {}, error: WorkdayManager.errorMessage(res.status, res.statusText, await this.parseErrorBody(res)) };
      const worker = (await res.json()) as Record<string, unknown>;
      return { success: true, worker, error: "" };
    } catch (err) {
      return { success: false, worker: {}, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async searchWorkers(query: string, limit: number): Promise<WorkdayGetWorkersResult> {
    try {
      const res = await fetch(this.url(`workers?search=${encodeURIComponent(query)}&limit=${limit || 20}`), { headers: this.headers() });
      if (!res.ok) return { success: false, workers: [], total: 0, error: WorkdayManager.errorMessage(res.status, res.statusText, await this.parseErrorBody(res)) };
      const json = (await res.json()) as { total?: number; data?: Record<string, unknown>[] };
      return { success: true, workers: json.data ?? [], total: json.total ?? 0, error: "" };
    } catch (err) {
      return { success: false, workers: [], total: 0, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async getStaffingOrganizations(limit: number, offset: number): Promise<WorkdayGetStaffingOrganizationsResult> {
    try {
      const res = await fetch(this.url(`staffingOrganizations?limit=${limit || 20}&offset=${offset || 0}`), { headers: this.headers() });
      if (!res.ok) return { success: false, organizations: [], total: 0, error: WorkdayManager.errorMessage(res.status, res.statusText, await this.parseErrorBody(res)) };
      const json = (await res.json()) as { total?: number; data?: Record<string, unknown>[] };
      return { success: true, organizations: json.data ?? [], total: json.total ?? 0, error: "" };
    } catch (err) {
      return { success: false, organizations: [], total: 0, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async getOrganization(organizationId: string): Promise<WorkdayGetOrganizationResult> {
    try {
      const res = await fetch(this.url(`organizations/${encodeURIComponent(organizationId)}`), { headers: this.headers() });
      if (!res.ok) return { success: false, organization: {}, error: WorkdayManager.errorMessage(res.status, res.statusText, await this.parseErrorBody(res)) };
      const organization = (await res.json()) as Record<string, unknown>;
      return { success: true, organization, error: "" };
    } catch (err) {
      return { success: false, organization: {}, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // Business process submission requires Workday's SOAP/RaaS integration surface, not this read-oriented REST v1 API — not implemented.
}
