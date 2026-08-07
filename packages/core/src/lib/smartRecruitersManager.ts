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

export interface SmartRecruitersJobApplicationResult extends SmartRecruitersOpResult {
  jobApplication: Record<string, unknown>;
}

export interface SmartRecruitersUsersListResult extends SmartRecruitersOpResult {
  users: Record<string, unknown>[];
  nextPageId: string;
}

export interface SmartRecruitersUserResult extends SmartRecruitersOpResult {
  user: Record<string, unknown>;
}

export interface SmartRecruitersSystemRolesResult extends SmartRecruitersOpResult {
  roles: Record<string, unknown>[];
}

export interface SmartRecruitersAccessGroupsListResult extends SmartRecruitersOpResult {
  accessGroups: Record<string, unknown>[];
}

export interface SmartRecruitersAccessGroupResult extends SmartRecruitersOpResult {
  accessGroup: Record<string, unknown>;
}

export interface SmartRecruitersInterviewsListResult extends SmartRecruitersOpResult {
  interviews: Record<string, unknown>[];
}

export interface SmartRecruitersInterviewResult extends SmartRecruitersOpResult {
  interview: Record<string, unknown>;
}

export interface SmartRecruitersInterviewTypesResult extends SmartRecruitersOpResult {
  interviewTypes: string[];
}

export interface SmartRecruitersTimeslotResult extends SmartRecruitersOpResult {
  timeslot: Record<string, unknown>;
}

export interface SmartRecruitersSchedulePreferencesResult extends SmartRecruitersOpResult {
  preferences: Record<string, unknown>;
}

export interface SmartRecruitersEventResult extends SmartRecruitersOpResult {
  event: Record<string, unknown>;
}

export interface SmartRecruitersEventsListResult extends SmartRecruitersOpResult {
  events: Record<string, unknown>[];
}

export interface SmartRecruitersEventSessionResult extends SmartRecruitersOpResult {
  session: Record<string, unknown>;
}

export interface SmartRecruitersInterviewersListResult extends SmartRecruitersOpResult {
  interviewers: Record<string, unknown>[];
}

export interface SmartRecruitersApplicantsListResult extends SmartRecruitersOpResult {
  applicants: Record<string, unknown>[];
  totalFound: number;
}

export interface SmartRecruitersSessionApplicantsResult extends SmartRecruitersOpResult {
  applicants: Record<string, unknown>[];
}

export interface SmartRecruitersSelfSchedulesListResult extends SmartRecruitersOpResult {
  selfSchedules: Record<string, unknown>[];
}

export interface SmartRecruitersSelfScheduleResult extends SmartRecruitersOpResult {
  selfSchedule: Record<string, unknown>;
}

export interface SmartRecruitersSelfScheduleIdResult extends SmartRecruitersOpResult {
  selfScheduleId: string;
}

export interface SmartRecruitersSelfScheduleInterviewResult extends SmartRecruitersOpResult {
  interview: Record<string, unknown>;
}

export interface SmartRecruitersSelfScheduleSlotsResult extends SmartRecruitersOpResult {
  slots: Record<string, unknown>[];
}

export interface SmartRecruitersAvailableSlotsCountResult extends SmartRecruitersOpResult {
  count: number;
}

export interface SmartRecruitersInterviewTemplateResult extends SmartRecruitersOpResult {
  template: Record<string, unknown>;
}

export interface SmartRecruitersInterviewTemplatesListResult extends SmartRecruitersOpResult {
  templates: Record<string, unknown>[];
  totalFound: number;
}

export interface SmartRecruitersJobManagedStepsResult extends SmartRecruitersOpResult {
  states: Record<string, unknown>[];
}

export interface SmartRecruitersJobTemplateStagesResult extends SmartRecruitersOpResult {
  stages: Record<string, unknown>[];
}

export interface SmartRecruitersJobTemplateBlueprintsResult extends SmartRecruitersOpResult {
  blueprints: Record<string, unknown>[];
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

  // --- Job Applications (Phase 4) ---------------------------------------------------------
  // Job Applications live under a separately-versioned sub-API (`job-applications-api/v202112`)
  // on the same host, unlike the unversioned `/jobs` and `/candidates` paths above — confirmed
  // against the live OpenAPI spec's `servers` entry, not assumed from the other resources' shape.

  async getJobApplication(jobApplicationId: string): Promise<SmartRecruitersJobApplicationResult> {
    const result = await this.request<Record<string, unknown>>("GET", `job-applications-api/v202112/job-applications/${encodeURIComponent(jobApplicationId)}`);
    if (!result.success) return { success: false, jobApplication: {}, error: result.error };
    return { success: true, jobApplication: result.data, error: "" };
  }

  async deleteJobApplication(jobApplicationId: string): Promise<SmartRecruitersOpResult> {
    const result = await this.request("DELETE", `job-applications-api/v202112/job-applications/${encodeURIComponent(jobApplicationId)}`);
    if (!result.success) return { success: false, error: result.error };
    return { success: true, error: "" };
  }

  // --- Users & Access (Phase 5) -----------------------------------------------------------
  // Users/system-roles/the legacy access-groups list+membership endpoints live under the
  // separately-versioned `user-api/v201804` sub-API (same "own versioned host path" pattern as
  // Job Applications in Phase 4); full access-group CRUD lives under the newer `configuration`
  // sub-API instead — confirmed via live reference docs, not assumed. There is no documented
  // "get current user / me" endpoint, so it was dropped from this phase's scope (same kind of
  // scope correction as the Phase 3 EEO drop and Phase 4 consent drop). `systemRole` is a
  // company-defined `{id, name}` reference, not a fixed enum — callers should look the id up via
  // listSystemRoles() rather than a hardcoded enum of role names.

