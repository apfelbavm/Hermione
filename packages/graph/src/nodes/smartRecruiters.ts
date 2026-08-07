import { NodeColorCategory } from "@hermione/graph/engine/types";
import type { ExecutionContext } from "@hermione/graph/engine/types";
import { registerNode } from "@hermione/graph/engine/registry";
import { compileResultVar, FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT } from "@hermione/graph/engine/compileUtils";
import { SMARTRECRUITERS_HTTP_METHOD_ENUM_TYPE, SMARTRECRUITERS_JOB_STATUS_ENUM_TYPE, SMARTRECRUITERS_HIRING_TEAM_ROLE_ENUM_TYPE, SMARTRECRUITERS_POSITION_TYPE_ENUM_TYPE, SMARTRECRUITERS_JOB_AD_POSTING_VISIBILITY_ENUM_TYPE } from "@hermione/graph/enum/smartRecruiters";
import { enumOptionIds } from "@hermione/graph/engine/enumRegistry";
import { SmartRecruitersManager, type SmartRecruitersAuth } from "@hermione/core/lib/smartRecruitersManager";
import type { SmartRecruitersApiKeyCredentialData, SmartRecruitersOAuth2ClientCredentialsData } from "@hermione/shared/types";
import { i18n } from "@i18n";

// SmartRecruiters exposes ~150 REST endpoints across Jobs, Candidates, Job Applications, Users,
// Interviews, Offers, Configuration, Reporting, Webhooks and more — see
// /memories/repo/smartrecruiters-plan.md for the phased build-out of dedicated per-resource nodes.
// This file starts with only the generic `smartRecruiters.apiCall` escape hatch (usable against any
// documented endpoint right away) plus the shared credential-resolution/pin helpers every later
// phase's dedicated nodes will reuse. Request/response bodies use JSON-string pins (mirrors
// salesforce.ts/workday.ts) since most SmartRecruiters resources are large, deeply-nested,
// per-company-configurable objects unsuited to rigid struct types.
//
// Every node here also has a compileExecute: the compiled path calls a same-named
// `functionLibrarySmartRecruiters.smartRecruiters*` wrapper (see
// server/functionLibrarySmartRecruiters.ts), which reads the credential back from environment
// variables via `smartRecruitersCredentialFromEnv` instead of the vault — same split as
// github.ts's/jira.ts's execute()/compileExecute().

const GROUP_NAME = "Request.SmartRecruiters";

/** Shared by every SmartRecruiters node — looks up a named Credential Vault entry and turns either
 * its smartRecruitersApiKey or smartRecruitersOAuth2ClientCredentials fields into the
 * SmartRecruitersAuth shape SmartRecruitersManager.forAuth expects. */
function resolveSmartRecruitersCredential(ctx: ExecutionContext, credentialName: string): { ok: true; auth: SmartRecruitersAuth } | { ok: false; error: string } {
  const credential = ctx.getCredential?.(credentialName);
  if (!credential) return { ok: false, error: `Credential "${credentialName}" not found in the vault` };
  if (credential.type === "smartRecruitersApiKey") {
    const data = credential.data as SmartRecruitersApiKeyCredentialData;
    return { ok: true, auth: { kind: "apiKey", apiKey: data.apiKey } };
  }
  if (credential.type === "smartRecruitersOAuth2ClientCredentials") {
    const data = credential.data as SmartRecruitersOAuth2ClientCredentialsData;
    return { ok: true, auth: { kind: "oauth2", clientId: data.clientId, clientSecret: data.clientSecret, tokenUrl: data.tokenUrl } };
  }
  return { ok: false, error: `Credential "${credentialName}" is not a SmartRecruiters API Key or OAuth2 Client Credentials credential` };
}

function credentialNamePin() {
  return { id: "credentialName", label: i18n.nodes.smartRecruiters.__shared.pin_credential_name, type: "string" as const, direction: "input" as const, defaultValue: "" };
}

function execInPin() {
  return { id: "exec-in", label: "", type: "exec" as const, direction: "input" as const };
}

