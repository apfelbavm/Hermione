import { Version2, Version3 } from "jira.js";

type Version2Client = Version2.Version2Client;
type Version3Client = Version3.Version3Client;
const { Version2Client } = Version2;
const { Version3Client } = Version3;

/** Every Jira node (issues, comments, transitions, worklogs, projects, users) needs the same
 * boilerplate: build a client for whichever Jira flavor the credential targets, call one SDK
 * route, and turn either a result or a thrown error into a plain {success, error} shape.
 * Centralized here once instead of repeated per node (see nodes/jira.ts).
 *
 * Jira Cloud and Jira Server/Data Center are deliberately handled by the same set of nodes rather
 * than split into separate node groups: every operation below (create/get/update/delete issue,
 * search, comment, transition, assign, worklog, link, project, user lookup) exists identically on
 * both REST APIs — only the auth mechanism and the user identifier (accountId vs username) differ,
 * and both of those are already abstracted away here. Splitting nodes per flavor would just
 * duplicate every node definition for no behavioral difference. */

function jiraErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "response" in err) {
    const response = (err as { response?: { status?: number; data?: unknown } }).response;
    const data = response?.data as { errorMessages?: string[]; errors?: Record<string, string>; message?: string } | undefined;
    if (data?.errorMessages?.length) return data.errorMessages.join("; ");
    if (data?.errors && Object.keys(data.errors).length > 0)
      return Object.entries(data.errors)
        .map(([field, message]) => `${field}: ${message}`)
        .join("; ");
    if (data?.message) return data.message;
    if (response?.status) return `Jira API error (status ${response.status})`;
  }
  return err instanceof Error ? err.message : String(err);
}

export type JiraCloudAuth = { kind: "cloud"; url: string; email: string; apiToken: string };
export type JiraServerPatAuth = { kind: "serverPat"; url: string; personalAccessToken: string };
export type JiraServerBasicAuth = { kind: "serverBasic"; url: string; username: string; password: string };
export type JiraAuth = JiraCloudAuth | JiraServerPatAuth | JiraServerBasicAuth;

const managerCache = new Map<string, JiraManager>();

function cacheKey(auth: JiraAuth): string {
  if (auth.kind === "cloud") return `cloud:${auth.url}:${auth.email}:${auth.apiToken}`;
  if (auth.kind === "serverPat") return `serverPat:${auth.url}:${auth.personalAccessToken}`;
  return `serverBasic:${auth.url}:${auth.username}:${auth.password}`;
}

export interface JiraOpResult {
  success: boolean;
  error: string;
  [key: string]: unknown;
}

export interface JiraIssue {
  id: string;
  key: string;
  summary: string;
  status: string;
  issueType: string;
  url: string;
}

export interface JiraCreateResult extends JiraOpResult {
  id: string;
  key: string;
  url: string;
}

export interface JiraGetIssueResult extends JiraOpResult {
  issue: JiraIssue;
}

export interface JiraSearchIssuesResult extends JiraOpResult {
  issues: JiraIssue[];
  total: number;
}

export interface JiraComment {
  id: string;
  body: string;
  author: string;
  created: string;
}

export interface JiraAddCommentResult extends JiraOpResult {
  id: string;
}

export interface JiraListCommentsResult extends JiraOpResult {
  comments: JiraComment[];
}

export interface JiraTransition {
  id: string;
  name: string;
}

export interface JiraListTransitionsResult extends JiraOpResult {
  transitions: JiraTransition[];
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
}

export interface JiraGetProjectResult extends JiraOpResult {
  project: JiraProject;
}

export interface JiraListProjectsResult extends JiraOpResult {
  projects: JiraProject[];
}

export interface JiraAddWorklogResult extends JiraOpResult {
  id: string;
}

export interface JiraUser {
  accountId: string;
  username: string;
  displayName: string;
  emailAddress: string;
}

export interface JiraGetUserResult extends JiraOpResult {
  user: JiraUser;
}

export interface JiraFindUsersResult extends JiraOpResult {
  users: JiraUser[];
}

