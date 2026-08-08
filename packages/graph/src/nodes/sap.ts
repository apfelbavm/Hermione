/** Registers nodes for SAP's OData/Gateway REST surface (S/4HANA and SAP Gateway-fronted systems) —
 * see lib/sapManager.ts for the request logic. SAP's proprietary IDoc/BAPI/RFC protocols require the
 * NetWeaver RFC SDK (not available via npm) and are out of scope here; this connector only covers
 * OData/Gateway services. RFC-enabled function modules exposed as a SOAP web service can still be
 * reached via the existing generic soap.call node (src/graph/nodes/soap.ts). */

import { NodeColorCategory } from "@hermione/graph/engine/types";
import { registerNode } from "@hermione/graph/engine/registry";
import { compileResultVar, SAP_MANAGER_IMPORT } from "@hermione/graph/engine/compileUtils";
import { i18n } from "@i18n";

// Every operation below calls the exact same SapManager static method (packages/core/src/lib/
// sapManager.ts) from both execute() (interpreter path) and compileExecute() (compiled/deployed
// path) — SapManager resolves the named credential straight from the database itself (see its
// findCredential), so unlike most other providers there is no separate functionLibrarySap.ts
// env-var-reading layer here: both paths are already identical.
//
// SapManager reaches the database directly (see its own header comment), which pulls in
// better-sqlite3, the SAP Cloud SDK, and Node builtins — fine for execute(), which only ever runs
// server-side, but this file is still statically imported client-side too (for the node-creation
// menu), so a plain top-level import here would drag that whole chain into the browser bundle.
// Loaded with a runtime `import()` instead, ignored by both bundlers, so it's never even resolved
// for the client build; only ever actually called server-side, where it resolves normally.
async function loadSapManager(): Promise<typeof import("@hermione/core/lib/sapManager").SapManager> {
  const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "@hermione/core/lib/sapManager");
  return mod.SapManager;
}

const GROUP_NAME = "Request.SAP";