  async searchUsers(query: Record<string, string | number | boolean | undefined>): Promise<SmartRecruitersUsersListResult> {
    const result = await this.request<{ nextPageId?: string; content?: Record<string, unknown>[] }>("GET", "user-api/v201804/users", { query });
    if (!result.success) return { success: false, users: [], nextPageId: "", error: result.error };
    return { success: true, users: result.data.content ?? [], nextPageId: result.data.nextPageId ?? "", error: "" };
  }

  async createUser(user: Record<string, unknown>): Promise<SmartRecruitersUserResult> {
    const result = await this.request<Record<string, unknown>>("POST", "user-api/v201804/users", { body: user });
    if (!result.success) return { success: false, user: {}, error: result.error };
    return { success: true, user: result.data, error: "" };
  }

  async getUser(userId: string): Promise<SmartRecruitersUserResult> {
    const result = await this.request<Record<string, unknown>>("GET", `user-api/v201804/users/${encodeURIComponent(userId)}`);
    if (!result.success) return { success: false, user: {}, error: result.error };
    return { success: true, user: result.data, error: "" };
  }

  /** RFC 6902 JSON Patch — `patch` is the raw operations array (`[{op, path, value}, ...]`), unlike
   * patchJob/updateCandidate's RFC 7396 merge-patch object. */
  async updateUser(userId: string, patch: unknown[]): Promise<SmartRecruitersUserResult> {
    const result = await this.request<Record<string, unknown>>("PATCH", `user-api/v201804/users/${encodeURIComponent(userId)}`, { body: patch, contentType: "application/json-patch+json" });
    if (!result.success) return { success: false, user: {}, error: result.error };
    return { success: true, user: result.data, error: "" };
  }

  /** Only triggers a reset email — SmartRecruiters has no endpoint to set a password directly. */
  async resetUserPassword(userId: string): Promise<SmartRecruitersOpResult> {
    const result = await this.request("POST", `user-api/v201804/users/${encodeURIComponent(userId)}/reset-password`);
    if (!result.success) return { success: false, error: result.error };
    return { success: true, error: "" };
  }

  async sendUserActivationEmail(userId: string): Promise<SmartRecruitersOpResult> {
    const result = await this.request("POST", `user-api/v201804/users/${encodeURIComponent(userId)}/activation-email`);
    if (!result.success) return { success: false, error: result.error };
    return { success: true, error: "" };
  }

  async activateUser(userId: string): Promise<SmartRecruitersOpResult> {
    const result = await this.request("PUT", `user-api/v201804/users/${encodeURIComponent(userId)}/activation`);
    if (!result.success) return { success: false, error: result.error };
    return { success: true, error: "" };
  }

  /** DELETE .../activation — the older `DELETE /users/{id}` is documented as a deprecated alias
   * for this, so it was not added separately. */
  async deactivateUser(userId: string): Promise<SmartRecruitersOpResult> {
    const result = await this.request("DELETE", `user-api/v201804/users/${encodeURIComponent(userId)}/activation`);
    if (!result.success) return { success: false, error: result.error };
    return { success: true, error: "" };
  }

  async updateUserAvatar(userId: string, fileBase64: string, fileName: string, fileContentType: string): Promise<SmartRecruitersUserResult> {
    const formData = this.buildFileFormData({}, "file", fileBase64, fileName, fileContentType);
    const result = await this.request<Record<string, unknown>>("PUT", `user-api/v201804/users/${encodeURIComponent(userId)}/avatar`, { formData });
    if (!result.success) return { success: false, user: {}, error: result.error };
    return { success: true, user: result.data, error: "" };
  }

  async listSystemRoles(): Promise<SmartRecruitersSystemRolesResult> {
    const result = await this.request<{ content?: Record<string, unknown>[] } | Record<string, unknown>[]>("GET", "user-api/v201804/system-roles");
    if (!result.success) return { success: false, roles: [], error: result.error };
    const roles = Array.isArray(result.data) ? result.data : (result.data.content ?? []);
    return { success: true, roles, error: "" };
  }

  /** GET /configuration/access-groups — the newer Configuration API variant, chosen over the
   * legacy `user-api/v201804/access-groups` list (which has no create/get/update/delete
   * counterpart) so this phase's list/create/get/update/delete set is one consistent resource. */
  async listAccessGroups(): Promise<SmartRecruitersAccessGroupsListResult> {
    const result = await this.request<{ content?: Record<string, unknown>[] } | Record<string, unknown>[]>("GET", "configuration/access-groups");
    if (!result.success) return { success: false, accessGroups: [], error: result.error };
    const accessGroups = Array.isArray(result.data) ? result.data : (result.data.content ?? []);
    return { success: true, accessGroups, error: "" };
  }

  async createAccessGroup(accessGroup: Record<string, unknown>): Promise<SmartRecruitersAccessGroupResult> {
    const result = await this.request<Record<string, unknown>>("POST", "configuration/access-groups", { body: accessGroup });
    if (!result.success) return { success: false, accessGroup: {}, error: result.error };
    return { success: true, accessGroup: result.data, error: "" };
  }

  async getAccessGroup(accessGroupId: string): Promise<SmartRecruitersAccessGroupResult> {
    const result = await this.request<Record<string, unknown>>("GET", `configuration/access-groups/${encodeURIComponent(accessGroupId)}`);
    if (!result.success) return { success: false, accessGroup: {}, error: result.error };
    return { success: true, accessGroup: result.data, error: "" };
  }

  async updateAccessGroup(accessGroupId: string, accessGroup: Record<string, unknown>): Promise<SmartRecruitersAccessGroupResult> {
    const result = await this.request<Record<string, unknown>>("PUT", `configuration/access-groups/${encodeURIComponent(accessGroupId)}`, { body: accessGroup });
    if (!result.success) return { success: false, accessGroup: {}, error: result.error };
    return { success: true, accessGroup: result.data, error: "" };
  }

