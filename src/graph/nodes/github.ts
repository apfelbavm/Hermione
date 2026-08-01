import { NodeColorCategory, type ExecutionContext } from "../../engine/types";
import { registerNode } from "../../engine/registry";
import { GithubManager, type GithubAuth } from "../../lib/githubManager";
import type {
  GithubTokenCredentialData,
  GithubAppCredentialData,
} from "../../credentials/types";
import {
  ISSUE_STRUCT_TYPE,
  PULL_REQUEST_STRUCT_TYPE,
  CREATE_RESULT_STRUCT_TYPE,
  MERGE_RESULT_STRUCT_TYPE,
  FILE_CONTENT_STRUCT_TYPE,
  FILE_WRITE_RESULT_STRUCT_TYPE,
} from "../structs/github";
import { i18n } from "@i18n";

// Every operation below is a thin pin-wiring shim over GithubManager (src/lib/githubManager.ts),
// which owns the actual SDK calls and error normalization — this file only ever translates pins to
// method arguments and method results back to pins. Interpreter-only for now (no compileExecute/
// compileImports), same deferral as dropbox.ts.

const STATE_OPTIONS = ["open", "closed", "all"];
const MERGE_METHOD_OPTIONS = ["merge", "squash", "rebase"];
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

/** Shared by every GitHub node — looks up a named Credential Vault entry and turns either its
 * githubToken or githubApp fields into the GithubAuth shape GithubManager's constructor expects. */