function credentialNamePin() {
  return { id: "credentialName", label: i18n.nodes.sap.__shared.pin_credential_name, type: "string" as const, direction: "input" as const, defaultValue: "" };
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

function servicePathPin(label: string) {
  return { id: "servicePath", label, type: "string" as const, direction: "input" as const, defaultValue: "" };
}

function entitySetPin(label: string) {
  return { id: "entitySet", label, type: "string" as const, direction: "input" as const, defaultValue: "" };
}

function keyPredicatePin(label: string) {
  return { id: "keyPredicate", label, type: "string" as const, direction: "input" as const, defaultValue: "" };
}

registerNode({
  type: "sap.getEntitySet",
  label: i18n.nodes.sap.getEntitySet.label,
  description: i18n.nodes.sap.getEntitySet.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    servicePathPin(i18n.nodes.sap.getEntitySet.pin_service_path),
    entitySetPin(i18n.nodes.sap.getEntitySet.pin_entity_set),
    { id: "queryOptions", label: i18n.nodes.sap.getEntitySet.pin_query_options, type: "string", direction: "input", defaultValue: "" },
    execOutPin(),
    successPin(),
    { id: "resultsJson", label: i18n.nodes.sap.getEntitySet.pin_results_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSapManager()).getEntitySet(String(inputs.credentialName ?? ""), String(inputs.servicePath ?? ""), String(inputs.entitySet ?? ""), String(inputs.queryOptions ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, resultsJson: JSON.stringify(result.results), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SapManager.getEntitySet(${inputs.credentialName}, ${inputs.servicePath}, ${inputs.entitySet}, ${inputs.queryOptions});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, resultsJson: `JSON.stringify(${v}.results)`, error: `${v}.error` };
  },
  compileImports: [SAP_MANAGER_IMPORT],
});

registerNode({
  type: "sap.getEntity",
  label: i18n.nodes.sap.getEntity.label,
  description: i18n.nodes.sap.getEntity.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    servicePathPin(i18n.nodes.sap.getEntity.pin_service_path),
    entitySetPin(i18n.nodes.sap.getEntity.pin_entity_set),
    keyPredicatePin(i18n.nodes.sap.getEntity.pin_key_predicate),
    execOutPin(),
    successPin(),
    { id: "entityJson", label: i18n.nodes.sap.getEntity.pin_entity_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSapManager()).getEntity(String(inputs.credentialName ?? ""), String(inputs.servicePath ?? ""), String(inputs.entitySet ?? ""), String(inputs.keyPredicate ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, entityJson: JSON.stringify(result.entity), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SapManager.getEntity(${inputs.credentialName}, ${inputs.servicePath}, ${inputs.entitySet}, ${inputs.keyPredicate});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, entityJson: `JSON.stringify(${v}.entity)`, error: `${v}.error` };
  },
  compileImports: [SAP_MANAGER_IMPORT],
});

registerNode({
  type: "sap.createEntity",
  label: i18n.nodes.sap.createEntity.label,
  description: i18n.nodes.sap.createEntity.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    servicePathPin(i18n.nodes.sap.createEntity.pin_service_path),
    entitySetPin(i18n.nodes.sap.createEntity.pin_entity_set),
    { id: "bodyJson", label: i18n.nodes.sap.createEntity.pin_body_json, type: "string", direction: "input", defaultValue: "{}" },
    execOutPin(),
    successPin(),
    { id: "entityJson", label: i18n.nodes.sap.createEntity.pin_entity_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSapManager()).createEntity(String(inputs.credentialName ?? ""), String(inputs.servicePath ?? ""), String(inputs.entitySet ?? ""), JSON.parse(String(inputs.bodyJson ?? "{}")));
    return { nextExec: "exec-out", outputs: { success: result.success, entityJson: JSON.stringify(result.entity), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SapManager.createEntity(${inputs.credentialName}, ${inputs.servicePath}, ${inputs.entitySet}, JSON.parse(${inputs.bodyJson}));`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, entityJson: `JSON.stringify(${v}.entity)`, error: `${v}.error` };
  },
  compileImports: [SAP_MANAGER_IMPORT],
});

registerNode({
  type: "sap.updateEntity",
  label: i18n.nodes.sap.updateEntity.label,
  description: i18n.nodes.sap.updateEntity.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    servicePathPin(i18n.nodes.sap.updateEntity.pin_service_path),
    entitySetPin(i18n.nodes.sap.updateEntity.pin_entity_set),
    keyPredicatePin(i18n.nodes.sap.updateEntity.pin_key_predicate),
    { id: "bodyJson", label: i18n.nodes.sap.updateEntity.pin_body_json, type: "string", direction: "input", defaultValue: "{}" },
    execOutPin(),
    successPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSapManager()).updateEntity(String(inputs.credentialName ?? ""), String(inputs.servicePath ?? ""), String(inputs.entitySet ?? ""), String(inputs.keyPredicate ?? ""), JSON.parse(String(inputs.bodyJson ?? "{}")));
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SapManager.updateEntity(${inputs.credentialName}, ${inputs.servicePath}, ${inputs.entitySet}, ${inputs.keyPredicate}, JSON.parse(${inputs.bodyJson}));`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SAP_MANAGER_IMPORT],
});

registerNode({
  type: "sap.deleteEntity",
  label: i18n.nodes.sap.deleteEntity.label,
  description: i18n.nodes.sap.deleteEntity.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), servicePathPin(i18n.nodes.sap.deleteEntity.pin_service_path), entitySetPin(i18n.nodes.sap.deleteEntity.pin_entity_set), keyPredicatePin(i18n.nodes.sap.deleteEntity.pin_key_predicate), execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadSapManager()).deleteEntity(String(inputs.credentialName ?? ""), String(inputs.servicePath ?? ""), String(inputs.entitySet ?? ""), String(inputs.keyPredicate ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await SapManager.deleteEntity(${inputs.credentialName}, ${inputs.servicePath}, ${inputs.entitySet}, ${inputs.keyPredicate});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [SAP_MANAGER_IMPORT],
});