  async deleteAccessGroup(accessGroupId: string): Promise<SmartRecruitersOpResult> {
    const result = await this.request("DELETE", `configuration/access-groups/${encodeURIComponent(accessGroupId)}`);
    if (!result.success) return { success: false, error: result.error };
    return { success: true, error: "" };
  }

  /** POST — bulk assign (up to 5000 user ids); membership assign/remove only exists under the
   * legacy `user-api/v201804/access-groups` path, not the Configuration API. */
  async assignUsersToAccessGroup(accessGroupId: string, userIds: string[]): Promise<SmartRecruitersOpResult> {
    const result = await this.request("POST", `user-api/v201804/access-groups/${encodeURIComponent(accessGroupId)}/users`, { body: { UserIds: userIds } });
    if (!result.success) return { success: false, error: result.error };
    return { success: true, error: "" };
  }

  /** DELETE — removes a single user; no bulk-remove variant is documented. */
  async removeUserFromAccessGroup(accessGroupId: string, userId: string): Promise<SmartRecruitersOpResult> {
    const result = await this.request("DELETE", `user-api/v201804/access-groups/${encodeURIComponent(accessGroupId)}/users/${encodeURIComponent(userId)}`);
    if (!result.success) return { success: false, error: result.error };
    return { success: true, error: "" };
  }

  // --- Interviews & Events (Phase 6) -------------------------------------------------------
  // `interviews-api/v201904` (candidate/timeslot/interviewer-status-centric — update/delete are
  // documented as supported only for interviews created via the Public API) and
  // `event-management-api` (sessions, applicant pools, richer invitations/reminders) are two
  // genuinely separate, still-active resource families confirmed via live docs — not a Phase-5-style
  // duplicate, so both are implemented in full. Self-Scheduling API (`self-scheduling`) is a third
  // family layered on top for candidate-facing slot picking. Schedule preferences has only a
  // documented GET — no update endpoint exists — so it's read-only here (same kind of scope
  // correction as the Phase 3 EEO drop / Phase 4 consent drop / Phase 5 "me" drop).

  async searchInterviews(applicationId: string): Promise<SmartRecruitersInterviewsListResult> {
    const result = await this.request<{ content?: Record<string, unknown>[] } | Record<string, unknown>[]>("GET", "interviews-api/v201904/interviews", { query: { applicationId } });
    if (!result.success) return { success: false, interviews: [], error: result.error };
    const interviews = Array.isArray(result.data) ? result.data : (result.data.content ?? []);
    return { success: true, interviews, error: "" };
  }

  async createInterview(interview: Record<string, unknown>): Promise<SmartRecruitersInterviewResult> {
    const result = await this.request<Record<string, unknown>>("POST", "interviews-api/v201904/interviews", { body: interview });
    if (!result.success) return { success: false, interview: {}, error: result.error };
    return { success: true, interview: result.data, error: "" };
  }

  async getInterview(interviewId: string): Promise<SmartRecruitersInterviewResult> {
    const result = await this.request<Record<string, unknown>>("GET", `interviews-api/v201904/interviews/${encodeURIComponent(interviewId)}`);
    if (!result.success) return { success: false, interview: {}, error: result.error };
    return { success: true, interview: result.data, error: "" };
  }

  /** PATCH — documented as supported only for interviews created via the Public API. */
  async updateInterview(interviewId: string, patch: Record<string, unknown>): Promise<SmartRecruitersInterviewResult> {
    const result = await this.request<Record<string, unknown>>("PATCH", `interviews-api/v201904/interviews/${encodeURIComponent(interviewId)}`, { body: patch });
    if (!result.success) return { success: false, interview: {}, error: result.error };
    return { success: true, interview: result.data, error: "" };
  }

  /** DELETE — same Public-API-only caveat as updateInterview. */
  async deleteInterview(interviewId: string): Promise<SmartRecruitersOpResult> {
    const result = await this.request("DELETE", `interviews-api/v201904/interviews/${encodeURIComponent(interviewId)}`);
    if (!result.success) return { success: false, error: result.error };
    return { success: true, error: "" };
  }

  async listInterviewTypes(): Promise<SmartRecruitersInterviewTypesResult> {
    const result = await this.request<string[]>("GET", "interviews-api/v201904/interview-types");
    if (!result.success) return { success: false, interviewTypes: [], error: result.error };
    return { success: true, interviewTypes: Array.isArray(result.data) ? result.data : [], error: "" };
  }

  /** PATCH — additive; appends to the existing type set rather than replacing it (no full-replace
   * endpoint is documented). */
  async addInterviewTypes(interviewTypes: string[]): Promise<SmartRecruitersOpResult> {
    const result = await this.request("PATCH", "interviews-api/v201904/interview-types", { body: interviewTypes });
    if (!result.success) return { success: false, error: result.error };
    return { success: true, error: "" };
  }

  /** Interview type names double as their id — there is no separate numeric/uuid id. */
  async deleteInterviewType(interviewType: string): Promise<SmartRecruitersOpResult> {
    const result = await this.request("DELETE", `interviews-api/v201904/interview-types/${encodeURIComponent(interviewType)}`);
    if (!result.success) return { success: false, error: result.error };
    return { success: true, error: "" };
  }

  async createInterviewTimeslot(interviewId: string, timeslot: Record<string, unknown>): Promise<SmartRecruitersTimeslotResult> {
    const result = await this.request<Record<string, unknown>>("POST", `interviews-api/v201904/interviews/${encodeURIComponent(interviewId)}/timeslots`, { body: timeslot });
    if (!result.success) return { success: false, timeslot: {}, error: result.error };
    return { success: true, timeslot: result.data, error: "" };
  }

  async getInterviewTimeslot(interviewId: string, timeslotId: string): Promise<SmartRecruitersTimeslotResult> {
    const result = await this.request<Record<string, unknown>>("GET", `interviews-api/v201904/interviews/${encodeURIComponent(interviewId)}/timeslots/${encodeURIComponent(timeslotId)}`);
    if (!result.success) return { success: false, timeslot: {}, error: result.error };
    return { success: true, timeslot: result.data, error: "" };
  }

