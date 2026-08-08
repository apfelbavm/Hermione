import { Octokit as OctokitCore } from "@octokit/core";
import { restEndpointMethods } from "@octokit/plugin-rest-endpoint-methods";
import { createAppAuth } from "@octokit/auth-app";
import { RequestError } from "@octokit/request-error";
import { getDatabaseManager } from "../server/DatabaseManager.ts";
import { resolveAllCredentials } from "../server/vaultCredentials.ts";
import type { GithubTokenCredentialData, GithubAppCredentialData } from "@hermione/shared/types";

// Deliberately @octokit/core + the REST plugin only, not the "octokit"/"@octokit/rest" bundles —
// those also pull in the retry/throttling plugins, which add multi-second backoff delays to every
// mutating request (and every test hitting one), for a "wait and retry on abuse limits" behavior
// this app doesn't need.
const Octokit = OctokitCore.plugin(restEndpointMethods);
type Octokit = InstanceType<typeof Octokit>;

/** Every GitHub node (issues, pull requests, repo contents) needs the same boilerplate: build an
 * Octokit client from either a personal access token or a GitHub App installation, call one REST
 * route, and turn either a result or a thrown RequestError into a plain {success, error} shape.
 * Centralized here once instead of repeated per node. */

export interface GithubOpResult {
  success: boolean;
  error: string;
  [key: string]: unknown;
}

export interface GithubIssue {
  number: number;
  title: string;
  state: string;
  url: string;
}

export interface GithubListIssuesResult extends GithubOpResult {
  issues: GithubIssue[];
}

export interface GithubIssueResult extends GithubOpResult {
  number: number;
  url: string;
}

export interface GithubPullRequest {
  number: number;
  title: string;
  state: string;
  url: string;
}

export interface GithubListPullRequestsResult extends GithubOpResult {
  pullRequests: GithubPullRequest[];
}

export interface GithubPullRequestResult extends GithubOpResult {
  number: number;
  url: string;
}

export interface GithubMergeResult extends GithubOpResult {
  merged: boolean;
  sha: string;
}

export interface GithubFileContentResult extends GithubOpResult {
  content: string;
  sha: string;
}

export interface GithubFileWriteResult extends GithubOpResult {
  sha: string;
  commitSha: string;
}

export interface GithubRequestResult extends GithubOpResult {
  data: unknown;
}

export type GithubTokenAuth = { token: string };
export type GithubAppAuth = {
  appId: string | number;
  privateKey: string;
  installationId: string | number;
};
export type GithubAuth = GithubTokenAuth | GithubAppAuth;

function isAppAuth(auth: GithubAuth): auth is GithubAppAuth {
  return "appId" in auth;
}

const managerCache = new Map<string, GithubManager>();

function cacheKey(auth: GithubAuth): string {
  return isAppAuth(auth) ? `app:${auth.appId}:${auth.installationId}` : `token:${auth.token}`;
}

export class GithubManager {
  private readonly client: Octokit;

  /** Reuses one GithubManager (and its underlying Octokit client) per distinct auth instead of
   * building a fresh one per node execution — for GithubAppAuth this matters because @octokit/
   * auth-app caches the installation access token on the auth strategy instance itself, so only a
   * fresh Octokit client re-authenticates on every call; a reused one only refreshes once that
   * cached token is actually about to expire. */
  static getInstance(auth: GithubAuth): GithubManager {
    const key = cacheKey(auth);
    let manager = managerCache.get(key);
    if (!manager) {
      manager = new GithubManager(auth);
      managerCache.set(key, manager);
    }
    return manager;
  }

  static errorMessage(err: unknown): string {
    if (err instanceof RequestError) {
      const data = err.response?.data as { message?: string } | undefined;
      return data?.message ? `${data.message} (status ${err.status})` : `GitHub API error (status ${err.status})`;
    }
    return err instanceof Error ? err.message : String(err);
  }

  /** Mirrors resolveGithubCredential's/githubCredentialFromEnv's shape check — GitHub has two
   * credential kinds (personal access token vs. GitHub App installation), so branch on the vault
   * record's type to build the right GithubAuth union member. */
  private static async findCredential(credentialName: string): Promise<{ ok: true; auth: GithubAuth } | { ok: false; error: string }> {
    const credRecord = (await resolveAllCredentials(getDatabaseManager())).get(credentialName);
    if (!credRecord) return { ok: false, error: `Credential "${credentialName}" not found in the vault` };
    if (credRecord.type === "githubToken") {
      const data = credRecord.data as GithubTokenCredentialData;
      return { ok: true, auth: { token: data.token } };
    }
    if (credRecord.type === "githubApp") {
      const data = credRecord.data as GithubAppCredentialData;
      return { ok: true, auth: { appId: data.appId, privateKey: data.privateKey, installationId: data.installationId } };
    }
    return { ok: false, error: `Credential "${credentialName}" is not a GitHub Token or GitHub App credential` };
  }