function resolveGithubCredential(
  ctx: ExecutionContext,
  credentialName: string,
): { ok: true; auth: GithubAuth } | { ok: false; error: string } {
  const credential = ctx.getCredential?.(credentialName);
  if (!credential)
    return {
      ok: false,
      error: `Credential "${credentialName}" not found in the vault`,
    };
  if (credential.type === "githubToken") {
    const data = credential.data as GithubTokenCredentialData;
    return { ok: true, auth: { token: data.token } };
  }
  if (credential.type === "githubApp") {
    const data = credential.data as GithubAppCredentialData;
    return {
      ok: true,
      auth: {
        appId: data.appId,
        privateKey: data.privateKey,
        installationId: data.installationId,
      },
    };
  }
  return {
    ok: false,
    error: `Credential "${credentialName}" is not a GitHub Token or GitHub App credential`,
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
    {
      id: "state",
      label: i18n.nodes.github.__shared.pin_state,
      type: "string",
      direction: "input",
      defaultValue: STATE_OPTIONS[0],
      options: STATE_OPTIONS,
    },
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "issues",
      label: i18n.nodes.github.listIssues.pin_issues,
      type: "struct",
      subType: ISSUE_STRUCT_TYPE,
      container: "array",
      direction: "output",
    },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGithubCredential(
      ctx,
      String(inputs.credentialName ?? ""),
    );
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: { success: false, issues: [], error: resolved.error },
      };
    const manager = GithubManager.forAuth(resolved.auth);
    const result = await manager.listIssues(
      String(inputs.owner ?? ""),
      String(inputs.repo ?? ""),
      (inputs.state as "open" | "closed" | "all") ?? "open",
    );
    return { nextExec: "exec-out", outputs: result };
  },
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
    {
      id: "title",
      label: i18n.nodes.github.__shared.pin_title,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "body",
      label: i18n.nodes.github.__shared.pin_body,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "result",
      label: i18n.nodes.github.createResult.label,
      type: "struct",
      subType: CREATE_RESULT_STRUCT_TYPE,
      direction: "output",
    },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGithubCredential(
      ctx,
      String(inputs.credentialName ?? ""),
    );
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: {
          success: false,
          result: { number: 0, url: "" },
          error: resolved.error,
        },
      };
    const manager = GithubManager.forAuth(resolved.auth);
    const result = await manager.createIssue(
      String(inputs.owner ?? ""),
      String(inputs.repo ?? ""),
      String(inputs.title ?? ""),
      String(inputs.body ?? ""),
    );
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        result: { number: result.number, url: result.url },
        error: result.error,
      },
    };
  },
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
    {
      id: "issueNumber",
      label: i18n.nodes.github.__shared.pin_issue_number,
      type: "number",
      direction: "input",
      defaultValue: 0,
      integer: true,
    },
    {
      id: "body",
      label: i18n.nodes.github.__shared.pin_body,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    execInOutPins().execOut,
    execInOutPins().success,
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGithubCredential(
      ctx,
      String(inputs.credentialName ?? ""),
    );
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: { success: false, error: resolved.error },
      };
    const manager = GithubManager.forAuth(resolved.auth);
    const result = await manager.commentOnIssue(
      String(inputs.owner ?? ""),
      String(inputs.repo ?? ""),
      Number(inputs.issueNumber ?? 0),
      String(inputs.body ?? ""),
    );
    return { nextExec: "exec-out", outputs: result };
  },
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
    {
      id: "state",
      label: i18n.nodes.github.__shared.pin_state,
      type: "string",
      direction: "input",
      defaultValue: STATE_OPTIONS[0],
      options: STATE_OPTIONS,
    },
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "pullRequests",
      label: i18n.nodes.github.listPullRequests.pin_pull_requests,
      type: "struct",
      subType: PULL_REQUEST_STRUCT_TYPE,
      container: "array",
      direction: "output",
    },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGithubCredential(
      ctx,
      String(inputs.credentialName ?? ""),
    );
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: { success: false, pullRequests: [], error: resolved.error },
      };
    const manager = GithubManager.forAuth(resolved.auth);
    const result = await manager.listPullRequests(
      String(inputs.owner ?? ""),
      String(inputs.repo ?? ""),
      (inputs.state as "open" | "closed" | "all") ?? "open",
    );
    return { nextExec: "exec-out", outputs: result };
  },
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
    {
      id: "title",
      label: i18n.nodes.github.__shared.pin_title,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "head",
      label: i18n.nodes.github.createPullRequest.pin_head,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "base",
      label: i18n.nodes.github.createPullRequest.pin_base,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "body",
      label: i18n.nodes.github.__shared.pin_body,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "result",
      label: i18n.nodes.github.createResult.label,
      type: "struct",
      subType: CREATE_RESULT_STRUCT_TYPE,
      direction: "output",
    },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGithubCredential(
      ctx,
      String(inputs.credentialName ?? ""),
    );
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: {
          success: false,
          result: { number: 0, url: "" },
          error: resolved.error,
        },
      };
    const manager = GithubManager.forAuth(resolved.auth);
    const result = await manager.createPullRequest(
      String(inputs.owner ?? ""),
      String(inputs.repo ?? ""),
      String(inputs.title ?? ""),
      String(inputs.head ?? ""),
      String(inputs.base ?? ""),
      String(inputs.body ?? ""),
    );
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        result: { number: result.number, url: result.url },
        error: result.error,
      },
    };
  },
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
    {
      id: "pullNumber",
      label: i18n.nodes.github.mergePullRequest.pin_pull_number,
      type: "number",
      direction: "input",
      defaultValue: 0,
      integer: true,
    },
    {
      id: "mergeMethod",
      label: i18n.nodes.github.mergePullRequest.pin_merge_method,
      type: "string",
      direction: "input",
      defaultValue: MERGE_METHOD_OPTIONS[0],
      options: MERGE_METHOD_OPTIONS,
    },
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "result",
      label: i18n.nodes.github.mergeResult.label,
      type: "struct",
      subType: MERGE_RESULT_STRUCT_TYPE,
      direction: "output",
    },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGithubCredential(
      ctx,
      String(inputs.credentialName ?? ""),
    );
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: {
          success: false,
          result: { merged: false, sha: "" },
          error: resolved.error,
        },
      };
    const manager = GithubManager.forAuth(resolved.auth);
    const result = await manager.mergePullRequest(
      String(inputs.owner ?? ""),
      String(inputs.repo ?? ""),
      Number(inputs.pullNumber ?? 0),
      (inputs.mergeMethod as "merge" | "squash" | "rebase") ?? "merge",
    );
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        result: { merged: result.merged, sha: result.sha },
        error: result.error,
      },
    };
  },
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
    {
      id: "path",
      label: i18n.nodes.github.__shared.pin_path,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "ref",
      label: i18n.nodes.github.__shared.pin_ref,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "result",
      label: i18n.nodes.github.fileContent.label,
      type: "struct",
      subType: FILE_CONTENT_STRUCT_TYPE,
      direction: "output",
    },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGithubCredential(
      ctx,
      String(inputs.credentialName ?? ""),
    );
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: {
          success: false,
          result: { content: "", sha: "" },
          error: resolved.error,
        },
      };
    const manager = GithubManager.forAuth(resolved.auth);
    const ref = String(inputs.ref ?? "");
    const result = await manager.getFileContent(
      String(inputs.owner ?? ""),
      String(inputs.repo ?? ""),
      String(inputs.path ?? ""),
      ref || undefined,
    );
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        result: { content: result.content, sha: result.sha },
        error: result.error,
      },
    };
  },
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
    {
      id: "path",
      label: i18n.nodes.github.__shared.pin_path,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "content",
      label: i18n.nodes.github.__shared.pin_content,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "message",
      label: i18n.nodes.github.createOrUpdateFile.pin_message,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "branch",
      label: i18n.nodes.github.createOrUpdateFile.pin_branch,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "sha",
      label: i18n.nodes.github.__shared.pin_sha,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "result",
      label: i18n.nodes.github.fileWriteResult.label,
      type: "struct",
      subType: FILE_WRITE_RESULT_STRUCT_TYPE,
      direction: "output",
    },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGithubCredential(
      ctx,
      String(inputs.credentialName ?? ""),
    );
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: {
          success: false,
          result: { sha: "", commitSha: "" },
          error: resolved.error,
        },
      };
    const manager = GithubManager.forAuth(resolved.auth);
    const branch = String(inputs.branch ?? "");
    const sha = String(inputs.sha ?? "");
    const result = await manager.createOrUpdateFile(
      String(inputs.owner ?? ""),
      String(inputs.repo ?? ""),
      String(inputs.path ?? ""),
      String(inputs.content ?? ""),
      String(inputs.message ?? ""),
      branch || undefined,
      sha || undefined,
    );
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        result: { sha: result.sha, commitSha: result.commitSha },
        error: result.error,
      },
    };
  },
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
    {
      id: "route",
      label: i18n.nodes.github.request.pin_route,
      type: "string",
      direction: "input",
      defaultValue: "GET /repos/{owner}/{repo}",
    },
    {
      id: "paramsJson",
      label: i18n.nodes.github.request.pin_params,
      type: "string",
      direction: "input",
      defaultValue: "{}",
    },
    execInOutPins().execOut,
    execInOutPins().success,
    {
      id: "data",
      label: i18n.nodes.__shared.pin_json,
      type: "object",
      direction: "output",
    },
    execInOutPins().error,
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveGithubCredential(
      ctx,
      String(inputs.credentialName ?? ""),
    );
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: { success: false, data: null, error: resolved.error },
      };
    const rawParams = String(inputs.paramsJson ?? "").trim();
    let params: Record<string, unknown> | undefined;
    try {
      params = rawParams ? JSON.parse(rawParams) : undefined;
    } catch (err) {
      return {
        nextExec: "exec-out",
        outputs: {
          success: false,
          data: null,
          error: err instanceof Error ? err.message : String(err),
        },
      };
    }
    const manager = GithubManager.forAuth(resolved.auth);
    const result = await manager.request(String(inputs.route ?? ""), params);
    return { nextExec: "exec-out", outputs: result };
  },
});
