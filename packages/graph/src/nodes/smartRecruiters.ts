import { NodeColorCategory } from "@hermione/graph/engine/types";
import { registerNode } from "@hermione/graph/engine/registry";
import { compileResultVar, SMARTRECRUITERS_MANAGER_IMPORT } from "@hermione/graph/engine/compileUtils";
import {
  SMARTRECRUITERS_HTTP_METHOD_ENUM_TYPE,
  SMARTRECRUITERS_JOB_STATUS_ENUM_TYPE,
  SMARTRECRUITERS_HIRING_TEAM_ROLE_ENUM_TYPE,
  SMARTRECRUITERS_POSITION_TYPE_ENUM_TYPE,
  SMARTRECRUITERS_JOB_AD_POSTING_VISIBILITY_ENUM_TYPE,
  SMARTRECRUITERS_ATTACHMENT_TYPE_ENUM_TYPE,
  SMARTRECRUITERS_PROPERTY_CONTEXT_ENUM_TYPE,
  SMARTRECRUITERS_ONBOARDING_STATUS_ENUM_TYPE,
  SMARTRECRUITERS_ATTENDEE_STATUS_ENUM_TYPE,
  SMARTRECRUITERS_EVENT_STATE_ENUM_TYPE,
  SMARTRECRUITERS_SELF_SCHEDULE_TYPE_ENUM_TYPE,
  SMARTRECRUITERS_TEMPLATE_HIRING_STAGE_ENUM_TYPE,
  SMARTRECRUITERS_INTERVIEW_TEMPLATE_TYPE_ENUM_TYPE,
} from "@hermione/graph/enum/smartRecruiters";
import { enumOptionIds } from "@hermione/graph/engine/enumRegistry";
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
// Every operation below calls the exact same SmartRecruitersManager static method (packages/core/
// src/lib/smartRecruitersManager.ts) from both execute() (interpreter path) and compileExecute()
// (compiled/deployed path) — SmartRecruitersManager resolves the named credential straight from the
// database itself, so unlike most other providers there is no separate
// functionLibrarySmartRecruiters.ts env-var-reading layer and no ctx.getCredential vault lookup
// here: both paths are already identical (mirrors twilio.ts/github.ts).

const GROUP_NAME = "Request.SmartRecruiters";

// SmartRecruitersManager (like TwilioManager/GithubManager) resolves its named credential straight
// from the database itself (see its findCredential) — no ctx.getCredential vault lookup here, and
// both the interpreter and the compiled/deployed path below call the exact same manager methods.
//
// SmartRecruitersManager reaches the database directly, which pulls in better-sqlite3 and Node
// builtins — fine for execute(), which only ever runs server-side, but this file is still statically
// imported client-side too (for the node-creation menu), so a plain top-level import here would drag
// that whole chain into the browser bundle. Loaded with a runtime `import()` instead, ignored by
// both bundlers, so it's never even resolved for the client build; only ever actually called
// server-side, where it resolves normally.
async function loadSmartRecruitersManager(): Promise<typeof import("@hermione/core/lib/smartRecruitersManager").SmartRecruitersManager> {
  const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "@hermione/core/lib/smartRecruitersManager");
  return mod.SmartRecruitersManager;
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

function jobApplicationIdPin() {
  return { id: "jobApplicationId", label: i18n.nodes.smartRecruiters.__shared.pin_job_application_id, type: "string" as const, direction: "input" as const, defaultValue: "" };
}

function userIdPin() {
  return { id: "userId", label: i18n.nodes.smartRecruiters.__shared.pin_user_id, type: "string" as const, direction: "input" as const, defaultValue: "" };
}

function accessGroupIdPin() {
  return { id: "accessGroupId", label: i18n.nodes.smartRecruiters.__shared.pin_access_group_id, type: "string" as const, direction: "input" as const, defaultValue: "" };
}

function interviewIdPin() {
  return { id: "interviewId", label: i18n.nodes.smartRecruiters.__shared.pin_interview_id, type: "string" as const, direction: "input" as const, defaultValue: "" };
}

function timeslotIdPin() {
  return { id: "timeslotId", label: i18n.nodes.smartRecruiters.__shared.pin_timeslot_id, type: "string" as const, direction: "input" as const, defaultValue: "" };
}

function eventIdPin() {
  return { id: "eventId", label: i18n.nodes.smartRecruiters.__shared.pin_event_id, type: "string" as const, direction: "input" as const, defaultValue: "" };
}

function sessionIdPin() {
  return { id: "sessionId", label: i18n.nodes.smartRecruiters.__shared.pin_session_id, type: "string" as const, direction: "input" as const, defaultValue: "" };
}

function selfScheduleIdPin() {
  return { id: "selfScheduleId", label: i18n.nodes.smartRecruiters.__shared.pin_self_schedule_id, type: "string" as const, direction: "input" as const, defaultValue: "" };
}

function applicationUuidPin() {
  return { id: "applicationUuid", label: i18n.nodes.smartRecruiters.__shared.pin_application_uuid, type: "string" as const, direction: "input" as const, defaultValue: "" };
}

function applicationIdPin() {
  return { id: "applicationId", label: i18n.nodes.smartRecruiters.__shared.pin_application_id, type: "string" as const, direction: "input" as const, defaultValue: "" };
}

function statusPin(label: string, defaultValue = "accepted") {
  return { id: "status", label, type: "enum" as const, subType: SMARTRECRUITERS_ATTENDEE_STATUS_ENUM_TYPE, direction: "input" as const, defaultValue, options: enumOptionIds(SMARTRECRUITERS_ATTENDEE_STATUS_ENUM_TYPE) };
}

function eventStatePin(label: string) {
  return { id: "state", label, type: "enum" as const, subType: SMARTRECRUITERS_EVENT_STATE_ENUM_TYPE, direction: "input" as const, defaultValue: "ACTIVE", options: enumOptionIds(SMARTRECRUITERS_EVENT_STATE_ENUM_TYPE) };
}

function templateIdPin() {
  return { id: "templateId", label: i18n.nodes.smartRecruiters.__shared.pin_template_id, type: "string" as const, direction: "input" as const, defaultValue: "" };
}

function jobInterviewTemplateIdPin() {
  return { id: "jobInterviewTemplateId", label: i18n.nodes.smartRecruiters.__shared.pin_job_interview_template_id, type: "string" as const, direction: "input" as const, defaultValue: "" };
}

function hiringStagePin(label: string) {
  return { id: "hiringStage", label, type: "enum" as const, subType: SMARTRECRUITERS_TEMPLATE_HIRING_STAGE_ENUM_TYPE, direction: "input" as const, defaultValue: "INTERVIEW", options: enumOptionIds(SMARTRECRUITERS_TEMPLATE_HIRING_STAGE_ENUM_TYPE) };
}

