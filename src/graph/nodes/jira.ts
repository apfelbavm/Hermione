import { NodeColorCategory, type ExecutionContext } from "../engine/types";
import { registerNode } from "../engine/registry";
import { JiraManager, type JiraAuth } from "../../lib/jiraManager";
import type { JiraCloudApiTokenCredentialData, JiraServerPersonalAccessTokenCredentialData, JiraServerBasicAuthCredentialData } from "../../credentials/types";
import { JIRA_ISSUE_STRUCT_TYPE, JIRA_COMMENT_STRUCT_TYPE, JIRA_TRANSITION_STRUCT_TYPE, JIRA_PROJECT_STRUCT_TYPE, JIRA_USER_STRUCT_TYPE } from "../structs/jira";
import { JIRA_VALIDATE_QUERY_ENUM_TYPE } from "../enum/jira";
import { enumOptionIds } from "../engine/enumRegistry";
import { i18n } from "@i18n";

// Every operation below is a thin pin-wiring shim over JiraManager (src/lib/jiraManager.ts), which
// owns the actual jira.js SDK calls and error normalization — this file only ever translates pins
// to method arguments and method results back to pins.
//
// Jira Cloud and Jira Server/Data Center share this single node group rather than being split into
// two: every operation here (issues, comments, transitions, worklogs, projects, users) behaves
// identically on both REST APIs once JiraManager has picked the right client/auth for the
// credential — see the comment atop jiraManager.ts for the full reasoning.
const GROUP_NAME = "Request.Jira";

function credentialNamePin() {
  return {
    id: "credentialName",
    label: i18n.nodes.jira.__shared.pin_credential_name,
    type: "string" as const,
    direction: "input" as const,
    defaultValue: "",
  };
}

function issueKeyPin(id = "issueKey") {
  return {
    id,
    label: i18n.nodes.jira.__shared.pin_issue_key,
    type: "string" as const,
    direction: "input" as const,
    defaultValue: "",
  };
}

/** Shared by every Jira node — looks up a named Credential Vault entry and turns whichever Jira
 * credential type it is (Cloud API token, Server PAT, Server Basic) into the JiraAuth shape
 * JiraManager's constructor expects. */
function resolveJiraCredential(ctx: ExecutionContext, credentialName: string): { ok: true; auth: JiraAuth } | { ok: false; error: string } {
  const credential = ctx.getCredential?.(credentialName);
  if (!credential)
    return {
      ok: false,
      error: `Credential "${credentialName}" not found in the vault`,
    };
  if (credential.type === "jiraCloudApiToken") {
    const data = credential.data as JiraCloudApiTokenCredentialData;
    return { ok: true, auth: { kind: "cloud", url: data.url, email: data.email, apiToken: data.apiToken } };
  }
  if (credential.type === "jiraServerPersonalAccessToken") {
    const data = credential.data as JiraServerPersonalAccessTokenCredentialData;
    return { ok: true, auth: { kind: "serverPat", url: data.url, personalAccessToken: data.personalAccessToken } };
  }
  if (credential.type === "jiraServerBasicAuth") {
    const data = credential.data as JiraServerBasicAuthCredentialData;
    return { ok: true, auth: { kind: "serverBasic", url: data.url, username: data.username, password: data.password } };
  }
  return {
    ok: false,
    error: `Credential "${credentialName}" is not a Jira Cloud or Jira Server/Data Center credential`,
  };
}

