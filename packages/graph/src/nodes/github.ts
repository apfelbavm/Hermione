import { NodeColorCategory } from "@hermione/graph/engine/types";
import { registerNode } from "@hermione/graph/engine/registry";
import { compileResultVar, GITHUB_MANAGER_IMPORT } from "@hermione/graph/engine/compileUtils";
import { ISSUE_STRUCT_TYPE, PULL_REQUEST_STRUCT_TYPE, CREATE_RESULT_STRUCT_TYPE, MERGE_RESULT_STRUCT_TYPE, FILE_CONTENT_STRUCT_TYPE, FILE_WRITE_RESULT_STRUCT_TYPE } from "@hermione/graph/structs/github";
import { GITHUB_STATE_ENUM_TYPE, GITHUB_MERGE_METHOD_ENUM_TYPE } from "@hermione/graph/enum/github";
import { enumOptionIds } from "@hermione/graph/engine/enumRegistry";
import { i18n } from "@i18n";

// Every operation below calls the exact same GithubManager static method (packages/core/src/lib/
// githubManager.ts) from both execute() (interpreter path) and compileExecute() (compiled/deployed
// path) — GithubManager resolves the named credential straight from the database itself (see its
// findCredential), so unlike the old two-layer split there is no separate functionLibraryGithub.ts
// env-var-reading layer and no ctx.getCredential vault lookup here: both paths are already identical.
//
// GithubManager now reaches the database directly (see its own header comment), which pulls in
// better-sqlite3 and Node builtins — fine for execute(), which only ever runs server-side, but this
// file is still statically imported client-side too (for the node-creation menu), so a plain
// top-level import here would drag that whole chain into the browser bundle. Loaded with a runtime
// `import()` instead, ignored by both bundlers, so it's never even resolved for the client build;
// only ever actually called server-side, where it resolves normally.
async function loadGithubManager(): Promise<typeof import("@hermione/core/lib/githubManager").GithubManager> {
  const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "@hermione/core/lib/githubManager");
  return mod.GithubManager;
}

const GROUP_NAME = "Request.GitHub";

function credentialNamePin() {
  return {
    id: "credentialName",
    label: i18n.nodes.github.__shared.pin_credential_name,
    type: "string" as const,
    direction: "input" as const,
    defaultValue: "",
  };
}

function repoPins() {
  return [
    {
      id: "owner",
      label: i18n.nodes.github.__shared.pin_owner,
      type: "string" as const,
      direction: "input" as const,
      defaultValue: "",
    },
    {
      id: "repo",
      label: i18n.nodes.github.__shared.pin_repo,
      type: "string" as const,
      direction: "input" as const,
      defaultValue: "",
    },
  ];
}

function execInOutPins() {
  return {
    execIn: {
      id: "exec-in",
      label: "",
      type: "exec" as const,
      direction: "input" as const,
    },
    execOut: {
      id: "exec-out",
      label: i18n.nodes.__shared.pin_completed,
      type: "exec" as const,
      direction: "output" as const,
    },
    success: {
      id: "success",
      label: i18n.nodes.__shared.pin_success,
      type: "boolean" as const,
      direction: "output" as const,
    },
    error: {
      id: "error",
      label: i18n.nodes.__shared.pin_error,
      type: "string" as const,
      direction: "output" as const,
    },
  };
}

registerNode({
  type: "github.listIssues",
  label: i18n.nodes.github.listIssues.label,
  description: i18n.nodes.github.listIssues.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    ...repoPins(),
    { id: "state", label: i18n.nodes.github.__shared.pin_state, type: "enum", subType: GITHUB_STATE_ENUM_TYPE, direction: "input", defaultValue: "open", options: enumOptionIds(GITHUB_STATE_ENUM_TYPE) },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "issues", label: i18n.nodes.github.listIssues.pin_issues, type: "struct", subType: ISSUE_STRUCT_TYPE, container: "array", direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadGithubManager()).listIssues(String(inputs.credentialName ?? ""), String(inputs.owner ?? ""), String(inputs.repo ?? ""), (inputs.state as "open" | "closed" | "all") ?? "open");
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GithubManager.listIssues(${inputs.credentialName}, ${inputs.owner}, ${inputs.repo}, ${inputs.state});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, issues: `${v}.issues`, error: `${v}.error` };
  },
  compileImports: [GITHUB_MANAGER_IMPORT],
});

registerNode({
  type: "github.createIssue",
  label: i18n.nodes.github.createIssue.label,
  description: i18n.nodes.github.createIssue.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    ...repoPins(),
    { id: "title", label: i18n.nodes.github.__shared.pin_title, type: "string", direction: "input", defaultValue: "" },
    { id: "body", label: i18n.nodes.github.__shared.pin_body, type: "string", direction: "input", defaultValue: "" },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "result", label: i18n.nodes.github.createResult.label, type: "struct", subType: CREATE_RESULT_STRUCT_TYPE, direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadGithubManager()).createIssue(String(inputs.credentialName ?? ""), String(inputs.owner ?? ""), String(inputs.repo ?? ""), String(inputs.title ?? ""), String(inputs.body ?? ""));
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        result: { number: result.number, url: result.url },
        error: result.error,
      },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GithubManager.createIssue(${inputs.credentialName}, ${inputs.owner}, ${inputs.repo}, ${inputs.title}, ${inputs.body});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, result: `{ number: ${v}.number, url: ${v}.url }`, error: `${v}.error` };
  },
  compileImports: [GITHUB_MANAGER_IMPORT],
});