  async updateInterviewTimeslot(interviewId: string, timeslotId: string, timeslot: Record<string, unknown>): Promise<SmartRecruitersTimeslotResult> {
    const result = await this.request<Record<string, unknown>>("PATCH", `interviews-api/v201904/interviews/${encodeURIComponent(interviewId)}/timeslots/${encodeURIComponent(timeslotId)}`, { body: timeslot });
    if (!result.success) return { success: false, timeslot: {}, error: result.error };
    return { success: true, timeslot: result.data, error: "" };
  }

  /** 409 if this would remove an interview's last timeslot. */
  async deleteInterviewTimeslot(interviewId: string, timeslotId: string): Promise<SmartRecruitersOpResult> {
    const result = await this.request("DELETE", `interviews-api/v201904/interviews/${encodeURIComponent(interviewId)}/timeslots/${encodeURIComponent(timeslotId)}`);
    if (!result.success) return { success: false, error: result.error };
    return { success: true, error: "" };
  }

  /** PATCH — `value` travels as a query param, not a body field. */
  async setInterviewTimeslotNoShow(interviewId: string, timeslotId: string, value: boolean): Promise<SmartRecruitersOpResult> {
    const result = await this.request("PATCH", `interviews-api/v201904/interviews/${encodeURIComponent(interviewId)}/timeslots/${encodeURIComponent(timeslotId)}/noshow`, { query: { value } });
    if (!result.success) return { success: false, error: result.error };
    return { success: true, error: "" };
  }

  /** Deprecated, interview-scoped (not per-timeslot) — kept alongside updateTimeslotCandidateStatus
   * for the same exhaustive-coverage reason as Phase 3/5's deprecated-variant methods. Public-API-only. */
  async updateInterviewCandidateStatus(interviewId: string, status: string): Promise<SmartRecruitersOpResult> {
    const result = await this.request("PUT", `interviews-api/v201904/interviews/${encodeURIComponent(interviewId)}/candidate/status`, { body: { status } });
    if (!result.success) return { success: false, error: result.error };
    return { success: true, error: "" };
  }

  async updateTimeslotCandidateStatus(interviewId: string, timeslotId: string, status: string): Promise<SmartRecruitersOpResult> {
    const result = await this.request("PUT", `interviews-api/v201904/interviews/${encodeURIComponent(interviewId)}/timeslots/${encodeURIComponent(timeslotId)}/candidateStatus`, { body: { status } });
    if (!result.success) return { success: false, error: result.error };
    return { success: true, error: "" };
  }

  async updateTimeslotInterviewerStatus(interviewId: string, timeslotId: string, userId: string, status: string): Promise<SmartRecruitersOpResult> {
    const result = await this.request("PUT", `interviews-api/v201904/interviews/${encodeURIComponent(interviewId)}/timeslots/${encodeURIComponent(timeslotId)}/interviewers/${encodeURIComponent(userId)}/status`, { body: { status } });
    if (!result.success) return { success: false, error: result.error };
    return { success: true, error: "" };
  }

  /** GET-only — no documented update endpoint exists for schedule preferences (verified via live
   * docs), so this connector exposes it read-only. Lives under the separate `interview-templates`
   * sub-API, not `interviews-api`. */
  async getSchedulePreferences(userId: string): Promise<SmartRecruitersSchedulePreferencesResult> {
    const result = await this.request<Record<string, unknown>>("GET", `interview-templates/schedule/preferences/users/${encodeURIComponent(userId)}`);
    if (!result.success) return { success: false, preferences: {}, error: result.error };
    return { success: true, preferences: result.data, error: "" };
  }

  async createEvent(event: Record<string, unknown>): Promise<SmartRecruitersEventResult> {
    const result = await this.request<Record<string, unknown>>("POST", "event-management-api/events", { body: event });
    if (!result.success) return { success: false, event: {}, error: result.error };
    return { success: true, event: result.data, error: "" };
  }

  async getEvent(eventId: string): Promise<SmartRecruitersEventResult> {
    const result = await this.request<Record<string, unknown>>("GET", `event-management-api/events/${encodeURIComponent(eventId)}`);
    if (!result.success) return { success: false, event: {}, error: result.error };
    return { success: true, event: result.data, error: "" };
  }

  async updateEvent(eventId: string, event: Record<string, unknown>): Promise<SmartRecruitersEventResult> {
    const result = await this.request<Record<string, unknown>>("PUT", `event-management-api/events/${encodeURIComponent(eventId)}`, { body: event });
    if (!result.success) return { success: false, event: {}, error: result.error };
    return { success: true, event: result.data, error: "" };
  }

  async deleteEvent(eventId: string): Promise<SmartRecruitersOpResult> {
    const result = await this.request("DELETE", `event-management-api/events/${encodeURIComponent(eventId)}`);
    if (!result.success) return { success: false, error: result.error };
    return { success: true, error: "" };
  }

  /** GET /events — job-scoped list ("Get job's events"); state is required (PAST|ACTIVE). */
  async listJobEvents(jobId: string, state: string, page: number, pageSize: number): Promise<SmartRecruitersEventsListResult> {
    const result = await this.request<{ content?: Record<string, unknown>[] } | Record<string, unknown>[]>("GET", "event-management-api/events", { query: { jobId, state, page, pageSize } });
    if (!result.success) return { success: false, events: [], error: result.error };
    const events = Array.isArray(result.data) ? result.data : (result.data.content ?? []);
    return { success: true, events, error: "" };
  }

  async getEventsForCandidate(profileId: string, state: string): Promise<SmartRecruitersEventsListResult> {
    const result = await this.request<{ content?: Record<string, unknown>[] } | Record<string, unknown>[]>("GET", `event-management-api/events/candidates/${encodeURIComponent(profileId)}`, {
      query: { state },
    });
    if (!result.success) return { success: false, events: [], error: result.error };
    const events = Array.isArray(result.data) ? result.data : (result.data.content ?? []);
    return { success: true, events, error: "" };
  }

