import { NodeColorCategory } from "@hermione/graph/engine/types";
import type { ExecutionContext } from "@hermione/graph/engine/types";
import { registerNode } from "@hermione/graph/engine/registry";
import { compileResultVar, FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT } from "@hermione/graph/engine/compileUtils";
import {
  SMARTRECRUITERS_HTTP_METHOD_ENUM_TYPE,
  SMARTRECRUITERS_JOB_STATUS_ENUM_TYPE,
  SMARTRECRUITERS_HIRING_TEAM_ROLE_ENUM_TYPE,
  SMARTRECRUITERS_POSITION_TYPE_ENUM_TYPE,
  SMARTRECRUITERS_JOB_AD_POSTING_VISIBILITY_ENUM_TYPE,
  SMARTRECRUITERS_ATTACHMENT_TYPE_ENUM_TYPE,
  SMARTRECRUITERS_PROPERTY_CONTEXT_ENUM_TYPE,
  SMARTRECRUITERS_ONBOARDING_STATUS_ENUM_TYPE,
} from "@hermione/graph/enum/smartRecruiters";
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

function candidateIdPin() {
  return { id: "candidateId", label: i18n.nodes.smartRecruiters.__shared.pin_candidate_id, type: "string" as const, direction: "input" as const, defaultValue: "" };
}