export class JiraManager {
  private readonly baseUrl: string;
  readonly isCloud: boolean;
  private readonly cloudClient?: Version3Client;
  private readonly serverClient?: Version2Client;

  /** Reuses one JiraManager (and its underlying jira.js client) per distinct auth instead of
   * building a fresh one per node execution — same rationale as GithubManager.forAuth. */
  static forAuth(auth: JiraAuth): JiraManager {
    const key = cacheKey(auth);
    let manager = managerCache.get(key);
    if (!manager) {
      manager = new JiraManager(auth);
      managerCache.set(key, manager);
    }
    return manager;
  }

  constructor(auth: JiraAuth) {
    this.baseUrl = auth.url.replace(/\/+$/, "");
    this.isCloud = auth.kind === "cloud";
    if (auth.kind === "cloud") {
      this.cloudClient = new Version3Client({
        host: this.baseUrl,
        authentication: { basic: { email: auth.email, apiToken: auth.apiToken } },
      });
    } else if (auth.kind === "serverPat") {
      // jira.js 5.x dropped PAT/username-password auth from its Config type (Cloud-only now), so the
      // Authorization header is set directly instead of going through `authentication`.
      this.serverClient = new Version2Client({
        host: this.baseUrl,
        baseRequestConfig: { headers: { Authorization: `Bearer ${auth.personalAccessToken}` } },
      });
    } else {
      const token = Buffer.from(`${auth.username}:${auth.password}`).toString("base64");
      this.serverClient = new Version2Client({
        host: this.baseUrl,
        baseRequestConfig: { headers: { Authorization: `Basic ${token}` } },
      });
    }
  }

  private run<T>(cloudFn: (client: Version3Client) => Promise<T>, serverFn: (client: Version2Client) => Promise<T>): Promise<T> {
    return this.cloudClient ? cloudFn(this.cloudClient) : serverFn(this.serverClient!);
  }

  /** Cloud (REST v3) fields (e.g. description, comment body) are Atlassian Document Format, while
   * Server/DC (REST v2) fields are plain strings/wiki markup — this is the one place that matters. */
  private richText(text: string): unknown {
    return this.isCloud ? { type: "doc", version: 1, content: text ? [{ type: "paragraph", content: [{ type: "text", text }] }] : [] } : text;
  }

  private plainText(body: unknown): string {
    if (typeof body === "string") return body;
    if (body && typeof body === "object") {
      // Atlassian Document Format: flatten paragraph/text nodes back to plain text.
      const doc = body as { content?: Array<{ content?: Array<{ text?: string }> }> };
      return (doc.content ?? []).flatMap((block) => (block.content ?? []).map((node) => node.text ?? "")).join("\n");
    }
    return "";
  }

  private toIssue(res: { id: string; key: string; fields?: { summary?: string; status?: { name?: string }; issuetype?: { name?: string } } }): JiraIssue {
    return {
      id: res.id,
      key: res.key,
      summary: res.fields?.summary ?? "",
      status: res.fields?.status?.name ?? "",
      issueType: res.fields?.issuetype?.name ?? "",
      url: `${this.baseUrl}/browse/${res.key}`,
    };
  }

  async createIssue(projectKey: string, issueTypeName: string, summary: string, description: string): Promise<JiraCreateResult> {
    try {
      const res = await this.run(
        (client) => client.issues.createIssue({ fields: { project: { key: projectKey }, issuetype: { name: issueTypeName }, summary, description: this.richText(description) as never } }),
        (client) => client.issues.createIssue({ fields: { project: { key: projectKey }, issuetype: { name: issueTypeName }, summary, description: this.richText(description) as never } }),
      );
      return { success: true, id: res.id, key: res.key, url: `${this.baseUrl}/browse/${res.key}`, error: "" };
    } catch (err) {
      return { success: false, id: "", key: "", url: "", error: jiraErrorMessage(err) };
    }
  }

  async getIssue(issueIdOrKey: string): Promise<JiraGetIssueResult> {
    try {
      const res = await this.run(
        (client) => client.issues.getIssue({ issueIdOrKey }),
        (client) => client.issues.getIssue({ issueIdOrKey }),
      );
      return { success: true, issue: this.toIssue(res), error: "" };
    } catch (err) {
      return { success: false, issue: { id: "", key: "", summary: "", status: "", issueType: "", url: "" }, error: jiraErrorMessage(err) };
    }
  }