  async getEventsForApplication(applicationId: string, state: string): Promise<SmartRecruitersEventsListResult> {
    const result = await this.request<{ content?: Record<string, unknown>[] } | Record<string, unknown>[]>("GET", `event-management-api/events/applications/${encodeURIComponent(applicationId)}`, {
      query: { state },
    });
    if (!result.success) return { success: false, events: [], error: result.error };
    const events = Array.isArray(result.data) ? result.data : (result.data.content ?? []);
    return { success: true, events, error: "" };
  }

  async getEventSession(eventId: string, sessionId: string): Promise<SmartRecruitersEventSessionResult> {
    const result = await this.request<Record<string, unknown>>("GET", `event-management-api/events/${encodeURIComponent(eventId)}/sessions/${encodeURIComponent(sessionId)}`);
    if (!result.success) return { success: false, session: {}, error: result.error };
    return { success: true, session: result.data, error: "" };
  }

  /** Sessions have no standalone create/update endpoint — they're only created/updated as part of
   * the parent event's body (createEvent/updateEvent's `sessions` array). */
  async deleteEventSession(eventId: string, sessionId: string): Promise<SmartRecruitersOpResult> {
    const result = await this.request("DELETE", `event-management-api/events/${encodeURIComponent(eventId)}/sessions/${encodeURIComponent(sessionId)}`);
    if (!result.success) return { success: false, error: result.error };
    return { success: true, error: "" };
  }

  async addSessionInterviewers(eventId: string, sessionId: string, interviewerIds: string[]): Promise<SmartRecruitersInterviewersListResult> {
    const result = await this.request<Record<string, unknown>[]>("PUT", `event-management-api/events/${encodeURIComponent(eventId)}/sessions/${encodeURIComponent(sessionId)}/interviewers`, {
      body: { interviewers: interviewerIds },
    });
    if (!result.success) return { success: false, interviewers: [], error: result.error };
    return { success: true, interviewers: Array.isArray(result.data) ? result.data : [], error: "" };
  }

  async removeSessionInterviewers(eventId: string, sessionId: string, interviewerIds: string[]): Promise<SmartRecruitersOpResult> {
    const result = await this.request("DELETE", `event-management-api/events/${encodeURIComponent(eventId)}/sessions/${encodeURIComponent(sessionId)}/interviewers`, {
      body: { interviewers: interviewerIds },
    });
    if (!result.success) return { success: false, error: result.error };
    return { success: true, error: "" };
  }

  /** Combines both event-applicants-pool and session-applicants, unpaginated per the docs — use
   * getEventPoolApplicants instead for the paginated, pool-only view. */
  async getAllEventApplicants(eventId: string): Promise<SmartRecruitersApplicantsListResult> {
    const result = await this.request<Record<string, unknown>[] | { content?: Record<string, unknown>[] }>("GET", `event-management-api/events/${encodeURIComponent(eventId)}/applicants`);
    if (!result.success) return { success: false, applicants: [], totalFound: 0, error: result.error };
    const applicants = Array.isArray(result.data) ? result.data : (result.data.content ?? []);
    return { success: true, applicants, totalFound: applicants.length, error: "" };
  }

  async getEventPoolApplicants(eventId: string, page: number, pageSize: number): Promise<SmartRecruitersApplicantsListResult> {
    const result = await this.request<{ content?: Record<string, unknown>[]; totalFound?: number }>("GET", `event-management-api/events/${encodeURIComponent(eventId)}/pool-applicants`, {
      query: { page, pageSize },
    });
    if (!result.success) return { success: false, applicants: [], totalFound: 0, error: result.error };
    return { success: true, applicants: result.data.content ?? [], totalFound: result.data.totalFound ?? 0, error: "" };
  }

  async addApplicantsToEvent(eventId: string, applicantIds: string[]): Promise<SmartRecruitersOpResult> {
    const result = await this.request("POST", `event-management-api/events/${encodeURIComponent(eventId)}/applicants`, { body: { applicantIds } });
    if (!result.success) return { success: false, error: result.error };
    return { success: true, error: "" };
  }

  async addApplicantsToSession(eventId: string, sessionId: string, applicantIds: string[], allowOverbooking: boolean): Promise<SmartRecruitersSessionApplicantsResult> {
    const result = await this.request<Record<string, unknown>[]>("POST", `event-management-api/events/${encodeURIComponent(eventId)}/sessions/${encodeURIComponent(sessionId)}/applicants`, {
      body: { applicantIds, allowOverbooking },
    });
    if (!result.success) return { success: false, applicants: [], error: result.error };
    return { success: true, applicants: Array.isArray(result.data) ? result.data : [], error: "" };
  }

  async moveApplicantsToSession(eventId: string, sessionId: string, fromSessionId: string, applicantIds: string[], allowOverbooking: boolean): Promise<SmartRecruitersSessionApplicantsResult> {
    const result = await this.request<Record<string, unknown>[]>("PUT", `event-management-api/events/${encodeURIComponent(eventId)}/sessions/${encodeURIComponent(sessionId)}/applicants`, {
      body: { fromSessionId, applicantIds, allowOverbooking },
    });
    if (!result.success) return { success: false, applicants: [], error: result.error };
    return { success: true, applicants: Array.isArray(result.data) ? result.data : [], error: "" };
  }

  async searchSelfSchedules(applicationId: string, withInterviews: boolean | undefined, limit: number, offset: number): Promise<SmartRecruitersSelfSchedulesListResult> {
    const result = await this.request<{ content?: Record<string, unknown>[] } | Record<string, unknown>[]>("GET", "self-scheduling/self-schedules", {
      query: { applicationId, withInterviews, limit, offset },
    });
    if (!result.success) return { success: false, selfSchedules: [], error: result.error };
    const selfSchedules = Array.isArray(result.data) ? result.data : (result.data.content ?? []);
    return { success: true, selfSchedules, error: "" };
  }