function hiringStepPin(label: string) {
  return { id: "hiringStep", label, type: "string" as const, direction: "input" as const, defaultValue: "" };
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
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).apiCall(String(inputs.credentialName ?? ""), String(inputs.method ?? "GET"), String(inputs.path ?? ""), parseJsonRecord(String(inputs.queryJson ?? "")), parseJsonBody(String(inputs.bodyJson ?? "")));
    return {
      nextExec: "exec-out",
      outputs: { success: result.success, status: result.status, dataJson: result.dataJson, error: result.error },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.apiCall(${inputs.credentialName}, ${inputs.method}, ${inputs.path}, ${inputs.queryJson}, ${inputs.bodyJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, status: `${v}.status`, dataJson: `${v}.dataJson`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).searchJobs(String(inputs.credentialName ?? ""), { ...parseJsonRecord(String(inputs.queryJson ?? "")), offset: Number(inputs.offset ?? 0), limit: Number(inputs.limit ?? 20) });
    return { nextExec: "exec-out", outputs: { success: result.success, jobsJson: JSON.stringify(result.jobs), totalFound: result.totalFound, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.searchJobs(${inputs.credentialName}, ${inputs.queryJson}, ${inputs.offset}, ${inputs.limit});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, jobsJson: `JSON.stringify(${v}.jobs)`, totalFound: `${v}.totalFound`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).createJob(String(inputs.credentialName ?? ""), parseJsonRecord(String(inputs.jobJson ?? "")));
    return { nextExec: "exec-out", outputs: { success: result.success, createdJobJson: JSON.stringify(result.job), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.createJob(${inputs.credentialName}, ${inputs.jobJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, createdJobJson: `JSON.stringify(${v}.job)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.getJob",
  label: i18n.nodes.smartRecruiters.getJob.label,
  description: i18n.nodes.smartRecruiters.getJob.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), jobIdPin(), execOutPin(), successPin(), { id: "jobJson", label: i18n.nodes.smartRecruiters.getJob.pin_job_json, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).getJob(String(inputs.credentialName ?? ""), String(inputs.jobId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, jobJson: JSON.stringify(result.job), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.getJob(${inputs.credentialName}, ${inputs.jobId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, jobJson: `JSON.stringify(${v}.job)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).patchJob(String(inputs.credentialName ?? ""), String(inputs.jobId ?? ""), parseJsonRecord(String(inputs.patchJson ?? "")));
    return { nextExec: "exec-out", outputs: { success: result.success, jobJson: JSON.stringify(result.job), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.patchJob(${inputs.credentialName}, ${inputs.jobId}, ${inputs.patchJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, jobJson: `JSON.stringify(${v}.job)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).updateJobStatus(String(inputs.credentialName ?? ""), String(inputs.jobId ?? ""), String(inputs.status ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, jobJson: JSON.stringify(result.job), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.updateJobStatus(${inputs.credentialName}, ${inputs.jobId}, ${inputs.status});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, jobJson: `JSON.stringify(${v}.job)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.getJobStatusHistory",
  label: i18n.nodes.smartRecruiters.getJobStatusHistory.label,
  description: i18n.nodes.smartRecruiters.getJobStatusHistory.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), jobIdPin(), execOutPin(), successPin(), { id: "historyJson", label: i18n.nodes.smartRecruiters.getJobStatusHistory.pin_history_json, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).getJobStatusHistory(String(inputs.credentialName ?? ""), String(inputs.jobId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, historyJson: JSON.stringify(result.history), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.getJobStatusHistory(${inputs.credentialName}, ${inputs.jobId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, historyJson: `JSON.stringify(${v}.history)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.getLatestApprovalRequest",
  label: i18n.nodes.smartRecruiters.getLatestApprovalRequest.label,
  description: i18n.nodes.smartRecruiters.getLatestApprovalRequest.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), jobIdPin(), execOutPin(), successPin(), { id: "approvalJson", label: i18n.nodes.smartRecruiters.getLatestApprovalRequest.pin_approval_json, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).getLatestApprovalRequest(String(inputs.credentialName ?? ""), String(inputs.jobId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, approvalJson: JSON.stringify(result.approval), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.getLatestApprovalRequest(${inputs.credentialName}, ${inputs.jobId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, approvalJson: `JSON.stringify(${v}.approval)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).updateHeadcount(String(inputs.credentialName ?? ""), String(inputs.jobId ?? ""), Number(inputs.headcount ?? 0));
    return { nextExec: "exec-out", outputs: { success: result.success, jobJson: JSON.stringify(result.job), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.updateHeadcount(${inputs.credentialName}, ${inputs.jobId}, ${inputs.headcount});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, jobJson: `JSON.stringify(${v}.job)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.getJobNote",
  label: i18n.nodes.smartRecruiters.getJobNote.label,
  description: i18n.nodes.smartRecruiters.getJobNote.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), jobIdPin(), execOutPin(), successPin(), { id: "noteJson", label: i18n.nodes.smartRecruiters.getJobNote.pin_note_json, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).getJobNote(String(inputs.credentialName ?? ""), String(inputs.jobId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, noteJson: JSON.stringify(result.note), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.getJobNote(${inputs.credentialName}, ${inputs.jobId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, noteJson: `JSON.stringify(${v}.note)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).updateJobNote(String(inputs.credentialName ?? ""), String(inputs.jobId ?? ""), String(inputs.content ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, noteJson: JSON.stringify(result.note), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.updateJobNote(${inputs.credentialName}, ${inputs.jobId}, ${inputs.content});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, noteJson: `JSON.stringify(${v}.note)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).listJobAds(String(inputs.credentialName ?? ""), String(inputs.jobId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, jobAdsJson: JSON.stringify(result.jobAds), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.listJobAds(${inputs.credentialName}, ${inputs.jobId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, jobAdsJson: `JSON.stringify(${v}.jobAds)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).createJobAd(String(inputs.credentialName ?? ""), String(inputs.jobId ?? ""), parseJsonRecord(String(inputs.jobAdJson ?? "")));
    return { nextExec: "exec-out", outputs: { success: result.success, createdJobAdJson: JSON.stringify(result.jobAd), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.createJobAd(${inputs.credentialName}, ${inputs.jobId}, ${inputs.jobAdJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, createdJobAdJson: `JSON.stringify(${v}.jobAd)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.getJobAd",
  label: i18n.nodes.smartRecruiters.getJobAd.label,
  description: i18n.nodes.smartRecruiters.getJobAd.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), jobIdPin(), jobAdIdPin(), execOutPin(), successPin(), { id: "jobAdJson", label: i18n.nodes.smartRecruiters.getJobAd.pin_job_ad_json, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).getJobAd(String(inputs.credentialName ?? ""), String(inputs.jobId ?? ""), String(inputs.jobAdId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, jobAdJson: JSON.stringify(result.jobAd), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.getJobAd(${inputs.credentialName}, ${inputs.jobId}, ${inputs.jobAdId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, jobAdJson: `JSON.stringify(${v}.jobAd)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).updateJobAd(String(inputs.credentialName ?? ""), String(inputs.jobId ?? ""), String(inputs.jobAdId ?? ""), parseJsonRecord(String(inputs.jobAdJson ?? "")));
    return { nextExec: "exec-out", outputs: { success: result.success, updatedJobAdJson: JSON.stringify(result.jobAd), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.updateJobAd(${inputs.credentialName}, ${inputs.jobId}, ${inputs.jobAdId}, ${inputs.jobAdJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, updatedJobAdJson: `JSON.stringify(${v}.jobAd)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (
      await loadSmartRecruitersManager()
    ).publishJobAdPosting(String(inputs.credentialName ?? ""), String(inputs.jobId ?? ""), String(inputs.jobAdId ?? ""), {
      aggregators: Boolean(inputs.aggregators ?? true),
      visibility: String(inputs.visibility ?? "PUBLIC"),
      includeInternal: Boolean(inputs.includeInternal ?? true),
      delayPublicInDays: Number(inputs.delayPublicInDays ?? 0),
    });
    return { nextExec: "exec-out", outputs: { success: result.success, status: result.status, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await SmartRecruitersManager.publishJobAdPosting(${inputs.credentialName}, ${inputs.jobId}, ${inputs.jobAdId}, ${inputs.aggregators}, ${inputs.visibility}, ${inputs.includeInternal}, ${inputs.delayPublicInDays});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, status: `${v}.status`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.unpublishJobAdPosting",
  label: i18n.nodes.smartRecruiters.unpublishJobAdPosting.label,
  description: i18n.nodes.smartRecruiters.unpublishJobAdPosting.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), jobIdPin(), jobAdIdPin(), execOutPin(), successPin(), { id: "status", label: i18n.nodes.smartRecruiters.unpublishJobAdPosting.pin_status, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).unpublishJobAdPosting(String(inputs.credentialName ?? ""), String(inputs.jobId ?? ""), String(inputs.jobAdId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, status: result.status, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.unpublishJobAdPosting(${inputs.credentialName}, ${inputs.jobId}, ${inputs.jobAdId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, status: `${v}.status`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).listJobAdPostings(String(inputs.credentialName ?? ""), String(inputs.jobId ?? ""), String(inputs.jobAdId ?? ""), Boolean(inputs.activeOnly ?? true));
    return { nextExec: "exec-out", outputs: { success: result.success, postingsJson: JSON.stringify(result.postings), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.listJobAdPostings(${inputs.credentialName}, ${inputs.jobId}, ${inputs.jobAdId}, ${inputs.activeOnly});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, postingsJson: `JSON.stringify(${v}.postings)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).listPositions(String(inputs.credentialName ?? ""), String(inputs.jobId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, positionsJson: JSON.stringify(result.positions), totalFound: result.totalFound, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.listPositions(${inputs.credentialName}, ${inputs.jobId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, positionsJson: `JSON.stringify(${v}.positions)`, totalFound: `${v}.totalFound`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (
      await loadSmartRecruitersManager()
    ).createPosition(String(inputs.credentialName ?? ""), String(inputs.jobId ?? ""), {
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
    `const ${compileResultVar(node.id)} = await SmartRecruitersManager.createPosition(${inputs.credentialName}, ${inputs.jobId}, ${inputs.type}, ${inputs.positionOpenDate}, ${inputs.targetStartDate}, ${inputs.externalPositionId}, ${inputs.incumbentName}, ${inputs.hiringManagerId});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, positionJson: `JSON.stringify(${v}.position)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).getPosition(String(inputs.credentialName ?? ""), String(inputs.jobId ?? ""), String(inputs.positionId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, positionJson: JSON.stringify(result.position), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.getPosition(${inputs.credentialName}, ${inputs.jobId}, ${inputs.positionId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, positionJson: `JSON.stringify(${v}.position)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (
      await loadSmartRecruitersManager()
    ).updatePosition(String(inputs.credentialName ?? ""), String(inputs.jobId ?? ""), String(inputs.positionId ?? ""), {
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
    `const ${compileResultVar(node.id)} = await SmartRecruitersManager.updatePosition(${inputs.credentialName}, ${inputs.jobId}, ${inputs.positionId}, ${inputs.type}, ${inputs.positionOpenDate}, ${inputs.targetStartDate}, ${inputs.externalPositionId}, ${inputs.incumbentName}, ${inputs.hiringManagerId});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, positionJson: `JSON.stringify(${v}.position)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.deletePosition",
  label: i18n.nodes.smartRecruiters.deletePosition.label,
  description: i18n.nodes.smartRecruiters.deletePosition.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), jobIdPin(), { id: "positionId", label: i18n.nodes.smartRecruiters.deletePosition.pin_position_id, type: "string", direction: "input", defaultValue: "" }, execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).deletePosition(String(inputs.credentialName ?? ""), String(inputs.jobId ?? ""), String(inputs.positionId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.deletePosition(${inputs.credentialName}, ${inputs.jobId}, ${inputs.positionId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).getHiringTeam(String(inputs.credentialName ?? ""), String(inputs.jobId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, membersJson: JSON.stringify(result.members), totalFound: result.totalFound, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.getHiringTeam(${inputs.credentialName}, ${inputs.jobId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, membersJson: `JSON.stringify(${v}.members)`, totalFound: `${v}.totalFound`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).addHiringTeamMember(String(inputs.credentialName ?? ""), String(inputs.jobId ?? ""), String(inputs.userId ?? ""), String(inputs.role ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, memberJson: JSON.stringify(result.member), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.addHiringTeamMember(${inputs.credentialName}, ${inputs.jobId}, ${inputs.userId}, ${inputs.role});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, memberJson: `JSON.stringify(${v}.member)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.removeHiringTeamMember",
  label: i18n.nodes.smartRecruiters.removeHiringTeamMember.label,
  description: i18n.nodes.smartRecruiters.removeHiringTeamMember.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), jobIdPin(), { id: "userId", label: i18n.nodes.smartRecruiters.removeHiringTeamMember.pin_user_id, type: "string", direction: "input", defaultValue: "" }, execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).removeHiringTeamMember(String(inputs.credentialName ?? ""), String(inputs.jobId ?? ""), String(inputs.userId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.removeHiringTeamMember(${inputs.credentialName}, ${inputs.jobId}, ${inputs.userId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).searchCandidates(String(inputs.credentialName ?? ""), { ...parseJsonRecord(String(inputs.queryJson ?? "")), pageId: String(inputs.pageId ?? "") || undefined, limit: Number(inputs.limit ?? 20) });
    return { nextExec: "exec-out", outputs: { success: result.success, candidatesJson: JSON.stringify(result.candidates), totalFound: result.totalFound, nextPageId: result.nextPageId, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.searchCandidates(${inputs.credentialName}, ${inputs.queryJson}, ${inputs.pageId}, ${inputs.limit});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, candidatesJson: `JSON.stringify(${v}.candidates)`, totalFound: `${v}.totalFound`, nextPageId: `${v}.nextPageId`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).addCandidate(String(inputs.credentialName ?? ""), parseJsonRecord(String(inputs.candidateJson ?? "")));
    return { nextExec: "exec-out", outputs: { success: result.success, createdCandidateJson: JSON.stringify(result.candidate), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.addCandidate(${inputs.credentialName}, ${inputs.candidateJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, createdCandidateJson: `JSON.stringify(${v}.candidate)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).addCandidateToJob(String(inputs.credentialName ?? ""), String(inputs.jobId ?? ""), parseJsonRecord(String(inputs.candidateJson ?? "")));
    return { nextExec: "exec-out", outputs: { success: result.success, createdCandidateJson: JSON.stringify(result.candidate), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.addCandidateToJob(${inputs.credentialName}, ${inputs.jobId}, ${inputs.candidateJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, createdCandidateJson: `JSON.stringify(${v}.candidate)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (
      await loadSmartRecruitersManager()
    ).parseResume(String(inputs.credentialName ?? ""), String(inputs.fileBase64 ?? ""), String(inputs.fileName ?? ""), String(inputs.fileContentType ?? ""), String(inputs.sourceTypeId ?? ""), String(inputs.sourceSubTypeId ?? ""), String(inputs.sourceId ?? ""), Boolean(inputs.internal ?? false));
    return { nextExec: "exec-out", outputs: { success: result.success, createdCandidateJson: JSON.stringify(result.candidate), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await SmartRecruitersManager.parseResume(${inputs.credentialName}, ${inputs.fileBase64}, ${inputs.fileName}, ${inputs.fileContentType}, ${inputs.sourceTypeId}, ${inputs.sourceSubTypeId}, ${inputs.sourceId}, ${inputs.internal});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, createdCandidateJson: `JSON.stringify(${v}.candidate)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (
      await loadSmartRecruitersManager()
    ).parseResumeForJob(
      String(inputs.credentialName ?? ""),
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
    `const ${compileResultVar(node.id)} = await SmartRecruitersManager.parseResumeForJob(${inputs.credentialName}, ${inputs.jobId}, ${inputs.fileBase64}, ${inputs.fileName}, ${inputs.fileContentType}, ${inputs.sourceTypeId}, ${inputs.sourceSubTypeId}, ${inputs.sourceId}, ${inputs.internal});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, createdCandidateJson: `JSON.stringify(${v}.candidate)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.getCandidate",
  label: i18n.nodes.smartRecruiters.getCandidate.label,
  description: i18n.nodes.smartRecruiters.getCandidate.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), candidateIdPin(), execOutPin(), successPin(), { id: "candidateJson", label: i18n.nodes.smartRecruiters.getCandidate.pin_candidate_json, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).getCandidate(String(inputs.credentialName ?? ""), String(inputs.candidateId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, candidateJson: JSON.stringify(result.candidate), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.getCandidate(${inputs.credentialName}, ${inputs.candidateId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, candidateJson: `JSON.stringify(${v}.candidate)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.deleteCandidate",
  label: i18n.nodes.smartRecruiters.deleteCandidate.label,
  description: i18n.nodes.smartRecruiters.deleteCandidate.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), candidateIdPin(), execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).deleteCandidate(String(inputs.credentialName ?? ""), String(inputs.candidateId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.deleteCandidate(${inputs.credentialName}, ${inputs.candidateId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).updateCandidate(String(inputs.credentialName ?? ""), String(inputs.candidateId ?? ""), parseJsonRecord(String(inputs.patchJson ?? "")));
    return { nextExec: "exec-out", outputs: { success: result.success, candidateJson: JSON.stringify(result.candidate), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.updateCandidate(${inputs.credentialName}, ${inputs.candidateId}, ${inputs.patchJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, candidateJson: `JSON.stringify(${v}.candidate)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.getCandidateTags",
  label: i18n.nodes.smartRecruiters.getCandidateTags.label,
  description: i18n.nodes.smartRecruiters.getCandidateTags.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), candidateIdPin(), execOutPin(), successPin(), { id: "tagsJson", label: i18n.nodes.smartRecruiters.getCandidateTags.pin_tags_json, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).getCandidateTags(String(inputs.credentialName ?? ""), String(inputs.candidateId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, tagsJson: JSON.stringify(result.tags), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.getCandidateTags(${inputs.credentialName}, ${inputs.candidateId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, tagsJson: `JSON.stringify(${v}.tags)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const parsedTags = parseJsonBody(String(inputs.tagsJson ?? "[]"));
    const result = await (await loadSmartRecruitersManager()).addCandidateTags(String(inputs.credentialName ?? ""), String(inputs.candidateId ?? ""), Array.isArray(parsedTags) ? parsedTags : []);
    return { nextExec: "exec-out", outputs: { success: result.success, resultTagsJson: JSON.stringify(result.tags), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.addCandidateTags(${inputs.credentialName}, ${inputs.candidateId}, ${inputs.tagsJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, resultTagsJson: `JSON.stringify(${v}.tags)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const parsedTags = parseJsonBody(String(inputs.tagsJson ?? "[]"));
    const result = await (await loadSmartRecruitersManager()).replaceCandidateTags(String(inputs.credentialName ?? ""), String(inputs.candidateId ?? ""), Array.isArray(parsedTags) ? parsedTags : []);
    return { nextExec: "exec-out", outputs: { success: result.success, resultTagsJson: JSON.stringify(result.tags), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.replaceCandidateTags(${inputs.credentialName}, ${inputs.candidateId}, ${inputs.tagsJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, resultTagsJson: `JSON.stringify(${v}.tags)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.deleteCandidateTags",
  label: i18n.nodes.smartRecruiters.deleteCandidateTags.label,
  description: i18n.nodes.smartRecruiters.deleteCandidateTags.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), candidateIdPin(), execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).deleteCandidateTags(String(inputs.credentialName ?? ""), String(inputs.candidateId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.deleteCandidateTags(${inputs.credentialName}, ${inputs.candidateId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (
      await loadSmartRecruitersManager()
    ).updateCandidateJobStatus(String(inputs.credentialName ?? ""), String(inputs.candidateId ?? ""), String(inputs.jobId ?? ""), String(inputs.status ?? ""), String(inputs.subStatus ?? ""), String(inputs.startsOn ?? ""), String(inputs.reason ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await SmartRecruitersManager.updateCandidateJobStatus(${inputs.credentialName}, ${inputs.candidateId}, ${inputs.jobId}, ${inputs.status}, ${inputs.subStatus}, ${inputs.startsOn}, ${inputs.reason});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.getCandidateJobStatusHistory",
  label: i18n.nodes.smartRecruiters.getCandidateJobStatusHistory.label,
  description: i18n.nodes.smartRecruiters.getCandidateJobStatusHistory.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), candidateIdPin(), jobIdPin(), execOutPin(), successPin(), { id: "historyJson", label: i18n.nodes.smartRecruiters.getCandidateJobStatusHistory.pin_history_json, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).getCandidateJobStatusHistory(String(inputs.credentialName ?? ""), String(inputs.candidateId ?? ""), String(inputs.jobId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, historyJson: JSON.stringify(result.history), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.getCandidateJobStatusHistory(${inputs.credentialName}, ${inputs.candidateId}, ${inputs.jobId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, historyJson: `JSON.stringify(${v}.history)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).updateCandidateSource(String(inputs.credentialName ?? ""), String(inputs.candidateId ?? ""), String(inputs.jobId ?? ""), String(inputs.sourceTypeId ?? ""), String(inputs.sourceSubTypeId ?? ""), String(inputs.sourceId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await SmartRecruitersManager.updateCandidateSource(${inputs.credentialName}, ${inputs.candidateId}, ${inputs.jobId}, ${inputs.sourceTypeId}, ${inputs.sourceSubTypeId}, ${inputs.sourceId});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const parsedIds = parseJsonBody(String(inputs.candidateIdsJson ?? "[]"));
    const result = await (await loadSmartRecruitersManager()).requestCandidateConsent(String(inputs.credentialName ?? ""), Array.isArray(parsedIds) ? parsedIds : []);
    return { nextExec: "exec-out", outputs: { success: result.success, resultsJson: JSON.stringify(result.results), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.requestCandidateConsent(${inputs.credentialName}, ${inputs.candidateIdsJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, resultsJson: `JSON.stringify(${v}.results)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).getCandidateConsentStatus(String(inputs.credentialName ?? ""), String(inputs.candidateId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, status: result.status, date: result.date, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.getCandidateConsentStatus(${inputs.credentialName}, ${inputs.candidateId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, status: `${v}.status`, date: `${v}.date`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.getCandidateConsentDecisions",
  label: i18n.nodes.smartRecruiters.getCandidateConsentDecisions.label,
  description: i18n.nodes.smartRecruiters.getCandidateConsentDecisions.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), candidateIdPin(), execOutPin(), successPin(), { id: "decisionsJson", label: i18n.nodes.smartRecruiters.getCandidateConsentDecisions.pin_decisions_json, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).getCandidateConsentDecisions(String(inputs.credentialName ?? ""), String(inputs.candidateId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, decisionsJson: JSON.stringify(result.decisions), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.getCandidateConsentDecisions(${inputs.credentialName}, ${inputs.candidateId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, decisionsJson: `JSON.stringify(${v}.decisions)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).getCandidateProperties(String(inputs.credentialName ?? ""), String(inputs.candidateId ?? ""), String(inputs.context ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, propertiesJson: JSON.stringify(result.properties), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.getCandidateProperties(${inputs.credentialName}, ${inputs.candidateId}, ${inputs.context});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, propertiesJson: `JSON.stringify(${v}.properties)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).updateCandidateProperty(String(inputs.credentialName ?? ""), String(inputs.candidateId ?? ""), String(inputs.propertyId ?? ""), String(inputs.value ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.updateCandidateProperty(${inputs.credentialName}, ${inputs.candidateId}, ${inputs.propertyId}, ${inputs.value});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).getCandidateJobProperties(String(inputs.credentialName ?? ""), String(inputs.candidateId ?? ""), String(inputs.jobId ?? ""), String(inputs.context ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, propertiesJson: JSON.stringify(result.properties), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.getCandidateJobProperties(${inputs.credentialName}, ${inputs.candidateId}, ${inputs.jobId}, ${inputs.context});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, propertiesJson: `JSON.stringify(${v}.properties)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.updateCandidateJobProperties",
  label: i18n.nodes.smartRecruiters.updateCandidateJobProperties.label,
  description: i18n.nodes.smartRecruiters.updateCandidateJobProperties.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), candidateIdPin(), jobIdPin(), { id: "propertiesJson", label: i18n.nodes.smartRecruiters.updateCandidateJobProperties.pin_properties_json, type: "string", direction: "input", defaultValue: "[]" }, execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const parsedProperties = parseJsonBody(String(inputs.propertiesJson ?? "[]"));
    const result = await (await loadSmartRecruitersManager()).updateCandidateJobProperties(String(inputs.credentialName ?? ""), String(inputs.candidateId ?? ""), String(inputs.jobId ?? ""), Array.isArray(parsedProperties) ? parsedProperties : []);
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.updateCandidateJobProperties(${inputs.credentialName}, ${inputs.candidateId}, ${inputs.jobId}, ${inputs.propertiesJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).listCandidateAttachments(String(inputs.credentialName ?? ""), String(inputs.candidateId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, attachmentsJson: JSON.stringify(result.attachments), totalFound: result.totalFound, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.listCandidateAttachments(${inputs.credentialName}, ${inputs.candidateId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, attachmentsJson: `JSON.stringify(${v}.attachments)`, totalFound: `${v}.totalFound`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).addCandidateAttachment(String(inputs.credentialName ?? ""), String(inputs.candidateId ?? ""), String(inputs.attachmentType ?? ""), String(inputs.fileBase64 ?? ""), String(inputs.fileName ?? ""), String(inputs.fileContentType ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, attachmentJson: JSON.stringify(result.attachment), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await SmartRecruitersManager.addCandidateAttachment(${inputs.credentialName}, ${inputs.candidateId}, ${inputs.attachmentType}, ${inputs.fileBase64}, ${inputs.fileName}, ${inputs.fileContentType});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, attachmentJson: `JSON.stringify(${v}.attachment)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).getCandidateAttachment(String(inputs.credentialName ?? ""), String(inputs.candidateId ?? ""), String(inputs.attachmentId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, contentBase64: result.contentBase64, contentType: result.contentType, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.getCandidateAttachment(${inputs.credentialName}, ${inputs.candidateId}, ${inputs.attachmentId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, contentBase64: `${v}.contentBase64`, contentType: `${v}.contentType`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).getCandidateOnboardingStatus(String(inputs.credentialName ?? ""), String(inputs.candidateId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, onboardingStatus: result.onboardingStatus, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.getCandidateOnboardingStatus(${inputs.credentialName}, ${inputs.candidateId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, onboardingStatus: `${v}.onboardingStatus`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).updateCandidateOnboardingStatus(String(inputs.credentialName ?? ""), String(inputs.candidateId ?? ""), String(inputs.onboardingStatus ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, resultOnboardingStatus: result.onboardingStatus, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.updateCandidateOnboardingStatus(${inputs.credentialName}, ${inputs.candidateId}, ${inputs.onboardingStatus});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, resultOnboardingStatus: `${v}.onboardingStatus`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.getCandidateJobOnboardingStatus",
  label: i18n.nodes.smartRecruiters.getCandidateJobOnboardingStatus.label,
  description: i18n.nodes.smartRecruiters.getCandidateJobOnboardingStatus.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), candidateIdPin(), jobIdPin(), execOutPin(), successPin(), { id: "onboardingStatus", label: i18n.nodes.smartRecruiters.getCandidateJobOnboardingStatus.pin_onboarding_status, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).getCandidateJobOnboardingStatus(String(inputs.credentialName ?? ""), String(inputs.candidateId ?? ""), String(inputs.jobId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, onboardingStatus: result.onboardingStatus, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.getCandidateJobOnboardingStatus(${inputs.credentialName}, ${inputs.candidateId}, ${inputs.jobId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, onboardingStatus: `${v}.onboardingStatus`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).updateCandidateJobOnboardingStatus(String(inputs.credentialName ?? ""), String(inputs.candidateId ?? ""), String(inputs.jobId ?? ""), String(inputs.onboardingStatus ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, resultOnboardingStatus: result.onboardingStatus, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.updateCandidateJobOnboardingStatus(${inputs.credentialName}, ${inputs.candidateId}, ${inputs.jobId}, ${inputs.onboardingStatus});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, resultOnboardingStatus: `${v}.onboardingStatus`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).getCandidateScreeningAnswers(String(inputs.credentialName ?? ""), String(inputs.candidateId ?? ""), String(inputs.jobId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, answersJson: JSON.stringify(result.answers), totalFound: result.totalFound, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.getCandidateScreeningAnswers(${inputs.credentialName}, ${inputs.candidateId}, ${inputs.jobId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, answersJson: `JSON.stringify(${v}.answers)`, totalFound: `${v}.totalFound`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.getJobApplication",
  label: i18n.nodes.smartRecruiters.getJobApplication.label,
  description: i18n.nodes.smartRecruiters.getJobApplication.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), jobApplicationIdPin(), execOutPin(), successPin(), { id: "jobApplicationJson", label: i18n.nodes.smartRecruiters.getJobApplication.pin_job_application_json, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).getJobApplication(String(inputs.credentialName ?? ""), String(inputs.jobApplicationId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, jobApplicationJson: JSON.stringify(result.jobApplication), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.getJobApplication(${inputs.credentialName}, ${inputs.jobApplicationId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, jobApplicationJson: `JSON.stringify(${v}.jobApplication)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.deleteJobApplication",
  label: i18n.nodes.smartRecruiters.deleteJobApplication.label,
  description: i18n.nodes.smartRecruiters.deleteJobApplication.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), jobApplicationIdPin(), execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).deleteJobApplication(String(inputs.credentialName ?? ""), String(inputs.jobApplicationId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.deleteJobApplication(${inputs.credentialName}, ${inputs.jobApplicationId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

// --- Users & Access (Phase 5) ----------------------------------------------------------------

registerNode({
  type: "smartRecruiters.searchUsers",
  label: i18n.nodes.smartRecruiters.searchUsers.label,
  description: i18n.nodes.smartRecruiters.searchUsers.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "queryJson", label: i18n.nodes.smartRecruiters.__shared.pin_query_json, type: "string", direction: "input", defaultValue: "{}" },
    { id: "pageId", label: i18n.nodes.smartRecruiters.searchUsers.pin_page_id, type: "string", direction: "input", defaultValue: "" },
    { id: "limit", label: i18n.nodes.smartRecruiters.searchUsers.pin_limit, type: "number", direction: "input", defaultValue: 20 },
    execOutPin(),
    successPin(),
    { id: "usersJson", label: i18n.nodes.smartRecruiters.searchUsers.pin_users_json, type: "string", direction: "output" },
    { id: "nextPageId", label: i18n.nodes.smartRecruiters.searchUsers.pin_next_page_id, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).searchUsers(String(inputs.credentialName ?? ""), { ...parseJsonRecord(String(inputs.queryJson ?? "")), pageId: String(inputs.pageId ?? "") || undefined, limit: Number(inputs.limit ?? 20) });
    return { nextExec: "exec-out", outputs: { success: result.success, usersJson: JSON.stringify(result.users), nextPageId: result.nextPageId, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.searchUsers(${inputs.credentialName}, ${inputs.queryJson}, ${inputs.pageId}, ${inputs.limit});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, usersJson: `JSON.stringify(${v}.users)`, nextPageId: `${v}.nextPageId`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.createUser",
  label: i18n.nodes.smartRecruiters.createUser.label,
  description: i18n.nodes.smartRecruiters.createUser.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "userJson", label: i18n.nodes.smartRecruiters.createUser.pin_user_json, type: "string", direction: "input", defaultValue: "{}" },
    execOutPin(),
    successPin(),
    { id: "createdUserJson", label: i18n.nodes.smartRecruiters.createUser.pin_created_user_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).createUser(String(inputs.credentialName ?? ""), parseJsonRecord(String(inputs.userJson ?? "")) as Record<string, unknown>);
    return { nextExec: "exec-out", outputs: { success: result.success, createdUserJson: JSON.stringify(result.user), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.createUser(${inputs.credentialName}, ${inputs.userJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, createdUserJson: `JSON.stringify(${v}.user)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.getUser",
  label: i18n.nodes.smartRecruiters.getUser.label,
  description: i18n.nodes.smartRecruiters.getUser.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), userIdPin(), execOutPin(), successPin(), { id: "userJson", label: i18n.nodes.smartRecruiters.getUser.pin_user_json, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).getUser(String(inputs.credentialName ?? ""), String(inputs.userId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, userJson: JSON.stringify(result.user), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.getUser(${inputs.credentialName}, ${inputs.userId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, userJson: `JSON.stringify(${v}.user)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.updateUser",
  label: i18n.nodes.smartRecruiters.updateUser.label,
  description: i18n.nodes.smartRecruiters.updateUser.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    userIdPin(),
    { id: "patchJson", label: i18n.nodes.smartRecruiters.updateUser.pin_patch_json, type: "string", direction: "input", defaultValue: "[]" },
    execOutPin(),
    successPin(),
    { id: "userJson", label: i18n.nodes.smartRecruiters.updateUser.pin_user_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const patch = parseJsonBody(String(inputs.patchJson ?? ""));
    const result = await (await loadSmartRecruitersManager()).updateUser(String(inputs.credentialName ?? ""), String(inputs.userId ?? ""), Array.isArray(patch) ? patch : []);
    return { nextExec: "exec-out", outputs: { success: result.success, userJson: JSON.stringify(result.user), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.updateUser(${inputs.credentialName}, ${inputs.userId}, ${inputs.patchJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, userJson: `JSON.stringify(${v}.user)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.resetUserPassword",
  label: i18n.nodes.smartRecruiters.resetUserPassword.label,
  description: i18n.nodes.smartRecruiters.resetUserPassword.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), userIdPin(), execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).resetUserPassword(String(inputs.credentialName ?? ""), String(inputs.userId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.resetUserPassword(${inputs.credentialName}, ${inputs.userId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.sendUserActivationEmail",
  label: i18n.nodes.smartRecruiters.sendUserActivationEmail.label,
  description: i18n.nodes.smartRecruiters.sendUserActivationEmail.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), userIdPin(), execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).sendUserActivationEmail(String(inputs.credentialName ?? ""), String(inputs.userId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.sendUserActivationEmail(${inputs.credentialName}, ${inputs.userId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.activateUser",
  label: i18n.nodes.smartRecruiters.activateUser.label,
  description: i18n.nodes.smartRecruiters.activateUser.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), userIdPin(), execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).activateUser(String(inputs.credentialName ?? ""), String(inputs.userId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.activateUser(${inputs.credentialName}, ${inputs.userId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.deactivateUser",
  label: i18n.nodes.smartRecruiters.deactivateUser.label,
  description: i18n.nodes.smartRecruiters.deactivateUser.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), userIdPin(), execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).deactivateUser(String(inputs.credentialName ?? ""), String(inputs.userId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.deactivateUser(${inputs.credentialName}, ${inputs.userId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.updateUserAvatar",
  label: i18n.nodes.smartRecruiters.updateUserAvatar.label,
  description: i18n.nodes.smartRecruiters.updateUserAvatar.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    userIdPin(),
    ...fileFieldPins({
      fileBase64: i18n.nodes.smartRecruiters.updateUserAvatar.pin_file_base64,
      fileName: i18n.nodes.smartRecruiters.updateUserAvatar.pin_file_name,
      fileContentType: i18n.nodes.smartRecruiters.updateUserAvatar.pin_file_content_type,
    }),
    execOutPin(),
    successPin(),
    { id: "userJson", label: i18n.nodes.smartRecruiters.updateUserAvatar.pin_user_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).updateUserAvatar(String(inputs.credentialName ?? ""), String(inputs.userId ?? ""), String(inputs.fileBase64 ?? ""), String(inputs.fileName ?? ""), String(inputs.fileContentType ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, userJson: JSON.stringify(result.user), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.updateUserAvatar(${inputs.credentialName}, ${inputs.userId}, ${inputs.fileBase64}, ${inputs.fileName}, ${inputs.fileContentType});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, userJson: `JSON.stringify(${v}.user)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.listSystemRoles",
  label: i18n.nodes.smartRecruiters.listSystemRoles.label,
  description: i18n.nodes.smartRecruiters.listSystemRoles.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), execOutPin(), successPin(), { id: "rolesJson", label: i18n.nodes.smartRecruiters.listSystemRoles.pin_roles_json, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).listSystemRoles(String(inputs.credentialName ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, rolesJson: JSON.stringify(result.roles), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.listSystemRoles(${inputs.credentialName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, rolesJson: `JSON.stringify(${v}.roles)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.listAccessGroups",
  label: i18n.nodes.smartRecruiters.listAccessGroups.label,
  description: i18n.nodes.smartRecruiters.listAccessGroups.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), execOutPin(), successPin(), { id: "accessGroupsJson", label: i18n.nodes.smartRecruiters.listAccessGroups.pin_access_groups_json, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).listAccessGroups(String(inputs.credentialName ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, accessGroupsJson: JSON.stringify(result.accessGroups), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.listAccessGroups(${inputs.credentialName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, accessGroupsJson: `JSON.stringify(${v}.accessGroups)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.createAccessGroup",
  label: i18n.nodes.smartRecruiters.createAccessGroup.label,
  description: i18n.nodes.smartRecruiters.createAccessGroup.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "accessGroupJson", label: i18n.nodes.smartRecruiters.createAccessGroup.pin_access_group_json, type: "string", direction: "input", defaultValue: "{}" },
    execOutPin(),
    successPin(),
    { id: "createdAccessGroupJson", label: i18n.nodes.smartRecruiters.createAccessGroup.pin_created_access_group_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).createAccessGroup(String(inputs.credentialName ?? ""), parseJsonRecord(String(inputs.accessGroupJson ?? "")) as Record<string, unknown>);
    return { nextExec: "exec-out", outputs: { success: result.success, createdAccessGroupJson: JSON.stringify(result.accessGroup), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.createAccessGroup(${inputs.credentialName}, ${inputs.accessGroupJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, createdAccessGroupJson: `JSON.stringify(${v}.accessGroup)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.getAccessGroup",
  label: i18n.nodes.smartRecruiters.getAccessGroup.label,
  description: i18n.nodes.smartRecruiters.getAccessGroup.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), accessGroupIdPin(), execOutPin(), successPin(), { id: "accessGroupJson", label: i18n.nodes.smartRecruiters.getAccessGroup.pin_access_group_json, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).getAccessGroup(String(inputs.credentialName ?? ""), String(inputs.accessGroupId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, accessGroupJson: JSON.stringify(result.accessGroup), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.getAccessGroup(${inputs.credentialName}, ${inputs.accessGroupId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, accessGroupJson: `JSON.stringify(${v}.accessGroup)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.updateAccessGroup",
  label: i18n.nodes.smartRecruiters.updateAccessGroup.label,
  description: i18n.nodes.smartRecruiters.updateAccessGroup.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    accessGroupIdPin(),
    { id: "accessGroupJson", label: i18n.nodes.smartRecruiters.updateAccessGroup.pin_access_group_json, type: "string", direction: "input", defaultValue: "{}" },
    execOutPin(),
    successPin(),
    { id: "updatedAccessGroupJson", label: i18n.nodes.smartRecruiters.updateAccessGroup.pin_updated_access_group_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).updateAccessGroup(String(inputs.credentialName ?? ""), String(inputs.accessGroupId ?? ""), parseJsonRecord(String(inputs.accessGroupJson ?? "")) as Record<string, unknown>);
    return { nextExec: "exec-out", outputs: { success: result.success, updatedAccessGroupJson: JSON.stringify(result.accessGroup), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.updateAccessGroup(${inputs.credentialName}, ${inputs.accessGroupId}, ${inputs.accessGroupJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, updatedAccessGroupJson: `JSON.stringify(${v}.accessGroup)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.deleteAccessGroup",
  label: i18n.nodes.smartRecruiters.deleteAccessGroup.label,
  description: i18n.nodes.smartRecruiters.deleteAccessGroup.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), accessGroupIdPin(), execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).deleteAccessGroup(String(inputs.credentialName ?? ""), String(inputs.accessGroupId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.deleteAccessGroup(${inputs.credentialName}, ${inputs.accessGroupId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.assignUsersToAccessGroup",
  label: i18n.nodes.smartRecruiters.assignUsersToAccessGroup.label,
  description: i18n.nodes.smartRecruiters.assignUsersToAccessGroup.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), accessGroupIdPin(), { id: "userIdsJson", label: i18n.nodes.smartRecruiters.assignUsersToAccessGroup.pin_user_ids_json, type: "string", direction: "input", defaultValue: "[]" }, execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const userIds = parseJsonBody(String(inputs.userIdsJson ?? ""));
    const result = await (await loadSmartRecruitersManager()).assignUsersToAccessGroup(String(inputs.credentialName ?? ""), String(inputs.accessGroupId ?? ""), Array.isArray(userIds) ? (userIds as string[]) : []);
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.assignUsersToAccessGroup(${inputs.credentialName}, ${inputs.accessGroupId}, ${inputs.userIdsJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.removeUserFromAccessGroup",
  label: i18n.nodes.smartRecruiters.removeUserFromAccessGroup.label,
  description: i18n.nodes.smartRecruiters.removeUserFromAccessGroup.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), accessGroupIdPin(), userIdPin(), execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).removeUserFromAccessGroup(String(inputs.credentialName ?? ""), String(inputs.accessGroupId ?? ""), String(inputs.userId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.removeUserFromAccessGroup(${inputs.credentialName}, ${inputs.accessGroupId}, ${inputs.userId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

// --- Interviews & Events (Phase 6) ------------------------------------------------------

registerNode({
  type: "smartRecruiters.searchInterviews",
  label: i18n.nodes.smartRecruiters.searchInterviews.label,
  description: i18n.nodes.smartRecruiters.searchInterviews.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), applicationIdPin(), execOutPin(), successPin(), { id: "interviewsJson", label: i18n.nodes.smartRecruiters.searchInterviews.pin_interviews_json, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).searchInterviews(String(inputs.credentialName ?? ""), String(inputs.applicationId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, interviewsJson: JSON.stringify(result.interviews), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.searchInterviews(${inputs.credentialName}, ${inputs.applicationId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, interviewsJson: `JSON.stringify(${v}.interviews)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.createInterview",
  label: i18n.nodes.smartRecruiters.createInterview.label,
  description: i18n.nodes.smartRecruiters.createInterview.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "interviewJson", label: i18n.nodes.smartRecruiters.createInterview.pin_interview_json, type: "string", direction: "input", defaultValue: "{}" },
    execOutPin(),
    successPin(),
    { id: "createdInterviewJson", label: i18n.nodes.smartRecruiters.createInterview.pin_created_interview_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).createInterview(String(inputs.credentialName ?? ""), parseJsonRecord(String(inputs.interviewJson ?? "")));
    return { nextExec: "exec-out", outputs: { success: result.success, createdInterviewJson: JSON.stringify(result.interview), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.createInterview(${inputs.credentialName}, ${inputs.interviewJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, createdInterviewJson: `JSON.stringify(${v}.interview)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.getInterview",
  label: i18n.nodes.smartRecruiters.getInterview.label,
  description: i18n.nodes.smartRecruiters.getInterview.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), interviewIdPin(), execOutPin(), successPin(), { id: "interviewJson", label: i18n.nodes.smartRecruiters.getInterview.pin_interview_json, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).getInterview(String(inputs.credentialName ?? ""), String(inputs.interviewId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, interviewJson: JSON.stringify(result.interview), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.getInterview(${inputs.credentialName}, ${inputs.interviewId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, interviewJson: `JSON.stringify(${v}.interview)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.updateInterview",
  label: i18n.nodes.smartRecruiters.updateInterview.label,
  description: i18n.nodes.smartRecruiters.updateInterview.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    interviewIdPin(),
    { id: "patchJson", label: i18n.nodes.smartRecruiters.updateInterview.pin_patch_json, type: "string", direction: "input", defaultValue: "{}" },
    execOutPin(),
    successPin(),
    { id: "interviewJson", label: i18n.nodes.smartRecruiters.updateInterview.pin_interview_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).updateInterview(String(inputs.credentialName ?? ""), String(inputs.interviewId ?? ""), parseJsonRecord(String(inputs.patchJson ?? "")));
    return { nextExec: "exec-out", outputs: { success: result.success, interviewJson: JSON.stringify(result.interview), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.updateInterview(${inputs.credentialName}, ${inputs.interviewId}, ${inputs.patchJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, interviewJson: `JSON.stringify(${v}.interview)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.deleteInterview",
  label: i18n.nodes.smartRecruiters.deleteInterview.label,
  description: i18n.nodes.smartRecruiters.deleteInterview.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), interviewIdPin(), execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).deleteInterview(String(inputs.credentialName ?? ""), String(inputs.interviewId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.deleteInterview(${inputs.credentialName}, ${inputs.interviewId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.listInterviewTypes",
  label: i18n.nodes.smartRecruiters.listInterviewTypes.label,
  description: i18n.nodes.smartRecruiters.listInterviewTypes.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), execOutPin(), successPin(), { id: "interviewTypesJson", label: i18n.nodes.smartRecruiters.listInterviewTypes.pin_interview_types_json, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).listInterviewTypes(String(inputs.credentialName ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, interviewTypesJson: JSON.stringify(result.interviewTypes), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.listInterviewTypes(${inputs.credentialName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, interviewTypesJson: `JSON.stringify(${v}.interviewTypes)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.addInterviewTypes",
  label: i18n.nodes.smartRecruiters.addInterviewTypes.label,
  description: i18n.nodes.smartRecruiters.addInterviewTypes.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), { id: "interviewTypesJson", label: i18n.nodes.smartRecruiters.addInterviewTypes.pin_interview_types_json, type: "string", direction: "input", defaultValue: "[]" }, execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const parsedTypes = parseJsonBody(String(inputs.interviewTypesJson ?? "[]"));
    const result = await (await loadSmartRecruitersManager()).addInterviewTypes(String(inputs.credentialName ?? ""), Array.isArray(parsedTypes) ? parsedTypes : []);
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.addInterviewTypes(${inputs.credentialName}, ${inputs.interviewTypesJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.deleteInterviewType",
  label: i18n.nodes.smartRecruiters.deleteInterviewType.label,
  description: i18n.nodes.smartRecruiters.deleteInterviewType.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), { id: "interviewType", label: i18n.nodes.smartRecruiters.deleteInterviewType.pin_interview_type, type: "string", direction: "input", defaultValue: "" }, execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).deleteInterviewType(String(inputs.credentialName ?? ""), String(inputs.interviewType ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.deleteInterviewType(${inputs.credentialName}, ${inputs.interviewType});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.createInterviewTimeslot",
  label: i18n.nodes.smartRecruiters.createInterviewTimeslot.label,
  description: i18n.nodes.smartRecruiters.createInterviewTimeslot.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    interviewIdPin(),
    { id: "timeslotJson", label: i18n.nodes.smartRecruiters.createInterviewTimeslot.pin_timeslot_json, type: "string", direction: "input", defaultValue: "{}" },
    execOutPin(),
    successPin(),
    { id: "createdTimeslotJson", label: i18n.nodes.smartRecruiters.createInterviewTimeslot.pin_created_timeslot_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).createInterviewTimeslot(String(inputs.credentialName ?? ""), String(inputs.interviewId ?? ""), parseJsonRecord(String(inputs.timeslotJson ?? "")));
    return { nextExec: "exec-out", outputs: { success: result.success, createdTimeslotJson: JSON.stringify(result.timeslot), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.createInterviewTimeslot(${inputs.credentialName}, ${inputs.interviewId}, ${inputs.timeslotJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, createdTimeslotJson: `JSON.stringify(${v}.timeslot)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.getInterviewTimeslot",
  label: i18n.nodes.smartRecruiters.getInterviewTimeslot.label,
  description: i18n.nodes.smartRecruiters.getInterviewTimeslot.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), interviewIdPin(), timeslotIdPin(), execOutPin(), successPin(), { id: "timeslotJson", label: i18n.nodes.smartRecruiters.getInterviewTimeslot.pin_timeslot_json, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).getInterviewTimeslot(String(inputs.credentialName ?? ""), String(inputs.interviewId ?? ""), String(inputs.timeslotId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, timeslotJson: JSON.stringify(result.timeslot), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.getInterviewTimeslot(${inputs.credentialName}, ${inputs.interviewId}, ${inputs.timeslotId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, timeslotJson: `JSON.stringify(${v}.timeslot)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.updateInterviewTimeslot",
  label: i18n.nodes.smartRecruiters.updateInterviewTimeslot.label,
  description: i18n.nodes.smartRecruiters.updateInterviewTimeslot.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    interviewIdPin(),
    timeslotIdPin(),
    { id: "timeslotJson", label: i18n.nodes.smartRecruiters.updateInterviewTimeslot.pin_timeslot_json, type: "string", direction: "input", defaultValue: "{}" },
    execOutPin(),
    successPin(),
    { id: "updatedTimeslotJson", label: i18n.nodes.smartRecruiters.updateInterviewTimeslot.pin_updated_timeslot_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).updateInterviewTimeslot(String(inputs.credentialName ?? ""), String(inputs.interviewId ?? ""), String(inputs.timeslotId ?? ""), parseJsonRecord(String(inputs.timeslotJson ?? "")));
    return { nextExec: "exec-out", outputs: { success: result.success, updatedTimeslotJson: JSON.stringify(result.timeslot), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.updateInterviewTimeslot(${inputs.credentialName}, ${inputs.interviewId}, ${inputs.timeslotId}, ${inputs.timeslotJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, updatedTimeslotJson: `JSON.stringify(${v}.timeslot)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.deleteInterviewTimeslot",
  label: i18n.nodes.smartRecruiters.deleteInterviewTimeslot.label,
  description: i18n.nodes.smartRecruiters.deleteInterviewTimeslot.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), interviewIdPin(), timeslotIdPin(), execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).deleteInterviewTimeslot(String(inputs.credentialName ?? ""), String(inputs.interviewId ?? ""), String(inputs.timeslotId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.deleteInterviewTimeslot(${inputs.credentialName}, ${inputs.interviewId}, ${inputs.timeslotId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.setInterviewTimeslotNoShow",
  label: i18n.nodes.smartRecruiters.setInterviewTimeslotNoShow.label,
  description: i18n.nodes.smartRecruiters.setInterviewTimeslotNoShow.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), interviewIdPin(), timeslotIdPin(), { id: "value", label: i18n.nodes.smartRecruiters.setInterviewTimeslotNoShow.pin_value, type: "boolean", direction: "input", defaultValue: true }, execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).setInterviewTimeslotNoShow(String(inputs.credentialName ?? ""), String(inputs.interviewId ?? ""), String(inputs.timeslotId ?? ""), Boolean(inputs.value ?? true));
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.setInterviewTimeslotNoShow(${inputs.credentialName}, ${inputs.interviewId}, ${inputs.timeslotId}, ${inputs.value});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.updateInterviewCandidateStatus",
  label: i18n.nodes.smartRecruiters.updateInterviewCandidateStatus.label,
  description: i18n.nodes.smartRecruiters.updateInterviewCandidateStatus.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), interviewIdPin(), statusPin(i18n.nodes.smartRecruiters.updateInterviewCandidateStatus.pin_status), execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).updateInterviewCandidateStatus(String(inputs.credentialName ?? ""), String(inputs.interviewId ?? ""), String(inputs.status ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.updateInterviewCandidateStatus(${inputs.credentialName}, ${inputs.interviewId}, ${inputs.status});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.updateTimeslotCandidateStatus",
  label: i18n.nodes.smartRecruiters.updateTimeslotCandidateStatus.label,
  description: i18n.nodes.smartRecruiters.updateTimeslotCandidateStatus.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), interviewIdPin(), timeslotIdPin(), statusPin(i18n.nodes.smartRecruiters.updateTimeslotCandidateStatus.pin_status), execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).updateTimeslotCandidateStatus(String(inputs.credentialName ?? ""), String(inputs.interviewId ?? ""), String(inputs.timeslotId ?? ""), String(inputs.status ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.updateTimeslotCandidateStatus(${inputs.credentialName}, ${inputs.interviewId}, ${inputs.timeslotId}, ${inputs.status});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.updateTimeslotInterviewerStatus",
  label: i18n.nodes.smartRecruiters.updateTimeslotInterviewerStatus.label,
  description: i18n.nodes.smartRecruiters.updateTimeslotInterviewerStatus.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), interviewIdPin(), timeslotIdPin(), userIdPin(), statusPin(i18n.nodes.smartRecruiters.updateTimeslotInterviewerStatus.pin_status), execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).updateTimeslotInterviewerStatus(String(inputs.credentialName ?? ""), String(inputs.interviewId ?? ""), String(inputs.timeslotId ?? ""), String(inputs.userId ?? ""), String(inputs.status ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.updateTimeslotInterviewerStatus(${inputs.credentialName}, ${inputs.interviewId}, ${inputs.timeslotId}, ${inputs.userId}, ${inputs.status});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.getSchedulePreferences",
  label: i18n.nodes.smartRecruiters.getSchedulePreferences.label,
  description: i18n.nodes.smartRecruiters.getSchedulePreferences.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), userIdPin(), execOutPin(), successPin(), { id: "preferencesJson", label: i18n.nodes.smartRecruiters.getSchedulePreferences.pin_preferences_json, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).getSchedulePreferences(String(inputs.credentialName ?? ""), String(inputs.userId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, preferencesJson: JSON.stringify(result.preferences), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.getSchedulePreferences(${inputs.credentialName}, ${inputs.userId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, preferencesJson: `JSON.stringify(${v}.preferences)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.createEvent",
  label: i18n.nodes.smartRecruiters.createEvent.label,
  description: i18n.nodes.smartRecruiters.createEvent.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "eventJson", label: i18n.nodes.smartRecruiters.createEvent.pin_event_json, type: "string", direction: "input", defaultValue: "{}" },
    execOutPin(),
    successPin(),
    { id: "createdEventJson", label: i18n.nodes.smartRecruiters.createEvent.pin_created_event_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).createEvent(String(inputs.credentialName ?? ""), parseJsonRecord(String(inputs.eventJson ?? "")));
    return { nextExec: "exec-out", outputs: { success: result.success, createdEventJson: JSON.stringify(result.event), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.createEvent(${inputs.credentialName}, ${inputs.eventJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, createdEventJson: `JSON.stringify(${v}.event)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.getEvent",
  label: i18n.nodes.smartRecruiters.getEvent.label,
  description: i18n.nodes.smartRecruiters.getEvent.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), eventIdPin(), execOutPin(), successPin(), { id: "eventJson", label: i18n.nodes.smartRecruiters.getEvent.pin_event_json, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).getEvent(String(inputs.credentialName ?? ""), String(inputs.eventId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, eventJson: JSON.stringify(result.event), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.getEvent(${inputs.credentialName}, ${inputs.eventId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, eventJson: `JSON.stringify(${v}.event)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.updateEvent",
  label: i18n.nodes.smartRecruiters.updateEvent.label,
  description: i18n.nodes.smartRecruiters.updateEvent.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    eventIdPin(),
    { id: "eventJson", label: i18n.nodes.smartRecruiters.updateEvent.pin_event_json, type: "string", direction: "input", defaultValue: "{}" },
    execOutPin(),
    successPin(),
    { id: "updatedEventJson", label: i18n.nodes.smartRecruiters.updateEvent.pin_updated_event_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).updateEvent(String(inputs.credentialName ?? ""), String(inputs.eventId ?? ""), parseJsonRecord(String(inputs.eventJson ?? "")));
    return { nextExec: "exec-out", outputs: { success: result.success, updatedEventJson: JSON.stringify(result.event), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.updateEvent(${inputs.credentialName}, ${inputs.eventId}, ${inputs.eventJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, updatedEventJson: `JSON.stringify(${v}.event)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.deleteEvent",
  label: i18n.nodes.smartRecruiters.deleteEvent.label,
  description: i18n.nodes.smartRecruiters.deleteEvent.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), eventIdPin(), execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).deleteEvent(String(inputs.credentialName ?? ""), String(inputs.eventId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.deleteEvent(${inputs.credentialName}, ${inputs.eventId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.listJobEvents",
  label: i18n.nodes.smartRecruiters.listJobEvents.label,
  description: i18n.nodes.smartRecruiters.listJobEvents.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    jobIdPin(),
    eventStatePin(i18n.nodes.smartRecruiters.listJobEvents.pin_state),
    { id: "page", label: i18n.nodes.smartRecruiters.listJobEvents.pin_page, type: "number", direction: "input", defaultValue: 0 },
    { id: "pageSize", label: i18n.nodes.smartRecruiters.listJobEvents.pin_page_size, type: "number", direction: "input", defaultValue: 10 },
    execOutPin(),
    successPin(),
    { id: "eventsJson", label: i18n.nodes.smartRecruiters.listJobEvents.pin_events_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).listJobEvents(String(inputs.credentialName ?? ""), String(inputs.jobId ?? ""), String(inputs.state ?? "ACTIVE"), Number(inputs.page ?? 0), Number(inputs.pageSize ?? 10));
    return { nextExec: "exec-out", outputs: { success: result.success, eventsJson: JSON.stringify(result.events), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.listJobEvents(${inputs.credentialName}, ${inputs.jobId}, ${inputs.state}, ${inputs.page}, ${inputs.pageSize});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, eventsJson: `JSON.stringify(${v}.events)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.getEventsForCandidate",
  label: i18n.nodes.smartRecruiters.getEventsForCandidate.label,
  description: i18n.nodes.smartRecruiters.getEventsForCandidate.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    candidateIdPin(),
    eventStatePin(i18n.nodes.smartRecruiters.getEventsForCandidate.pin_state),
    execOutPin(),
    successPin(),
    { id: "eventsJson", label: i18n.nodes.smartRecruiters.getEventsForCandidate.pin_events_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).getEventsForCandidate(String(inputs.credentialName ?? ""), String(inputs.candidateId ?? ""), String(inputs.state ?? "ACTIVE"));
    return { nextExec: "exec-out", outputs: { success: result.success, eventsJson: JSON.stringify(result.events), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.getEventsForCandidate(${inputs.credentialName}, ${inputs.candidateId}, ${inputs.state});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, eventsJson: `JSON.stringify(${v}.events)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.getEventsForApplication",
  label: i18n.nodes.smartRecruiters.getEventsForApplication.label,
  description: i18n.nodes.smartRecruiters.getEventsForApplication.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    applicationIdPin(),
    eventStatePin(i18n.nodes.smartRecruiters.getEventsForApplication.pin_state),
    execOutPin(),
    successPin(),
    { id: "eventsJson", label: i18n.nodes.smartRecruiters.getEventsForApplication.pin_events_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).getEventsForApplication(String(inputs.credentialName ?? ""), String(inputs.applicationId ?? ""), String(inputs.state ?? "ACTIVE"));
    return { nextExec: "exec-out", outputs: { success: result.success, eventsJson: JSON.stringify(result.events), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.getEventsForApplication(${inputs.credentialName}, ${inputs.applicationId}, ${inputs.state});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, eventsJson: `JSON.stringify(${v}.events)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.getEventSession",
  label: i18n.nodes.smartRecruiters.getEventSession.label,
  description: i18n.nodes.smartRecruiters.getEventSession.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), eventIdPin(), sessionIdPin(), execOutPin(), successPin(), { id: "sessionJson", label: i18n.nodes.smartRecruiters.getEventSession.pin_session_json, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).getEventSession(String(inputs.credentialName ?? ""), String(inputs.eventId ?? ""), String(inputs.sessionId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, sessionJson: JSON.stringify(result.session), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.getEventSession(${inputs.credentialName}, ${inputs.eventId}, ${inputs.sessionId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, sessionJson: `JSON.stringify(${v}.session)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.deleteEventSession",
  label: i18n.nodes.smartRecruiters.deleteEventSession.label,
  description: i18n.nodes.smartRecruiters.deleteEventSession.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), eventIdPin(), sessionIdPin(), execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).deleteEventSession(String(inputs.credentialName ?? ""), String(inputs.eventId ?? ""), String(inputs.sessionId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.deleteEventSession(${inputs.credentialName}, ${inputs.eventId}, ${inputs.sessionId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.addSessionInterviewers",
  label: i18n.nodes.smartRecruiters.addSessionInterviewers.label,
  description: i18n.nodes.smartRecruiters.addSessionInterviewers.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    eventIdPin(),
    sessionIdPin(),
    { id: "interviewerIdsJson", label: i18n.nodes.smartRecruiters.addSessionInterviewers.pin_interviewer_ids_json, type: "string", direction: "input", defaultValue: "[]" },
    execOutPin(),
    successPin(),
    { id: "interviewersJson", label: i18n.nodes.smartRecruiters.addSessionInterviewers.pin_interviewers_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const parsedIds = parseJsonBody(String(inputs.interviewerIdsJson ?? "[]"));
    const result = await (await loadSmartRecruitersManager()).addSessionInterviewers(String(inputs.credentialName ?? ""), String(inputs.eventId ?? ""), String(inputs.sessionId ?? ""), Array.isArray(parsedIds) ? parsedIds : []);
    return { nextExec: "exec-out", outputs: { success: result.success, interviewersJson: JSON.stringify(result.interviewers), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.addSessionInterviewers(${inputs.credentialName}, ${inputs.eventId}, ${inputs.sessionId}, ${inputs.interviewerIdsJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, interviewersJson: `JSON.stringify(${v}.interviewers)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.removeSessionInterviewers",
  label: i18n.nodes.smartRecruiters.removeSessionInterviewers.label,
  description: i18n.nodes.smartRecruiters.removeSessionInterviewers.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), eventIdPin(), sessionIdPin(), { id: "interviewerIdsJson", label: i18n.nodes.smartRecruiters.removeSessionInterviewers.pin_interviewer_ids_json, type: "string", direction: "input", defaultValue: "[]" }, execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const parsedIds = parseJsonBody(String(inputs.interviewerIdsJson ?? "[]"));
    const result = await (await loadSmartRecruitersManager()).removeSessionInterviewers(String(inputs.credentialName ?? ""), String(inputs.eventId ?? ""), String(inputs.sessionId ?? ""), Array.isArray(parsedIds) ? parsedIds : []);
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.removeSessionInterviewers(${inputs.credentialName}, ${inputs.eventId}, ${inputs.sessionId}, ${inputs.interviewerIdsJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.getAllEventApplicants",
  label: i18n.nodes.smartRecruiters.getAllEventApplicants.label,
  description: i18n.nodes.smartRecruiters.getAllEventApplicants.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    eventIdPin(),
    execOutPin(),
    successPin(),
    { id: "applicantsJson", label: i18n.nodes.smartRecruiters.getAllEventApplicants.pin_applicants_json, type: "string", direction: "output" },
    { id: "totalFound", label: i18n.nodes.smartRecruiters.getAllEventApplicants.pin_total_found, type: "number", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).getAllEventApplicants(String(inputs.credentialName ?? ""), String(inputs.eventId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, applicantsJson: JSON.stringify(result.applicants), totalFound: result.totalFound, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.getAllEventApplicants(${inputs.credentialName}, ${inputs.eventId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, applicantsJson: `JSON.stringify(${v}.applicants)`, totalFound: `${v}.totalFound`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.getEventPoolApplicants",
  label: i18n.nodes.smartRecruiters.getEventPoolApplicants.label,
  description: i18n.nodes.smartRecruiters.getEventPoolApplicants.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    eventIdPin(),
    { id: "page", label: i18n.nodes.smartRecruiters.getEventPoolApplicants.pin_page, type: "number", direction: "input", defaultValue: 0 },
    { id: "pageSize", label: i18n.nodes.smartRecruiters.getEventPoolApplicants.pin_page_size, type: "number", direction: "input", defaultValue: 10 },
    execOutPin(),
    successPin(),
    { id: "applicantsJson", label: i18n.nodes.smartRecruiters.getEventPoolApplicants.pin_applicants_json, type: "string", direction: "output" },
    { id: "totalFound", label: i18n.nodes.smartRecruiters.getEventPoolApplicants.pin_total_found, type: "number", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).getEventPoolApplicants(String(inputs.credentialName ?? ""), String(inputs.eventId ?? ""), Number(inputs.page ?? 0), Number(inputs.pageSize ?? 10));
    return { nextExec: "exec-out", outputs: { success: result.success, applicantsJson: JSON.stringify(result.applicants), totalFound: result.totalFound, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.getEventPoolApplicants(${inputs.credentialName}, ${inputs.eventId}, ${inputs.page}, ${inputs.pageSize});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, applicantsJson: `JSON.stringify(${v}.applicants)`, totalFound: `${v}.totalFound`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.addApplicantsToEvent",
  label: i18n.nodes.smartRecruiters.addApplicantsToEvent.label,
  description: i18n.nodes.smartRecruiters.addApplicantsToEvent.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), eventIdPin(), { id: "applicantIdsJson", label: i18n.nodes.smartRecruiters.addApplicantsToEvent.pin_applicant_ids_json, type: "string", direction: "input", defaultValue: "[]" }, execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const parsedIds = parseJsonBody(String(inputs.applicantIdsJson ?? "[]"));
    const result = await (await loadSmartRecruitersManager()).addApplicantsToEvent(String(inputs.credentialName ?? ""), String(inputs.eventId ?? ""), Array.isArray(parsedIds) ? parsedIds : []);
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.addApplicantsToEvent(${inputs.credentialName}, ${inputs.eventId}, ${inputs.applicantIdsJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.addApplicantsToSession",
  label: i18n.nodes.smartRecruiters.addApplicantsToSession.label,
  description: i18n.nodes.smartRecruiters.addApplicantsToSession.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    eventIdPin(),
    sessionIdPin(),
    { id: "applicantIdsJson", label: i18n.nodes.smartRecruiters.addApplicantsToSession.pin_applicant_ids_json, type: "string", direction: "input", defaultValue: "[]" },
    { id: "allowOverbooking", label: i18n.nodes.smartRecruiters.addApplicantsToSession.pin_allow_overbooking, type: "boolean", direction: "input", defaultValue: false },
    execOutPin(),
    successPin(),
    { id: "applicantsJson", label: i18n.nodes.smartRecruiters.addApplicantsToSession.pin_applicants_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const parsedIds = parseJsonBody(String(inputs.applicantIdsJson ?? "[]"));
    const result = await (await loadSmartRecruitersManager()).addApplicantsToSession(String(inputs.credentialName ?? ""), String(inputs.eventId ?? ""), String(inputs.sessionId ?? ""), Array.isArray(parsedIds) ? parsedIds : [], Boolean(inputs.allowOverbooking ?? false));
    return { nextExec: "exec-out", outputs: { success: result.success, applicantsJson: JSON.stringify(result.applicants), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.addApplicantsToSession(${inputs.credentialName}, ${inputs.eventId}, ${inputs.sessionId}, ${inputs.applicantIdsJson}, ${inputs.allowOverbooking});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, applicantsJson: `JSON.stringify(${v}.applicants)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.moveApplicantsToSession",
  label: i18n.nodes.smartRecruiters.moveApplicantsToSession.label,
  description: i18n.nodes.smartRecruiters.moveApplicantsToSession.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    eventIdPin(),
    sessionIdPin(),
    { id: "fromSessionId", label: i18n.nodes.smartRecruiters.moveApplicantsToSession.pin_from_session_id, type: "string", direction: "input", defaultValue: "" },
    { id: "applicantIdsJson", label: i18n.nodes.smartRecruiters.moveApplicantsToSession.pin_applicant_ids_json, type: "string", direction: "input", defaultValue: "[]" },
    { id: "allowOverbooking", label: i18n.nodes.smartRecruiters.moveApplicantsToSession.pin_allow_overbooking, type: "boolean", direction: "input", defaultValue: false },
    execOutPin(),
    successPin(),
    { id: "applicantsJson", label: i18n.nodes.smartRecruiters.moveApplicantsToSession.pin_applicants_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const parsedIds = parseJsonBody(String(inputs.applicantIdsJson ?? "[]"));
    const result = await (
      await loadSmartRecruitersManager()
    ).moveApplicantsToSession(String(inputs.credentialName ?? ""), String(inputs.eventId ?? ""), String(inputs.sessionId ?? ""), String(inputs.fromSessionId ?? ""), Array.isArray(parsedIds) ? parsedIds : [], Boolean(inputs.allowOverbooking ?? false));
    return { nextExec: "exec-out", outputs: { success: result.success, applicantsJson: JSON.stringify(result.applicants), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await SmartRecruitersManager.moveApplicantsToSession(${inputs.credentialName}, ${inputs.eventId}, ${inputs.sessionId}, ${inputs.fromSessionId}, ${inputs.applicantIdsJson}, ${inputs.allowOverbooking});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, applicantsJson: `JSON.stringify(${v}.applicants)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.searchSelfSchedules",
  label: i18n.nodes.smartRecruiters.searchSelfSchedules.label,
  description: i18n.nodes.smartRecruiters.searchSelfSchedules.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    applicationIdPin(),
    { id: "withInterviews", label: i18n.nodes.smartRecruiters.searchSelfSchedules.pin_with_interviews, type: "boolean", direction: "input", defaultValue: false },
    { id: "limit", label: i18n.nodes.smartRecruiters.searchSelfSchedules.pin_limit, type: "number", direction: "input", defaultValue: 10 },
    { id: "offset", label: i18n.nodes.smartRecruiters.searchSelfSchedules.pin_offset, type: "number", direction: "input", defaultValue: 0 },
    execOutPin(),
    successPin(),
    { id: "selfSchedulesJson", label: i18n.nodes.smartRecruiters.searchSelfSchedules.pin_self_schedules_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).searchSelfSchedules(String(inputs.credentialName ?? ""), String(inputs.applicationId ?? ""), Boolean(inputs.withInterviews ?? false), Number(inputs.limit ?? 10), Number(inputs.offset ?? 0));
    return { nextExec: "exec-out", outputs: { success: result.success, selfSchedulesJson: JSON.stringify(result.selfSchedules), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.searchSelfSchedules(${inputs.credentialName}, ${inputs.applicationId}, ${inputs.withInterviews}, ${inputs.limit}, ${inputs.offset});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, selfSchedulesJson: `JSON.stringify(${v}.selfSchedules)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.getSelfSchedule",
  label: i18n.nodes.smartRecruiters.getSelfSchedule.label,
  description: i18n.nodes.smartRecruiters.getSelfSchedule.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), selfScheduleIdPin(), execOutPin(), successPin(), { id: "selfScheduleJson", label: i18n.nodes.smartRecruiters.getSelfSchedule.pin_self_schedule_json, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).getSelfSchedule(String(inputs.credentialName ?? ""), String(inputs.selfScheduleId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, selfScheduleJson: JSON.stringify(result.selfSchedule), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.getSelfSchedule(${inputs.credentialName}, ${inputs.selfScheduleId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, selfScheduleJson: `JSON.stringify(${v}.selfSchedule)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.cancelSelfSchedule",
  label: i18n.nodes.smartRecruiters.cancelSelfSchedule.label,
  description: i18n.nodes.smartRecruiters.cancelSelfSchedule.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), selfScheduleIdPin(), execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).cancelSelfSchedule(String(inputs.credentialName ?? ""), String(inputs.selfScheduleId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.cancelSelfSchedule(${inputs.credentialName}, ${inputs.selfScheduleId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.getApplicationSelfSchedule",
  label: i18n.nodes.smartRecruiters.getApplicationSelfSchedule.label,
  description: i18n.nodes.smartRecruiters.getApplicationSelfSchedule.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), selfScheduleIdPin(), applicationUuidPin(), execOutPin(), successPin(), { id: "selfScheduleJson", label: i18n.nodes.smartRecruiters.getApplicationSelfSchedule.pin_self_schedule_json, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).getApplicationSelfSchedule(String(inputs.credentialName ?? ""), String(inputs.selfScheduleId ?? ""), String(inputs.applicationUuid ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, selfScheduleJson: JSON.stringify(result.selfSchedule), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.getApplicationSelfSchedule(${inputs.credentialName}, ${inputs.selfScheduleId}, ${inputs.applicationUuid});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, selfScheduleJson: `JSON.stringify(${v}.selfSchedule)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.getSelfScheduleSlots",
  label: i18n.nodes.smartRecruiters.getSelfScheduleSlots.label,
  description: i18n.nodes.smartRecruiters.getSelfScheduleSlots.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), selfScheduleIdPin(), applicationUuidPin(), execOutPin(), successPin(), { id: "slotsJson", label: i18n.nodes.smartRecruiters.getSelfScheduleSlots.pin_slots_json, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).getSelfScheduleSlots(String(inputs.credentialName ?? ""), String(inputs.selfScheduleId ?? ""), String(inputs.applicationUuid ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, slotsJson: JSON.stringify(result.slots), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.getSelfScheduleSlots(${inputs.credentialName}, ${inputs.selfScheduleId}, ${inputs.applicationUuid});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, slotsJson: `JSON.stringify(${v}.slots)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

function selfScheduleTimeRangePins(labels: { startsAt: string; endsAt: string }) {
  return [
    { id: "startsAt", label: labels.startsAt, type: "string" as const, direction: "input" as const, defaultValue: "" },
    { id: "endsAt", label: labels.endsAt, type: "string" as const, direction: "input" as const, defaultValue: "" },
  ];
}

registerNode({
  type: "smartRecruiters.createSelfScheduleInterview",
  label: i18n.nodes.smartRecruiters.createSelfScheduleInterview.label,
  description: i18n.nodes.smartRecruiters.createSelfScheduleInterview.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    selfScheduleIdPin(),
    applicationUuidPin(),
    ...selfScheduleTimeRangePins({ startsAt: i18n.nodes.smartRecruiters.createSelfScheduleInterview.pin_starts_at, endsAt: i18n.nodes.smartRecruiters.createSelfScheduleInterview.pin_ends_at }),
    execOutPin(),
    successPin(),
    { id: "interviewJson", label: i18n.nodes.smartRecruiters.createSelfScheduleInterview.pin_interview_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).createSelfScheduleInterview(String(inputs.credentialName ?? ""), String(inputs.selfScheduleId ?? ""), String(inputs.applicationUuid ?? ""), String(inputs.startsAt ?? ""), String(inputs.endsAt ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, interviewJson: JSON.stringify(result.interview), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.createSelfScheduleInterview(${inputs.credentialName}, ${inputs.selfScheduleId}, ${inputs.applicationUuid}, ${inputs.startsAt}, ${inputs.endsAt});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, interviewJson: `JSON.stringify(${v}.interview)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.updateSelfScheduleInterview",
  label: i18n.nodes.smartRecruiters.updateSelfScheduleInterview.label,
  description: i18n.nodes.smartRecruiters.updateSelfScheduleInterview.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    selfScheduleIdPin(),
    applicationUuidPin(),
    ...selfScheduleTimeRangePins({ startsAt: i18n.nodes.smartRecruiters.updateSelfScheduleInterview.pin_starts_at, endsAt: i18n.nodes.smartRecruiters.updateSelfScheduleInterview.pin_ends_at }),
    execOutPin(),
    successPin(),
    { id: "interviewJson", label: i18n.nodes.smartRecruiters.updateSelfScheduleInterview.pin_interview_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).updateSelfScheduleInterview(String(inputs.credentialName ?? ""), String(inputs.selfScheduleId ?? ""), String(inputs.applicationUuid ?? ""), String(inputs.startsAt ?? ""), String(inputs.endsAt ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, interviewJson: JSON.stringify(result.interview), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.updateSelfScheduleInterview(${inputs.credentialName}, ${inputs.selfScheduleId}, ${inputs.applicationUuid}, ${inputs.startsAt}, ${inputs.endsAt});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, interviewJson: `JSON.stringify(${v}.interview)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.getSelfScheduledInterview",
  label: i18n.nodes.smartRecruiters.getSelfScheduledInterview.label,
  description: i18n.nodes.smartRecruiters.getSelfScheduledInterview.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), selfScheduleIdPin(), applicationUuidPin(), execOutPin(), successPin(), { id: "interviewJson", label: i18n.nodes.smartRecruiters.getSelfScheduledInterview.pin_interview_json, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).getSelfScheduledInterview(String(inputs.credentialName ?? ""), String(inputs.selfScheduleId ?? ""), String(inputs.applicationUuid ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, interviewJson: JSON.stringify(result.interview), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.getSelfScheduledInterview(${inputs.credentialName}, ${inputs.selfScheduleId}, ${inputs.applicationUuid});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, interviewJson: `JSON.stringify(${v}.interview)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.createAutomatedSelfSchedule",
  label: i18n.nodes.smartRecruiters.createAutomatedSelfSchedule.label,
  description: i18n.nodes.smartRecruiters.createAutomatedSelfSchedule.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), applicationUuidPin(), execOutPin(), successPin(), { id: "selfScheduleId", label: i18n.nodes.smartRecruiters.createAutomatedSelfSchedule.pin_self_schedule_id, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).createAutomatedSelfSchedule(String(inputs.credentialName ?? ""), String(inputs.applicationUuid ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, selfScheduleId: result.selfScheduleId, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.createAutomatedSelfSchedule(${inputs.credentialName}, ${inputs.applicationUuid});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, selfScheduleId: `${v}.selfScheduleId`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.updateAutomatedSelfScheduleInvite",
  label: i18n.nodes.smartRecruiters.updateAutomatedSelfScheduleInvite.label,
  description: i18n.nodes.smartRecruiters.updateAutomatedSelfScheduleInvite.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), { id: "configJson", label: i18n.nodes.smartRecruiters.updateAutomatedSelfScheduleInvite.pin_config_json, type: "string", direction: "input", defaultValue: "{}" }, execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).updateAutomatedSelfScheduleInvite(String(inputs.credentialName ?? ""), parseJsonRecord(String(inputs.configJson ?? "")));
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.updateAutomatedSelfScheduleInvite(${inputs.credentialName}, ${inputs.configJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.requestAutomatedSelfReschedule",
  label: i18n.nodes.smartRecruiters.requestAutomatedSelfReschedule.label,
  description: i18n.nodes.smartRecruiters.requestAutomatedSelfReschedule.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), { id: "configJson", label: i18n.nodes.smartRecruiters.requestAutomatedSelfReschedule.pin_config_json, type: "string", direction: "input", defaultValue: "{}" }, execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).requestAutomatedSelfReschedule(String(inputs.credentialName ?? ""), parseJsonRecord(String(inputs.configJson ?? "")));
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.requestAutomatedSelfReschedule(${inputs.credentialName}, ${inputs.configJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.getAutomatedScheduleAvailableSlotsCount",
  label: i18n.nodes.smartRecruiters.getAutomatedScheduleAvailableSlotsCount.label,
  description: i18n.nodes.smartRecruiters.getAutomatedScheduleAvailableSlotsCount.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    {
      id: "scheduleType",
      label: i18n.nodes.smartRecruiters.getAutomatedScheduleAvailableSlotsCount.pin_schedule_type,
      type: "enum",
      subType: SMARTRECRUITERS_SELF_SCHEDULE_TYPE_ENUM_TYPE,
      direction: "input",
      defaultValue: "INDIVIDUAL",
      options: enumOptionIds(SMARTRECRUITERS_SELF_SCHEDULE_TYPE_ENUM_TYPE),
    },
    applicationUuidPin(),
    { id: "interviewerIdsByRoleJson", label: i18n.nodes.smartRecruiters.getAutomatedScheduleAvailableSlotsCount.pin_interviewer_ids_by_role_json, type: "string", direction: "input", defaultValue: "{}" },
    { id: "startDate", label: i18n.nodes.smartRecruiters.getAutomatedScheduleAvailableSlotsCount.pin_start_date, type: "string", direction: "input", defaultValue: "" },
    { id: "endDate", label: i18n.nodes.smartRecruiters.getAutomatedScheduleAvailableSlotsCount.pin_end_date, type: "string", direction: "input", defaultValue: "" },
    { id: "slotsAvailabilityLimitInDays", label: i18n.nodes.smartRecruiters.getAutomatedScheduleAvailableSlotsCount.pin_slots_availability_limit_in_days, type: "number", direction: "input", defaultValue: 0 },
    execOutPin(),
    successPin(),
    { id: "count", label: i18n.nodes.smartRecruiters.getAutomatedScheduleAvailableSlotsCount.pin_count, type: "number", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (
      await loadSmartRecruitersManager()
    ).getAutomatedScheduleAvailableSlotsCount(
      String(inputs.credentialName ?? ""),
      String(inputs.scheduleType ?? "INDIVIDUAL"),
      String(inputs.applicationUuid ?? ""),
      parseJsonRecord(String(inputs.interviewerIdsByRoleJson ?? "")) as unknown as Record<string, string[]>,
      String(inputs.startDate ?? ""),
      String(inputs.endDate ?? ""),
      Number(inputs.slotsAvailabilityLimitInDays ?? 0),
    );
    return { nextExec: "exec-out", outputs: { success: result.success, count: result.count, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await SmartRecruitersManager.getAutomatedScheduleAvailableSlotsCount(${inputs.credentialName}, ${inputs.scheduleType}, ${inputs.applicationUuid}, ${inputs.interviewerIdsByRoleJson}, ${inputs.startDate}, ${inputs.endDate}, ${inputs.slotsAvailabilityLimitInDays});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, count: `${v}.count`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

// --- Interview Templates & Job Managed Steps (Phase 7) ----------------------------------

registerNode({
  type: "smartRecruiters.searchInterviewTemplates",
  label: i18n.nodes.smartRecruiters.searchInterviewTemplates.label,
  description: i18n.nodes.smartRecruiters.searchInterviewTemplates.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    {
      id: "type",
      label: i18n.nodes.smartRecruiters.searchInterviewTemplates.pin_type,
      type: "enum",
      subType: SMARTRECRUITERS_INTERVIEW_TEMPLATE_TYPE_ENUM_TYPE,
      direction: "input",
      defaultValue: "",
      options: enumOptionIds(SMARTRECRUITERS_INTERVIEW_TEMPLATE_TYPE_ENUM_TYPE),
    },
    { id: "queryJson", label: i18n.nodes.smartRecruiters.__shared.pin_query_json, type: "string", direction: "input", defaultValue: "{}" },
    execOutPin(),
    successPin(),
    { id: "templatesJson", label: i18n.nodes.smartRecruiters.searchInterviewTemplates.pin_templates_json, type: "string", direction: "output" },
    { id: "totalFound", label: i18n.nodes.smartRecruiters.searchInterviewTemplates.pin_total_found, type: "number", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).searchInterviewTemplates(String(inputs.credentialName ?? ""), { ...parseJsonRecord(String(inputs.queryJson ?? "")), type: String(inputs.type ?? "") || undefined });
    return { nextExec: "exec-out", outputs: { success: result.success, templatesJson: JSON.stringify(result.templates), totalFound: result.totalFound, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.searchInterviewTemplates(${inputs.credentialName}, ${inputs.type}, ${inputs.queryJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, templatesJson: `JSON.stringify(${v}.templates)`, totalFound: `${v}.totalFound`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.createInterviewTemplate",
  label: i18n.nodes.smartRecruiters.createInterviewTemplate.label,
  description: i18n.nodes.smartRecruiters.createInterviewTemplate.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "templateJson", label: i18n.nodes.smartRecruiters.createInterviewTemplate.pin_template_json, type: "string", direction: "input", defaultValue: "{}" },
    execOutPin(),
    successPin(),
    { id: "createdTemplateJson", label: i18n.nodes.smartRecruiters.createInterviewTemplate.pin_created_template_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).createInterviewTemplate(String(inputs.credentialName ?? ""), parseJsonRecord(String(inputs.templateJson ?? "")));
    return { nextExec: "exec-out", outputs: { success: result.success, createdTemplateJson: JSON.stringify(result.template), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.createInterviewTemplate(${inputs.credentialName}, ${inputs.templateJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, createdTemplateJson: `JSON.stringify(${v}.template)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.getInterviewTemplate",
  label: i18n.nodes.smartRecruiters.getInterviewTemplate.label,
  description: i18n.nodes.smartRecruiters.getInterviewTemplate.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), templateIdPin(), execOutPin(), successPin(), { id: "templateJson", label: i18n.nodes.smartRecruiters.getInterviewTemplate.pin_template_json, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).getInterviewTemplate(String(inputs.credentialName ?? ""), String(inputs.templateId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, templateJson: JSON.stringify(result.template), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.getInterviewTemplate(${inputs.credentialName}, ${inputs.templateId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, templateJson: `JSON.stringify(${v}.template)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.updateInterviewTemplate",
  label: i18n.nodes.smartRecruiters.updateInterviewTemplate.label,
  description: i18n.nodes.smartRecruiters.updateInterviewTemplate.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    templateIdPin(),
    { id: "templateJson", label: i18n.nodes.smartRecruiters.updateInterviewTemplate.pin_template_json, type: "string", direction: "input", defaultValue: "{}" },
    execOutPin(),
    successPin(),
    { id: "updatedTemplateJson", label: i18n.nodes.smartRecruiters.updateInterviewTemplate.pin_updated_template_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).updateInterviewTemplate(String(inputs.credentialName ?? ""), String(inputs.templateId ?? ""), parseJsonRecord(String(inputs.templateJson ?? "")));
    return { nextExec: "exec-out", outputs: { success: result.success, updatedTemplateJson: JSON.stringify(result.template), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.updateInterviewTemplate(${inputs.credentialName}, ${inputs.templateId}, ${inputs.templateJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, updatedTemplateJson: `JSON.stringify(${v}.template)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.deleteInterviewTemplate",
  label: i18n.nodes.smartRecruiters.deleteInterviewTemplate.label,
  description: i18n.nodes.smartRecruiters.deleteInterviewTemplate.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), templateIdPin(), execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).deleteInterviewTemplate(String(inputs.credentialName ?? ""), String(inputs.templateId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.deleteInterviewTemplate(${inputs.credentialName}, ${inputs.templateId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.searchInterviewTemplatesDeprecated",
  label: i18n.nodes.smartRecruiters.searchInterviewTemplatesDeprecated.label,
  description: i18n.nodes.smartRecruiters.searchInterviewTemplatesDeprecated.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "page", label: i18n.nodes.smartRecruiters.searchInterviewTemplatesDeprecated.pin_page, type: "number", direction: "input", defaultValue: 0 },
    { id: "limit", label: i18n.nodes.smartRecruiters.searchInterviewTemplatesDeprecated.pin_limit, type: "number", direction: "input", defaultValue: 20 },
    { id: "search", label: i18n.nodes.smartRecruiters.searchInterviewTemplatesDeprecated.pin_search, type: "string", direction: "input", defaultValue: "" },
    execOutPin(),
    successPin(),
    { id: "templatesJson", label: i18n.nodes.smartRecruiters.searchInterviewTemplatesDeprecated.pin_templates_json, type: "string", direction: "output" },
    { id: "totalFound", label: i18n.nodes.smartRecruiters.searchInterviewTemplatesDeprecated.pin_total_found, type: "number", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).searchInterviewTemplatesDeprecated(String(inputs.credentialName ?? ""), Number(inputs.page ?? 0), Number(inputs.limit ?? 20), String(inputs.search ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, templatesJson: JSON.stringify(result.templates), totalFound: result.totalFound, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.searchInterviewTemplatesDeprecated(${inputs.credentialName}, ${inputs.page}, ${inputs.limit}, ${inputs.search});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, templatesJson: `JSON.stringify(${v}.templates)`, totalFound: `${v}.totalFound`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.getInterviewTemplateDeprecated",
  label: i18n.nodes.smartRecruiters.getInterviewTemplateDeprecated.label,
  description: i18n.nodes.smartRecruiters.getInterviewTemplateDeprecated.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), templateIdPin(), execOutPin(), successPin(), { id: "templateJson", label: i18n.nodes.smartRecruiters.getInterviewTemplateDeprecated.pin_template_json, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).getInterviewTemplateDeprecated(String(inputs.credentialName ?? ""), String(inputs.templateId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, templateJson: JSON.stringify(result.template), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.getInterviewTemplateDeprecated(${inputs.credentialName}, ${inputs.templateId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, templateJson: `JSON.stringify(${v}.template)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.updateInterviewTemplateDeprecated",
  label: i18n.nodes.smartRecruiters.updateInterviewTemplateDeprecated.label,
  description: i18n.nodes.smartRecruiters.updateInterviewTemplateDeprecated.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    templateIdPin(),
    { id: "templateJson", label: i18n.nodes.smartRecruiters.updateInterviewTemplateDeprecated.pin_template_json, type: "string", direction: "input", defaultValue: "{}" },
    execOutPin(),
    successPin(),
    { id: "updatedTemplateJson", label: i18n.nodes.smartRecruiters.updateInterviewTemplateDeprecated.pin_updated_template_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).updateInterviewTemplateDeprecated(String(inputs.credentialName ?? ""), String(inputs.templateId ?? ""), parseJsonRecord(String(inputs.templateJson ?? "")));
    return { nextExec: "exec-out", outputs: { success: result.success, updatedTemplateJson: JSON.stringify(result.template), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.updateInterviewTemplateDeprecated(${inputs.credentialName}, ${inputs.templateId}, ${inputs.templateJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, updatedTemplateJson: `JSON.stringify(${v}.template)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.deleteInterviewTemplateDeprecated",
  label: i18n.nodes.smartRecruiters.deleteInterviewTemplateDeprecated.label,
  description: i18n.nodes.smartRecruiters.deleteInterviewTemplateDeprecated.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), templateIdPin(), execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).deleteInterviewTemplateDeprecated(String(inputs.credentialName ?? ""), String(inputs.templateId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.deleteInterviewTemplateDeprecated(${inputs.credentialName}, ${inputs.templateId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.getJobManagedSteps",
  label: i18n.nodes.smartRecruiters.getJobManagedSteps.label,
  description: i18n.nodes.smartRecruiters.getJobManagedSteps.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), jobIdPin(), execOutPin(), successPin(), { id: "statesJson", label: i18n.nodes.smartRecruiters.getJobManagedSteps.pin_states_json, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).getJobManagedSteps(String(inputs.credentialName ?? ""), String(inputs.jobId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, statesJson: JSON.stringify(result.states), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.getJobManagedSteps(${inputs.credentialName}, ${inputs.jobId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, statesJson: `JSON.stringify(${v}.states)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.updateJobManagedSteps",
  label: i18n.nodes.smartRecruiters.updateJobManagedSteps.label,
  description: i18n.nodes.smartRecruiters.updateJobManagedSteps.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    jobIdPin(),
    { id: "statesJson", label: i18n.nodes.smartRecruiters.updateJobManagedSteps.pin_states_json, type: "string", direction: "input", defaultValue: "[]" },
    execOutPin(),
    successPin(),
    { id: "updatedStatesJson", label: i18n.nodes.smartRecruiters.updateJobManagedSteps.pin_updated_states_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const parsed = parseJsonBody(String(inputs.statesJson ?? "[]"));
    const result = await (await loadSmartRecruitersManager()).updateJobManagedSteps(String(inputs.credentialName ?? ""), String(inputs.jobId ?? ""), Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : []);
    return { nextExec: "exec-out", outputs: { success: result.success, updatedStatesJson: JSON.stringify(result.states), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.updateJobManagedSteps(${inputs.credentialName}, ${inputs.jobId}, ${inputs.statesJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, updatedStatesJson: `JSON.stringify(${v}.states)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.updateJobInterviewTemplateDeprecated",
  label: i18n.nodes.smartRecruiters.updateJobInterviewTemplateDeprecated.label,
  description: i18n.nodes.smartRecruiters.updateJobInterviewTemplateDeprecated.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), jobInterviewTemplateIdPin(), { id: "templateJson", label: i18n.nodes.smartRecruiters.updateJobInterviewTemplateDeprecated.pin_template_json, type: "string", direction: "input", defaultValue: "{}" }, execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).updateJobInterviewTemplateDeprecated(String(inputs.credentialName ?? ""), String(inputs.jobInterviewTemplateId ?? ""), parseJsonRecord(String(inputs.templateJson ?? "")));
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.updateJobInterviewTemplateDeprecated(${inputs.credentialName}, ${inputs.jobInterviewTemplateId}, ${inputs.templateJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.updateJobInterviewTemplateInterviewersDeprecated",
  label: i18n.nodes.smartRecruiters.updateJobInterviewTemplateInterviewersDeprecated.label,
  description: i18n.nodes.smartRecruiters.updateJobInterviewTemplateInterviewersDeprecated.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    jobInterviewTemplateIdPin(),
    { id: "hiringTeamRoleToInterviewersJson", label: i18n.nodes.smartRecruiters.updateJobInterviewTemplateInterviewersDeprecated.pin_hiring_team_role_to_interviewers_json, type: "string", direction: "input", defaultValue: "{}" },
    execOutPin(),
    successPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (
      await loadSmartRecruitersManager()
    ).updateJobInterviewTemplateInterviewersDeprecated(String(inputs.credentialName ?? ""), String(inputs.jobInterviewTemplateId ?? ""), parseJsonRecord(String(inputs.hiringTeamRoleToInterviewersJson ?? "")) as unknown as Record<string, string[]>);
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await SmartRecruitersManager.updateJobInterviewTemplateInterviewersDeprecated(${inputs.credentialName}, ${inputs.jobInterviewTemplateId}, ${inputs.hiringTeamRoleToInterviewersJson});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.getJobInterviewTemplatesDeprecated",
  label: i18n.nodes.smartRecruiters.getJobInterviewTemplatesDeprecated.label,
  description: i18n.nodes.smartRecruiters.getJobInterviewTemplatesDeprecated.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), jobIdPin(), execOutPin(), successPin(), { id: "stagesJson", label: i18n.nodes.smartRecruiters.getJobInterviewTemplatesDeprecated.pin_stages_json, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).getJobInterviewTemplatesDeprecated(String(inputs.credentialName ?? ""), String(inputs.jobId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, stagesJson: JSON.stringify(result.stages), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.getJobInterviewTemplatesDeprecated(${inputs.credentialName}, ${inputs.jobId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, stagesJson: `JSON.stringify(${v}.stages)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.getJobApplicationInterviewTemplateDeprecated",
  label: i18n.nodes.smartRecruiters.getJobApplicationInterviewTemplateDeprecated.label,
  description: i18n.nodes.smartRecruiters.getJobApplicationInterviewTemplateDeprecated.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), applicationIdPin(), execOutPin(), successPin(), { id: "templateJson", label: i18n.nodes.smartRecruiters.getJobApplicationInterviewTemplateDeprecated.pin_template_json, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).getJobApplicationInterviewTemplateDeprecated(String(inputs.credentialName ?? ""), String(inputs.applicationId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, templateJson: JSON.stringify(result.template), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.getJobApplicationInterviewTemplateDeprecated(${inputs.credentialName}, ${inputs.applicationId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, templateJson: `JSON.stringify(${v}.template)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.updateJobTemplate",
  label: i18n.nodes.smartRecruiters.updateJobTemplate.label,
  description: i18n.nodes.smartRecruiters.updateJobTemplate.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), jobInterviewTemplateIdPin(), { id: "templateJson", label: i18n.nodes.smartRecruiters.updateJobTemplate.pin_template_json, type: "string", direction: "input", defaultValue: "{}" }, execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).updateJobTemplate(String(inputs.credentialName ?? ""), String(inputs.jobInterviewTemplateId ?? ""), parseJsonRecord(String(inputs.templateJson ?? "")));
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.updateJobTemplate(${inputs.credentialName}, ${inputs.jobInterviewTemplateId}, ${inputs.templateJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.updateJobTemplateInterviewers",
  label: i18n.nodes.smartRecruiters.updateJobTemplateInterviewers.label,
  description: i18n.nodes.smartRecruiters.updateJobTemplateInterviewers.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    jobInterviewTemplateIdPin(),
    { id: "hiringTeamRoleToInterviewersJson", label: i18n.nodes.smartRecruiters.updateJobTemplateInterviewers.pin_hiring_team_role_to_interviewers_json, type: "string", direction: "input", defaultValue: "{}" },
    execOutPin(),
    successPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).updateJobTemplateInterviewers(String(inputs.credentialName ?? ""), String(inputs.jobInterviewTemplateId ?? ""), parseJsonRecord(String(inputs.hiringTeamRoleToInterviewersJson ?? "")) as unknown as Record<string, string[]>);
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.updateJobTemplateInterviewers(${inputs.credentialName}, ${inputs.jobInterviewTemplateId}, ${inputs.hiringTeamRoleToInterviewersJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.findJobTemplateByHiringStage",
  label: i18n.nodes.smartRecruiters.findJobTemplateByHiringStage.label,
  description: i18n.nodes.smartRecruiters.findJobTemplateByHiringStage.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    jobIdPin(),
    hiringStagePin(i18n.nodes.smartRecruiters.findJobTemplateByHiringStage.pin_hiring_stage),
    hiringStepPin(i18n.nodes.smartRecruiters.findJobTemplateByHiringStage.pin_hiring_step),
    execOutPin(),
    successPin(),
    { id: "templateJson", label: i18n.nodes.smartRecruiters.findJobTemplateByHiringStage.pin_template_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).findJobTemplateByHiringStage(String(inputs.credentialName ?? ""), String(inputs.jobId ?? ""), String(inputs.hiringStage ?? "INTERVIEW"), String(inputs.hiringStep ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, templateJson: JSON.stringify(result.template), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.findJobTemplateByHiringStage(${inputs.credentialName}, ${inputs.jobId}, ${inputs.hiringStage}, ${inputs.hiringStep});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, templateJson: `JSON.stringify(${v}.template)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.upsertJobTemplate",
  label: i18n.nodes.smartRecruiters.upsertJobTemplate.label,
  description: i18n.nodes.smartRecruiters.upsertJobTemplate.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    jobIdPin(),
    hiringStagePin(i18n.nodes.smartRecruiters.upsertJobTemplate.pin_hiring_stage),
    hiringStepPin(i18n.nodes.smartRecruiters.upsertJobTemplate.pin_hiring_step),
    templateIdPin(),
    execOutPin(),
    successPin(),
    { id: "templateJson", label: i18n.nodes.smartRecruiters.upsertJobTemplate.pin_template_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).upsertJobTemplate(String(inputs.credentialName ?? ""), String(inputs.jobId ?? ""), String(inputs.hiringStage ?? "INTERVIEW"), String(inputs.hiringStep ?? ""), String(inputs.templateId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, templateJson: JSON.stringify(result.template), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.upsertJobTemplate(${inputs.credentialName}, ${inputs.jobId}, ${inputs.hiringStage}, ${inputs.hiringStep}, ${inputs.templateId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, templateJson: `JSON.stringify(${v}.template)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.findJobTemplatesByJobId",
  label: i18n.nodes.smartRecruiters.findJobTemplatesByJobId.label,
  description: i18n.nodes.smartRecruiters.findJobTemplatesByJobId.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), jobIdPin(), execOutPin(), successPin(), { id: "stagesJson", label: i18n.nodes.smartRecruiters.findJobTemplatesByJobId.pin_stages_json, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).findJobTemplatesByJobId(String(inputs.credentialName ?? ""), String(inputs.jobId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, stagesJson: JSON.stringify(result.stages), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.findJobTemplatesByJobId(${inputs.credentialName}, ${inputs.jobId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, stagesJson: `JSON.stringify(${v}.stages)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.findJobTemplateByApplicationId",
  label: i18n.nodes.smartRecruiters.findJobTemplateByApplicationId.label,
  description: i18n.nodes.smartRecruiters.findJobTemplateByApplicationId.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), applicationIdPin(), execOutPin(), successPin(), { id: "templateJson", label: i18n.nodes.smartRecruiters.findJobTemplateByApplicationId.pin_template_json, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSmartRecruitersManager()).findJobTemplateByApplicationId(String(inputs.credentialName ?? ""), String(inputs.applicationId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, templateJson: JSON.stringify(result.template), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.findJobTemplateByApplicationId(${inputs.credentialName}, ${inputs.applicationId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, templateJson: `JSON.stringify(${v}.template)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});

registerNode({
  type: "smartRecruiters.searchJobTemplatesByApplicationIds",
  label: i18n.nodes.smartRecruiters.searchJobTemplatesByApplicationIds.label,
  description: i18n.nodes.smartRecruiters.searchJobTemplatesByApplicationIds.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    jobIdPin(),
    { id: "applicationIdsJson", label: i18n.nodes.smartRecruiters.searchJobTemplatesByApplicationIds.pin_application_ids_json, type: "string", direction: "input", defaultValue: "[]" },
    execOutPin(),
    successPin(),
    { id: "blueprintsJson", label: i18n.nodes.smartRecruiters.searchJobTemplatesByApplicationIds.pin_blueprints_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const parsed = parseJsonBody(String(inputs.applicationIdsJson ?? "[]"));
    const result = await (await loadSmartRecruitersManager()).searchJobTemplatesByApplicationIds(String(inputs.credentialName ?? ""), String(inputs.jobId ?? ""), Array.isArray(parsed) ? (parsed as string[]) : []);
    return { nextExec: "exec-out", outputs: { success: result.success, blueprintsJson: JSON.stringify(result.blueprints), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SmartRecruitersManager.searchJobTemplatesByApplicationIds(${inputs.credentialName}, ${inputs.jobId}, ${inputs.applicationIdsJson});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, blueprintsJson: `JSON.stringify(${v}.blueprints)`, error: `${v}.error` };
  },
  compileImports: [SMARTRECRUITERS_MANAGER_IMPORT],
});
