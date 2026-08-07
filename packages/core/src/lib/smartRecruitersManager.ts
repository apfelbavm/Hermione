/** Thin fetch()-only wrapper around the SmartRecruiters REST API
 * (https://developers.smartrecruiters.com), hand-written against its OpenAPI/reference docs since
 * SmartRecruiters has no official Node SDK — mirrors lib/workdayManager.ts's zero-dependency style.
 * Supports both of SmartRecruiters' own auth options: a plain API key (X-SmartToken header) or an
 * OAuth2 client-credentials grant (Bearer token, minted/cached/refreshed automatically). Every
 * public method funnels through the private `request()` helper so the ~150 REST endpoints this
 * connector covers (see /memories/repo/smartrecruiters-plan.md for the phased build-out) share one
 * auth/error/JSON-body implementation instead of duplicating it per method. */

const API_BASE_URL = "https://api.smartrecruiters.com";

export type SmartRecruitersAuth = { kind: "apiKey"; apiKey: string } | { kind: "oauth2"; clientId: string; clientSecret: string; tokenUrl: string };

export interface SmartRecruitersOpResult {
  success: boolean;
  error: string;
  [key: string]: unknown;
}

export interface SmartRecruitersJobsListResult extends SmartRecruitersOpResult {
  jobs: Record<string, unknown>[];
  totalFound: number;
  offset: number;
  limit: number;
}

export interface SmartRecruitersJobResult extends SmartRecruitersOpResult {
  job: Record<string, unknown>;
}

export interface SmartRecruitersJobStatusHistoryResult extends SmartRecruitersOpResult {
  history: Record<string, unknown>[];
}

export interface SmartRecruitersApprovalResult extends SmartRecruitersOpResult {
  approval: Record<string, unknown>;
}

export interface SmartRecruitersJobNoteResult extends SmartRecruitersOpResult {
  note: Record<string, unknown>;
}

export interface SmartRecruitersJobAdsListResult extends SmartRecruitersOpResult {
  jobAds: Record<string, unknown>[];
}

export interface SmartRecruitersJobAdResult extends SmartRecruitersOpResult {
  jobAd: Record<string, unknown>;
}

export interface SmartRecruitersPostingStatusResult extends SmartRecruitersOpResult {
  status: string;
}

export interface SmartRecruitersPostingsListResult extends SmartRecruitersOpResult {
  postings: Record<string, unknown>[];
}

export interface SmartRecruitersPositionsListResult extends SmartRecruitersOpResult {
  positions: Record<string, unknown>[];
  totalFound: number;
}

export interface SmartRecruitersPositionResult extends SmartRecruitersOpResult {
  position: Record<string, unknown>;
}

export interface SmartRecruitersHiringTeamListResult extends SmartRecruitersOpResult {
  members: Record<string, unknown>[];
  totalFound: number;
}

export interface SmartRecruitersHiringTeamMemberResult extends SmartRecruitersOpResult {
  member: Record<string, unknown>;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

function smartRecruitersErrorMessage(status: number, statusText: string, body: unknown): string {
  const err = body as { message?: string; error?: string; error_description?: string } | undefined;
  const message = err?.message ?? err?.error_description ?? err?.error;
  return message ? `${message} (status ${status})` : `SmartRecruiters API error (status ${status}): ${statusText}`;
}

function authCacheKey(auth: SmartRecruitersAuth): string {
  return auth.kind === "apiKey" ? `apiKey:${auth.apiKey}` : `oauth2:${auth.clientId}:${auth.tokenUrl}`;
}

const managerCache = new Map<string, SmartRecruitersManager>();
// Shared across all manager instances (keyed same as managerCache) so a fresh SmartRecruitersManager
// built for the same auth doesn't re-mint a token that's still valid.
const tokenCache = new Map<string, CachedToken>();

export class SmartRecruitersManager {
  private constructor(private readonly auth: SmartRecruitersAuth) {}

  /** Reuses one manager per distinct auth instead of building a fresh one per node execution — see
   * lib/githubManager.ts's GithubManager.forAuth for the same rationale. */
  static forAuth(auth: SmartRecruitersAuth): SmartRecruitersManager {
    const key = authCacheKey(auth);
    let manager = managerCache.get(key);
    if (!manager) {
      manager = new SmartRecruitersManager(auth);
      managerCache.set(key, manager);
    }
    return manager;
  }

  private async parseErrorBody(res: Response): Promise<unknown> {
    try {
      return await res.json();
    } catch {
      return undefined;
    }
  }