  async getSelfSchedule(selfScheduleId: string): Promise<SmartRecruitersSelfScheduleResult> {
    const result = await this.request<Record<string, unknown>>("GET", `self-scheduling/self-schedules/${encodeURIComponent(selfScheduleId)}`);
    if (!result.success) return { success: false, selfSchedule: {}, error: result.error };
    return { success: true, selfSchedule: result.data, error: "" };
  }

  async cancelSelfSchedule(selfScheduleId: string): Promise<SmartRecruitersOpResult> {
    const result = await this.request("DELETE", `self-scheduling/self-schedules/${encodeURIComponent(selfScheduleId)}`);
    if (!result.success) return { success: false, error: result.error };
    return { success: true, error: "" };
  }

  async getApplicationSelfSchedule(selfScheduleId: string, applicationUuid: string): Promise<SmartRecruitersSelfScheduleResult> {
    const result = await this.request<Record<string, unknown>>("GET", `self-scheduling/self-schedules/${encodeURIComponent(selfScheduleId)}/application/${encodeURIComponent(applicationUuid)}`);
    if (!result.success) return { success: false, selfSchedule: {}, error: result.error };
    return { success: true, selfSchedule: result.data, error: "" };
  }

  async getSelfScheduleSlots(selfScheduleId: string, applicationUuid: string): Promise<SmartRecruitersSelfScheduleSlotsResult> {
    const result = await this.request<Record<string, unknown>[]>("GET", `self-scheduling/self-schedules/${encodeURIComponent(selfScheduleId)}/application/${encodeURIComponent(applicationUuid)}/slots`);
    if (!result.success) return { success: false, slots: [], error: result.error };
    return { success: true, slots: Array.isArray(result.data) ? result.data : [], error: "" };
  }

  async createSelfScheduleInterview(selfScheduleId: string, applicationUuid: string, startsAt: string, endsAt: string): Promise<SmartRecruitersSelfScheduleInterviewResult> {
    const result = await this.request<Record<string, unknown>>("POST", `self-scheduling/self-schedules/${encodeURIComponent(selfScheduleId)}/application/${encodeURIComponent(applicationUuid)}/interview`, { body: { startsAt, endsAt } });
    if (!result.success) return { success: false, interview: {}, error: result.error };
    return { success: true, interview: result.data, error: "" };
  }

  async updateSelfScheduleInterview(selfScheduleId: string, applicationUuid: string, startsAt: string, endsAt: string): Promise<SmartRecruitersSelfScheduleInterviewResult> {
    const result = await this.request<Record<string, unknown>>("PUT", `self-scheduling/self-schedules/${encodeURIComponent(selfScheduleId)}/application/${encodeURIComponent(applicationUuid)}/interview`, { body: { startsAt, endsAt } });
    if (!result.success) return { success: false, interview: {}, error: result.error };
    return { success: true, interview: result.data, error: "" };
  }

  async getSelfScheduledInterview(selfScheduleId: string, applicationUuid: string): Promise<SmartRecruitersSelfScheduleInterviewResult> {
    const result = await this.request<Record<string, unknown>>("GET", `self-scheduling/self-schedules/${encodeURIComponent(selfScheduleId)}/application/${encodeURIComponent(applicationUuid)}/interview`);
    if (!result.success) return { success: false, interview: {}, error: result.error };
    return { success: true, interview: result.data, error: "" };
  }

  /** Returns only a generated `selfScheduleId` — the candidate-facing flow (invite, slots, interview
   * creation) is driven by the rest of the automated-self-schedules sub-family below. */
  async createAutomatedSelfSchedule(applicationUuid: string): Promise<SmartRecruitersSelfScheduleIdResult> {
    const result = await this.request<{ selfScheduleId?: string }>("POST", "self-scheduling/automated-self-schedules", { body: { applicationUuid } });
    if (!result.success) return { success: false, selfScheduleId: "", error: result.error };
    return { success: true, selfScheduleId: result.data.selfScheduleId ?? "", error: "" };
  }

  async updateAutomatedSelfScheduleInvite(config: Record<string, unknown>): Promise<SmartRecruitersOpResult> {
    const result = await this.request("POST", "self-scheduling/automated-self-schedules/update-invite", { body: config });
    if (!result.success) return { success: false, error: result.error };
    return { success: true, error: "" };
  }

  async requestAutomatedSelfReschedule(config: Record<string, unknown>): Promise<SmartRecruitersOpResult> {
    const result = await this.request("POST", "self-scheduling/automated-self-schedules/reschedule", { body: config });
    if (!result.success) return { success: false, error: result.error };
    return { success: true, error: "" };
  }

  /** `scheduleType` (INDIVIDUAL|GROUP) is a path segment, not a body field. */
  async getAutomatedScheduleAvailableSlotsCount(scheduleType: string, applicationUuid: string, interviewerIdsByRole: Record<string, string[]>, startDate: string, endDate: string, slotsAvailabilityLimitInDays: number): Promise<SmartRecruitersAvailableSlotsCountResult> {
    const result = await this.request<{ count?: number }>("POST", `self-scheduling/automated-self-schedules/${encodeURIComponent(scheduleType)}/application/${encodeURIComponent(applicationUuid)}/slots/count/by-role`, {
      body: { interviewerIdsByRole, startDate: startDate || undefined, endDate: endDate || undefined, slotsAvailabilityLimitInDays: slotsAvailabilityLimitInDays || undefined },
    });
    if (!result.success) return { success: false, count: 0, error: result.error };
    return { success: true, count: result.data.count ?? 0, error: "" };
  }

