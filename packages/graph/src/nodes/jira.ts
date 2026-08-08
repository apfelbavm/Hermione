import { NodeColorCategory } from "@hermione/graph/engine/types";
import { registerNode } from "@hermione/graph/engine/registry";
import { compileResultVar, JIRA_MANAGER_IMPORT } from "@hermione/graph/engine/compileUtils";
import { JIRA_ISSUE_STRUCT_TYPE, JIRA_COMMENT_STRUCT_TYPE, JIRA_TRANSITION_STRUCT_TYPE, JIRA_PROJECT_STRUCT_TYPE, JIRA_USER_STRUCT_TYPE } from "@hermione/graph/structs/jira";
import { JIRA_VALIDATE_QUERY_ENUM_TYPE } from "@hermione/graph/enum/jira";
import { enumOptionIds } from "@hermione/graph/engine/enumRegistry";
import { i18n } from "@i18n";

// Every operation below is a thin pin-wiring shim over JiraManager (src/lib/jiraManager.ts), which
// owns the actual jira.js SDK calls, credential resolution, and error normalization — this file
// only ever translates pins to method arguments and method results back to pins.
//
// Jira Cloud and Jira Server/Data Center share this single node group rather than being split into
// two: every operation here (issues, comments, transitions, worklogs, projects, users) behaves
// identically on both REST APIs once JiraManager has picked the right client/auth for the
// credential — see the comment atop jiraManager.ts for the full reasoning.
//
// Both execute() and compileExecute() call the exact same JiraManager static method — JiraManager
// resolves the named credential straight from the database itself, so there is no separate
// functionLibraryJira.ts env-var-reading layer and no ctx.getCredential vault lookup here.
const GROUP_NAME = "Request.Jira";

// JiraManager pulls in better-sqlite3/Node builtins for its DB-backed credential resolution — fine
// server-side, but this file is also statically imported client-side (node-creation menu), so a
// plain top-level import would drag that chain into the browser bundle. Loaded with a runtime
// `import()` instead, ignored by both bundlers, same as nodes/twilio.ts's loadTwilioManager.
async function loadJiraManager(): Promise<typeof import("@hermione/core/lib/jiraManager").JiraManager> {
  const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "@hermione/core/lib/jiraManager");
  return mod.JiraManager;
}

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

function execInOutPins() {
  return {
    execIn: { id: "exec-in", label: "", type: "exec" as const, direction: "input" as const },
    execOut: { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec" as const, direction: "output" as const },
    success: { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean" as const, direction: "output" as const },
    error: { id: "error", label: i18n.nodes.__shared.pin_error, type: "string" as const, direction: "output" as const },
  };
}

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
  execute: async ({ inputs }) => {
    const result = await (await loadJiraManager()).createIssue(String(inputs.credentialName ?? ""), String(inputs.projectKey ?? ""), String(inputs.issueType ?? ""), String(inputs.summary ?? ""), String(inputs.description ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await JiraManager.createIssue(${inputs.credentialName}, ${inputs.projectKey}, ${inputs.issueType}, ${inputs.summary}, ${inputs.description});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, id: `${v}.id`, key: `${v}.key`, url: `${v}.url`, error: `${v}.error` };
  },
  compileImports: [JIRA_MANAGER_IMPORT],
});

registerNode({
  type: "jira.getIssue",
  label: i18n.nodes.jira.getIssue.label,
  description: i18n.nodes.jira.getIssue.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInOutPins().execIn, credentialNamePin(), issueKeyPin(), execInOutPins().execOut, execInOutPins().success, { id: "issue", label: i18n.nodes.jira.getIssue.pin_issue, type: "struct", subType: JIRA_ISSUE_STRUCT_TYPE, direction: "output" }, execInOutPins().error],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadJiraManager()).getIssue(String(inputs.credentialName ?? ""), String(inputs.issueKey ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await JiraManager.getIssue(${inputs.credentialName}, ${inputs.issueKey});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, issue: `${v}.issue`, error: `${v}.error` };
  },
  compileImports: [JIRA_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadJiraManager()).updateIssue(String(inputs.credentialName ?? ""), String(inputs.issueKey ?? ""), String(inputs.summary ?? ""), String(inputs.description ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await JiraManager.updateIssue(${inputs.credentialName}, ${inputs.issueKey}, ${inputs.summary}, ${inputs.description});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [JIRA_MANAGER_IMPORT],
});

registerNode({
  type: "jira.deleteIssue",
  label: i18n.nodes.jira.deleteIssue.label,
  description: i18n.nodes.jira.deleteIssue.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInOutPins().execIn, credentialNamePin(), issueKeyPin(), execInOutPins().execOut, execInOutPins().success, execInOutPins().error],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadJiraManager()).deleteIssue(String(inputs.credentialName ?? ""), String(inputs.issueKey ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await JiraManager.deleteIssue(${inputs.credentialName}, ${inputs.issueKey});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [JIRA_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadJiraManager()).searchIssues(String(inputs.credentialName ?? ""), String(inputs.jql ?? ""), Number(inputs.maxResults ?? 50), (inputs.validateQuery as "strict" | "warn" | "none") ?? "warn");
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await JiraManager.searchIssues(${inputs.credentialName}, ${inputs.jql}, ${inputs.maxResults}, ${inputs.validateQuery});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, issues: `${v}.issues`, total: `${v}.total`, error: `${v}.error` };
  },
  compileImports: [JIRA_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadJiraManager()).addComment(String(inputs.credentialName ?? ""), String(inputs.issueKey ?? ""), String(inputs.body ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await JiraManager.addComment(${inputs.credentialName}, ${inputs.issueKey}, ${inputs.body});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, id: `${v}.id`, error: `${v}.error` };
  },
  compileImports: [JIRA_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadJiraManager()).listComments(String(inputs.credentialName ?? ""), String(inputs.issueKey ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await JiraManager.listComments(${inputs.credentialName}, ${inputs.issueKey});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, comments: `${v}.comments`, error: `${v}.error` };
  },
  compileImports: [JIRA_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadJiraManager()).listTransitions(String(inputs.credentialName ?? ""), String(inputs.issueKey ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await JiraManager.listTransitions(${inputs.credentialName}, ${inputs.issueKey});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, transitions: `${v}.transitions`, error: `${v}.error` };
  },
  compileImports: [JIRA_MANAGER_IMPORT],
});