  private async authHeader(): Promise<{ ok: true; header: Record<string, string> } | { ok: false; error: string }> {
    if (this.auth.kind === "apiKey") return { ok: true, header: { "X-SmartToken": this.auth.apiKey } };

    const key = authCacheKey(this.auth);
    const cached = tokenCache.get(key);
    if (cached && cached.expiresAt > Date.now() + 5000) return { ok: true, header: { Authorization: `Bearer ${cached.accessToken}` } };

    try {
      const res = await fetch(this.auth.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "client_credentials", client_id: this.auth.clientId, client_secret: this.auth.clientSecret }),
      });
      if (!res.ok) return { ok: false, error: smartRecruitersErrorMessage(res.status, res.statusText, await this.parseErrorBody(res)) };
      const json = (await res.json()) as { access_token?: string; expires_in?: number };
      if (!json.access_token) return { ok: false, error: "SmartRecruiters token endpoint did not return an access_token" };
      tokenCache.set(key, { accessToken: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 });
      return { ok: true, header: { Authorization: `Bearer ${json.access_token}` } };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Core request helper every resource method (and the generic apiCall escape hatch) funnels
   * through. `path` is relative to the API base (leading slash optional). `contentType` defaults
   * to `application/json`; pass `application/merge-patch+json` for RFC 7396 partial updates
   * (e.g. patchJob). */
  private async request<T = Record<string, unknown>>(
    method: string,
    path: string,
    options?: { query?: Record<string, string | number | boolean | undefined>; body?: unknown; contentType?: string },
  ): Promise<{ success: true; data: T; status: number } | { success: false; error: string; status: number }> {
    const authResult = await this.authHeader();
    if (!authResult.ok) return { success: false, error: authResult.error, status: 0 };

    const url = new URL(path.replace(/^\/+/, ""), `${API_BASE_URL}/`);
    for (const [k, v] of Object.entries(options?.query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }

    try {
      const res = await fetch(url, {
        method,
        headers: {
          ...authResult.header,
          Accept: "application/json",
          ...(options?.body !== undefined ? { "Content-Type": options?.contentType ?? "application/json" } : {}),
        },
        body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
      });
      if (!res.ok) return { success: false, error: smartRecruitersErrorMessage(res.status, res.statusText, await this.parseErrorBody(res)), status: res.status };
      if (res.status === 204) return { success: true, data: {} as T, status: res.status };
      const text = await res.text();
      const data = text ? (JSON.parse(text) as T) : ({} as T);
      return { success: true, data, status: res.status };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err), status: 0 };
    }
  }

  /** Generic escape hatch for any documented SmartRecruiters endpoint not yet covered by a
   * dedicated method on this class — see /memories/repo/smartrecruiters-plan.md for the phased
   * build-out of dedicated resource methods (Jobs, Candidates, Applications, Users, ...). `query`
   * and `body` are already-parsed plain objects; `body` should be `undefined` for methods without
   * a request body (GET/DELETE). */
  async apiCall(method: string, path: string, query: Record<string, string>, body: unknown): Promise<SmartRecruitersOpResult & { status: number; dataJson: string }> {
    const result = await this.request(method, path, { query, body });
    if (!result.success) return { success: false, error: result.error, status: result.status, dataJson: "" };
    return { success: true, error: "", status: result.status, dataJson: JSON.stringify(result.data) };
  }

  // --- Jobs core (Phase 1) ---------------------------------------------------------------

  async searchJobs(query: Record<string, string | number | boolean | undefined>): Promise<SmartRecruitersJobsListResult> {
    const result = await this.request<{ totalFound?: number; offset?: number; limit?: number; content?: Record<string, unknown>[] }>("GET", "/jobs", { query });
    if (!result.success) return { success: false, jobs: [], totalFound: 0, offset: 0, limit: 0, error: result.error };
    return { success: true, jobs: result.data.content ?? [], totalFound: result.data.totalFound ?? 0, offset: result.data.offset ?? 0, limit: result.data.limit ?? 0, error: "" };
  }

  async createJob(job: Record<string, unknown>): Promise<SmartRecruitersJobResult> {
    const result = await this.request<Record<string, unknown>>("POST", "/jobs", { body: job });
    if (!result.success) return { success: false, job: {}, error: result.error };
    return { success: true, job: result.data, error: "" };
  }

  async getJob(jobId: string): Promise<SmartRecruitersJobResult> {
    const result = await this.request<Record<string, unknown>>("GET", `/jobs/${encodeURIComponent(jobId)}`);
    if (!result.success) return { success: false, job: {}, error: result.error };
    return { success: true, job: result.data, error: "" };
  }

  /** RFC 7396 JSON Merge Patch — only the fields present in `patch` are changed. */
  async patchJob(jobId: string, patch: Record<string, unknown>): Promise<SmartRecruitersJobResult> {
    const result = await this.request<Record<string, unknown>>("PATCH", `/jobs/${encodeURIComponent(jobId)}`, { body: patch, contentType: "application/merge-patch+json" });
    if (!result.success) return { success: false, job: {}, error: result.error };
    return { success: true, job: result.data, error: "" };
  }

  async updateJobStatus(jobId: string, status: string): Promise<SmartRecruitersJobResult> {
    const result = await this.request<Record<string, unknown>>("POST", `/jobs/${encodeURIComponent(jobId)}/status`, { body: { status } });
    if (!result.success) return { success: false, job: {}, error: result.error };
    return { success: true, job: result.data, error: "" };
  }

  async getJobStatusHistory(jobId: string): Promise<SmartRecruitersJobStatusHistoryResult> {
    const result = await this.request<{ content?: Record<string, unknown>[] } | Record<string, unknown>[]>("GET", `/jobs/${encodeURIComponent(jobId)}/status-history`);
    if (!result.success) return { success: false, history: [], error: result.error };
    const history = Array.isArray(result.data) ? result.data : (result.data.content ?? []);
    return { success: true, history, error: "" };
  }

  async getLatestApprovalRequest(jobId: string): Promise<SmartRecruitersApprovalResult> {
    const result = await this.request<Record<string, unknown>>("GET", `/jobs/${encodeURIComponent(jobId)}/approvals/latest`);
    if (!result.success) return { success: false, approval: {}, error: result.error };
    return { success: true, approval: result.data, error: "" };
  }

  async updateHeadcount(jobId: string, headcount: number): Promise<SmartRecruitersJobResult> {
    const result = await this.request<Record<string, unknown>>("POST", `/jobs/${encodeURIComponent(jobId)}/headcount`, { body: { headcount } });
    if (!result.success) return { success: false, job: {}, error: result.error };
    return { success: true, job: result.data, error: "" };
  }

  async getJobNote(jobId: string): Promise<SmartRecruitersJobNoteResult> {
    const result = await this.request<Record<string, unknown>>("GET", `/jobs/${encodeURIComponent(jobId)}/note`);
    if (!result.success) return { success: false, note: {}, error: result.error };
    return { success: true, note: result.data, error: "" };
  }

  async updateJobNote(jobId: string, content: string): Promise<SmartRecruitersJobNoteResult> {
    const result = await this.request<Record<string, unknown>>("POST", `/jobs/${encodeURIComponent(jobId)}/note`, { body: { content } });
    if (!result.success) return { success: false, note: {}, error: result.error };
    return { success: true, note: result.data, error: "" };
  }

  // --- Job Ads, Postings, Positions, Hiring Team (Phase 2) -------------------------------

  async listJobAds(jobId: string): Promise<SmartRecruitersJobAdsListResult> {
    const result = await this.request<Record<string, unknown>[] | { content?: Record<string, unknown>[] }>("GET", `/jobs/${encodeURIComponent(jobId)}/jobads`);
    if (!result.success) return { success: false, jobAds: [], error: result.error };
    const jobAds = Array.isArray(result.data) ? result.data : (result.data.content ?? []);
    return { success: true, jobAds, error: "" };
  }

  async createJobAd(jobId: string, jobAd: Record<string, unknown>): Promise<SmartRecruitersJobAdResult> {
    const result = await this.request<Record<string, unknown>>("POST", `/jobs/${encodeURIComponent(jobId)}/jobads`, { body: jobAd });
    if (!result.success) return { success: false, jobAd: {}, error: result.error };
    return { success: true, jobAd: result.data, error: "" };
  }

  async getJobAd(jobId: string, jobAdId: string): Promise<SmartRecruitersJobAdResult> {
    const result = await this.request<Record<string, unknown>>("GET", `/jobs/${encodeURIComponent(jobId)}/jobads/${encodeURIComponent(jobAdId)}`);
    if (!result.success) return { success: false, jobAd: {}, error: result.error };
    return { success: true, jobAd: result.data, error: "" };
  }

  async updateJobAd(jobId: string, jobAdId: string, jobAd: Record<string, unknown>): Promise<SmartRecruitersJobAdResult> {
    const result = await this.request<Record<string, unknown>>("PUT", `/jobs/${encodeURIComponent(jobId)}/jobads/${encodeURIComponent(jobAdId)}`, { body: jobAd });
    if (!result.success) return { success: false, jobAd: {}, error: result.error };
    return { success: true, jobAd: result.data, error: "" };
  }

  /** POST .../postings — asynchronously publishes a job ad to its configured channels; the API
   * returns 202 with `{postingStatus: "PENDING"}`, not the fully-published state. */
  async publishJobAdPosting(jobId: string, jobAdId: string, options: Record<string, unknown>): Promise<SmartRecruitersPostingStatusResult> {
    const result = await this.request<{ postingStatus?: string }>("POST", `/jobs/${encodeURIComponent(jobId)}/jobads/${encodeURIComponent(jobAdId)}/postings`, { body: options });
    if (!result.success) return { success: false, status: "", error: result.error };
    return { success: true, status: result.data.postingStatus ?? "", error: "" };
  }

  /** DELETE .../postings — asynchronously unpublishes; the API returns 202 with
   * `{unpostingStatus: "PENDING"}`. */
  async unpublishJobAdPosting(jobId: string, jobAdId: string): Promise<SmartRecruitersPostingStatusResult> {
    const result = await this.request<{ unpostingStatus?: string }>("DELETE", `/jobs/${encodeURIComponent(jobId)}/jobads/${encodeURIComponent(jobAdId)}/postings`);
    if (!result.success) return { success: false, status: "", error: result.error };
    return { success: true, status: result.data.unpostingStatus ?? "", error: "" };
  }

  async listJobAdPostings(jobId: string, jobAdId: string, activeOnly: boolean): Promise<SmartRecruitersPostingsListResult> {
    const result = await this.request<{ content?: Record<string, unknown>[] }>("GET", `/jobs/${encodeURIComponent(jobId)}/jobads/${encodeURIComponent(jobAdId)}/postings`, { query: { activeOnly } });
    if (!result.success) return { success: false, postings: [], error: result.error };
    return { success: true, postings: result.data.content ?? [], error: "" };
  }

  async listPositions(jobId: string): Promise<SmartRecruitersPositionsListResult> {
    const result = await this.request<{ totalFound?: number; content?: Record<string, unknown>[] }>("GET", `/jobs/${encodeURIComponent(jobId)}/positions`);
    if (!result.success) return { success: false, positions: [], totalFound: 0, error: result.error };
    return { success: true, positions: result.data.content ?? [], totalFound: result.data.totalFound ?? 0, error: "" };
  }

  async createPosition(jobId: string, position: Record<string, unknown>): Promise<SmartRecruitersPositionResult> {
    const result = await this.request<Record<string, unknown>>("POST", `/jobs/${encodeURIComponent(jobId)}/positions`, { body: position });
    if (!result.success) return { success: false, position: {}, error: result.error };
    return { success: true, position: result.data, error: "" };
  }

  async getPosition(jobId: string, positionId: string): Promise<SmartRecruitersPositionResult> {
    const result = await this.request<Record<string, unknown>>("GET", `/jobs/${encodeURIComponent(jobId)}/positions/${encodeURIComponent(positionId)}`);
    if (!result.success) return { success: false, position: {}, error: result.error };
    return { success: true, position: result.data, error: "" };
  }

  async updatePosition(jobId: string, positionId: string, position: Record<string, unknown>): Promise<SmartRecruitersPositionResult> {
    const result = await this.request<Record<string, unknown>>("PUT", `/jobs/${encodeURIComponent(jobId)}/positions/${encodeURIComponent(positionId)}`, { body: position });
    if (!result.success) return { success: false, position: {}, error: result.error };
    return { success: true, position: result.data, error: "" };
  }

  async deletePosition(jobId: string, positionId: string): Promise<SmartRecruitersOpResult> {
    const result = await this.request("DELETE", `/jobs/${encodeURIComponent(jobId)}/positions/${encodeURIComponent(positionId)}`);
    if (!result.success) return { success: false, error: result.error };
    return { success: true, error: "" };
  }

  async getHiringTeam(jobId: string): Promise<SmartRecruitersHiringTeamListResult> {
    const result = await this.request<{ totalFound?: number; content?: Record<string, unknown>[] }>("GET", `/jobs/${encodeURIComponent(jobId)}/hiring-team`);
    if (!result.success) return { success: false, members: [], totalFound: 0, error: result.error };
    return { success: true, members: result.data.content ?? [], totalFound: result.data.totalFound ?? 0, error: "" };
  }

  async addHiringTeamMember(jobId: string, userId: string, role: string): Promise<SmartRecruitersHiringTeamMemberResult> {
    const result = await this.request<Record<string, unknown>>("POST", `/jobs/${encodeURIComponent(jobId)}/hiring-team`, { body: { id: userId, role } });
    if (!result.success) return { success: false, member: {}, error: result.error };
    return { success: true, member: result.data, error: "" };
  }

  async removeHiringTeamMember(jobId: string, userId: string): Promise<SmartRecruitersOpResult> {
    const result = await this.request("DELETE", `/jobs/${encodeURIComponent(jobId)}/hiring-team/${encodeURIComponent(userId)}`);
    if (!result.success) return { success: false, error: result.error };
    return { success: true, error: "" };
  }
}