registerNode({
  type: "github.commentOnIssue",
  label: i18n.nodes.github.commentOnIssue.label,
  description: i18n.nodes.github.commentOnIssue.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    ...repoPins(),
    { id: "issueNumber", label: i18n.nodes.github.__shared.pin_issue_number, type: "number", direction: "input", defaultValue: 0, integer: true },
    { id: "body", label: i18n.nodes.github.__shared.pin_body, type: "string", direction: "input", defaultValue: "" },
    execInOutPins().execOut,
    execInOutPins().success,
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadGithubManager()).commentOnIssue(String(inputs.credentialName ?? ""), String(inputs.owner ?? ""), String(inputs.repo ?? ""), Number(inputs.issueNumber ?? 0), String(inputs.body ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GithubManager.commentOnIssue(${inputs.credentialName}, ${inputs.owner}, ${inputs.repo}, ${inputs.issueNumber}, ${inputs.body});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [GITHUB_MANAGER_IMPORT],
});

registerNode({
  type: "github.listPullRequests",
  label: i18n.nodes.github.listPullRequests.label,
  description: i18n.nodes.github.listPullRequests.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    ...repoPins(),
    { id: "state", label: i18n.nodes.github.__shared.pin_state, type: "enum", subType: GITHUB_STATE_ENUM_TYPE, direction: "input", defaultValue: "open", options: enumOptionIds(GITHUB_STATE_ENUM_TYPE) },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "pullRequests", label: i18n.nodes.github.listPullRequests.pin_pull_requests, type: "struct", subType: PULL_REQUEST_STRUCT_TYPE, container: "array", direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadGithubManager()).listPullRequests(String(inputs.credentialName ?? ""), String(inputs.owner ?? ""), String(inputs.repo ?? ""), (inputs.state as "open" | "closed" | "all") ?? "open");
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GithubManager.listPullRequests(${inputs.credentialName}, ${inputs.owner}, ${inputs.repo}, ${inputs.state});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, pullRequests: `${v}.pullRequests`, error: `${v}.error` };
  },
  compileImports: [GITHUB_MANAGER_IMPORT],
});

registerNode({
  type: "github.createPullRequest",
  label: i18n.nodes.github.createPullRequest.label,
  description: i18n.nodes.github.createPullRequest.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    ...repoPins(),
    { id: "title", label: i18n.nodes.github.__shared.pin_title, type: "string", direction: "input", defaultValue: "" },
    { id: "head", label: i18n.nodes.github.createPullRequest.pin_head, type: "string", direction: "input", defaultValue: "" },
    { id: "base", label: i18n.nodes.github.createPullRequest.pin_base, type: "string", direction: "input", defaultValue: "" },
    { id: "body", label: i18n.nodes.github.__shared.pin_body, type: "string", direction: "input", defaultValue: "" },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "result", label: i18n.nodes.github.createResult.label, type: "struct", subType: CREATE_RESULT_STRUCT_TYPE, direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadGithubManager()).createPullRequest(String(inputs.credentialName ?? ""), String(inputs.owner ?? ""), String(inputs.repo ?? ""), String(inputs.title ?? ""), String(inputs.head ?? ""), String(inputs.base ?? ""), String(inputs.body ?? ""));
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        result: { number: result.number, url: result.url },
        error: result.error,
      },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GithubManager.createPullRequest(${inputs.credentialName}, ${inputs.owner}, ${inputs.repo}, ${inputs.title}, ${inputs.head}, ${inputs.base}, ${inputs.body});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, result: `{ number: ${v}.number, url: ${v}.url }`, error: `${v}.error` };
  },
  compileImports: [GITHUB_MANAGER_IMPORT],
});