  // --- Interview Templates & Job Managed Steps (Phase 7) -----------------------------------
  // `interview-templates` sub-API (same host as Phase 6's getSchedulePreferences). Company-level
  // template CRUD has a genuine "new" (`/templates`) and "deprecated" (`/interview/templates`)
  // family — unlike the false EEO/consent/"me" assumptions in Phases 3-5, both are still live and
  // documented, with the deprecated endpoints carrying literal "use GET/PUT/DELETE
  // /public-api/templates/{id} instead" migration notices. Job-level templates mirror the same
  // split: `/job-templates` (new) vs. `/interview/templates/job...` (deprecated). Managed steps
  // (`/managed-steps/jobs/{jobId}`) control whether a hiring stage/step requires a template
  // assignment. The only batch/"search" endpoint in this area
  // (POST /job-templates/jobs/{jobId}/search) is scoped to one job and batches by application ids
  // — there is no job-ids-batched search, confirmed via live docs (same kind of scope correction
  // as prior phases' dropped assumptions).

  async searchInterviewTemplates(query: Record<string, string | number | boolean | undefined>): Promise<SmartRecruitersInterviewTemplatesListResult> {
    const result = await this.request<{ totalElements?: number; contents?: Record<string, unknown>[] }>("GET", "interview-templates/templates", { query });
    if (!result.success) return { success: false, templates: [], totalFound: 0, error: result.error };
    return { success: true, templates: result.data.contents ?? [], totalFound: result.data.totalElements ?? 0, error: "" };
  }

  async createInterviewTemplate(template: Record<string, unknown>): Promise<SmartRecruitersInterviewTemplateResult> {
    const result = await this.request<Record<string, unknown>>("POST", "interview-templates/templates", { body: template });
    if (!result.success) return { success: false, template: {}, error: result.error };
    return { success: true, template: result.data, error: "" };
  }

  async getInterviewTemplate(templateId: string): Promise<SmartRecruitersInterviewTemplateResult> {
    const result = await this.request<Record<string, unknown>>("GET", `interview-templates/templates/${encodeURIComponent(templateId)}`);
    if (!result.success) return { success: false, template: {}, error: result.error };
    return { success: true, template: result.data, error: "" };
  }

  async updateInterviewTemplate(templateId: string, template: Record<string, unknown>): Promise<SmartRecruitersInterviewTemplateResult> {
    const result = await this.request<Record<string, unknown>>("PUT", `interview-templates/templates/${encodeURIComponent(templateId)}`, { body: template });
    if (!result.success) return { success: false, template: {}, error: result.error };
    return { success: true, template: result.data, error: "" };
  }

  async deleteInterviewTemplate(templateId: string): Promise<SmartRecruitersOpResult> {
    const result = await this.request("DELETE", `interview-templates/templates/${encodeURIComponent(templateId)}`);
    if (!result.success) return { success: false, error: result.error };
    return { success: true, error: "" };
  }

  /** Deprecated company-level family — kept for exhaustive coverage alongside the new /templates
   * endpoints above, same as prior phases' deprecated variants. Response shape differs
   * materially (durationInMinutes/format/location instead of slotSetup/templateType), and the
   * list field is `content` (singular) here vs. `contents` on the new endpoint. */
  async searchInterviewTemplatesDeprecated(page: number, limit: number, search: string): Promise<SmartRecruitersInterviewTemplatesListResult> {
    const result = await this.request<{ totalElements?: number; content?: Record<string, unknown>[] }>("GET", "interview-templates/interview/templates", { query: { page, limit, search: search || undefined } });
    if (!result.success) return { success: false, templates: [], totalFound: 0, error: result.error };
    return { success: true, templates: result.data.content ?? [], totalFound: result.data.totalElements ?? 0, error: "" };
  }

  async getInterviewTemplateDeprecated(templateId: string): Promise<SmartRecruitersInterviewTemplateResult> {
    const result = await this.request<Record<string, unknown>>("GET", `interview-templates/interview/templates/${encodeURIComponent(templateId)}`);
    if (!result.success) return { success: false, template: {}, error: result.error };
    return { success: true, template: result.data, error: "" };
  }

  async updateInterviewTemplateDeprecated(templateId: string, template: Record<string, unknown>): Promise<SmartRecruitersInterviewTemplateResult> {
    const result = await this.request<Record<string, unknown>>("PUT", `interview-templates/interview/templates/${encodeURIComponent(templateId)}`, { body: template });
    if (!result.success) return { success: false, template: {}, error: result.error };
    return { success: true, template: result.data, error: "" };
  }

  async deleteInterviewTemplateDeprecated(templateId: string): Promise<SmartRecruitersOpResult> {
    const result = await this.request("DELETE", `interview-templates/interview/templates/${encodeURIComponent(templateId)}`);
    if (!result.success) return { success: false, error: result.error };
    return { success: true, error: "" };
  }

  /** Controls whether a hiring stage/step requires an interview template assignment. */
  async getJobManagedSteps(jobId: string): Promise<SmartRecruitersJobManagedStepsResult> {
    const result = await this.request<{ states?: Record<string, unknown>[] }>("GET", `interview-templates/managed-steps/jobs/${encodeURIComponent(jobId)}`);
    if (!result.success) return { success: false, states: [], error: result.error };
    return { success: true, states: result.data.states ?? [], error: "" };
  }

  async updateJobManagedSteps(jobId: string, states: Record<string, unknown>[]): Promise<SmartRecruitersJobManagedStepsResult> {
    const result = await this.request<{ states?: Record<string, unknown>[] }>("PUT", `interview-templates/managed-steps/jobs/${encodeURIComponent(jobId)}`, { body: { states } });
    if (!result.success) return { success: false, states: [], error: result.error };
    return { success: true, states: result.data.states ?? [], error: "" };
  }

  // Job-level templates: deprecated family (`/interview/templates/job...`).