function execOutPin() {
  return { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec" as const, direction: "output" as const };
}

function successPin() {
  return { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean" as const, direction: "output" as const };
}

function errorPin() {
  return { id: "error", label: i18n.nodes.__shared.pin_error, type: "string" as const, direction: "output" as const };
}

function jobIdPin() {
  return { id: "jobId", label: i18n.nodes.smartRecruiters.__shared.pin_job_id, type: "string" as const, direction: "input" as const, defaultValue: "" };
}

function jobAdIdPin() {
  return { id: "jobAdId", label: i18n.nodes.smartRecruiters.__shared.pin_job_ad_id, type: "string" as const, direction: "input" as const, defaultValue: "" };
}

function parseJsonRecord(json: string): Record<string, string> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function parseJsonBody(json: string): unknown {
  if (!json) return undefined;
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

registerNode({
  type: "smartRecruiters.apiCall",
  label: i18n.nodes.smartRecruiters.apiCall.label,
  description: i18n.nodes.smartRecruiters.apiCall.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "method", label: i18n.nodes.smartRecruiters.__shared.pin_method, type: "enum", subType: SMARTRECRUITERS_HTTP_METHOD_ENUM_TYPE, direction: "input", defaultValue: "GET", options: enumOptionIds(SMARTRECRUITERS_HTTP_METHOD_ENUM_TYPE) },
    { id: "path", label: i18n.nodes.smartRecruiters.__shared.pin_path, type: "string", direction: "input", defaultValue: "/jobs" },
    { id: "queryJson", label: i18n.nodes.smartRecruiters.__shared.pin_query_json, type: "string", direction: "input", defaultValue: "{}" },
    { id: "bodyJson", label: i18n.nodes.smartRecruiters.__shared.pin_body_json, type: "string", direction: "input", defaultValue: "" },
    execOutPin(),
    successPin(),
    { id: "status", label: i18n.nodes.smartRecruiters.apiCall.pin_status, type: "number", direction: "output" },
    { id: "dataJson", label: i18n.nodes.smartRecruiters.apiCall.pin_data_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: { success: false, status: 0, dataJson: "", error: resolved.error },
      };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.apiCall(String(inputs.method ?? "GET"), String(inputs.path ?? ""), parseJsonRecord(String(inputs.queryJson ?? "")), parseJsonBody(String(inputs.bodyJson ?? "")));
    return {
      nextExec: "exec-out",
      outputs: { success: result.success, status: result.status, dataJson: result.dataJson, error: result.error },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersApiCall(${inputs.credentialName}, ${inputs.method}, ${inputs.path}, ${inputs.queryJson}, ${inputs.bodyJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, status: `${v}.status`, dataJson: `${v}.dataJson`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

// --- Jobs core (Phase 1) ---------------------------------------------------------------

registerNode({
  type: "smartRecruiters.searchJobs",
  label: i18n.nodes.smartRecruiters.searchJobs.label,
  description: i18n.nodes.smartRecruiters.searchJobs.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "queryJson", label: i18n.nodes.smartRecruiters.__shared.pin_query_json, type: "string", direction: "input", defaultValue: "{}" },
    { id: "offset", label: i18n.nodes.smartRecruiters.searchJobs.pin_offset, type: "number", direction: "input", defaultValue: 0 },
    { id: "limit", label: i18n.nodes.smartRecruiters.searchJobs.pin_limit, type: "number", direction: "input", defaultValue: 20 },
    execOutPin(),
    successPin(),
    { id: "jobsJson", label: i18n.nodes.smartRecruiters.searchJobs.pin_jobs_json, type: "string", direction: "output" },
    { id: "totalFound", label: i18n.nodes.smartRecruiters.searchJobs.pin_total_found, type: "number", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, jobsJson: "[]", totalFound: 0, error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.searchJobs({ ...parseJsonRecord(String(inputs.queryJson ?? "")), offset: Number(inputs.offset ?? 0), limit: Number(inputs.limit ?? 20) });
    return { nextExec: "exec-out", outputs: { success: result.success, jobsJson: JSON.stringify(result.jobs), totalFound: result.totalFound, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersSearchJobs(${inputs.credentialName}, ${inputs.queryJson}, ${inputs.offset}, ${inputs.limit});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, jobsJson: `JSON.stringify(${v}.jobs)`, totalFound: `${v}.totalFound`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.createJob",
  label: i18n.nodes.smartRecruiters.createJob.label,
  description: i18n.nodes.smartRecruiters.createJob.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "jobJson", label: i18n.nodes.smartRecruiters.createJob.pin_job_json, type: "string", direction: "input", defaultValue: "{}" },
    execOutPin(),
    successPin(),
    { id: "createdJobJson", label: i18n.nodes.smartRecruiters.createJob.pin_created_job_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, createdJobJson: "{}", error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.createJob(parseJsonRecord(String(inputs.jobJson ?? "")));
    return { nextExec: "exec-out", outputs: { success: result.success, createdJobJson: JSON.stringify(result.job), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersCreateJob(${inputs.credentialName}, ${inputs.jobJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, createdJobJson: `JSON.stringify(${v}.job)`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.getJob",
  label: i18n.nodes.smartRecruiters.getJob.label,
  description: i18n.nodes.smartRecruiters.getJob.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), jobIdPin(), execOutPin(), successPin(), { id: "jobJson", label: i18n.nodes.smartRecruiters.getJob.pin_job_json, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, jobJson: "{}", error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.getJob(String(inputs.jobId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, jobJson: JSON.stringify(result.job), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersGetJob(${inputs.credentialName}, ${inputs.jobId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, jobJson: `JSON.stringify(${v}.job)`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.patchJob",
  label: i18n.nodes.smartRecruiters.patchJob.label,
  description: i18n.nodes.smartRecruiters.patchJob.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    jobIdPin(),
    { id: "patchJson", label: i18n.nodes.smartRecruiters.patchJob.pin_patch_json, type: "string", direction: "input", defaultValue: "{}" },
    execOutPin(),
    successPin(),
    { id: "jobJson", label: i18n.nodes.smartRecruiters.patchJob.pin_job_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, jobJson: "{}", error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.patchJob(String(inputs.jobId ?? ""), parseJsonRecord(String(inputs.patchJson ?? "")));
    return { nextExec: "exec-out", outputs: { success: result.success, jobJson: JSON.stringify(result.job), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersPatchJob(${inputs.credentialName}, ${inputs.jobId}, ${inputs.patchJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, jobJson: `JSON.stringify(${v}.job)`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.updateJobStatus",
  label: i18n.nodes.smartRecruiters.updateJobStatus.label,
  description: i18n.nodes.smartRecruiters.updateJobStatus.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    jobIdPin(),
    { id: "status", label: i18n.nodes.smartRecruiters.updateJobStatus.pin_status, type: "enum", subType: SMARTRECRUITERS_JOB_STATUS_ENUM_TYPE, direction: "input", defaultValue: "SOURCING", options: enumOptionIds(SMARTRECRUITERS_JOB_STATUS_ENUM_TYPE) },
    execOutPin(),
    successPin(),
    { id: "jobJson", label: i18n.nodes.smartRecruiters.updateJobStatus.pin_job_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, jobJson: "{}", error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.updateJobStatus(String(inputs.jobId ?? ""), String(inputs.status ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, jobJson: JSON.stringify(result.job), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersUpdateJobStatus(${inputs.credentialName}, ${inputs.jobId}, ${inputs.status});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, jobJson: `JSON.stringify(${v}.job)`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.getJobStatusHistory",
  label: i18n.nodes.smartRecruiters.getJobStatusHistory.label,
  description: i18n.nodes.smartRecruiters.getJobStatusHistory.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), jobIdPin(), execOutPin(), successPin(), { id: "historyJson", label: i18n.nodes.smartRecruiters.getJobStatusHistory.pin_history_json, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, historyJson: "[]", error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.getJobStatusHistory(String(inputs.jobId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, historyJson: JSON.stringify(result.history), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersGetJobStatusHistory(${inputs.credentialName}, ${inputs.jobId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, historyJson: `JSON.stringify(${v}.history)`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.getLatestApprovalRequest",
  label: i18n.nodes.smartRecruiters.getLatestApprovalRequest.label,
  description: i18n.nodes.smartRecruiters.getLatestApprovalRequest.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), jobIdPin(), execOutPin(), successPin(), { id: "approvalJson", label: i18n.nodes.smartRecruiters.getLatestApprovalRequest.pin_approval_json, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, approvalJson: "{}", error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.getLatestApprovalRequest(String(inputs.jobId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, approvalJson: JSON.stringify(result.approval), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersGetLatestApprovalRequest(${inputs.credentialName}, ${inputs.jobId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, approvalJson: `JSON.stringify(${v}.approval)`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.updateHeadcount",
  label: i18n.nodes.smartRecruiters.updateHeadcount.label,
  description: i18n.nodes.smartRecruiters.updateHeadcount.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    jobIdPin(),
    { id: "headcount", label: i18n.nodes.smartRecruiters.updateHeadcount.pin_headcount, type: "number", direction: "input", defaultValue: 1 },
    execOutPin(),
    successPin(),
    { id: "jobJson", label: i18n.nodes.smartRecruiters.updateHeadcount.pin_job_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, jobJson: "{}", error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.updateHeadcount(String(inputs.jobId ?? ""), Number(inputs.headcount ?? 0));
    return { nextExec: "exec-out", outputs: { success: result.success, jobJson: JSON.stringify(result.job), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersUpdateHeadcount(${inputs.credentialName}, ${inputs.jobId}, ${inputs.headcount});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, jobJson: `JSON.stringify(${v}.job)`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.getJobNote",
  label: i18n.nodes.smartRecruiters.getJobNote.label,
  description: i18n.nodes.smartRecruiters.getJobNote.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), jobIdPin(), execOutPin(), successPin(), { id: "noteJson", label: i18n.nodes.smartRecruiters.getJobNote.pin_note_json, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, noteJson: "{}", error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.getJobNote(String(inputs.jobId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, noteJson: JSON.stringify(result.note), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersGetJobNote(${inputs.credentialName}, ${inputs.jobId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, noteJson: `JSON.stringify(${v}.note)`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.updateJobNote",
  label: i18n.nodes.smartRecruiters.updateJobNote.label,
  description: i18n.nodes.smartRecruiters.updateJobNote.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    jobIdPin(),
    { id: "content", label: i18n.nodes.smartRecruiters.updateJobNote.pin_content, type: "string", direction: "input", defaultValue: "" },
    execOutPin(),
    successPin(),
    { id: "noteJson", label: i18n.nodes.smartRecruiters.updateJobNote.pin_note_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, noteJson: "{}", error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.updateJobNote(String(inputs.jobId ?? ""), String(inputs.content ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, noteJson: JSON.stringify(result.note), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersUpdateJobNote(${inputs.credentialName}, ${inputs.jobId}, ${inputs.content});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, noteJson: `JSON.stringify(${v}.note)`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

// --- Job Ads, Postings, Positions, Hiring Team (Phase 2) -------------------------------

registerNode({
  type: "smartRecruiters.listJobAds",
  label: i18n.nodes.smartRecruiters.listJobAds.label,
  description: i18n.nodes.smartRecruiters.listJobAds.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), jobIdPin(), execOutPin(), successPin(), { id: "jobAdsJson", label: i18n.nodes.smartRecruiters.listJobAds.pin_job_ads_json, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, jobAdsJson: "[]", error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.listJobAds(String(inputs.jobId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, jobAdsJson: JSON.stringify(result.jobAds), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersListJobAds(${inputs.credentialName}, ${inputs.jobId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, jobAdsJson: `JSON.stringify(${v}.jobAds)`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.createJobAd",
  label: i18n.nodes.smartRecruiters.createJobAd.label,
  description: i18n.nodes.smartRecruiters.createJobAd.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    jobIdPin(),
    { id: "jobAdJson", label: i18n.nodes.smartRecruiters.createJobAd.pin_job_ad_json, type: "string", direction: "input", defaultValue: "{}" },
    execOutPin(),
    successPin(),
    { id: "createdJobAdJson", label: i18n.nodes.smartRecruiters.createJobAd.pin_created_job_ad_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, createdJobAdJson: "{}", error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.createJobAd(String(inputs.jobId ?? ""), parseJsonRecord(String(inputs.jobAdJson ?? "")));
    return { nextExec: "exec-out", outputs: { success: result.success, createdJobAdJson: JSON.stringify(result.jobAd), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersCreateJobAd(${inputs.credentialName}, ${inputs.jobId}, ${inputs.jobAdJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, createdJobAdJson: `JSON.stringify(${v}.jobAd)`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.getJobAd",
  label: i18n.nodes.smartRecruiters.getJobAd.label,
  description: i18n.nodes.smartRecruiters.getJobAd.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), jobIdPin(), jobAdIdPin(), execOutPin(), successPin(), { id: "jobAdJson", label: i18n.nodes.smartRecruiters.getJobAd.pin_job_ad_json, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, jobAdJson: "{}", error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.getJobAd(String(inputs.jobId ?? ""), String(inputs.jobAdId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, jobAdJson: JSON.stringify(result.jobAd), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersGetJobAd(${inputs.credentialName}, ${inputs.jobId}, ${inputs.jobAdId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, jobAdJson: `JSON.stringify(${v}.jobAd)`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.updateJobAd",
  label: i18n.nodes.smartRecruiters.updateJobAd.label,
  description: i18n.nodes.smartRecruiters.updateJobAd.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    jobIdPin(),
    jobAdIdPin(),
    { id: "jobAdJson", label: i18n.nodes.smartRecruiters.updateJobAd.pin_job_ad_json, type: "string", direction: "input", defaultValue: "{}" },
    execOutPin(),
    successPin(),
    { id: "updatedJobAdJson", label: i18n.nodes.smartRecruiters.updateJobAd.pin_job_ad_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, updatedJobAdJson: "{}", error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.updateJobAd(String(inputs.jobId ?? ""), String(inputs.jobAdId ?? ""), parseJsonRecord(String(inputs.jobAdJson ?? "")));
    return { nextExec: "exec-out", outputs: { success: result.success, updatedJobAdJson: JSON.stringify(result.jobAd), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersUpdateJobAd(${inputs.credentialName}, ${inputs.jobId}, ${inputs.jobAdId}, ${inputs.jobAdJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, updatedJobAdJson: `JSON.stringify(${v}.jobAd)`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.publishJobAdPosting",
  label: i18n.nodes.smartRecruiters.publishJobAdPosting.label,
  description: i18n.nodes.smartRecruiters.publishJobAdPosting.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    jobIdPin(),
    jobAdIdPin(),
    { id: "aggregators", label: i18n.nodes.smartRecruiters.publishJobAdPosting.pin_aggregators, type: "boolean", direction: "input", defaultValue: true },
    { id: "visibility", label: i18n.nodes.smartRecruiters.publishJobAdPosting.pin_visibility, type: "enum", subType: SMARTRECRUITERS_JOB_AD_POSTING_VISIBILITY_ENUM_TYPE, direction: "input", defaultValue: "PUBLIC", options: enumOptionIds(SMARTRECRUITERS_JOB_AD_POSTING_VISIBILITY_ENUM_TYPE) },
    { id: "includeInternal", label: i18n.nodes.smartRecruiters.publishJobAdPosting.pin_include_internal, type: "boolean", direction: "input", defaultValue: true },
    { id: "delayPublicInDays", label: i18n.nodes.smartRecruiters.publishJobAdPosting.pin_delay_public_in_days, type: "number", direction: "input", defaultValue: 0 },
    execOutPin(),
    successPin(),
    { id: "status", label: i18n.nodes.smartRecruiters.publishJobAdPosting.pin_status, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, status: "", error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.publishJobAdPosting(String(inputs.jobId ?? ""), String(inputs.jobAdId ?? ""), {
      aggregators: Boolean(inputs.aggregators ?? true),
      visibility: String(inputs.visibility ?? "PUBLIC"),
      includeInternal: Boolean(inputs.includeInternal ?? true),
      delayPublicInDays: Number(inputs.delayPublicInDays ?? 0),
    });
    return { nextExec: "exec-out", outputs: { success: result.success, status: result.status, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersPublishJobAdPosting(${inputs.credentialName}, ${inputs.jobId}, ${inputs.jobAdId}, ${inputs.aggregators}, ${inputs.visibility}, ${inputs.includeInternal}, ${inputs.delayPublicInDays});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, status: `${v}.status`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.unpublishJobAdPosting",
  label: i18n.nodes.smartRecruiters.unpublishJobAdPosting.label,
  description: i18n.nodes.smartRecruiters.unpublishJobAdPosting.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), jobIdPin(), jobAdIdPin(), execOutPin(), successPin(), { id: "status", label: i18n.nodes.smartRecruiters.unpublishJobAdPosting.pin_status, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, status: "", error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.unpublishJobAdPosting(String(inputs.jobId ?? ""), String(inputs.jobAdId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, status: result.status, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersUnpublishJobAdPosting(${inputs.credentialName}, ${inputs.jobId}, ${inputs.jobAdId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, status: `${v}.status`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.listJobAdPostings",
  label: i18n.nodes.smartRecruiters.listJobAdPostings.label,
  description: i18n.nodes.smartRecruiters.listJobAdPostings.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    jobIdPin(),
    jobAdIdPin(),
    { id: "activeOnly", label: i18n.nodes.smartRecruiters.listJobAdPostings.pin_active_only, type: "boolean", direction: "input", defaultValue: true },
    execOutPin(),
    successPin(),
    { id: "postingsJson", label: i18n.nodes.smartRecruiters.listJobAdPostings.pin_postings_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, postingsJson: "[]", error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.listJobAdPostings(String(inputs.jobId ?? ""), String(inputs.jobAdId ?? ""), Boolean(inputs.activeOnly ?? true));
    return { nextExec: "exec-out", outputs: { success: result.success, postingsJson: JSON.stringify(result.postings), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersListJobAdPostings(${inputs.credentialName}, ${inputs.jobId}, ${inputs.jobAdId}, ${inputs.activeOnly});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, postingsJson: `JSON.stringify(${v}.postings)`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.listPositions",
  label: i18n.nodes.smartRecruiters.listPositions.label,
  description: i18n.nodes.smartRecruiters.listPositions.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    jobIdPin(),
    execOutPin(),
    successPin(),
    { id: "positionsJson", label: i18n.nodes.smartRecruiters.listPositions.pin_positions_json, type: "string", direction: "output" },
    { id: "totalFound", label: i18n.nodes.smartRecruiters.listPositions.pin_total_found, type: "number", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, positionsJson: "[]", totalFound: 0, error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.listPositions(String(inputs.jobId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, positionsJson: JSON.stringify(result.positions), totalFound: result.totalFound, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersListPositions(${inputs.credentialName}, ${inputs.jobId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, positionsJson: `JSON.stringify(${v}.positions)`, totalFound: `${v}.totalFound`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

function positionFieldPins(labels: { type: string; positionOpenDate: string; targetStartDate: string; externalPositionId: string; incumbentName: string; hiringManagerId: string }) {
  return [
    { id: "type", label: labels.type, type: "enum" as const, subType: SMARTRECRUITERS_POSITION_TYPE_ENUM_TYPE, direction: "input" as const, defaultValue: "NEW", options: enumOptionIds(SMARTRECRUITERS_POSITION_TYPE_ENUM_TYPE) },
    { id: "positionOpenDate", label: labels.positionOpenDate, type: "string" as const, direction: "input" as const, defaultValue: "" },
    { id: "targetStartDate", label: labels.targetStartDate, type: "string" as const, direction: "input" as const, defaultValue: "" },
    { id: "externalPositionId", label: labels.externalPositionId, type: "string" as const, direction: "input" as const, defaultValue: "" },
    { id: "incumbentName", label: labels.incumbentName, type: "string" as const, direction: "input" as const, defaultValue: "" },
    { id: "hiringManagerId", label: labels.hiringManagerId, type: "string" as const, direction: "input" as const, defaultValue: "" },
  ];
}

registerNode({
  type: "smartRecruiters.createPosition",
  label: i18n.nodes.smartRecruiters.createPosition.label,
  description: i18n.nodes.smartRecruiters.createPosition.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    jobIdPin(),
    ...positionFieldPins({
      type: i18n.nodes.smartRecruiters.createPosition.pin_type,
      positionOpenDate: i18n.nodes.smartRecruiters.createPosition.pin_position_open_date,
      targetStartDate: i18n.nodes.smartRecruiters.createPosition.pin_target_start_date,
      externalPositionId: i18n.nodes.smartRecruiters.createPosition.pin_external_position_id,
      incumbentName: i18n.nodes.smartRecruiters.createPosition.pin_incumbent_name,
      hiringManagerId: i18n.nodes.smartRecruiters.createPosition.pin_hiring_manager_id,
    }),
    execOutPin(),
    successPin(),
    { id: "positionJson", label: i18n.nodes.smartRecruiters.createPosition.pin_position_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, positionJson: "{}", error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.createPosition(String(inputs.jobId ?? ""), {
      type: inputs.type,
      positionOpenDate: inputs.positionOpenDate,
      targetStartDate: inputs.targetStartDate,
      positionId: inputs.externalPositionId || undefined,
      incumbentName: inputs.incumbentName || undefined,
      hiringManagerId: inputs.hiringManagerId || undefined,
    });
    return { nextExec: "exec-out", outputs: { success: result.success, positionJson: JSON.stringify(result.position), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersCreatePosition(${inputs.credentialName}, ${inputs.jobId}, ${inputs.type}, ${inputs.positionOpenDate}, ${inputs.targetStartDate}, ${inputs.externalPositionId}, ${inputs.incumbentName}, ${inputs.hiringManagerId});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, positionJson: `JSON.stringify(${v}.position)`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.getPosition",
  label: i18n.nodes.smartRecruiters.getPosition.label,
  description: i18n.nodes.smartRecruiters.getPosition.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    jobIdPin(),
    { id: "positionId", label: i18n.nodes.smartRecruiters.getPosition.pin_position_id, type: "string", direction: "input", defaultValue: "" },
    execOutPin(),
    successPin(),
    { id: "positionJson", label: i18n.nodes.smartRecruiters.getPosition.pin_position_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, positionJson: "{}", error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.getPosition(String(inputs.jobId ?? ""), String(inputs.positionId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, positionJson: JSON.stringify(result.position), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersGetPosition(${inputs.credentialName}, ${inputs.jobId}, ${inputs.positionId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, positionJson: `JSON.stringify(${v}.position)`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.updatePosition",
  label: i18n.nodes.smartRecruiters.updatePosition.label,
  description: i18n.nodes.smartRecruiters.updatePosition.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    jobIdPin(),
    { id: "positionId", label: i18n.nodes.smartRecruiters.updatePosition.pin_position_id, type: "string", direction: "input", defaultValue: "" },
    ...positionFieldPins({
      type: i18n.nodes.smartRecruiters.updatePosition.pin_type,
      positionOpenDate: i18n.nodes.smartRecruiters.updatePosition.pin_position_open_date,
      targetStartDate: i18n.nodes.smartRecruiters.updatePosition.pin_target_start_date,
      externalPositionId: i18n.nodes.smartRecruiters.updatePosition.pin_external_position_id,
      incumbentName: i18n.nodes.smartRecruiters.updatePosition.pin_incumbent_name,
      hiringManagerId: i18n.nodes.smartRecruiters.updatePosition.pin_hiring_manager_id,
    }),
    execOutPin(),
    successPin(),
    { id: "positionJson", label: i18n.nodes.smartRecruiters.updatePosition.pin_position_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, positionJson: "{}", error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.updatePosition(String(inputs.jobId ?? ""), String(inputs.positionId ?? ""), {
      type: inputs.type,
      positionOpenDate: inputs.positionOpenDate,
      targetStartDate: inputs.targetStartDate,
      positionId: inputs.externalPositionId || undefined,
      incumbentName: inputs.incumbentName || undefined,
      hiringManagerId: inputs.hiringManagerId || undefined,
    });
    return { nextExec: "exec-out", outputs: { success: result.success, positionJson: JSON.stringify(result.position), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersUpdatePosition(${inputs.credentialName}, ${inputs.jobId}, ${inputs.positionId}, ${inputs.type}, ${inputs.positionOpenDate}, ${inputs.targetStartDate}, ${inputs.externalPositionId}, ${inputs.incumbentName}, ${inputs.hiringManagerId});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, positionJson: `JSON.stringify(${v}.position)`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.deletePosition",
  label: i18n.nodes.smartRecruiters.deletePosition.label,
  description: i18n.nodes.smartRecruiters.deletePosition.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), jobIdPin(), { id: "positionId", label: i18n.nodes.smartRecruiters.deletePosition.pin_position_id, type: "string", direction: "input", defaultValue: "" }, execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.deletePosition(String(inputs.jobId ?? ""), String(inputs.positionId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersDeletePosition(${inputs.credentialName}, ${inputs.jobId}, ${inputs.positionId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.getHiringTeam",
  label: i18n.nodes.smartRecruiters.getHiringTeam.label,
  description: i18n.nodes.smartRecruiters.getHiringTeam.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    jobIdPin(),
    execOutPin(),
    successPin(),
    { id: "membersJson", label: i18n.nodes.smartRecruiters.getHiringTeam.pin_members_json, type: "string", direction: "output" },
    { id: "totalFound", label: i18n.nodes.smartRecruiters.getHiringTeam.pin_total_found, type: "number", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, membersJson: "[]", totalFound: 0, error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.getHiringTeam(String(inputs.jobId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, membersJson: JSON.stringify(result.members), totalFound: result.totalFound, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersGetHiringTeam(${inputs.credentialName}, ${inputs.jobId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, membersJson: `JSON.stringify(${v}.members)`, totalFound: `${v}.totalFound`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.addHiringTeamMember",
  label: i18n.nodes.smartRecruiters.addHiringTeamMember.label,
  description: i18n.nodes.smartRecruiters.addHiringTeamMember.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    jobIdPin(),
    { id: "userId", label: i18n.nodes.smartRecruiters.addHiringTeamMember.pin_user_id, type: "string", direction: "input", defaultValue: "" },
    { id: "role", label: i18n.nodes.smartRecruiters.addHiringTeamMember.pin_role, type: "enum", subType: SMARTRECRUITERS_HIRING_TEAM_ROLE_ENUM_TYPE, direction: "input", defaultValue: "RECRUITER", options: enumOptionIds(SMARTRECRUITERS_HIRING_TEAM_ROLE_ENUM_TYPE) },
    execOutPin(),
    successPin(),
    { id: "memberJson", label: i18n.nodes.smartRecruiters.addHiringTeamMember.pin_member_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, memberJson: "{}", error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.addHiringTeamMember(String(inputs.jobId ?? ""), String(inputs.userId ?? ""), String(inputs.role ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, memberJson: JSON.stringify(result.member), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersAddHiringTeamMember(${inputs.credentialName}, ${inputs.jobId}, ${inputs.userId}, ${inputs.role});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, memberJson: `JSON.stringify(${v}.member)`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.removeHiringTeamMember",
  label: i18n.nodes.smartRecruiters.removeHiringTeamMember.label,
  description: i18n.nodes.smartRecruiters.removeHiringTeamMember.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), jobIdPin(), { id: "userId", label: i18n.nodes.smartRecruiters.removeHiringTeamMember.pin_user_id, type: "string", direction: "input", defaultValue: "" }, execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.removeHiringTeamMember(String(inputs.jobId ?? ""), String(inputs.userId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersRemoveHiringTeamMember(${inputs.credentialName}, ${inputs.jobId}, ${inputs.userId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});
