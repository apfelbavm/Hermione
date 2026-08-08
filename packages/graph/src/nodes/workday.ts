import { NodeColorCategory } from "@hermione/graph/engine/types";
import { registerNode } from "@hermione/graph/engine/registry";
import { compileResultVar, WORKDAY_MANAGER_IMPORT } from "@hermione/graph/engine/compileUtils";
import { i18n } from "@i18n";

const GROUP_NAME = "Request.Workday";

// Loaded via runtime import() rather than a top-level import for the same reason as
// nodes/twilio.ts's loadTwilioManager: WorkdayManager reaches the database directly, pulling in
// better-sqlite3 and Node builtins that must never be dragged into the client bundle that
// statically imports this file for the node-creation menu.
async function loadWorkdayManager(): Promise<typeof import("@hermione/core/lib/workdayManager").WorkdayManager> {
  const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "@hermione/core/lib/workdayManager");
  return mod.WorkdayManager;
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
  execute: async ({ inputs }) => {
    const result = await (await loadWorkdayManager()).getWorkers(String(inputs.credentialName ?? ""), Number(inputs.limit ?? 20), Number(inputs.offset ?? 0), String(inputs.searchTerm ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, workersJson: JSON.stringify(result.workers), total: result.total, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await WorkdayManager.getWorkers(${inputs.credentialName}, ${inputs.limit}, ${inputs.offset}, ${inputs.searchTerm});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, workersJson: `JSON.stringify(${v}.workers)`, total: `${v}.total`, error: `${v}.error` };
  },
  compileImports: [WORKDAY_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadWorkdayManager()).getWorker(String(inputs.credentialName ?? ""), String(inputs.workerId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, workerJson: JSON.stringify(result.worker), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await WorkdayManager.getWorker(${inputs.credentialName}, ${inputs.workerId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, workerJson: `JSON.stringify(${v}.worker)`, error: `${v}.error` };
  },
  compileImports: [WORKDAY_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadWorkdayManager()).searchWorkers(String(inputs.credentialName ?? ""), String(inputs.query ?? ""), Number(inputs.limit ?? 20));
    return { nextExec: "exec-out", outputs: { success: result.success, workersJson: JSON.stringify(result.workers), total: result.total, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await WorkdayManager.searchWorkers(${inputs.credentialName}, ${inputs.query}, ${inputs.limit});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, workersJson: `JSON.stringify(${v}.workers)`, total: `${v}.total`, error: `${v}.error` };
  },
  compileImports: [WORKDAY_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadWorkdayManager()).getStaffingOrganizations(String(inputs.credentialName ?? ""), Number(inputs.limit ?? 20), Number(inputs.offset ?? 0));
    return { nextExec: "exec-out", outputs: { success: result.success, organizationsJson: JSON.stringify(result.organizations), total: result.total, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await WorkdayManager.getStaffingOrganizations(${inputs.credentialName}, ${inputs.limit}, ${inputs.offset});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, organizationsJson: `JSON.stringify(${v}.organizations)`, total: `${v}.total`, error: `${v}.error` };
  },
  compileImports: [WORKDAY_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadWorkdayManager()).getOrganization(String(inputs.credentialName ?? ""), String(inputs.organizationId ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, organizationJson: JSON.stringify(result.organization), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await WorkdayManager.getOrganization(${inputs.credentialName}, ${inputs.organizationId});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, organizationJson: `JSON.stringify(${v}.organization)`, error: `${v}.error` };
  },
  compileImports: [WORKDAY_MANAGER_IMPORT],
});