registerNode({
  type: "jira.transitionIssue",
  label: i18n.nodes.jira.transitionIssue.label,
  description: i18n.nodes.jira.transitionIssue.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInOutPins().execIn, credentialNamePin(), issueKeyPin(), { id: "transitionId", label: i18n.nodes.jira.transitionIssue.pin_transition_id, type: "string", direction: "input", defaultValue: "" }, execInOutPins().execOut, execInOutPins().success, execInOutPins().error],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadJiraManager()).transitionIssue(String(inputs.credentialName ?? ""), String(inputs.issueKey ?? ""), String(inputs.transitionId ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await JiraManager.transitionIssue(${inputs.credentialName}, ${inputs.issueKey}, ${inputs.transitionId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [JIRA_MANAGER_IMPORT],
});

registerNode({
  type: "jira.assignIssue",
  label: i18n.nodes.jira.assignIssue.label,
  description: i18n.nodes.jira.assignIssue.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInOutPins().execIn, credentialNamePin(), issueKeyPin(), { id: "assignee", label: i18n.nodes.jira.assignIssue.pin_assignee, type: "string", direction: "input", defaultValue: "" }, execInOutPins().execOut, execInOutPins().success, execInOutPins().error],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadJiraManager()).assignIssue(String(inputs.credentialName ?? ""), String(inputs.issueKey ?? ""), String(inputs.assignee ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await JiraManager.assignIssue(${inputs.credentialName}, ${inputs.issueKey}, ${inputs.assignee});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [JIRA_MANAGER_IMPORT],
});

registerNode({
  type: "jira.listProjects",
  label: i18n.nodes.jira.listProjects.label,
  description: i18n.nodes.jira.listProjects.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInOutPins().execIn, credentialNamePin(), execInOutPins().execOut, execInOutPins().success, { id: "projects", label: i18n.nodes.jira.listProjects.pin_projects, type: "struct", subType: JIRA_PROJECT_STRUCT_TYPE, container: "array", direction: "output" }, execInOutPins().error],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadJiraManager()).listProjects(String(inputs.credentialName ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await JiraManager.listProjects(${inputs.credentialName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, projects: `${v}.projects`, error: `${v}.error` };
  },
  compileImports: [JIRA_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadJiraManager()).getProject(String(inputs.credentialName ?? ""), String(inputs.projectKey ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await JiraManager.getProject(${inputs.credentialName}, ${inputs.projectKey});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, project: `${v}.project`, error: `${v}.error` };
  },
  compileImports: [JIRA_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadJiraManager()).addWorklog(String(inputs.credentialName ?? ""), String(inputs.issueKey ?? ""), String(inputs.timeSpent ?? ""), String(inputs.comment ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await JiraManager.addWorklog(${inputs.credentialName}, ${inputs.issueKey}, ${inputs.timeSpent}, ${inputs.comment});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, id: `${v}.id`, error: `${v}.error` };
  },
  compileImports: [JIRA_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadJiraManager()).linkIssues(String(inputs.credentialName ?? ""), String(inputs.inwardIssueKey ?? ""), String(inputs.outwardIssueKey ?? ""), String(inputs.linkType ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await JiraManager.linkIssues(${inputs.credentialName}, ${inputs.inwardIssueKey}, ${inputs.outwardIssueKey}, ${inputs.linkType});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [JIRA_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadJiraManager()).getUser(String(inputs.credentialName ?? ""), String(inputs.accountId ?? ""), String(inputs.username ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await JiraManager.getUser(${inputs.credentialName}, ${inputs.accountId}, ${inputs.username});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, user: `${v}.user`, error: `${v}.error` };
  },
  compileImports: [JIRA_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadJiraManager()).findUsers(String(inputs.credentialName ?? ""), String(inputs.query ?? ""), Number(inputs.maxResults ?? 50));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await JiraManager.findUsers(${inputs.credentialName}, ${inputs.query}, ${inputs.maxResults});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, users: `${v}.users`, error: `${v}.error` };
  },
  compileImports: [JIRA_MANAGER_IMPORT],
});