  /** 204 on success — the deprecated job-level template body is the older shape
   * (durationInMinutes/format/location instead of slotSetup/templateType). */
  async updateJobInterviewTemplateDeprecated(jobInterviewTemplateId: string, template: Record<string, unknown>): Promise<SmartRecruitersOpResult> {
    const result = await this.request("PUT", `interview-templates/interview/templates/job/${encodeURIComponent(jobInterviewTemplateId)}`, { body: template });
    if (!result.success) return { success: false, error: result.error };
    return { success: true, error: "" };
  }

  /** 204 on success — reassigns interviewers per hiring-team role without touching the rest of the template. */
  async updateJobInterviewTemplateInterviewersDeprecated(jobInterviewTemplateId: string, hiringTeamRoleToInterviewers: Record<string, string[]>): Promise<SmartRecruitersOpResult> {
    const result = await this.request("PATCH", `interview-templates/interview/templates/job/${encodeURIComponent(jobInterviewTemplateId)}`, { body: { hiringTeamRoleToInterviewers } });
    if (!result.success) return { success: false, error: result.error };
    return { success: true, error: "" };
  }

  async getJobInterviewTemplatesDeprecated(jobId: string): Promise<SmartRecruitersJobTemplateStagesResult> {
    const result = await this.request<{ stages?: Record<string, unknown>[] }>("GET", `interview-templates/interview/templates/jobs/${encodeURIComponent(jobId)}`);
    if (!result.success) return { success: false, stages: [], error: result.error };
    return { success: true, stages: result.data.stages ?? [], error: "" };
  }

  /** 200 if a template is assigned to the application's current hiring step, 204 if none is. */
  async getJobApplicationInterviewTemplateDeprecated(applicationId: string): Promise<SmartRecruitersInterviewTemplateResult> {
    const result = await this.request<Record<string, unknown>>("GET", `interview-templates/interview/templates/job-applications/${encodeURIComponent(applicationId)}`);
    if (!result.success) return { success: false, template: {}, error: result.error };
    return { success: true, template: result.data, error: "" };
  }

  // Job-level templates: new family (`/job-templates`).

  /** 204 on success. */
  async updateJobTemplate(jobInterviewTemplateId: string, template: Record<string, unknown>): Promise<SmartRecruitersOpResult> {
    const result = await this.request("PUT", `interview-templates/job-templates/${encodeURIComponent(jobInterviewTemplateId)}`, { body: template });
    if (!result.success) return { success: false, error: result.error };
    return { success: true, error: "" };
  }

  /** 204 on success — reassigns interviewers per hiring-team role, same body shape as the deprecated variant. */
  async updateJobTemplateInterviewers(jobInterviewTemplateId: string, hiringTeamRoleToInterviewers: Record<string, string[]>): Promise<SmartRecruitersOpResult> {
    const result = await this.request("PATCH", `interview-templates/job-templates/${encodeURIComponent(jobInterviewTemplateId)}`, { body: { hiringTeamRoleToInterviewers } });
    if (!result.success) return { success: false, error: result.error };
    return { success: true, error: "" };
  }

  /** 200 if found, 204 if no template is bound to this hiring stage/step yet. */
  async findJobTemplateByHiringStage(jobId: string, hiringStage: string, hiringStep: string): Promise<SmartRecruitersInterviewTemplateResult> {
    const result = await this.request<Record<string, unknown>>("GET", `interview-templates/job-templates/jobs/${encodeURIComponent(jobId)}/hiringStages/${encodeURIComponent(hiringStage)}`, { query: { hiringStep } });
    if (!result.success) return { success: false, template: {}, error: result.error };
    return { success: true, template: result.data, error: "" };
  }

  /** Save-or-replace — binds an existing company-level template (`templateId`) to a job's hiring stage/step. */
  async upsertJobTemplate(jobId: string, hiringStage: string, hiringStep: string, templateId: string): Promise<SmartRecruitersInterviewTemplateResult> {
    const result = await this.request<Record<string, unknown>>("PUT", `interview-templates/job-templates/jobs/${encodeURIComponent(jobId)}/hiringStages/${encodeURIComponent(hiringStage)}`, { query: { hiringStep }, body: { templateId } });
    if (!result.success) return { success: false, template: {}, error: result.error };
    return { success: true, template: result.data, error: "" };
  }

  async findJobTemplatesByJobId(jobId: string): Promise<SmartRecruitersJobTemplateStagesResult> {
    const result = await this.request<{ stages?: Record<string, unknown>[] }>("GET", `interview-templates/job-templates/jobs/${encodeURIComponent(jobId)}`);
    if (!result.success) return { success: false, stages: [], error: result.error };
    return { success: true, stages: result.data.stages ?? [], error: "" };
  }

  /** 200 if found, 204 if none is bound yet. */
  async findJobTemplateByApplicationId(applicationId: string): Promise<SmartRecruitersInterviewTemplateResult> {
    const result = await this.request<Record<string, unknown>>("GET", `interview-templates/job-templates/job-applications/${encodeURIComponent(applicationId)}`);
    if (!result.success) return { success: false, template: {}, error: result.error };
    return { success: true, template: result.data, error: "" };
  }

  /** The one batch endpoint in this area — scoped to a single job (`jobId` in the path), batched
   * by application ids (not job ids) in the body. Returns one blueprint per distinct hiring
   * state reached by the given applications. */
  async searchJobTemplatesByApplicationIds(jobId: string, applicationIds: string[]): Promise<SmartRecruitersJobTemplateBlueprintsResult> {
    const result = await this.request<{ hiringStateBlueprints?: Record<string, unknown>[] }>("POST", `interview-templates/job-templates/jobs/${encodeURIComponent(jobId)}/search`, { body: { applicationIds } });
    if (!result.success) return { success: false, blueprints: [], error: result.error };
    return { success: true, blueprints: result.data.hiringStateBlueprints ?? [], error: "" };
  }
}