registerNode({
  type: "github.mergePullRequest",
  label: i18n.nodes.github.mergePullRequest.label,
  description: i18n.nodes.github.mergePullRequest.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    ...repoPins(),
    { id: "pullNumber", label: i18n.nodes.github.mergePullRequest.pin_pull_number, type: "number", direction: "input", defaultValue: 0, integer: true },
    { id: "mergeMethod", label: i18n.nodes.github.mergePullRequest.pin_merge_method, type: "enum", subType: GITHUB_MERGE_METHOD_ENUM_TYPE, direction: "input", defaultValue: "merge", options: enumOptionIds(GITHUB_MERGE_METHOD_ENUM_TYPE) },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "result", label: i18n.nodes.github.mergeResult.label, type: "struct", subType: MERGE_RESULT_STRUCT_TYPE, direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadGithubManager()).mergePullRequest(String(inputs.credentialName ?? ""), String(inputs.owner ?? ""), String(inputs.repo ?? ""), Number(inputs.pullNumber ?? 0), (inputs.mergeMethod as "merge" | "squash" | "rebase") ?? "merge");
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        result: { merged: result.merged, sha: result.sha },
        error: result.error,
      },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GithubManager.mergePullRequest(${inputs.credentialName}, ${inputs.owner}, ${inputs.repo}, ${inputs.pullNumber}, ${inputs.mergeMethod});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, result: `{ merged: ${v}.merged, sha: ${v}.sha }`, error: `${v}.error` };
  },
  compileImports: [GITHUB_MANAGER_IMPORT],
});

registerNode({
  type: "github.getFileContent",
  label: i18n.nodes.github.getFileContent.label,
  description: i18n.nodes.github.getFileContent.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    ...repoPins(),
    { id: "path", label: i18n.nodes.github.__shared.pin_path, type: "string", direction: "input", defaultValue: "" },
    { id: "ref", label: i18n.nodes.github.__shared.pin_ref, type: "string", direction: "input", defaultValue: "" },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "result", label: i18n.nodes.github.fileContent.label, type: "struct", subType: FILE_CONTENT_STRUCT_TYPE, direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const ref = String(inputs.ref ?? "");
    const result = await (await loadGithubManager()).getFileContent(String(inputs.credentialName ?? ""), String(inputs.owner ?? ""), String(inputs.repo ?? ""), String(inputs.path ?? ""), ref || undefined);
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        result: { content: result.content, sha: result.sha },
        error: result.error,
      },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GithubManager.getFileContent(${inputs.credentialName}, ${inputs.owner}, ${inputs.repo}, ${inputs.path}, ${inputs.ref});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, result: `{ content: ${v}.content, sha: ${v}.sha }`, error: `${v}.error` };
  },
  compileImports: [GITHUB_MANAGER_IMPORT],
});

registerNode({
  type: "github.createOrUpdateFile",
  label: i18n.nodes.github.createOrUpdateFile.label,
  description: i18n.nodes.github.createOrUpdateFile.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    ...repoPins(),
    { id: "path", label: i18n.nodes.github.__shared.pin_path, type: "string", direction: "input", defaultValue: "" },
    { id: "content", label: i18n.nodes.github.__shared.pin_content, type: "string", direction: "input", defaultValue: "" },
    { id: "message", label: i18n.nodes.github.createOrUpdateFile.pin_message, type: "string", direction: "input", defaultValue: "" },
    { id: "branch", label: i18n.nodes.github.createOrUpdateFile.pin_branch, type: "string", direction: "input", defaultValue: "" },
    { id: "sha", label: i18n.nodes.github.__shared.pin_sha, type: "string", direction: "input", defaultValue: "" },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "result", label: i18n.nodes.github.fileWriteResult.label, type: "struct", subType: FILE_WRITE_RESULT_STRUCT_TYPE, direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const branch = String(inputs.branch ?? "");
    const sha = String(inputs.sha ?? "");
    const result = await (await loadGithubManager()).createOrUpdateFile(String(inputs.credentialName ?? ""), String(inputs.owner ?? ""), String(inputs.repo ?? ""), String(inputs.path ?? ""), String(inputs.content ?? ""), String(inputs.message ?? ""), branch || undefined, sha || undefined);
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        result: { sha: result.sha, commitSha: result.commitSha },
        error: result.error,
      },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await GithubManager.createOrUpdateFile(${inputs.credentialName}, ${inputs.owner}, ${inputs.repo}, ${inputs.path}, ${inputs.content}, ${inputs.message}, ${inputs.branch}, ${inputs.sha});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, result: `{ sha: ${v}.sha, commitSha: ${v}.commitSha }`, error: `${v}.error` };
  },
  compileImports: [GITHUB_MANAGER_IMPORT],
});

registerNode({
  type: "github.request",
  label: i18n.nodes.github.request.label,
  description: i18n.nodes.github.request.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInOutPins().execIn,
    credentialNamePin(),
    { id: "route", label: i18n.nodes.github.request.pin_route, type: "string", direction: "input", defaultValue: "GET /repos/{owner}/{repo}" },
    { id: "paramsJson", label: i18n.nodes.github.request.pin_params, type: "string", direction: "input", defaultValue: "{}" },
    execInOutPins().execOut,
    execInOutPins().success,
    { id: "data", label: i18n.nodes.__shared.pin_json, type: "object", direction: "output" },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadGithubManager()).request(String(inputs.credentialName ?? ""), String(inputs.route ?? ""), String(inputs.paramsJson ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await GithubManager.request(${inputs.credentialName}, ${inputs.route}, ${inputs.paramsJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, data: `${v}.data`, error: `${v}.error` };
  },
  compileImports: [GITHUB_MANAGER_IMPORT],
});
