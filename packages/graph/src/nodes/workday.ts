import { NodeColorCategory } from "@hermione/graph/engine/types";
import type { ExecutionContext } from "@hermione/graph/engine/types";
import { registerNode } from "@hermione/graph/engine/registry";
import { compileResultVar, FUNCTION_LIBRARY_WORKDAY_IMPORT } from "@hermione/graph/engine/compileUtils";
import { WorkdayManager } from "@hermione/core/lib/workdayManager";
import type { WorkdayBasicAuthCredentialData } from "@hermione/shared/types";
import { i18n } from "@i18n";

const GROUP_NAME = "Request.Workday";

function resolveWorkdayCredential(ctx: ExecutionContext, credentialName: string): { ok: true; data: WorkdayBasicAuthCredentialData } | { ok: false; error: string } {
  const credential = ctx.getCredential?.(credentialName);
  if (!credential) return { ok: false, error: `Credential "${credentialName}" not found in the vault` };
  if (credential.type !== "workdayBasicAuth") return { ok: false, error: `Credential "${credentialName}" is not a Workday Basic Auth credential` };
  return { ok: true, data: credential.data as WorkdayBasicAuthCredentialData };
}

function credentialNamePin() {
  return { id: "credentialName", label: i18n.nodes.workday.__shared.pin_credential_name, type: "string" as const, direction: "input" as const, defaultValue: "" };
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

registerNode({
  type: "workday.getWorkers",
  label: i18n.nodes.workday.getWorkers.label,
  description: i18n.nodes.workday.getWorkers.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "limit", label: i18n.nodes.workday.getWorkers.pin_limit, type: "number", direction: "input", defaultValue: 20 },
    { id: "offset", label: i18n.nodes.workday.getWorkers.pin_offset, type: "number", direction: "input", defaultValue: 0 },
    { id: "searchTerm", label: i18n.nodes.workday.getWorkers.pin_search_term, type: "string", direction: "input", defaultValue: "" },
    execOutPin(),
    successPin(),
    { id: "workersJson", label: i18n.nodes.workday.getWorkers.pin_workers_json, type: "string", direction: "output" },
    { id: "total", label: i18n.nodes.workday.getWorkers.pin_total, type: "number", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveWorkdayCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, workersJson: "[]", total: 0, error: resolved.error } };
    const manager = new WorkdayManager(resolved.data.tenantUrl, resolved.data.username, resolved.data.password);
    const result = await manager.getWorkers(Number(inputs.limit ?? 20), Number(inputs.offset ?? 0), String(inputs.searchTerm ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, workersJson: JSON.stringify(result.workers), total: result.total, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryWorkday.workdayGetWorkers(${inputs.credentialName}, ${inputs.limit}, ${inputs.offset}, ${inputs.searchTerm});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, workersJson: `JSON.stringify(${v}.workers)`, total: `${v}.total`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_WORKDAY_IMPORT],
});

registerNode({
  type: "workday.getWorker",
  label: i18n.nodes.workday.getWorker.label,
  description: i18n.nodes.workday.getWorker.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "workerId", label: i18n.nodes.workday.getWorker.pin_worker_id, type: "string", direction: "input", defaultValue: "" },
    execOutPin(),
    successPin(),
    { id: "workerJson", label: i18n.nodes.workday.getWorker.pin_worker_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveWorkdayCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, workerJson: "{}", error: resolved.error } };
    const manager = new WorkdayManager(resolved.data.tenantUrl, resolved.data.username, resolved.data.password);
    const result = await manager.getWorker(String(inputs.workerId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, workerJson: JSON.stringify(result.worker), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryWorkday.workdayGetWorker(${inputs.credentialName}, ${inputs.workerId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, workerJson: `JSON.stringify(${v}.worker)`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_WORKDAY_IMPORT],
});

registerNode({
  type: "workday.searchWorkers",
  label: i18n.nodes.workday.searchWorkers.label,
  description: i18n.nodes.workday.searchWorkers.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "query", label: i18n.nodes.workday.searchWorkers.pin_query, type: "string", direction: "input", defaultValue: "" },
    { id: "limit", label: i18n.nodes.workday.searchWorkers.pin_limit, type: "number", direction: "input", defaultValue: 20 },
    execOutPin(),
    successPin(),
    { id: "workersJson", label: i18n.nodes.workday.searchWorkers.pin_workers_json, type: "string", direction: "output" },
    { id: "total", label: i18n.nodes.workday.searchWorkers.pin_total, type: "number", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveWorkdayCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, workersJson: "[]", total: 0, error: resolved.error } };
    const manager = new WorkdayManager(resolved.data.tenantUrl, resolved.data.username, resolved.data.password);
    const result = await manager.searchWorkers(String(inputs.query ?? ""), Number(inputs.limit ?? 20));
    return { nextExec: "exec-out", outputs: { success: result.success, workersJson: JSON.stringify(result.workers), total: result.total, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryWorkday.workdaySearchWorkers(${inputs.credentialName}, ${inputs.query}, ${inputs.limit});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, workersJson: `JSON.stringify(${v}.workers)`, total: `${v}.total`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_WORKDAY_IMPORT],
});

registerNode({
  type: "workday.getStaffingOrganizations",
  label: i18n.nodes.workday.getStaffingOrganizations.label,
  description: i18n.nodes.workday.getStaffingOrganizations.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "limit", label: i18n.nodes.workday.getStaffingOrganizations.pin_limit, type: "number", direction: "input", defaultValue: 20 },
    { id: "offset", label: i18n.nodes.workday.getStaffingOrganizations.pin_offset, type: "number", direction: "input", defaultValue: 0 },
    execOutPin(),
    successPin(),
    { id: "organizationsJson", label: i18n.nodes.workday.getStaffingOrganizations.pin_organizations_json, type: "string", direction: "output" },
    { id: "total", label: i18n.nodes.workday.getStaffingOrganizations.pin_total, type: "number", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveWorkdayCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, organizationsJson: "[]", total: 0, error: resolved.error } };
    const manager = new WorkdayManager(resolved.data.tenantUrl, resolved.data.username, resolved.data.password);
    const result = await manager.getStaffingOrganizations(Number(inputs.limit ?? 20), Number(inputs.offset ?? 0));
    return { nextExec: "exec-out", outputs: { success: result.success, organizationsJson: JSON.stringify(result.organizations), total: result.total, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryWorkday.workdayGetStaffingOrganizations(${inputs.credentialName}, ${inputs.limit}, ${inputs.offset});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, organizationsJson: `JSON.stringify(${v}.organizations)`, total: `${v}.total`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_WORKDAY_IMPORT],
});

registerNode({
  type: "workday.getOrganization",
  label: i18n.nodes.workday.getOrganization.label,
  description: i18n.nodes.workday.getOrganization.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "organizationId", label: i18n.nodes.workday.getOrganization.pin_organization_id, type: "string", direction: "input", defaultValue: "" },
    execOutPin(),
    successPin(),
    { id: "organizationJson", label: i18n.nodes.workday.getOrganization.pin_organization_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveWorkdayCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, organizationJson: "{}", error: resolved.error } };
    const manager = new WorkdayManager(resolved.data.tenantUrl, resolved.data.username, resolved.data.password);
    const result = await manager.getOrganization(String(inputs.organizationId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, organizationJson: JSON.stringify(result.organization), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryWorkday.workdayGetOrganization(${inputs.credentialName}, ${inputs.organizationId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, organizationJson: `JSON.stringify(${v}.organization)`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_WORKDAY_IMPORT],
});
