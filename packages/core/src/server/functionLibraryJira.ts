import { JiraManager, type JiraAuth } from "../lib/jiraManager.ts";

/** Compile-time-only counterpart of nodes/jira.ts's execute() vault lookup (resolveJiraCredential)
 * — the compiled/deployed script has no access to the Credential Vault database, only the
 * interpreter does, so it reads the same credential's fields from environment variables instead,
 * keyed by the `_CREDENTIAL_TYPE` suffix credentialEnv.ts's applyCredentialEnvVars also writes
 * (Jira, unlike oauth2Saml's single shape, has three differently-shaped credential kinds, so the
 * type itself must be read back too, not just its fields). Never called by the interpreter —
 * genuinely different credential-sourcing behavior, not duplicated logic.
 *
 * Kept in its own file, separate from functionLibrary.ts, purely to mirror functionLibrarySftp.ts's
 * one-node-family-per-file convention rather than growing that file's Jira section indefinitely —
 * unlike sftp's, this module has no special non-interpreter-safe dependency of its own. */
export function jiraCredentialFromEnv(name: string): { ok: true; auth: JiraAuth } | { ok: false; error: string } {
  const prefix = `HERMIONE_CRED_${String(name)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")}`;
  const type = process.env[`${prefix}_CREDENTIAL_TYPE`];
  const url = process.env[`${prefix}_URL`] || "";
  if (type === "jiraCloudApiToken") {
    return { ok: true, auth: { kind: "cloud", url, email: process.env[`${prefix}_EMAIL`] || "", apiToken: process.env[`${prefix}_API_TOKEN`] || "" } };
  }
  if (type === "jiraServerPersonalAccessToken") {
    return { ok: true, auth: { kind: "serverPat", url, personalAccessToken: process.env[`${prefix}_PERSONAL_ACCESS_TOKEN`] || "" } };
  }
  if (type === "jiraServerBasicAuth") {
    return { ok: true, auth: { kind: "serverBasic", url, username: process.env[`${prefix}_USERNAME`] || "", password: process.env[`${prefix}_PASSWORD`] || "" } };
  }
  return { ok: false, error: `Credential "${name}" not found in the vault, or is not a Jira Cloud/Server credential` };
}

export async function jiraCreateIssue(credentialName: string, projectKey: string, issueTypeName: string, summary: string, description: string) {
  const cred = jiraCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, id: "", key: "", url: "", error: cred.error };
  return JiraManager.forAuth(cred.auth).createIssue(projectKey, issueTypeName, summary, description);
}

export async function jiraGetIssue(credentialName: string, issueIdOrKey: string) {
  const cred = jiraCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, issue: { id: "", key: "", summary: "", status: "", issueType: "", url: "" }, error: cred.error };
  return JiraManager.forAuth(cred.auth).getIssue(issueIdOrKey);
}

export async function jiraUpdateIssue(credentialName: string, issueIdOrKey: string, summary: string, description: string) {
  const cred = jiraCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return JiraManager.forAuth(cred.auth).updateIssue(issueIdOrKey, summary, description);
}

export async function jiraDeleteIssue(credentialName: string, issueIdOrKey: string) {
  const cred = jiraCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return JiraManager.forAuth(cred.auth).deleteIssue(issueIdOrKey);
}

export async function jiraSearchIssues(credentialName: string, jql: string, maxResults: number, validateQuery: "strict" | "warn" | "none") {
  const cred = jiraCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, issues: [], total: 0, error: cred.error };
  return JiraManager.forAuth(cred.auth).searchIssues(jql, maxResults, validateQuery);
}

export async function jiraAddComment(credentialName: string, issueIdOrKey: string, body: string) {
  const cred = jiraCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, id: "", error: cred.error };
  return JiraManager.forAuth(cred.auth).addComment(issueIdOrKey, body);
}

export async function jiraListComments(credentialName: string, issueIdOrKey: string) {
  const cred = jiraCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, comments: [], error: cred.error };
  return JiraManager.forAuth(cred.auth).listComments(issueIdOrKey);
}

export async function jiraListTransitions(credentialName: string, issueIdOrKey: string) {
  const cred = jiraCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, transitions: [], error: cred.error };
  return JiraManager.forAuth(cred.auth).listTransitions(issueIdOrKey);
}

export async function jiraTransitionIssue(credentialName: string, issueIdOrKey: string, transitionId: string) {
  const cred = jiraCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return JiraManager.forAuth(cred.auth).transitionIssue(issueIdOrKey, transitionId);
}

export async function jiraAssignIssue(credentialName: string, issueIdOrKey: string, assignee: string) {
  const cred = jiraCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return JiraManager.forAuth(cred.auth).assignIssue(issueIdOrKey, assignee);
}

export async function jiraListProjects(credentialName: string) {
  const cred = jiraCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, projects: [], error: cred.error };
  return JiraManager.forAuth(cred.auth).listProjects();
}

export async function jiraGetProject(credentialName: string, projectIdOrKey: string) {
  const cred = jiraCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, project: { id: "", key: "", name: "" }, error: cred.error };
  return JiraManager.forAuth(cred.auth).getProject(projectIdOrKey);
}

export async function jiraAddWorklog(credentialName: string, issueIdOrKey: string, timeSpent: string, comment: string) {
  const cred = jiraCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, id: "", error: cred.error };
  return JiraManager.forAuth(cred.auth).addWorklog(issueIdOrKey, timeSpent, comment);
}

export async function jiraLinkIssues(credentialName: string, inwardIssueKey: string, outwardIssueKey: string, linkTypeName: string) {
  const cred = jiraCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return JiraManager.forAuth(cred.auth).linkIssues(inwardIssueKey, outwardIssueKey, linkTypeName);
}

export async function jiraGetUser(credentialName: string, accountId: string, username: string) {
  const cred = jiraCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, user: { accountId: "", username: "", displayName: "", emailAddress: "" }, error: cred.error };
  return JiraManager.forAuth(cred.auth).getUser(accountId, username);
}

export async function jiraFindUsers(credentialName: string, query: string, maxResults: number) {
  const cred = jiraCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, users: [], error: cred.error };
  return JiraManager.forAuth(cred.auth).findUsers(query, maxResults);
}
