import { Octokit as OctokitCore } from "@octokit/core";
import { restEndpointMethods } from "@octokit/plugin-rest-endpoint-methods";
import { createAppAuth } from "@octokit/auth-app";
import { RequestError } from "@octokit/request-error";

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

function githubErrorMessage(err: unknown): string {
  if (err instanceof RequestError) {
    const data = err.response?.data as { message?: string } | undefined;
    return data?.message ? `${data.message} (status ${err.status})` : `GitHub API error (status ${err.status})`;
  }
  return err instanceof Error ? err.message : String(err);
}

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
  static forAuth(auth: GithubAuth): GithubManager {
    const key = cacheKey(auth);
    let manager = managerCache.get(key);
    if (!manager) {
      manager = new GithubManager(auth);
      managerCache.set(key, manager);
    }
    return manager;
  }

  constructor(auth: GithubAuth) {
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

  async listIssues(owner: string, repo: string, state: "open" | "closed" | "all" = "open"): Promise<GithubListIssuesResult> {
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
      return { success: false, issues: [], error: githubErrorMessage(err) };
    }
  }

  async createIssue(owner: string, repo: string, title: string, body: string): Promise<GithubIssueResult> {
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
        error: githubErrorMessage(err),
      };
    }
  }

  async commentOnIssue(owner: string, repo: string, issueNumber: number, body: string): Promise<GithubOpResult> {
    try {
      await this.client.rest.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body,
      });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: githubErrorMessage(err) };
    }
  }

  async listPullRequests(owner: string, repo: string, state: "open" | "closed" | "all" = "open"): Promise<GithubListPullRequestsResult> {
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
        error: githubErrorMessage(err),
      };
    }
  }

  async createPullRequest(owner: string, repo: string, title: string, head: string, base: string, body: string): Promise<GithubPullRequestResult> {
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
        error: githubErrorMessage(err),
      };
    }
  }

  async mergePullRequest(owner: string, repo: string, pullNumber: number, mergeMethod: "merge" | "squash" | "rebase" = "merge"): Promise<GithubMergeResult> {
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
        error: githubErrorMessage(err),
      };
    }
  }

  /** Content comes back base64-encoded from the API; sha must be threaded back into
   * createOrUpdateFile so GitHub can detect update-vs-create and resolve conflicts. */
  async getFileContent(owner: string, repo: string, path: string, ref?: string): Promise<GithubFileContentResult> {
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
        error: githubErrorMessage(err),
      };
    }
  }

  /** Pass the sha returned by getFileContent to update an existing file; omit it to create a new one. */
  async createOrUpdateFile(owner: string, repo: string, path: string, content: string, message: string, branch?: string, sha?: string): Promise<GithubFileWriteResult> {
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
        error: githubErrorMessage(err),
      };
    }
  }

  /** Escape hatch for any endpoint not wrapped above — thin pass-through to octokit.request with the
   * same error normalization as every typed method here. */
  async request(route: string, params?: Record<string, unknown>): Promise<GithubRequestResult> {
    try {
      const res = await this.client.request(route, params);
      return { success: true, data: res.data, error: "" };
    } catch (err) {
      return {
        success: false,
        data: undefined,
        error: githubErrorMessage(err),
      };
    }
  }
}