function fileFieldPins(labels: { fileBase64: string; fileName: string; fileContentType: string }) {
  return [
    { id: "fileBase64", label: labels.fileBase64, type: "string" as const, direction: "input" as const, defaultValue: "" },
    { id: "fileName", label: labels.fileName, type: "string" as const, direction: "input" as const, defaultValue: "" },
    { id: "fileContentType", label: labels.fileContentType, type: "string" as const, direction: "input" as const, defaultValue: "application/pdf" },
  ];
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

// --- Candidates core (Phase 3) ----------------------------------------------------------

registerNode({
  type: "smartRecruiters.searchCandidates",
  label: i18n.nodes.smartRecruiters.searchCandidates.label,
  description: i18n.nodes.smartRecruiters.searchCandidates.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "queryJson", label: i18n.nodes.smartRecruiters.__shared.pin_query_json, type: "string", direction: "input", defaultValue: "{}" },
    { id: "pageId", label: i18n.nodes.smartRecruiters.searchCandidates.pin_page_id, type: "string", direction: "input", defaultValue: "" },
    { id: "limit", label: i18n.nodes.smartRecruiters.searchCandidates.pin_limit, type: "number", direction: "input", defaultValue: 20 },
    execOutPin(),
    successPin(),
    { id: "candidatesJson", label: i18n.nodes.smartRecruiters.searchCandidates.pin_candidates_json, type: "string", direction: "output" },
    { id: "totalFound", label: i18n.nodes.smartRecruiters.searchCandidates.pin_total_found, type: "number", direction: "output" },
    { id: "nextPageId", label: i18n.nodes.smartRecruiters.searchCandidates.pin_next_page_id, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, candidatesJson: "[]", totalFound: 0, nextPageId: "", error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.searchCandidates({ ...parseJsonRecord(String(inputs.queryJson ?? "")), pageId: String(inputs.pageId ?? "") || undefined, limit: Number(inputs.limit ?? 20) });
    return { nextExec: "exec-out", outputs: { success: result.success, candidatesJson: JSON.stringify(result.candidates), totalFound: result.totalFound, nextPageId: result.nextPageId, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersSearchCandidates(${inputs.credentialName}, ${inputs.queryJson}, ${inputs.pageId}, ${inputs.limit});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, candidatesJson: `JSON.stringify(${v}.candidates)`, totalFound: `${v}.totalFound`, nextPageId: `${v}.nextPageId`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.addCandidate",
  label: i18n.nodes.smartRecruiters.addCandidate.label,
  description: i18n.nodes.smartRecruiters.addCandidate.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "candidateJson", label: i18n.nodes.smartRecruiters.addCandidate.pin_candidate_json, type: "string", direction: "input", defaultValue: "{}" },
    execOutPin(),
    successPin(),
    { id: "createdCandidateJson", label: i18n.nodes.smartRecruiters.addCandidate.pin_created_candidate_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, createdCandidateJson: "{}", error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.addCandidate(parseJsonRecord(String(inputs.candidateJson ?? "")));
    return { nextExec: "exec-out", outputs: { success: result.success, createdCandidateJson: JSON.stringify(result.candidate), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersAddCandidate(${inputs.credentialName}, ${inputs.candidateJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, createdCandidateJson: `JSON.stringify(${v}.candidate)`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.addCandidateToJob",
  label: i18n.nodes.smartRecruiters.addCandidateToJob.label,
  description: i18n.nodes.smartRecruiters.addCandidateToJob.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    jobIdPin(),
    { id: "candidateJson", label: i18n.nodes.smartRecruiters.addCandidateToJob.pin_candidate_json, type: "string", direction: "input", defaultValue: "{}" },
    execOutPin(),
    successPin(),
    { id: "createdCandidateJson", label: i18n.nodes.smartRecruiters.addCandidateToJob.pin_created_candidate_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, createdCandidateJson: "{}", error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.addCandidateToJob(String(inputs.jobId ?? ""), parseJsonRecord(String(inputs.candidateJson ?? "")));
    return { nextExec: "exec-out", outputs: { success: result.success, createdCandidateJson: JSON.stringify(result.candidate), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersAddCandidateToJob(${inputs.credentialName}, ${inputs.jobId}, ${inputs.candidateJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, createdCandidateJson: `JSON.stringify(${v}.candidate)`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

function resumeSourcePins(labels: { sourceTypeId: string; sourceSubTypeId: string; sourceId: string; internal: string }) {
  return [
    { id: "sourceTypeId", label: labels.sourceTypeId, type: "string" as const, direction: "input" as const, defaultValue: "" },
    { id: "sourceSubTypeId", label: labels.sourceSubTypeId, type: "string" as const, direction: "input" as const, defaultValue: "" },
    { id: "sourceId", label: labels.sourceId, type: "string" as const, direction: "input" as const, defaultValue: "" },
    { id: "internal", label: labels.internal, type: "boolean" as const, direction: "input" as const, defaultValue: false },
  ];
}

registerNode({
  type: "smartRecruiters.parseResume",
  label: i18n.nodes.smartRecruiters.parseResume.label,
  description: i18n.nodes.smartRecruiters.parseResume.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    ...fileFieldPins({
      fileBase64: i18n.nodes.smartRecruiters.parseResume.pin_file_base64,
      fileName: i18n.nodes.smartRecruiters.parseResume.pin_file_name,
      fileContentType: i18n.nodes.smartRecruiters.parseResume.pin_file_content_type,
    }),
    ...resumeSourcePins({
      sourceTypeId: i18n.nodes.smartRecruiters.parseResume.pin_source_type_id,
      sourceSubTypeId: i18n.nodes.smartRecruiters.parseResume.pin_source_sub_type_id,
      sourceId: i18n.nodes.smartRecruiters.parseResume.pin_source_id,
      internal: i18n.nodes.smartRecruiters.parseResume.pin_internal,
    }),
    execOutPin(),
    successPin(),
    { id: "createdCandidateJson", label: i18n.nodes.smartRecruiters.parseResume.pin_created_candidate_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, createdCandidateJson: "{}", error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.parseResume(String(inputs.fileBase64 ?? ""), String(inputs.fileName ?? ""), String(inputs.fileContentType ?? ""), String(inputs.sourceTypeId ?? ""), String(inputs.sourceSubTypeId ?? ""), String(inputs.sourceId ?? ""), Boolean(inputs.internal ?? false));
    return { nextExec: "exec-out", outputs: { success: result.success, createdCandidateJson: JSON.stringify(result.candidate), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersParseResume(${inputs.credentialName}, ${inputs.fileBase64}, ${inputs.fileName}, ${inputs.fileContentType}, ${inputs.sourceTypeId}, ${inputs.sourceSubTypeId}, ${inputs.sourceId}, ${inputs.internal});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, createdCandidateJson: `JSON.stringify(${v}.candidate)`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.parseResumeForJob",
  label: i18n.nodes.smartRecruiters.parseResumeForJob.label,
  description: i18n.nodes.smartRecruiters.parseResumeForJob.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    jobIdPin(),
    ...fileFieldPins({
      fileBase64: i18n.nodes.smartRecruiters.parseResumeForJob.pin_file_base64,
      fileName: i18n.nodes.smartRecruiters.parseResumeForJob.pin_file_name,
      fileContentType: i18n.nodes.smartRecruiters.parseResumeForJob.pin_file_content_type,
    }),
    ...resumeSourcePins({
      sourceTypeId: i18n.nodes.smartRecruiters.parseResumeForJob.pin_source_type_id,
      sourceSubTypeId: i18n.nodes.smartRecruiters.parseResumeForJob.pin_source_sub_type_id,
      sourceId: i18n.nodes.smartRecruiters.parseResumeForJob.pin_source_id,
      internal: i18n.nodes.smartRecruiters.parseResumeForJob.pin_internal,
    }),
    execOutPin(),
    successPin(),
    { id: "createdCandidateJson", label: i18n.nodes.smartRecruiters.parseResumeForJob.pin_created_candidate_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, createdCandidateJson: "{}", error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.parseResumeForJob(
      String(inputs.jobId ?? ""),
      String(inputs.fileBase64 ?? ""),
      String(inputs.fileName ?? ""),
      String(inputs.fileContentType ?? ""),
      String(inputs.sourceTypeId ?? ""),
      String(inputs.sourceSubTypeId ?? ""),
      String(inputs.sourceId ?? ""),
      Boolean(inputs.internal ?? false),
    );
    return { nextExec: "exec-out", outputs: { success: result.success, createdCandidateJson: JSON.stringify(result.candidate), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersParseResumeForJob(${inputs.credentialName}, ${inputs.jobId}, ${inputs.fileBase64}, ${inputs.fileName}, ${inputs.fileContentType}, ${inputs.sourceTypeId}, ${inputs.sourceSubTypeId}, ${inputs.sourceId}, ${inputs.internal});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, createdCandidateJson: `JSON.stringify(${v}.candidate)`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.getCandidate",
  label: i18n.nodes.smartRecruiters.getCandidate.label,
  description: i18n.nodes.smartRecruiters.getCandidate.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), candidateIdPin(), execOutPin(), successPin(), { id: "candidateJson", label: i18n.nodes.smartRecruiters.getCandidate.pin_candidate_json, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, candidateJson: "{}", error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.getCandidate(String(inputs.candidateId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, candidateJson: JSON.stringify(result.candidate), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersGetCandidate(${inputs.credentialName}, ${inputs.candidateId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, candidateJson: `JSON.stringify(${v}.candidate)`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.deleteCandidate",
  label: i18n.nodes.smartRecruiters.deleteCandidate.label,
  description: i18n.nodes.smartRecruiters.deleteCandidate.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), candidateIdPin(), execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.deleteCandidate(String(inputs.candidateId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersDeleteCandidate(${inputs.credentialName}, ${inputs.candidateId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.updateCandidate",
  label: i18n.nodes.smartRecruiters.updateCandidate.label,
  description: i18n.nodes.smartRecruiters.updateCandidate.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    candidateIdPin(),
    { id: "patchJson", label: i18n.nodes.smartRecruiters.updateCandidate.pin_patch_json, type: "string", direction: "input", defaultValue: "{}" },
    execOutPin(),
    successPin(),
    { id: "candidateJson", label: i18n.nodes.smartRecruiters.updateCandidate.pin_candidate_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, candidateJson: "{}", error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.updateCandidate(String(inputs.candidateId ?? ""), parseJsonRecord(String(inputs.patchJson ?? "")));
    return { nextExec: "exec-out", outputs: { success: result.success, candidateJson: JSON.stringify(result.candidate), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersUpdateCandidate(${inputs.credentialName}, ${inputs.candidateId}, ${inputs.patchJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, candidateJson: `JSON.stringify(${v}.candidate)`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.getCandidateTags",
  label: i18n.nodes.smartRecruiters.getCandidateTags.label,
  description: i18n.nodes.smartRecruiters.getCandidateTags.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), candidateIdPin(), execOutPin(), successPin(), { id: "tagsJson", label: i18n.nodes.smartRecruiters.getCandidateTags.pin_tags_json, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, tagsJson: "[]", error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.getCandidateTags(String(inputs.candidateId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, tagsJson: JSON.stringify(result.tags), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersGetCandidateTags(${inputs.credentialName}, ${inputs.candidateId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, tagsJson: `JSON.stringify(${v}.tags)`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

function tagsWritePins(labelTagsJson: string) {
  return [{ id: "tagsJson", label: labelTagsJson, type: "string" as const, direction: "input" as const, defaultValue: "[]" }];
}

registerNode({
  type: "smartRecruiters.addCandidateTags",
  label: i18n.nodes.smartRecruiters.addCandidateTags.label,
  description: i18n.nodes.smartRecruiters.addCandidateTags.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    candidateIdPin(),
    ...tagsWritePins(i18n.nodes.smartRecruiters.addCandidateTags.pin_tags_json),
    execOutPin(),
    successPin(),
    { id: "resultTagsJson", label: i18n.nodes.smartRecruiters.addCandidateTags.pin_result_tags_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, resultTagsJson: "[]", error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const parsedTags = parseJsonBody(String(inputs.tagsJson ?? "[]"));
    const result = await manager.addCandidateTags(String(inputs.candidateId ?? ""), Array.isArray(parsedTags) ? parsedTags : []);
    return { nextExec: "exec-out", outputs: { success: result.success, resultTagsJson: JSON.stringify(result.tags), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersAddCandidateTags(${inputs.credentialName}, ${inputs.candidateId}, ${inputs.tagsJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, resultTagsJson: `JSON.stringify(${v}.tags)`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.replaceCandidateTags",
  label: i18n.nodes.smartRecruiters.replaceCandidateTags.label,
  description: i18n.nodes.smartRecruiters.replaceCandidateTags.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    candidateIdPin(),
    ...tagsWritePins(i18n.nodes.smartRecruiters.replaceCandidateTags.pin_tags_json),
    execOutPin(),
    successPin(),
    { id: "resultTagsJson", label: i18n.nodes.smartRecruiters.replaceCandidateTags.pin_result_tags_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, resultTagsJson: "[]", error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const parsedTags = parseJsonBody(String(inputs.tagsJson ?? "[]"));
    const result = await manager.replaceCandidateTags(String(inputs.candidateId ?? ""), Array.isArray(parsedTags) ? parsedTags : []);
    return { nextExec: "exec-out", outputs: { success: result.success, resultTagsJson: JSON.stringify(result.tags), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersReplaceCandidateTags(${inputs.credentialName}, ${inputs.candidateId}, ${inputs.tagsJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, resultTagsJson: `JSON.stringify(${v}.tags)`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.deleteCandidateTags",
  label: i18n.nodes.smartRecruiters.deleteCandidateTags.label,
  description: i18n.nodes.smartRecruiters.deleteCandidateTags.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), candidateIdPin(), execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.deleteCandidateTags(String(inputs.candidateId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersDeleteCandidateTags(${inputs.credentialName}, ${inputs.candidateId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.updateCandidateJobStatus",
  label: i18n.nodes.smartRecruiters.updateCandidateJobStatus.label,
  description: i18n.nodes.smartRecruiters.updateCandidateJobStatus.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    candidateIdPin(),
    jobIdPin(),
    { id: "status", label: i18n.nodes.smartRecruiters.updateCandidateJobStatus.pin_status, type: "string", direction: "input", defaultValue: "" },
    { id: "subStatus", label: i18n.nodes.smartRecruiters.updateCandidateJobStatus.pin_sub_status, type: "string", direction: "input", defaultValue: "" },
    { id: "startsOn", label: i18n.nodes.smartRecruiters.updateCandidateJobStatus.pin_starts_on, type: "string", direction: "input", defaultValue: "" },
    { id: "reason", label: i18n.nodes.smartRecruiters.updateCandidateJobStatus.pin_reason, type: "string", direction: "input", defaultValue: "" },
    execOutPin(),
    successPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.updateCandidateJobStatus(String(inputs.candidateId ?? ""), String(inputs.jobId ?? ""), String(inputs.status ?? ""), String(inputs.subStatus ?? ""), String(inputs.startsOn ?? ""), String(inputs.reason ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersUpdateCandidateJobStatus(${inputs.credentialName}, ${inputs.candidateId}, ${inputs.jobId}, ${inputs.status}, ${inputs.subStatus}, ${inputs.startsOn}, ${inputs.reason});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.getCandidateJobStatusHistory",
  label: i18n.nodes.smartRecruiters.getCandidateJobStatusHistory.label,
  description: i18n.nodes.smartRecruiters.getCandidateJobStatusHistory.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), candidateIdPin(), jobIdPin(), execOutPin(), successPin(), { id: "historyJson", label: i18n.nodes.smartRecruiters.getCandidateJobStatusHistory.pin_history_json, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, historyJson: "[]", error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.getCandidateJobStatusHistory(String(inputs.candidateId ?? ""), String(inputs.jobId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, historyJson: JSON.stringify(result.history), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersGetCandidateJobStatusHistory(${inputs.credentialName}, ${inputs.candidateId}, ${inputs.jobId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, historyJson: `JSON.stringify(${v}.history)`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.updateCandidateSource",
  label: i18n.nodes.smartRecruiters.updateCandidateSource.label,
  description: i18n.nodes.smartRecruiters.updateCandidateSource.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    candidateIdPin(),
    jobIdPin(),
    { id: "sourceTypeId", label: i18n.nodes.smartRecruiters.updateCandidateSource.pin_source_type_id, type: "string", direction: "input", defaultValue: "" },
    { id: "sourceSubTypeId", label: i18n.nodes.smartRecruiters.updateCandidateSource.pin_source_sub_type_id, type: "string", direction: "input", defaultValue: "" },
    { id: "sourceId", label: i18n.nodes.smartRecruiters.updateCandidateSource.pin_source_id, type: "string", direction: "input", defaultValue: "" },
    execOutPin(),
    successPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.updateCandidateSource(String(inputs.candidateId ?? ""), String(inputs.jobId ?? ""), String(inputs.sourceTypeId ?? ""), String(inputs.sourceSubTypeId ?? ""), String(inputs.sourceId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersUpdateCandidateSource(${inputs.credentialName}, ${inputs.candidateId}, ${inputs.jobId}, ${inputs.sourceTypeId}, ${inputs.sourceSubTypeId}, ${inputs.sourceId});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.requestCandidateConsent",
  label: i18n.nodes.smartRecruiters.requestCandidateConsent.label,
  description: i18n.nodes.smartRecruiters.requestCandidateConsent.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "candidateIdsJson", label: i18n.nodes.smartRecruiters.requestCandidateConsent.pin_candidate_ids_json, type: "string", direction: "input", defaultValue: "[]" },
    execOutPin(),
    successPin(),
    { id: "resultsJson", label: i18n.nodes.smartRecruiters.requestCandidateConsent.pin_results_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, resultsJson: "[]", error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const parsedIds = parseJsonBody(String(inputs.candidateIdsJson ?? "[]"));
    const result = await manager.requestCandidateConsent(Array.isArray(parsedIds) ? parsedIds : []);
    return { nextExec: "exec-out", outputs: { success: result.success, resultsJson: JSON.stringify(result.results), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersRequestCandidateConsent(${inputs.credentialName}, ${inputs.candidateIdsJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, resultsJson: `JSON.stringify(${v}.results)`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.getCandidateConsentStatus",
  label: i18n.nodes.smartRecruiters.getCandidateConsentStatus.label,
  description: i18n.nodes.smartRecruiters.getCandidateConsentStatus.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    candidateIdPin(),
    execOutPin(),
    successPin(),
    { id: "status", label: i18n.nodes.smartRecruiters.getCandidateConsentStatus.pin_status, type: "string", direction: "output" },
    { id: "date", label: i18n.nodes.smartRecruiters.getCandidateConsentStatus.pin_date, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, status: "", date: "", error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.getCandidateConsentStatus(String(inputs.candidateId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, status: result.status, date: result.date, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersGetCandidateConsentStatus(${inputs.credentialName}, ${inputs.candidateId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, status: `${v}.status`, date: `${v}.date`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.getCandidateConsentDecisions",
  label: i18n.nodes.smartRecruiters.getCandidateConsentDecisions.label,
  description: i18n.nodes.smartRecruiters.getCandidateConsentDecisions.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), candidateIdPin(), execOutPin(), successPin(), { id: "decisionsJson", label: i18n.nodes.smartRecruiters.getCandidateConsentDecisions.pin_decisions_json, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, decisionsJson: "[]", error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.getCandidateConsentDecisions(String(inputs.candidateId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, decisionsJson: JSON.stringify(result.decisions), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersGetCandidateConsentDecisions(${inputs.credentialName}, ${inputs.candidateId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, decisionsJson: `JSON.stringify(${v}.decisions)`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

function propertyContextPin(label: string) {
  return { id: "context", label, type: "enum" as const, subType: SMARTRECRUITERS_PROPERTY_CONTEXT_ENUM_TYPE, direction: "input" as const, defaultValue: "PROFILE", options: enumOptionIds(SMARTRECRUITERS_PROPERTY_CONTEXT_ENUM_TYPE) };
}

registerNode({
  type: "smartRecruiters.getCandidateProperties",
  label: i18n.nodes.smartRecruiters.getCandidateProperties.label,
  description: i18n.nodes.smartRecruiters.getCandidateProperties.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    candidateIdPin(),
    propertyContextPin(i18n.nodes.smartRecruiters.getCandidateProperties.pin_context),
    execOutPin(),
    successPin(),
    { id: "propertiesJson", label: i18n.nodes.smartRecruiters.getCandidateProperties.pin_properties_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, propertiesJson: "[]", error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.getCandidateProperties(String(inputs.candidateId ?? ""), String(inputs.context ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, propertiesJson: JSON.stringify(result.properties), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersGetCandidateProperties(${inputs.credentialName}, ${inputs.candidateId}, ${inputs.context});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, propertiesJson: `JSON.stringify(${v}.properties)`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.updateCandidateProperty",
  label: i18n.nodes.smartRecruiters.updateCandidateProperty.label,
  description: i18n.nodes.smartRecruiters.updateCandidateProperty.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    candidateIdPin(),
    { id: "propertyId", label: i18n.nodes.smartRecruiters.updateCandidateProperty.pin_property_id, type: "string", direction: "input", defaultValue: "" },
    { id: "value", label: i18n.nodes.smartRecruiters.updateCandidateProperty.pin_value, type: "string", direction: "input", defaultValue: "" },
    execOutPin(),
    successPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.updateCandidateProperty(String(inputs.candidateId ?? ""), String(inputs.propertyId ?? ""), String(inputs.value ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersUpdateCandidateProperty(${inputs.credentialName}, ${inputs.candidateId}, ${inputs.propertyId}, ${inputs.value});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.getCandidateJobProperties",
  label: i18n.nodes.smartRecruiters.getCandidateJobProperties.label,
  description: i18n.nodes.smartRecruiters.getCandidateJobProperties.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    candidateIdPin(),
    jobIdPin(),
    propertyContextPin(i18n.nodes.smartRecruiters.getCandidateJobProperties.pin_context),
    execOutPin(),
    successPin(),
    { id: "propertiesJson", label: i18n.nodes.smartRecruiters.getCandidateJobProperties.pin_properties_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, propertiesJson: "[]", error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.getCandidateJobProperties(String(inputs.candidateId ?? ""), String(inputs.jobId ?? ""), String(inputs.context ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, propertiesJson: JSON.stringify(result.properties), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersGetCandidateJobProperties(${inputs.credentialName}, ${inputs.candidateId}, ${inputs.jobId}, ${inputs.context});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, propertiesJson: `JSON.stringify(${v}.properties)`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.updateCandidateJobProperties",
  label: i18n.nodes.smartRecruiters.updateCandidateJobProperties.label,
  description: i18n.nodes.smartRecruiters.updateCandidateJobProperties.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), candidateIdPin(), jobIdPin(), { id: "propertiesJson", label: i18n.nodes.smartRecruiters.updateCandidateJobProperties.pin_properties_json, type: "string", direction: "input", defaultValue: "[]" }, execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const parsedProperties = parseJsonBody(String(inputs.propertiesJson ?? "[]"));
    const result = await manager.updateCandidateJobProperties(String(inputs.candidateId ?? ""), String(inputs.jobId ?? ""), Array.isArray(parsedProperties) ? parsedProperties : []);
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersUpdateCandidateJobProperties(${inputs.credentialName}, ${inputs.candidateId}, ${inputs.jobId}, ${inputs.propertiesJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.listCandidateAttachments",
  label: i18n.nodes.smartRecruiters.listCandidateAttachments.label,
  description: i18n.nodes.smartRecruiters.listCandidateAttachments.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    candidateIdPin(),
    execOutPin(),
    successPin(),
    { id: "attachmentsJson", label: i18n.nodes.smartRecruiters.listCandidateAttachments.pin_attachments_json, type: "string", direction: "output" },
    { id: "totalFound", label: i18n.nodes.smartRecruiters.listCandidateAttachments.pin_total_found, type: "number", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, attachmentsJson: "[]", totalFound: 0, error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.listCandidateAttachments(String(inputs.candidateId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, attachmentsJson: JSON.stringify(result.attachments), totalFound: result.totalFound, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersListCandidateAttachments(${inputs.credentialName}, ${inputs.candidateId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, attachmentsJson: `JSON.stringify(${v}.attachments)`, totalFound: `${v}.totalFound`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.addCandidateAttachment",
  label: i18n.nodes.smartRecruiters.addCandidateAttachment.label,
  description: i18n.nodes.smartRecruiters.addCandidateAttachment.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    candidateIdPin(),
    { id: "attachmentType", label: i18n.nodes.smartRecruiters.addCandidateAttachment.pin_attachment_type, type: "enum", subType: SMARTRECRUITERS_ATTACHMENT_TYPE_ENUM_TYPE, direction: "input", defaultValue: "GENERIC_FILE", options: enumOptionIds(SMARTRECRUITERS_ATTACHMENT_TYPE_ENUM_TYPE) },
    ...fileFieldPins({
      fileBase64: i18n.nodes.smartRecruiters.addCandidateAttachment.pin_file_base64,
      fileName: i18n.nodes.smartRecruiters.addCandidateAttachment.pin_file_name,
      fileContentType: i18n.nodes.smartRecruiters.addCandidateAttachment.pin_file_content_type,
    }),
    execOutPin(),
    successPin(),
    { id: "attachmentJson", label: i18n.nodes.smartRecruiters.addCandidateAttachment.pin_attachment_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, attachmentJson: "{}", error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.addCandidateAttachment(String(inputs.candidateId ?? ""), String(inputs.attachmentType ?? ""), String(inputs.fileBase64 ?? ""), String(inputs.fileName ?? ""), String(inputs.fileContentType ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, attachmentJson: JSON.stringify(result.attachment), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersAddCandidateAttachment(${inputs.credentialName}, ${inputs.candidateId}, ${inputs.attachmentType}, ${inputs.fileBase64}, ${inputs.fileName}, ${inputs.fileContentType});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, attachmentJson: `JSON.stringify(${v}.attachment)`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.getCandidateAttachment",
  label: i18n.nodes.smartRecruiters.getCandidateAttachment.label,
  description: i18n.nodes.smartRecruiters.getCandidateAttachment.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    candidateIdPin(),
    { id: "attachmentId", label: i18n.nodes.smartRecruiters.getCandidateAttachment.pin_attachment_id, type: "string", direction: "input", defaultValue: "" },
    execOutPin(),
    successPin(),
    { id: "contentBase64", label: i18n.nodes.smartRecruiters.getCandidateAttachment.pin_content_base64, type: "string", direction: "output" },
    { id: "contentType", label: i18n.nodes.smartRecruiters.getCandidateAttachment.pin_content_type, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, contentBase64: "", contentType: "", error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.getCandidateAttachment(String(inputs.candidateId ?? ""), String(inputs.attachmentId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, contentBase64: result.contentBase64, contentType: result.contentType, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersGetCandidateAttachment(${inputs.credentialName}, ${inputs.candidateId}, ${inputs.attachmentId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, contentBase64: `${v}.contentBase64`, contentType: `${v}.contentType`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

function onboardingStatusPin(label: string) {
  return { id: "onboardingStatus", label, type: "enum" as const, subType: SMARTRECRUITERS_ONBOARDING_STATUS_ENUM_TYPE, direction: "input" as const, defaultValue: "READY_TO_ONBOARD", options: enumOptionIds(SMARTRECRUITERS_ONBOARDING_STATUS_ENUM_TYPE) };
}

registerNode({
  type: "smartRecruiters.getCandidateOnboardingStatus",
  label: i18n.nodes.smartRecruiters.getCandidateOnboardingStatus.label,
  description: i18n.nodes.smartRecruiters.getCandidateOnboardingStatus.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), candidateIdPin(), execOutPin(), successPin(), { id: "onboardingStatus", label: i18n.nodes.smartRecruiters.getCandidateOnboardingStatus.pin_onboarding_status, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, onboardingStatus: "", error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.getCandidateOnboardingStatus(String(inputs.candidateId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, onboardingStatus: result.onboardingStatus, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersGetCandidateOnboardingStatus(${inputs.credentialName}, ${inputs.candidateId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, onboardingStatus: `${v}.onboardingStatus`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.updateCandidateOnboardingStatus",
  label: i18n.nodes.smartRecruiters.updateCandidateOnboardingStatus.label,
  description: i18n.nodes.smartRecruiters.updateCandidateOnboardingStatus.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    candidateIdPin(),
    onboardingStatusPin(i18n.nodes.smartRecruiters.updateCandidateOnboardingStatus.pin_onboarding_status),
    execOutPin(),
    successPin(),
    { id: "resultOnboardingStatus", label: i18n.nodes.smartRecruiters.updateCandidateOnboardingStatus.pin_result_onboarding_status, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, resultOnboardingStatus: "", error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.updateCandidateOnboardingStatus(String(inputs.candidateId ?? ""), String(inputs.onboardingStatus ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, resultOnboardingStatus: result.onboardingStatus, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersUpdateCandidateOnboardingStatus(${inputs.credentialName}, ${inputs.candidateId}, ${inputs.onboardingStatus});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, resultOnboardingStatus: `${v}.onboardingStatus`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.getCandidateJobOnboardingStatus",
  label: i18n.nodes.smartRecruiters.getCandidateJobOnboardingStatus.label,
  description: i18n.nodes.smartRecruiters.getCandidateJobOnboardingStatus.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), candidateIdPin(), jobIdPin(), execOutPin(), successPin(), { id: "onboardingStatus", label: i18n.nodes.smartRecruiters.getCandidateJobOnboardingStatus.pin_onboarding_status, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, onboardingStatus: "", error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.getCandidateJobOnboardingStatus(String(inputs.candidateId ?? ""), String(inputs.jobId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, onboardingStatus: result.onboardingStatus, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersGetCandidateJobOnboardingStatus(${inputs.credentialName}, ${inputs.candidateId}, ${inputs.jobId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, onboardingStatus: `${v}.onboardingStatus`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.updateCandidateJobOnboardingStatus",
  label: i18n.nodes.smartRecruiters.updateCandidateJobOnboardingStatus.label,
  description: i18n.nodes.smartRecruiters.updateCandidateJobOnboardingStatus.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    candidateIdPin(),
    jobIdPin(),
    onboardingStatusPin(i18n.nodes.smartRecruiters.updateCandidateJobOnboardingStatus.pin_onboarding_status),
    execOutPin(),
    successPin(),
    { id: "resultOnboardingStatus", label: i18n.nodes.smartRecruiters.updateCandidateJobOnboardingStatus.pin_result_onboarding_status, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, resultOnboardingStatus: "", error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.updateCandidateJobOnboardingStatus(String(inputs.candidateId ?? ""), String(inputs.jobId ?? ""), String(inputs.onboardingStatus ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, resultOnboardingStatus: result.onboardingStatus, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersUpdateCandidateJobOnboardingStatus(${inputs.credentialName}, ${inputs.candidateId}, ${inputs.jobId}, ${inputs.onboardingStatus});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, resultOnboardingStatus: `${v}.onboardingStatus`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});

registerNode({
  type: "smartRecruiters.getCandidateScreeningAnswers",
  label: i18n.nodes.smartRecruiters.getCandidateScreeningAnswers.label,
  description: i18n.nodes.smartRecruiters.getCandidateScreeningAnswers.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    candidateIdPin(),
    jobIdPin(),
    execOutPin(),
    successPin(),
    { id: "answersJson", label: i18n.nodes.smartRecruiters.getCandidateScreeningAnswers.pin_answers_json, type: "string", direction: "output" },
    { id: "totalFound", label: i18n.nodes.smartRecruiters.getCandidateScreeningAnswers.pin_total_found, type: "number", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSmartRecruitersCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, answersJson: "[]", totalFound: 0, error: resolved.error } };
    const manager = SmartRecruitersManager.forAuth(resolved.auth);
    const result = await manager.getCandidateScreeningAnswers(String(inputs.candidateId ?? ""), String(inputs.jobId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, answersJson: JSON.stringify(result.answers), totalFound: result.totalFound, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySmartRecruiters.smartRecruitersGetCandidateScreeningAnswers(${inputs.credentialName}, ${inputs.candidateId}, ${inputs.jobId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, answersJson: `JSON.stringify(${v}.answers)`, totalFound: `${v}.totalFound`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT],
});
