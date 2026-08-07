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

export interface SmartRecruitersCandidatesListResult extends SmartRecruitersOpResult {
  candidates: Record<string, unknown>[];
  totalFound: number;
  nextPageId: string;
}

export interface SmartRecruitersCandidateResult extends SmartRecruitersOpResult {
  candidate: Record<string, unknown>;
}

export interface SmartRecruitersCandidateTagsResult extends SmartRecruitersOpResult {
  tags: string[];
}

export interface SmartRecruitersCandidateStatusHistoryResult extends SmartRecruitersOpResult {
  history: Record<string, unknown>[];
}

export interface SmartRecruitersConsentRequestResult extends SmartRecruitersOpResult {
  results: Record<string, unknown>[];
}

export interface SmartRecruitersConsentStatusResult extends SmartRecruitersOpResult {
  status: string;
  date: string;
}

export interface SmartRecruitersConsentDecisionsResult extends SmartRecruitersOpResult {
  decisions: Record<string, unknown>[];
}

export interface SmartRecruitersCandidatePropertiesResult extends SmartRecruitersOpResult {
  properties: Record<string, unknown>[];
}

export interface SmartRecruitersCandidateAttachmentsListResult extends SmartRecruitersOpResult {
  attachments: Record<string, unknown>[];
  totalFound: number;
}

export interface SmartRecruitersCandidateAttachmentResult extends SmartRecruitersOpResult {
  attachment: Record<string, unknown>;
}

export interface SmartRecruitersCandidateAttachmentContentResult extends SmartRecruitersOpResult {
  contentBase64: string;
  contentType: string;
}

export interface SmartRecruitersOnboardingStatusResult extends SmartRecruitersOpResult {
  onboardingStatus: string;
}

