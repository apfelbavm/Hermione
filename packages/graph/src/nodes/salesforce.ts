import { NodeColorCategory } from "@hermione/graph/engine/types";
import { registerNode } from "@hermione/graph/engine/registry";
import { compileResultVar, SALESFORCE_MANAGER_IMPORT, RETRY_HELPER_IMPORT } from "@hermione/graph/engine/compileUtils";
import { SALESFORCE_DESCRIBE_FIELD_STRUCT_TYPE } from "@hermione/graph/structs/salesforce";
import { withRetry } from "@hermione/core/lib/retry";
import { retryCountPin, retryDelayMsPin, attemptsPin } from "@hermione/graph/nodes/shared/retryPins";
import { i18n } from "@i18n";

// Every operation below calls the exact same SalesforceManager static method (packages/core/src/lib/
// salesforceManager.ts) from both execute() (interpreter path) and compileExecute() (compiled/deployed
// path) — SalesforceManager resolves the named credential straight from the database itself (see its
// findCredential), so unlike most other providers there is no separate functionLibrarySalesforce.ts
// env-var-reading layer and no ctx.getCredential vault lookup here: both paths are already identical.
//
// SalesforceManager reaches the database directly, which pulls in better-sqlite3 and Node builtins —
// fine for execute(), which only ever runs server-side, but this file is still statically imported
// client-side too (for the node-creation menu), so a plain top-level import here would drag that
// whole chain into the browser bundle. Loaded with a runtime `import()` instead, ignored by both
// bundlers, so it's never even resolved for the client build; only ever actually called server-side,
// where it resolves normally.
async function loadSalesforceManager(): Promise<typeof import("@hermione/core/lib/salesforceManager").SalesforceManager> {
  const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "@hermione/core/lib/salesforceManager");
  return mod.SalesforceManager;
}

const GROUP_NAME = "Request.Salesforce";