function execInOutPins() {
  return {
    execIn: { id: "exec-in", label: "", type: "exec" as const, direction: "input" as const },
    execOut: { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec" as const, direction: "output" as const },
    success: { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean" as const, direction: "output" as const },
    error: { id: "error", label: i18n.nodes.__shared.pin_error, type: "string" as const, direction: "output" as const },
  };
}

const emptyIssue = { id: "", key: "", summary: "", status: "", issueType: "", url: "" };
const emptyProject = { id: "", key: "", name: "" };
const emptyUser = { accountId: "", username: "", displayName: "", emailAddress: "" };

registerNode({
  type: "jira.createIssue",
  label: i18n.nodes.jira.createIssue.label,
  description: i18n.nodes.jira.createIssue.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    { id: "projectKey", label: i18n.nodes.jira.createIssue.pin_project_key, type: "string", direction: "input", defaultValue: "" },
    { id: "issueType", label: i18n.nodes.jira.createIssue.pin_issue_type, type: "string", direction: "input", defaultValue: "Task" },
    { id: "summary", label: i18n.nodes.jira.createIssue.pin_summary, type: "string", direction: "input", defaultValue: "" },
    { id: "description", label: i18n.nodes.jira.createIssue.pin_description, type: "string", direction: "input", defaultValue: "" },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "id", label: i18n.nodes.jira.createIssue.pin_id, type: "string", direction: "output" },
    { id: "key", label: i18n.nodes.jira.createIssue.pin_key, type: "string", direction: "output" },
    { id: "url", label: i18n.nodes.jira.createIssue.pin_url, type: "string", direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveJiraCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, id: "", key: "", url: "", error: resolved.error } };
    const manager = JiraManager.forAuth(resolved.auth);
    const result = await manager.createIssue(String(inputs.projectKey ?? ""), String(inputs.issueType ?? ""), String(inputs.summary ?? ""), String(inputs.description ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "jira.getIssue",
  label: i18n.nodes.jira.getIssue.label,
  description: i18n.nodes.jira.getIssue.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInOutPins().execIn, credentialNamePin(), issueKeyPin(), execInOutPins().execOut, execInOutPins().success, { id: "issue", label: i18n.nodes.jira.getIssue.pin_issue, type: "struct", subType: JIRA_ISSUE_STRUCT_TYPE, direction: "output" }, execInOutPins().error],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveJiraCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, issue: emptyIssue, error: resolved.error } };
    const manager = JiraManager.forAuth(resolved.auth);
    const result = await manager.getIssue(String(inputs.issueKey ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "jira.updateIssue",
  label: i18n.nodes.jira.updateIssue.label,
  description: i18n.nodes.jira.updateIssue.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    issueKeyPin(),
    { id: "summary", label: i18n.nodes.jira.updateIssue.pin_summary, type: "string", direction: "input", defaultValue: "" },
    { id: "description", label: i18n.nodes.jira.updateIssue.pin_description, type: "string", direction: "input", defaultValue: "" },
    execInOutPins().execOut,
    execInOutPins().success,
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveJiraCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const manager = JiraManager.forAuth(resolved.auth);
    const result = await manager.updateIssue(String(inputs.issueKey ?? ""), String(inputs.summary ?? ""), String(inputs.description ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "jira.deleteIssue",
  label: i18n.nodes.jira.deleteIssue.label,
  description: i18n.nodes.jira.deleteIssue.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInOutPins().execIn, credentialNamePin(), issueKeyPin(), execInOutPins().execOut, execInOutPins().success, execInOutPins().error],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveJiraCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const manager = JiraManager.forAuth(resolved.auth);
    const result = await manager.deleteIssue(String(inputs.issueKey ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "jira.searchIssues",
  label: i18n.nodes.jira.searchIssues.label,
  description: i18n.nodes.jira.searchIssues.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    { id: "jql", label: i18n.nodes.jira.searchIssues.pin_jql, type: "string", direction: "input", defaultValue: "" },
    { id: "maxResults", label: i18n.nodes.jira.searchIssues.pin_max_results, type: "number", direction: "input", defaultValue: 50 },
    { id: "validateQuery", label: i18n.nodes.jira.searchIssues.pin_validate_query, type: "enum", subType: JIRA_VALIDATE_QUERY_ENUM_TYPE, direction: "input", defaultValue: "warn", options: enumOptionIds(JIRA_VALIDATE_QUERY_ENUM_TYPE) },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "issues", label: i18n.nodes.jira.searchIssues.pin_issues, type: "struct", subType: JIRA_ISSUE_STRUCT_TYPE, container: "array", direction: "output" },
    { id: "total", label: i18n.nodes.jira.searchIssues.pin_total, type: "number", direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveJiraCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, issues: [], total: 0, error: resolved.error } };
    const manager = JiraManager.forAuth(resolved.auth);
    const result = await manager.searchIssues(String(inputs.jql ?? ""), Number(inputs.maxResults ?? 50), (inputs.validateQuery as "strict" | "warn" | "none") ?? "warn");
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "jira.addComment",
  label: i18n.nodes.jira.addComment.label,
  description: i18n.nodes.jira.addComment.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    issueKeyPin(),
    { id: "body", label: i18n.nodes.jira.addComment.pin_body, type: "string", direction: "input", defaultValue: "" },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "id", label: i18n.nodes.jira.addComment.pin_id, type: "string", direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveJiraCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, id: "", error: resolved.error } };
    const manager = JiraManager.forAuth(resolved.auth);
    const result = await manager.addComment(String(inputs.issueKey ?? ""), String(inputs.body ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "jira.listComments",
  label: i18n.nodes.jira.listComments.label,
  description: i18n.nodes.jira.listComments.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    issueKeyPin(),
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "comments", label: i18n.nodes.jira.listComments.pin_comments, type: "struct", subType: JIRA_COMMENT_STRUCT_TYPE, container: "array", direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveJiraCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, comments: [], error: resolved.error } };
    const manager = JiraManager.forAuth(resolved.auth);
    const result = await manager.listComments(String(inputs.issueKey ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "jira.listTransitions",
  label: i18n.nodes.jira.listTransitions.label,
  description: i18n.nodes.jira.listTransitions.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    issueKeyPin(),
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "transitions", label: i18n.nodes.jira.listTransitions.pin_transitions, type: "struct", subType: JIRA_TRANSITION_STRUCT_TYPE, container: "array", direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveJiraCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, transitions: [], error: resolved.error } };
    const manager = JiraManager.forAuth(resolved.auth);
    const result = await manager.listTransitions(String(inputs.issueKey ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "jira.transitionIssue",
  label: i18n.nodes.jira.transitionIssue.label,
  description: i18n.nodes.jira.transitionIssue.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInOutPins().execIn, credentialNamePin(), issueKeyPin(), { id: "transitionId", label: i18n.nodes.jira.transitionIssue.pin_transition_id, type: "string", direction: "input", defaultValue: "" }, execInOutPins().execOut, execInOutPins().success, execInOutPins().error],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveJiraCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const manager = JiraManager.forAuth(resolved.auth);
    const result = await manager.transitionIssue(String(inputs.issueKey ?? ""), String(inputs.transitionId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "jira.assignIssue",
  label: i18n.nodes.jira.assignIssue.label,
  description: i18n.nodes.jira.assignIssue.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInOutPins().execIn, credentialNamePin(), issueKeyPin(), { id: "assignee", label: i18n.nodes.jira.assignIssue.pin_assignee, type: "string", direction: "input", defaultValue: "" }, execInOutPins().execOut, execInOutPins().success, execInOutPins().error],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveJiraCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const manager = JiraManager.forAuth(resolved.auth);
    const result = await manager.assignIssue(String(inputs.issueKey ?? ""), String(inputs.assignee ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "jira.listProjects",
  label: i18n.nodes.jira.listProjects.label,
  description: i18n.nodes.jira.listProjects.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInOutPins().execIn, credentialNamePin(), execInOutPins().execOut, execInOutPins().success, { id: "projects", label: i18n.nodes.jira.listProjects.pin_projects, type: "struct", subType: JIRA_PROJECT_STRUCT_TYPE, container: "array", direction: "output" }, execInOutPins().error],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveJiraCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, projects: [], error: resolved.error } };
    const manager = JiraManager.forAuth(resolved.auth);
    const result = await manager.listProjects();
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "jira.getProject",
  label: i18n.nodes.jira.getProject.label,
  description: i18n.nodes.jira.getProject.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    { id: "projectKey", label: i18n.nodes.jira.getProject.pin_project_key, type: "string", direction: "input", defaultValue: "" },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "project", label: i18n.nodes.jira.getProject.pin_project, type: "struct", subType: JIRA_PROJECT_STRUCT_TYPE, direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveJiraCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, project: emptyProject, error: resolved.error } };
    const manager = JiraManager.forAuth(resolved.auth);
    const result = await manager.getProject(String(inputs.projectKey ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "jira.addWorklog",
  label: i18n.nodes.jira.addWorklog.label,
  description: i18n.nodes.jira.addWorklog.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    issueKeyPin(),
    { id: "timeSpent", label: i18n.nodes.jira.addWorklog.pin_time_spent, type: "string", direction: "input", defaultValue: "1h" },
    { id: "comment", label: i18n.nodes.jira.addWorklog.pin_comment, type: "string", direction: "input", defaultValue: "" },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "id", label: i18n.nodes.jira.addWorklog.pin_id, type: "string", direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveJiraCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, id: "", error: resolved.error } };
    const manager = JiraManager.forAuth(resolved.auth);
    const result = await manager.addWorklog(String(inputs.issueKey ?? ""), String(inputs.timeSpent ?? ""), String(inputs.comment ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "jira.linkIssues",
  label: i18n.nodes.jira.linkIssues.label,
  description: i18n.nodes.jira.linkIssues.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    issueKeyPin("inwardIssueKey"),
    issueKeyPin("outwardIssueKey"),
    { id: "linkType", label: i18n.nodes.jira.linkIssues.pin_link_type, type: "string", direction: "input", defaultValue: "Relates" },
    execInOutPins().execOut,
    execInOutPins().success,
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveJiraCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const manager = JiraManager.forAuth(resolved.auth);
    const result = await manager.linkIssues(String(inputs.inwardIssueKey ?? ""), String(inputs.outwardIssueKey ?? ""), String(inputs.linkType ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "jira.getUser",
  label: i18n.nodes.jira.getUser.label,
  description: i18n.nodes.jira.getUser.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    { id: "accountId", label: i18n.nodes.jira.getUser.pin_account_id, type: "string", direction: "input", defaultValue: "" },
    { id: "username", label: i18n.nodes.jira.getUser.pin_username, type: "string", direction: "input", defaultValue: "" },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "user", label: i18n.nodes.jira.getUser.pin_user, type: "struct", subType: JIRA_USER_STRUCT_TYPE, direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveJiraCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, user: emptyUser, error: resolved.error } };
    const manager = JiraManager.forAuth(resolved.auth);
    const result = await manager.getUser(String(inputs.accountId ?? ""), String(inputs.username ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
});

registerNode({
  type: "jira.findUsers",
  label: i18n.nodes.jira.findUsers.label,
  description: i18n.nodes.jira.findUsers.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    { id: "query", label: i18n.nodes.jira.findUsers.pin_query, type: "string", direction: "input", defaultValue: "" },
    { id: "maxResults", label: i18n.nodes.jira.findUsers.pin_max_results, type: "number", direction: "input", defaultValue: 50 },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "users", label: i18n.nodes.jira.findUsers.pin_users, type: "struct", subType: JIRA_USER_STRUCT_TYPE, container: "array", direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveJiraCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, users: [], error: resolved.error } };
    const manager = JiraManager.forAuth(resolved.auth);
    const result = await manager.findUsers(String(inputs.query ?? ""), Number(inputs.maxResults ?? 50));
    return { nextExec: "exec-out", outputs: result };
  },
});