  async updateIssue(issueIdOrKey: string, summary: string, description: string): Promise<JiraOpResult> {
    try {
      const fields: Record<string, unknown> = {};
      if (summary) fields.summary = summary;
      if (description) fields.description = this.richText(description);
      await this.run(
        (client) => client.issues.editIssue({ issueIdOrKey, fields: fields as never }),
        (client) => client.issues.editIssue({ issueIdOrKey, fields: fields as never }),
      );
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: jiraErrorMessage(err) };
    }
  }

  async deleteIssue(issueIdOrKey: string): Promise<JiraOpResult> {
    try {
      await this.run(
        (client) => client.issues.deleteIssue({ issueIdOrKey }),
        (client) => client.issues.deleteIssue({ issueIdOrKey }),
      );
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: jiraErrorMessage(err) };
    }
  }

  async searchIssues(jql: string, maxResults: number, validateQuery: "strict" | "warn" | "none"): Promise<JiraSearchIssuesResult> {
    try {
      const res = await this.run(
        (client) => client.issueSearch.searchForIssuesUsingJql({ jql, maxResults, validateQuery }),
        (client) => client.issueSearch.searchForIssuesUsingJql({ jql, maxResults, validateQuery }),
      );
      const issues = (res.issues ?? []).map((issue) => this.toIssue(issue));
      return { success: true, issues, total: res.total ?? issues.length, error: "" };
    } catch (err) {
      return { success: false, issues: [], total: 0, error: jiraErrorMessage(err) };
    }
  }

  async addComment(issueIdOrKey: string, body: string): Promise<JiraAddCommentResult> {
    try {
      const res = await this.run(
        (client) => client.issueComments.addComment({ issueIdOrKey, comment: this.richText(body) as never }),
        (client) => client.issueComments.addComment({ issueIdOrKey, comment: this.richText(body) as never }),
      );
      return { success: true, id: res.id ?? "", error: "" };
    } catch (err) {
      return { success: false, id: "", error: jiraErrorMessage(err) };
    }
  }

  async listComments(issueIdOrKey: string): Promise<JiraListCommentsResult> {
    try {
      const res = await this.run(
        (client) => client.issueComments.getComments({ issueIdOrKey }),
        (client) => client.issueComments.getComments({ issueIdOrKey }),
      );
      const comments = (res.comments ?? []).map((comment) => ({
        id: comment.id ?? "",
        body: this.plainText(comment.body),
        author: comment.author?.displayName ?? "",
        created: comment.created ?? "",
      }));
      return { success: true, comments, error: "" };
    } catch (err) {
      return { success: false, comments: [], error: jiraErrorMessage(err) };
    }
  }

  async listTransitions(issueIdOrKey: string): Promise<JiraListTransitionsResult> {
    try {
      const res = await this.run(
        (client) => client.issues.getTransitions({ issueIdOrKey }),
        (client) => client.issues.getTransitions({ issueIdOrKey }),
      );
      const transitions = (res.transitions ?? []).map((transition) => ({ id: transition.id ?? "", name: transition.name ?? "" }));
      return { success: true, transitions, error: "" };
    } catch (err) {
      return { success: false, transitions: [], error: jiraErrorMessage(err) };
    }
  }

  async transitionIssue(issueIdOrKey: string, transitionId: string): Promise<JiraOpResult> {
    try {
      await this.run(
        (client) => client.issues.doTransition({ issueIdOrKey, transition: { id: transitionId } }),
        (client) => client.issues.doTransition({ issueIdOrKey, transition: { id: transitionId } }),
      );
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: jiraErrorMessage(err) };
    }
  }

  /** `assignee` is an accountId on Jira Cloud, a username on Jira Server/Data Center — pass
   * whichever identifier matches the credential's flavor. */
  async assignIssue(issueIdOrKey: string, assignee: string): Promise<JiraOpResult> {
    try {
      await this.run(
        (client) => client.issues.assignIssue({ issueIdOrKey, accountId: assignee }),
        (client) => client.issues.assignIssue({ issueIdOrKey, accountId: null, name: assignee }),
      );
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: jiraErrorMessage(err) };
    }
  }

  async listProjects(): Promise<JiraListProjectsResult> {
    try {
      const res = await this.run(
        (client) => client.projects.searchProjects(),
        (client) => client.projects.searchProjects(),
      );
      const projects = (res.values ?? []).map((project) => ({ id: project.id ?? "", key: project.key ?? "", name: project.name ?? "" }));
      return { success: true, projects, error: "" };
    } catch (err) {
      return { success: false, projects: [], error: jiraErrorMessage(err) };
    }
  }

  async getProject(projectIdOrKey: string): Promise<JiraGetProjectResult> {
    try {
      const res = await this.run(
        (client) => client.projects.getProject({ projectIdOrKey }),
        (client) => client.projects.getProject({ projectIdOrKey }),
      );
      return { success: true, project: { id: res.id ?? "", key: res.key ?? "", name: res.name ?? "" }, error: "" };
    } catch (err) {
      return { success: false, project: { id: "", key: "", name: "" }, error: jiraErrorMessage(err) };
    }
  }

  async addWorklog(issueIdOrKey: string, timeSpent: string, comment: string): Promise<JiraAddWorklogResult> {
    try {
      const res = await this.run(
        (client) => client.issueWorklogs.addWorklog({ issueIdOrKey, timeSpent, comment: comment ? (this.richText(comment) as never) : undefined }),
        (client) => client.issueWorklogs.addWorklog({ issueIdOrKey, timeSpent, comment: comment ? (this.richText(comment) as never) : undefined }),
      );
      return { success: true, id: res.id ?? "", error: "" };
    } catch (err) {
      return { success: false, id: "", error: jiraErrorMessage(err) };
    }
  }

  async linkIssues(inwardIssueKey: string, outwardIssueKey: string, linkTypeName: string): Promise<JiraOpResult> {
    try {
      await this.run(
        (client) => client.issueLinks.linkIssues({ type: { name: linkTypeName }, inwardIssue: { key: inwardIssueKey }, outwardIssue: { key: outwardIssueKey } }),
        (client) => client.issueLinks.linkIssues({ type: { name: linkTypeName }, inwardIssue: { key: inwardIssueKey }, outwardIssue: { key: outwardIssueKey } }),
      );
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: jiraErrorMessage(err) };
    }
  }

  /** `accountId` resolves a user on Jira Cloud, `username` (or `key`) on Jira Server/Data Center —
   * only the identifier matching the credential's flavor needs to be provided. */
  async getUser(accountId: string, username: string): Promise<JiraGetUserResult> {
    try {
      const res = await this.run(
        (client) => client.users.getUser({ accountId: accountId || undefined }),
        // jira.js 5.x's Version2 `GetUser` type dropped `username` (Cloud-only type now), but Jira
        // Server/Data Center's real v2 REST API still accepts it.
        (client) => client.users.getUser({ username: username || undefined } as never),
      );
      return {
        success: true,
        user: { accountId: res.accountId ?? "", username: res.name ?? "", displayName: res.displayName ?? "", emailAddress: res.emailAddress ?? "" },
        error: "",
      };
    } catch (err) {
      return { success: false, user: { accountId: "", username: "", displayName: "", emailAddress: "" }, error: jiraErrorMessage(err) };
    }
  }

  async findUsers(query: string, maxResults: number): Promise<JiraFindUsersResult> {
    try {
      const res = await this.run(
        (client) => client.userSearch.findUsers({ query, maxResults }),
        (client) => client.userSearch.findUsers({ query, maxResults }),
      );
      const users = (res ?? []).map((user) => ({
        accountId: user.accountId ?? "",
        username: user.name ?? "",
        displayName: user.displayName ?? "",
        emailAddress: user.emailAddress ?? "",
      }));
      return { success: true, users, error: "" };
    } catch (err) {
      return { success: false, users: [], error: jiraErrorMessage(err) };
    }
  }
}