function credentialNamePin() {
  return { id: "credentialName", label: i18n.nodes.salesforce.__shared.pin_credential_name, type: "string" as const, direction: "input" as const, defaultValue: "" };
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
  type: "salesforce.query",
  label: i18n.nodes.salesforce.query.label,
  description: i18n.nodes.salesforce.query.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "soql", label: i18n.nodes.salesforce.query.pin_soql, type: "string", direction: "input", defaultValue: "" },
    retryCountPin(),
    retryDelayMsPin(),
    execOutPin(),
    successPin(),
    { id: "recordsJson", label: i18n.nodes.salesforce.query.pin_records_json, type: "string", direction: "output" },
    { id: "totalSize", label: i18n.nodes.salesforce.query.pin_total_size, type: "number", direction: "output" },
    { id: "done", label: i18n.nodes.salesforce.query.pin_done, type: "boolean", direction: "output" },
    attemptsPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await withRetry(async () => (await loadSalesforceManager()).query(String(inputs.credentialName ?? ""), String(inputs.soql ?? "")), Number(inputs.retryCount ?? 0), Number(inputs.retryDelayMs ?? 0));
    return { nextExec: "exec-out", outputs: { success: result.success, recordsJson: JSON.stringify(result.records), totalSize: result.totalSize, done: result.done, attempts: result.attempts, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await withRetry(() => SalesforceManager.query(${inputs.credentialName}, ${inputs.soql}), ${inputs.retryCount}, ${inputs.retryDelayMs});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, recordsJson: `JSON.stringify(${v}.records)`, totalSize: `${v}.totalSize`, done: `${v}.done`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [SALESFORCE_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
});

registerNode({
  type: "salesforce.createRecord",
  label: i18n.nodes.salesforce.createRecord.label,
  description: i18n.nodes.salesforce.createRecord.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "sobjectType", label: i18n.nodes.salesforce.createRecord.pin_sobject_type, type: "string", direction: "input", defaultValue: "" },
    { id: "fieldsJson", label: i18n.nodes.salesforce.createRecord.pin_fields_json, type: "string", direction: "input", defaultValue: "{}" },
    retryCountPin(),
    retryDelayMsPin(),
    execOutPin(),
    successPin(),
    { id: "id", label: i18n.nodes.salesforce.createRecord.pin_id, type: "string", direction: "output" },
    attemptsPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    let fields: Record<string, unknown>;
    try {
      fields = JSON.parse(String(inputs.fieldsJson ?? "{}"));
    } catch {
      return { nextExec: "exec-out", outputs: { success: false, id: "", error: "Fields JSON is not valid JSON" } };
    }
    const result = await withRetry(async () => (await loadSalesforceManager()).createRecord(String(inputs.credentialName ?? ""), String(inputs.sobjectType ?? ""), fields), Number(inputs.retryCount ?? 0), Number(inputs.retryDelayMs ?? 0));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await withRetry(() => SalesforceManager.createRecord(${inputs.credentialName}, ${inputs.sobjectType}, JSON.parse(${inputs.fieldsJson})), ${inputs.retryCount}, ${inputs.retryDelayMs});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, id: `${v}.id`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [SALESFORCE_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
});

registerNode({
  type: "salesforce.getRecord",
  label: i18n.nodes.salesforce.getRecord.label,
  description: i18n.nodes.salesforce.getRecord.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "sobjectType", label: i18n.nodes.salesforce.getRecord.pin_sobject_type, type: "string", direction: "input", defaultValue: "" },
    { id: "id", label: i18n.nodes.salesforce.getRecord.pin_id, type: "string", direction: "input", defaultValue: "" },
    { id: "fields", label: i18n.nodes.salesforce.getRecord.pin_fields, type: "string", direction: "input", defaultValue: "" },
    retryCountPin(),
    retryDelayMsPin(),
    execOutPin(),
    successPin(),
    { id: "recordJson", label: i18n.nodes.salesforce.getRecord.pin_record_json, type: "string", direction: "output" },
    attemptsPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await withRetry(async () => (await loadSalesforceManager()).getRecord(String(inputs.credentialName ?? ""), String(inputs.sobjectType ?? ""), String(inputs.id ?? ""), String(inputs.fields ?? "")), Number(inputs.retryCount ?? 0), Number(inputs.retryDelayMs ?? 0));
    return { nextExec: "exec-out", outputs: { success: result.success, recordJson: JSON.stringify(result.record), attempts: result.attempts, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await withRetry(() => SalesforceManager.getRecord(${inputs.credentialName}, ${inputs.sobjectType}, ${inputs.id}, ${inputs.fields}), ${inputs.retryCount}, ${inputs.retryDelayMs});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, recordJson: `JSON.stringify(${v}.record)`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [SALESFORCE_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
});

registerNode({
  type: "salesforce.updateRecord",
  label: i18n.nodes.salesforce.updateRecord.label,
  description: i18n.nodes.salesforce.updateRecord.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "sobjectType", label: i18n.nodes.salesforce.updateRecord.pin_sobject_type, type: "string", direction: "input", defaultValue: "" },
    { id: "id", label: i18n.nodes.salesforce.updateRecord.pin_id, type: "string", direction: "input", defaultValue: "" },
    { id: "fieldsJson", label: i18n.nodes.salesforce.updateRecord.pin_fields_json, type: "string", direction: "input", defaultValue: "{}" },
    retryCountPin(),
    retryDelayMsPin(),
    execOutPin(),
    successPin(),
    attemptsPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    let fields: Record<string, unknown>;
    try {
      fields = JSON.parse(String(inputs.fieldsJson ?? "{}"));
    } catch {
      return { nextExec: "exec-out", outputs: { success: false, error: "Fields JSON is not valid JSON" } };
    }
    const result = await withRetry(async () => (await loadSalesforceManager()).updateRecord(String(inputs.credentialName ?? ""), String(inputs.sobjectType ?? ""), String(inputs.id ?? ""), fields), Number(inputs.retryCount ?? 0), Number(inputs.retryDelayMs ?? 0));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await withRetry(() => SalesforceManager.updateRecord(${inputs.credentialName}, ${inputs.sobjectType}, ${inputs.id}, JSON.parse(${inputs.fieldsJson})), ${inputs.retryCount}, ${inputs.retryDelayMs});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [SALESFORCE_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
});

registerNode({
  type: "salesforce.deleteRecord",
  label: i18n.nodes.salesforce.deleteRecord.label,
  description: i18n.nodes.salesforce.deleteRecord.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "sobjectType", label: i18n.nodes.salesforce.deleteRecord.pin_sobject_type, type: "string", direction: "input", defaultValue: "" },
    { id: "id", label: i18n.nodes.salesforce.deleteRecord.pin_id, type: "string", direction: "input", defaultValue: "" },
    retryCountPin(),
    retryDelayMsPin(),
    execOutPin(),
    successPin(),
    attemptsPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await withRetry(async () => (await loadSalesforceManager()).deleteRecord(String(inputs.credentialName ?? ""), String(inputs.sobjectType ?? ""), String(inputs.id ?? "")), Number(inputs.retryCount ?? 0), Number(inputs.retryDelayMs ?? 0));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await withRetry(() => SalesforceManager.deleteRecord(${inputs.credentialName}, ${inputs.sobjectType}, ${inputs.id}), ${inputs.retryCount}, ${inputs.retryDelayMs});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [SALESFORCE_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
});

registerNode({
  type: "salesforce.upsertRecord",
  label: i18n.nodes.salesforce.upsertRecord.label,
  description: i18n.nodes.salesforce.upsertRecord.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "sobjectType", label: i18n.nodes.salesforce.upsertRecord.pin_sobject_type, type: "string", direction: "input", defaultValue: "" },
    { id: "externalIdField", label: i18n.nodes.salesforce.upsertRecord.pin_external_id_field, type: "string", direction: "input", defaultValue: "" },
    { id: "externalIdValue", label: i18n.nodes.salesforce.upsertRecord.pin_external_id_value, type: "string", direction: "input", defaultValue: "" },
    { id: "fieldsJson", label: i18n.nodes.salesforce.upsertRecord.pin_fields_json, type: "string", direction: "input", defaultValue: "{}" },
    retryCountPin(),
    retryDelayMsPin(),
    execOutPin(),
    successPin(),
    { id: "id", label: i18n.nodes.salesforce.upsertRecord.pin_id, type: "string", direction: "output" },
    attemptsPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    let fields: Record<string, unknown>;
    try {
      fields = JSON.parse(String(inputs.fieldsJson ?? "{}"));
    } catch {
      return { nextExec: "exec-out", outputs: { success: false, id: "", error: "Fields JSON is not valid JSON" } };
    }
    const result = await withRetry(
      async () => (await loadSalesforceManager()).upsertRecord(String(inputs.credentialName ?? ""), String(inputs.sobjectType ?? ""), String(inputs.externalIdField ?? ""), String(inputs.externalIdValue ?? ""), fields),
      Number(inputs.retryCount ?? 0),
      Number(inputs.retryDelayMs ?? 0),
    );
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await withRetry(() => SalesforceManager.upsertRecord(${inputs.credentialName}, ${inputs.sobjectType}, ${inputs.externalIdField}, ${inputs.externalIdValue}, JSON.parse(${inputs.fieldsJson})), ${inputs.retryCount}, ${inputs.retryDelayMs});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, id: `${v}.id`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [SALESFORCE_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
});

registerNode({
  type: "salesforce.describeSobject",
  label: i18n.nodes.salesforce.describeSobject.label,
  description: i18n.nodes.salesforce.describeSobject.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "sobjectType", label: i18n.nodes.salesforce.describeSobject.pin_sobject_type, type: "string", direction: "input", defaultValue: "" },
    retryCountPin(),
    retryDelayMsPin(),
    execOutPin(),
    successPin(),
    { id: "fields", label: i18n.nodes.salesforce.describeSobject.pin_fields, type: "struct", subType: SALESFORCE_DESCRIBE_FIELD_STRUCT_TYPE, container: "array", direction: "output" },
    attemptsPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await withRetry(async () => (await loadSalesforceManager()).describeSobject(String(inputs.credentialName ?? ""), String(inputs.sobjectType ?? "")), Number(inputs.retryCount ?? 0), Number(inputs.retryDelayMs ?? 0));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await withRetry(() => SalesforceManager.describeSobject(${inputs.credentialName}, ${inputs.sobjectType}), ${inputs.retryCount}, ${inputs.retryDelayMs});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, fields: `${v}.fields`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [SALESFORCE_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
});
