/** Registers nodes for SAP's OData/Gateway REST surface (S/4HANA and SAP Gateway-fronted systems) —
 * see lib/sapManager.ts for the request logic. SAP's proprietary IDoc/BAPI/RFC protocols require the
 * NetWeaver RFC SDK (not available via npm) and are out of scope here; this connector only covers
 * OData/Gateway services. RFC-enabled function modules exposed as a SOAP web service can still be
 * reached via the existing generic soap.call node (src/graph/nodes/soap.ts).
 *
 * lib/sapManager.ts wraps the official `@sap-cloud-sdk/http-client` + `@sap-cloud-sdk/connectivity`
 * packages, which transitively depend on Node-only packages (jsonwebtoken, @sap/xssec, jks-js, etc.)
 * — a browser tab has no way to run them at all, same situation as twilio.ts/stripe.ts/smtp.ts (see
 * those files' own header comments for the fuller explanation). Every node's own execute() below is
 * therefore a permanent, honest stub — it always reports failure with a clear explanation instead of
 * pretending to try, and the REAL implementation exists only for the compiled path, reached purely
 * via compileImports below (never a static import here). */

import { NodeColorCategory } from "../engine/types";
import { registerNode } from "../engine/registry";
import { compileResultVar, FUNCTION_LIBRARY_SAP_IMPORT } from "../engine/compileUtils";
import { i18n } from "@i18n";

const GROUP_NAME = "Request.SAP";

const STUB_ERROR = 'SAP OData nodes only run in the compiled output (under Node.js) — the in-browser "Run" button cannot load the SAP Cloud SDK. Compile this graph and run the generated script to actually reach SAP.';

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
  execute: async () => ({ nextExec: "exec-out", outputs: { success: false, resultsJson: "[]", error: STUB_ERROR } }),
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySap.sapGetEntitySet(${inputs.credentialName}, ${inputs.servicePath}, ${inputs.entitySet}, ${inputs.queryOptions});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, resultsJson: `JSON.stringify(${v}.results)`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SAP_IMPORT],
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
  execute: async () => ({ nextExec: "exec-out", outputs: { success: false, entityJson: "{}", error: STUB_ERROR } }),
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySap.sapGetEntity(${inputs.credentialName}, ${inputs.servicePath}, ${inputs.entitySet}, ${inputs.keyPredicate});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, entityJson: `JSON.stringify(${v}.entity)`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SAP_IMPORT],
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
  execute: async () => ({ nextExec: "exec-out", outputs: { success: false, entityJson: "{}", error: STUB_ERROR } }),
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySap.sapCreateEntity(${inputs.credentialName}, ${inputs.servicePath}, ${inputs.entitySet}, JSON.parse(${inputs.bodyJson}));`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, entityJson: `JSON.stringify(${v}.entity)`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SAP_IMPORT],
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
  execute: async () => ({ nextExec: "exec-out", outputs: { success: false, error: STUB_ERROR } }),
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySap.sapUpdateEntity(${inputs.credentialName}, ${inputs.servicePath}, ${inputs.entitySet}, ${inputs.keyPredicate}, JSON.parse(${inputs.bodyJson}));`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SAP_IMPORT],
});

registerNode({
  type: "sap.deleteEntity",
  label: i18n.nodes.sap.deleteEntity.label,
  description: i18n.nodes.sap.deleteEntity.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), servicePathPin(i18n.nodes.sap.deleteEntity.pin_service_path), entitySetPin(i18n.nodes.sap.deleteEntity.pin_entity_set), keyPredicatePin(i18n.nodes.sap.deleteEntity.pin_key_predicate), execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async () => ({ nextExec: "exec-out", outputs: { success: false, error: STUB_ERROR } }),
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySap.sapDeleteEntity(${inputs.credentialName}, ${inputs.servicePath}, ${inputs.entitySet}, ${inputs.keyPredicate});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SAP_IMPORT],
});