  static async listIssues(credentialName: string, owner: string, repo: string, state: "open" | "closed" | "all" = "open"): Promise<GithubListIssuesResult> {
    const cred = await GithubManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, issues: [], error: cred.error };
    return GithubManager.getInstance(cred.auth).listIssues(owner, repo, state);
  }

  static async createIssue(credentialName: string, owner: string, repo: string, title: string, body: string): Promise<GithubIssueResult> {
    const cred = await GithubManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, number: 0, url: "", error: cred.error };
    return GithubManager.getInstance(cred.auth).createIssue(owner, repo, title, body);
  }

  static async commentOnIssue(credentialName: string, owner: string, repo: string, issueNumber: number, body: string): Promise<GithubOpResult> {
    const cred = await GithubManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return GithubManager.getInstance(cred.auth).commentOnIssue(owner, repo, issueNumber, body);
  }

  static async listPullRequests(credentialName: string, owner: string, repo: string, state: "open" | "closed" | "all" = "open"): Promise<GithubListPullRequestsResult> {
    const cred = await GithubManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, pullRequests: [], error: cred.error };
    return GithubManager.getInstance(cred.auth).listPullRequests(owner, repo, state);
  }

  static async createPullRequest(credentialName: string, owner: string, repo: string, title: string, head: string, base: string, body: string): Promise<GithubPullRequestResult> {
    const cred = await GithubManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, number: 0, url: "", error: cred.error };
    return GithubManager.getInstance(cred.auth).createPullRequest(owner, repo, title, head, base, body);
  }

  static async mergePullRequest(credentialName: string, owner: string, repo: string, pullNumber: number, mergeMethod: "merge" | "squash" | "rebase" = "merge"): Promise<GithubMergeResult> {
    const cred = await GithubManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, merged: false, sha: "", error: cred.error };
    return GithubManager.getInstance(cred.auth).mergePullRequest(owner, repo, pullNumber, mergeMethod);
  }

  static async getFileContent(credentialName: string, owner: string, repo: string, path: string, ref?: string): Promise<GithubFileContentResult> {
    const cred = await GithubManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, content: "", sha: "", error: cred.error };
    return GithubManager.getInstance(cred.auth).getFileContent(owner, repo, path, ref);
  }

  static async createOrUpdateFile(credentialName: string, owner: string, repo: string, path: string, content: string, message: string, branch?: string, sha?: string): Promise<GithubFileWriteResult> {
    const cred = await GithubManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, sha: "", commitSha: "", error: cred.error };
    return GithubManager.getInstance(cred.auth).createOrUpdateFile(owner, repo, path, content, message, branch, sha);
  }

  static async request(credentialName: string, route: string, paramsJson: string): Promise<GithubRequestResult> {
    const cred = await GithubManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, data: undefined, error: cred.error };
    return GithubManager.getInstance(cred.auth).request(route, paramsJson);
  }

  private constructor(auth: GithubAuth) {
    this.client = isAppAuth(auth)
      ? new Octokit({
          authStrategy: createAppAuth,
          auth: {
            appId: auth.appId,
            privateKey: auth.privateKey,
            installationId: auth.installationId,
          },
        })
      : new Octokit({ auth: auth.token });
  }

  private async listIssues(owner: string, repo: string, state: "open" | "closed" | "all" = "open"): Promise<GithubListIssuesResult> {
    try {
      const res = await this.client.rest.issues.listForRepo({
        owner,
        repo,
        state,
      });
      // The issues endpoint also returns pull requests; filter those out to keep this a pure issue list.
      const issues = res.data
        .filter((issue) => !issue.pull_request)
        .map((issue) => ({
          number: issue.number,
          title: issue.title,
          state: issue.state,
          url: issue.html_url,
        }));
      return { success: true, issues, error: "" };
    } catch (err) {
      return { success: false, issues: [], error: GithubManager.errorMessage(err) };
    }
  }

  private async createIssue(owner: string, repo: string, title: string, body: string): Promise<GithubIssueResult> {
    try {
      const res = await this.client.rest.issues.create({
        owner,
        repo,
        title,
        body,
      });
      return {
        success: true,
        number: res.data.number,
        url: res.data.html_url,
        error: "",
      };
    } catch (err) {
      return {
        success: false,
        number: 0,
        url: "",
        error: GithubManager.errorMessage(err),
      };
    }
  }

  private async commentOnIssue(owner: string, repo: string, issueNumber: number, body: string): Promise<GithubOpResult> {
    try {
      await this.client.rest.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body,
      });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: GithubManager.errorMessage(err) };
    }
  }

  private async listPullRequests(owner: string, repo: string, state: "open" | "closed" | "all" = "open"): Promise<GithubListPullRequestsResult> {
    try {
      const res = await this.client.rest.pulls.list({ owner, repo, state });
      const pullRequests = res.data.map((pr) => ({
        number: pr.number,
        title: pr.title,
        state: pr.state,
        url: pr.html_url,
      }));
      return { success: true, pullRequests, error: "" };
    } catch (err) {
      return {
        success: false,
        pullRequests: [],
        error: GithubManager.errorMessage(err),
      };
    }
  }

  private async createPullRequest(owner: string, repo: string, title: string, head: string, base: string, body: string): Promise<GithubPullRequestResult> {
    try {
      const res = await this.client.rest.pulls.create({
        owner,
        repo,
        title,
        head,
        base,
        body,
      });
      return {
        success: true,
        number: res.data.number,
        url: res.data.html_url,
        error: "",
      };
    } catch (err) {
      return {
        success: false,
        number: 0,
        url: "",
        error: GithubManager.errorMessage(err),
      };
    }
  }

  private async mergePullRequest(owner: string, repo: string, pullNumber: number, mergeMethod: "merge" | "squash" | "rebase" = "merge"): Promise<GithubMergeResult> {
    try {
      const res = await this.client.rest.pulls.merge({
        owner,
        repo,
        pull_number: pullNumber,
        merge_method: mergeMethod,
      });
      return {
        success: true,
        merged: res.data.merged,
        sha: res.data.sha,
        error: "",
      };
    } catch (err) {
      return {
        success: false,
        merged: false,
        sha: "",
        error: GithubManager.errorMessage(err),
      };
    }
  }

  /** Content comes back base64-encoded from the API; sha must be threaded back into
   * createOrUpdateFile so GitHub can detect update-vs-create and resolve conflicts. */
  private async getFileContent(owner: string, repo: string, path: string, ref?: string): Promise<GithubFileContentResult> {
    try {
      const res = await this.client.rest.repos.getContent({
        owner,
        repo,
        path,
        ref,
      });
      const file = Array.isArray(res.data) ? undefined : res.data;
      if (!file || file.type !== "file")
        return {
          success: false,
          content: "",
          sha: "",
          error: `"${path}" is not a file`,
        };
      return {
        success: true,
        content: Buffer.from(file.content, "base64").toString("utf8"),
        sha: file.sha,
        error: "",
      };
    } catch (err) {
      return {
        success: false,
        content: "",
        sha: "",
        error: GithubManager.errorMessage(err),
      };
    }
  }

  /** Pass the sha returned by getFileContent to update an existing file; omit it to create a new one. */
  private async createOrUpdateFile(owner: string, repo: string, path: string, content: string, message: string, branch?: string, sha?: string): Promise<GithubFileWriteResult> {
    try {
      const res = await this.client.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path,
        message,
        content: Buffer.from(content, "utf8").toString("base64"),
        branch,
        sha,
      });
      return {
        success: true,
        sha: res.data.content?.sha ?? "",
        commitSha: res.data.commit.sha ?? "",
        error: "",
      };
    } catch (err) {
      return {
        success: false,
        sha: "",
        commitSha: "",
        error: GithubManager.errorMessage(err),
      };
    }
  }

  /** Escape hatch for any endpoint not wrapped above — thin pass-through to octokit.request with the
   * same error normalization as every typed method here. */
  private async request(route: string, paramsJson: string): Promise<GithubRequestResult> {
    try {
      const rawParams = String(paramsJson ?? "").trim();
      const params = rawParams ? (JSON.parse(rawParams) as Record<string, unknown>) : undefined;
      const res = await this.client.request(route, params);
      return { success: true, data: res.data, error: "" };
    } catch (err) {
      return {
        success: false,
        data: undefined,
        error: GithubManager.errorMessage(err),
      };
    }
  }
}