export interface SmartRecruitersScreeningAnswersResult extends SmartRecruitersOpResult {
  answers: Record<string, unknown>[];
  totalFound: number;
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
    options?: { query?: Record<string, string | number | boolean | undefined>; body?: unknown; contentType?: string; formData?: FormData },
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
          // Leave Content-Type unset for multipart bodies — fetch derives the boundary itself.
          ...(options?.formData ? {} : options?.body !== undefined ? { "Content-Type": options?.contentType ?? "application/json" } : {}),
        },
        body: options?.formData ?? (options?.body !== undefined ? JSON.stringify(options.body) : undefined),
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

  // --- Candidates core (Phase 3) ----------------------------------------------------------

  /** Builds a multipart form for the two resume-parse endpoints and addCandidateAttachment —
   * SmartRecruiters expects the file as a binary part, not base64 inside a JSON body. */
  private buildFileFormData(fields: Record<string, string | boolean | undefined>, fileFieldName: string, fileBase64: string, fileName: string, fileContentType: string): FormData {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined && v !== "") form.set(k, String(v));
    }
    form.set(fileFieldName, new Blob([Buffer.from(fileBase64, "base64")], { type: fileContentType || "application/octet-stream" }), fileName);
    return form;
  }

  async searchCandidates(query: Record<string, string | number | boolean | undefined>): Promise<SmartRecruitersCandidatesListResult> {
    const result = await this.request<{ totalFound?: number; nextPageId?: string; content?: Record<string, unknown>[] }>("GET", "/candidates", { query });
    if (!result.success) return { success: false, candidates: [], totalFound: 0, nextPageId: "", error: result.error };
    return { success: true, candidates: result.data.content ?? [], totalFound: result.data.totalFound ?? 0, nextPageId: result.data.nextPageId ?? "", error: "" };
  }

  async addCandidate(candidate: Record<string, unknown>): Promise<SmartRecruitersCandidateResult> {
    const result = await this.request<Record<string, unknown>>("POST", "/candidates", { body: candidate });
    if (!result.success) return { success: false, candidate: {}, error: result.error };
    return { success: true, candidate: result.data, error: "" };
  }

  async addCandidateToJob(jobId: string, candidate: Record<string, unknown>): Promise<SmartRecruitersCandidateResult> {
    const result = await this.request<Record<string, unknown>>("POST", `/jobs/${encodeURIComponent(jobId)}/candidates`, { body: candidate });
    if (!result.success) return { success: false, candidate: {}, error: result.error };
    return { success: true, candidate: result.data, error: "" };
  }

  /** POST /candidates/cv — parses a resume file and creates a talent-pool candidate from it. */
  async parseResume(fileBase64: string, fileName: string, fileContentType: string, sourceTypeId: string, sourceSubTypeId: string, sourceId: string, internal: boolean): Promise<SmartRecruitersCandidateResult> {
    const formData = this.buildFileFormData({ sourceTypeId, sourceSubTypeId, sourceId, internal }, "file", fileBase64, fileName, fileContentType);
    const result = await this.request<Record<string, unknown>>("POST", "/candidates/cv", { formData });
    if (!result.success) return { success: false, candidate: {}, error: result.error };
    return { success: true, candidate: result.data, error: "" };
  }

  /** POST /jobs/{jobId}/candidates/cv — same as parseResume but the created candidate is attached to `jobId`. */
  async parseResumeForJob(jobId: string, fileBase64: string, fileName: string, fileContentType: string, sourceTypeId: string, sourceSubTypeId: string, sourceId: string, internal: boolean): Promise<SmartRecruitersCandidateResult> {
    const formData = this.buildFileFormData({ sourceTypeId, sourceSubTypeId, sourceId, internal }, "file", fileBase64, fileName, fileContentType);
    const result = await this.request<Record<string, unknown>>("POST", `/jobs/${encodeURIComponent(jobId)}/candidates/cv`, { formData });
    if (!result.success) return { success: false, candidate: {}, error: result.error };
    return { success: true, candidate: result.data, error: "" };
  }

  async getCandidate(candidateId: string): Promise<SmartRecruitersCandidateResult> {
    const result = await this.request<Record<string, unknown>>("GET", `/candidates/${encodeURIComponent(candidateId)}`);
    if (!result.success) return { success: false, candidate: {}, error: result.error };
    return { success: true, candidate: result.data, error: "" };
  }

  async deleteCandidate(candidateId: string): Promise<SmartRecruitersOpResult> {
    const result = await this.request("DELETE", `/candidates/${encodeURIComponent(candidateId)}`);
    if (!result.success) return { success: false, error: result.error };
    return { success: true, error: "" };
  }

  /** PATCH /candidates/{id} — RFC 7396 JSON Merge Patch, same partial-update semantics as patchJob. */
  async updateCandidate(candidateId: string, patch: Record<string, unknown>): Promise<SmartRecruitersCandidateResult> {
    const result = await this.request<Record<string, unknown>>("PATCH", `/candidates/${encodeURIComponent(candidateId)}`, { body: patch, contentType: "application/merge-patch+json" });
    if (!result.success) return { success: false, candidate: {}, error: result.error };
    return { success: true, candidate: result.data, error: "" };
  }

  async getCandidateTags(candidateId: string): Promise<SmartRecruitersCandidateTagsResult> {
    const result = await this.request<{ tags?: string[] }>("GET", `/candidates/${encodeURIComponent(candidateId)}/tags`);
    if (!result.success) return { success: false, tags: [], error: result.error };
    return { success: true, tags: result.data.tags ?? [], error: "" };
  }

  /** POST — additive; existing tags are kept. */
  async addCandidateTags(candidateId: string, tags: string[]): Promise<SmartRecruitersCandidateTagsResult> {
    const result = await this.request<{ tags?: string[] }>("POST", `/candidates/${encodeURIComponent(candidateId)}/tags`, { body: { tags } });
    if (!result.success) return { success: false, tags: [], error: result.error };
    return { success: true, tags: result.data.tags ?? [], error: "" };
  }

  /** PUT — replaces the full tag set. */
  async replaceCandidateTags(candidateId: string, tags: string[]): Promise<SmartRecruitersCandidateTagsResult> {
    const result = await this.request<{ tags?: string[] }>("PUT", `/candidates/${encodeURIComponent(candidateId)}/tags`, { body: { tags } });
    if (!result.success) return { success: false, tags: [], error: result.error };
    return { success: true, tags: result.data.tags ?? [], error: "" };
  }

  /** DELETE — clears all tags from the candidate; the API has no selective single-tag delete. */
  async deleteCandidateTags(candidateId: string): Promise<SmartRecruitersOpResult> {
    const result = await this.request("DELETE", `/candidates/${encodeURIComponent(candidateId)}/tags`);
    if (!result.success) return { success: false, error: result.error };
    return { success: true, error: "" };
  }

  async updateCandidateJobStatus(candidateId: string, jobId: string, status: string, subStatus: string, startsOn: string, reason: string): Promise<SmartRecruitersOpResult> {
    const result = await this.request("PUT", `/candidates/${encodeURIComponent(candidateId)}/jobs/${encodeURIComponent(jobId)}/status`, {
      body: { status, subStatus: subStatus || undefined, startsOn: startsOn || undefined, reason: reason || undefined },
    });
    if (!result.success) return { success: false, error: result.error };
    return { success: true, error: "" };
  }

  async getCandidateJobStatusHistory(candidateId: string, jobId: string): Promise<SmartRecruitersCandidateStatusHistoryResult> {
    const result = await this.request<{ content?: Record<string, unknown>[] }>("GET", `/candidates/${encodeURIComponent(candidateId)}/jobs/${encodeURIComponent(jobId)}/status/history`);
    if (!result.success) return { success: false, history: [], error: result.error };
    return { success: true, history: result.data.content ?? [], error: "" };
  }

  async updateCandidateSource(candidateId: string, jobId: string, sourceTypeId: string, sourceSubTypeId: string, sourceId: string): Promise<SmartRecruitersOpResult> {
    const result = await this.request("PUT", `/candidates/${encodeURIComponent(candidateId)}/jobs/${encodeURIComponent(jobId)}/source`, {
      body: { sourceTypeId, sourceSubTypeId: sourceSubTypeId || undefined, sourceId: sourceId || undefined },
    });
    if (!result.success) return { success: false, error: result.error };
    return { success: true, error: "" };
  }

  /** POST /candidates/consent-requests — batch (1-1000 candidate ids); each id gets its own
   * per-item status in the response, a single bad id doesn't fail the whole batch. */
  async requestCandidateConsent(candidateIds: string[]): Promise<SmartRecruitersConsentRequestResult> {
    const result = await this.request<{ results?: Record<string, unknown>[] }>("POST", "/candidates/consent-requests", { body: { content: candidateIds.map((id) => ({ id })) } });
    if (!result.success) return { success: false, results: [], error: result.error };
    return { success: true, results: result.data.results ?? [], error: "" };
  }

  async getCandidateConsentStatus(candidateId: string): Promise<SmartRecruitersConsentStatusResult> {
    const result = await this.request<{ status?: string; date?: string }>("GET", `/candidates/${encodeURIComponent(candidateId)}/consent`);
    if (!result.success) return { success: false, status: "", date: "", error: result.error };
    return { success: true, status: result.data.status ?? "", date: result.data.date ?? "", error: "" };
  }

  async getCandidateConsentDecisions(candidateId: string): Promise<SmartRecruitersConsentDecisionsResult> {
    const result = await this.request<{ decisions?: Record<string, unknown>[] }>("GET", `/candidates/${encodeURIComponent(candidateId)}/consents`);
    if (!result.success) return { success: false, decisions: [], error: result.error };
    return { success: true, decisions: result.data.decisions ?? [], error: "" };
  }

  /** Deprecated global (non-job-scoped) properties, kept alongside the job-scoped variant below
   * because the API still serves it and this connector aims for exhaustive coverage. */
  async getCandidateProperties(candidateId: string, context: string): Promise<SmartRecruitersCandidatePropertiesResult> {
    const result = await this.request<{ content?: Record<string, unknown>[] }>("GET", `/candidates/${encodeURIComponent(candidateId)}/properties`, { query: { context: context || undefined } });
    if (!result.success) return { success: false, properties: [], error: result.error };
    return { success: true, properties: result.data.content ?? [], error: "" };
  }

  async updateCandidateProperty(candidateId: string, propertyId: string, value: string): Promise<SmartRecruitersOpResult> {
    const result = await this.request("PUT", `/candidates/${encodeURIComponent(candidateId)}/properties/${encodeURIComponent(propertyId)}`, { body: { value } });
    if (!result.success) return { success: false, error: result.error };
    return { success: true, error: "" };
  }

  async getCandidateJobProperties(candidateId: string, jobId: string, context: string): Promise<SmartRecruitersCandidatePropertiesResult> {
    const result = await this.request<{ content?: Record<string, unknown>[] }>("GET", `/candidates/${encodeURIComponent(candidateId)}/jobs/${encodeURIComponent(jobId)}/properties`, {
      query: { context: context || undefined },
    });
    if (!result.success) return { success: false, properties: [], error: result.error };
    return { success: true, properties: result.data.content ?? [], error: "" };
  }

  /** PUT (batch, current) — body is an array of `{id, value}`, 1-100 items per call. */
  async updateCandidateJobProperties(candidateId: string, jobId: string, properties: { id: string; value: unknown }[]): Promise<SmartRecruitersOpResult> {
    const result = await this.request("PUT", `/candidates/${encodeURIComponent(candidateId)}/jobs/${encodeURIComponent(jobId)}/properties`, { body: properties });
    if (!result.success) return { success: false, error: result.error };
    return { success: true, error: "" };
  }

  async listCandidateAttachments(candidateId: string): Promise<SmartRecruitersCandidateAttachmentsListResult> {
    const result = await this.request<{ totalFound?: number; content?: Record<string, unknown>[] }>("GET", `/candidates/${encodeURIComponent(candidateId)}/attachments`);
    if (!result.success) return { success: false, attachments: [], totalFound: 0, error: result.error };
    return { success: true, attachments: result.data.content ?? [], totalFound: result.data.totalFound ?? 0, error: "" };
  }

  async addCandidateAttachment(candidateId: string, attachmentType: string, fileBase64: string, fileName: string, fileContentType: string): Promise<SmartRecruitersCandidateAttachmentResult> {
    const formData = this.buildFileFormData({ attachmentType }, "file", fileBase64, fileName, fileContentType);
    const result = await this.request<Record<string, unknown>>("POST", `/candidates/${encodeURIComponent(candidateId)}/attachments`, { formData });
    if (!result.success) return { success: false, attachment: {}, error: result.error };
    return { success: true, attachment: result.data, error: "" };
  }

  /** GET /candidates/{id}/attachments/{attachmentId} — deprecated but still the only documented way
   * to fetch an attachment's binary content; returned as base64 since the rest of this manager's
   * responses are JSON. */
  async getCandidateAttachment(candidateId: string, attachmentId: string): Promise<SmartRecruitersCandidateAttachmentContentResult> {
    const authResult = await this.authHeader();
    if (!authResult.ok) return { success: false, contentBase64: "", contentType: "", error: authResult.error };
    try {
      const res = await fetch(new URL(`candidates/${encodeURIComponent(candidateId)}/attachments/${encodeURIComponent(attachmentId)}`, `${API_BASE_URL}/`), { headers: authResult.header });
      if (!res.ok) return { success: false, contentBase64: "", contentType: "", error: smartRecruitersErrorMessage(res.status, res.statusText, await this.parseErrorBody(res)) };
      const buffer = Buffer.from(await res.arrayBuffer());
      return { success: true, contentBase64: buffer.toString("base64"), contentType: res.headers.get("content-type") ?? "", error: "" };
    } catch (err) {
      return { success: false, contentBase64: "", contentType: "", error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Deprecated global (non-job-scoped) onboarding status, kept alongside the job-scoped variant
   * below for the same exhaustive-coverage reason as getCandidateProperties. */
  async getCandidateOnboardingStatus(candidateId: string): Promise<SmartRecruitersOnboardingStatusResult> {
    const result = await this.request<{ onboardingStatus?: string }>("GET", `/candidates/${encodeURIComponent(candidateId)}/onboardingStatus`);
    if (!result.success) return { success: false, onboardingStatus: "", error: result.error };
    return { success: true, onboardingStatus: result.data.onboardingStatus ?? "", error: "" };
  }

  async updateCandidateOnboardingStatus(candidateId: string, onboardingStatus: string): Promise<SmartRecruitersOnboardingStatusResult> {
    const result = await this.request<{ onboardingStatus?: string }>("PUT", `/candidates/${encodeURIComponent(candidateId)}/onboardingStatus`, { body: { onboardingStatus } });
    if (!result.success) return { success: false, onboardingStatus: "", error: result.error };
    return { success: true, onboardingStatus: result.data.onboardingStatus ?? "", error: "" };
  }

  async getCandidateJobOnboardingStatus(candidateId: string, jobId: string): Promise<SmartRecruitersOnboardingStatusResult> {
    const result = await this.request<{ onboardingStatus?: string }>("GET", `/candidates/${encodeURIComponent(candidateId)}/jobs/${encodeURIComponent(jobId)}/onboardingStatus`);
    if (!result.success) return { success: false, onboardingStatus: "", error: result.error };
    return { success: true, onboardingStatus: result.data.onboardingStatus ?? "", error: "" };
  }

  async updateCandidateJobOnboardingStatus(candidateId: string, jobId: string, onboardingStatus: string): Promise<SmartRecruitersOnboardingStatusResult> {
    const result = await this.request<{ onboardingStatus?: string }>("PUT", `/candidates/${encodeURIComponent(candidateId)}/jobs/${encodeURIComponent(jobId)}/onboardingStatus`, {
      body: { onboardingStatus },
    });
    if (!result.success) return { success: false, onboardingStatus: "", error: result.error };
    return { success: true, onboardingStatus: result.data.onboardingStatus ?? "", error: "" };
  }

  async getCandidateScreeningAnswers(candidateId: string, jobId: string): Promise<SmartRecruitersScreeningAnswersResult> {
    const result = await this.request<{ totalFound?: number; content?: Record<string, unknown>[] }>("GET", `/candidates/${encodeURIComponent(candidateId)}/jobs/${encodeURIComponent(jobId)}/screening-answers`);
    if (!result.success) return { success: false, answers: [], totalFound: 0, error: result.error };
    return { success: true, answers: result.data.content ?? [], totalFound: result.data.totalFound ?? 0, error: "" };
  }
}
