/** Thin fetch()-only wrapper around Workday's REST API v1
 * (https://community.workday.com/sites/default/files/file-hosting/productionapi/index.html), authenticated
 * with HTTP Basic auth against an Integration System User (see lib/dropboxManager.ts for the zero-dependency
 * style this mirrors). Every method turns a response into the same plain {success, error} shape every other
 * provider manager in this repo returns, unwrapping Workday's {total, data: [...]} pagination envelope for
 * collection endpoints. */

function workdayErrorMessage(status: number, statusText: string, body: unknown): string {
  const err = body as { error?: string; errors?: { error?: string }[] } | undefined;
  const messages = [err?.error, ...(err?.errors?.map((e) => e?.error) ?? [])].filter(Boolean);
  if (messages.length > 0) return messages.join("; ");
  return `Workday API error (status ${status}): ${statusText}`;
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

export class WorkdayManager {
  private readonly authHeader: string;

  constructor(
    private readonly tenantUrl: string,
    username: string,
    password: string,
  ) {
    this.authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
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

  async getWorkers(limit: number, offset: number, searchTerm: string): Promise<WorkdayGetWorkersResult> {
    try {
      const params = `?limit=${limit || 20}&offset=${offset || 0}${searchTerm ? `&search=${encodeURIComponent(searchTerm)}` : ""}`;
      const res = await fetch(this.url(`workers${params}`), { headers: this.headers() });
      if (!res.ok) return { success: false, workers: [], total: 0, error: workdayErrorMessage(res.status, res.statusText, await this.parseErrorBody(res)) };
      const json = (await res.json()) as { total?: number; data?: Record<string, unknown>[] };
      return { success: true, workers: json.data ?? [], total: json.total ?? 0, error: "" };
    } catch (err) {
      return { success: false, workers: [], total: 0, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async getWorker(workerId: string): Promise<WorkdayGetWorkerResult> {
    try {
      const res = await fetch(this.url(`workers/${encodeURIComponent(workerId)}`), { headers: this.headers() });
      if (!res.ok) return { success: false, worker: {}, error: workdayErrorMessage(res.status, res.statusText, await this.parseErrorBody(res)) };
      const worker = (await res.json()) as Record<string, unknown>;
      return { success: true, worker, error: "" };
    } catch (err) {
      return { success: false, worker: {}, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async searchWorkers(query: string, limit: number): Promise<WorkdayGetWorkersResult> {
    try {
      const res = await fetch(this.url(`workers?search=${encodeURIComponent(query)}&limit=${limit || 20}`), { headers: this.headers() });
      if (!res.ok) return { success: false, workers: [], total: 0, error: workdayErrorMessage(res.status, res.statusText, await this.parseErrorBody(res)) };
      const json = (await res.json()) as { total?: number; data?: Record<string, unknown>[] };
      return { success: true, workers: json.data ?? [], total: json.total ?? 0, error: "" };
    } catch (err) {
      return { success: false, workers: [], total: 0, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async getStaffingOrganizations(limit: number, offset: number): Promise<WorkdayGetStaffingOrganizationsResult> {
    try {
      const res = await fetch(this.url(`staffingOrganizations?limit=${limit || 20}&offset=${offset || 0}`), { headers: this.headers() });
      if (!res.ok) return { success: false, organizations: [], total: 0, error: workdayErrorMessage(res.status, res.statusText, await this.parseErrorBody(res)) };
      const json = (await res.json()) as { total?: number; data?: Record<string, unknown>[] };
      return { success: true, organizations: json.data ?? [], total: json.total ?? 0, error: "" };
    } catch (err) {
      return { success: false, organizations: [], total: 0, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async getOrganization(organizationId: string): Promise<WorkdayGetOrganizationResult> {
    try {
      const res = await fetch(this.url(`organizations/${encodeURIComponent(organizationId)}`), { headers: this.headers() });
      if (!res.ok) return { success: false, organization: {}, error: workdayErrorMessage(res.status, res.statusText, await this.parseErrorBody(res)) };
      const organization = (await res.json()) as Record<string, unknown>;
      return { success: true, organization, error: "" };
    } catch (err) {
      return { success: false, organization: {}, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // Business process submission requires Workday's SOAP/RaaS integration surface, not this read-oriented REST v1 API — not implemented.
}
