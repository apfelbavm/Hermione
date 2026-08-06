import { NodeColorCategory, type ExecutionContext } from "../engine/types";
import { registerNode } from "../engine/registry";
import { compileResultVar, FUNCTION_LIBRARY_SALESFORCE_IMPORT } from "../engine/compileUtils";
import { SalesforceManager } from "../../lib/salesforceManager";
import type { SalesforceOAuth2PasswordFlowCredentialData } from "../../credentials/types";
import { SALESFORCE_DESCRIBE_FIELD_STRUCT_TYPE } from "../structs/salesforce";
import { i18n } from "@i18n";

const GROUP_NAME = "Request.Salesforce";

function credentialNamePin() {
  return { id: "credentialName", label: i18n.nodes.salesforce.__shared.pin_credential_name, type: "string" as const, direction: "input" as const, defaultValue: "" };
}

function resolveSalesforceCredential(ctx: ExecutionContext, credentialName: string): { ok: true; data: SalesforceOAuth2PasswordFlowCredentialData } | { ok: false; error: string } {
  const credential = ctx.getCredential?.(credentialName);
  if (!credential) return { ok: false, error: `Credential "${credentialName}" not found in the vault` };
  if (credential.type !== "salesforceOAuth2PasswordFlow") return { ok: false, error: `Credential "${credentialName}" is not a Salesforce OAuth2 (Password Flow) credential` };
  return { ok: true, data: credential.data as SalesforceOAuth2PasswordFlowCredentialData };
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
    execOutPin(),
    successPin(),
    { id: "recordsJson", label: i18n.nodes.salesforce.query.pin_records_json, type: "string", direction: "output" },
    { id: "totalSize", label: i18n.nodes.salesforce.query.pin_total_size, type: "number", direction: "output" },
    { id: "done", label: i18n.nodes.salesforce.query.pin_done, type: "boolean", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSalesforceCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, recordsJson: "[]", totalSize: 0, done: true, error: resolved.error } };
    const auth = await SalesforceManager.forCredential(resolved.data);
    if (!auth.ok) return { nextExec: "exec-out", outputs: { success: false, recordsJson: "[]", totalSize: 0, done: true, error: auth.error } };
    const result = await auth.manager.query(String(inputs.soql ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, recordsJson: JSON.stringify(result.records), totalSize: result.totalSize, done: result.done, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySalesforce.salesforceQuery(${inputs.credentialName}, ${inputs.soql});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, recordsJson: `JSON.stringify(${v}.records)`, totalSize: `${v}.totalSize`, done: `${v}.done`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SALESFORCE_IMPORT],
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
    execOutPin(),
    successPin(),
    { id: "id", label: i18n.nodes.salesforce.createRecord.pin_id, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSalesforceCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, id: "", error: resolved.error } };
    let fields: Record<string, unknown>;
    try {
      fields = JSON.parse(String(inputs.fieldsJson ?? "{}"));
    } catch {
      return { nextExec: "exec-out", outputs: { success: false, id: "", error: "Fields JSON is not valid JSON" } };
    }
    const auth = await SalesforceManager.forCredential(resolved.data);
    if (!auth.ok) return { nextExec: "exec-out", outputs: { success: false, id: "", error: auth.error } };
    const result = await auth.manager.createRecord(String(inputs.sobjectType ?? ""), fields);
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySalesforce.salesforceCreateRecord(${inputs.credentialName}, ${inputs.sobjectType}, JSON.parse(${inputs.fieldsJson}));`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, id: `${v}.id`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SALESFORCE_IMPORT],
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
    execOutPin(),
    successPin(),
    { id: "recordJson", label: i18n.nodes.salesforce.getRecord.pin_record_json, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSalesforceCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, recordJson: "{}", error: resolved.error } };
    const auth = await SalesforceManager.forCredential(resolved.data);
    if (!auth.ok) return { nextExec: "exec-out", outputs: { success: false, recordJson: "{}", error: auth.error } };
    const result = await auth.manager.getRecord(String(inputs.sobjectType ?? ""), String(inputs.id ?? ""), String(inputs.fields ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, recordJson: JSON.stringify(result.record), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySalesforce.salesforceGetRecord(${inputs.credentialName}, ${inputs.sobjectType}, ${inputs.id}, ${inputs.fields});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, recordJson: `JSON.stringify(${v}.record)`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SALESFORCE_IMPORT],
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
    execOutPin(),
    successPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSalesforceCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    let fields: Record<string, unknown>;
    try {
      fields = JSON.parse(String(inputs.fieldsJson ?? "{}"));
    } catch {
      return { nextExec: "exec-out", outputs: { success: false, error: "Fields JSON is not valid JSON" } };
    }
    const auth = await SalesforceManager.forCredential(resolved.data);
    if (!auth.ok) return { nextExec: "exec-out", outputs: { success: false, error: auth.error } };
    const result = await auth.manager.updateRecord(String(inputs.sobjectType ?? ""), String(inputs.id ?? ""), fields);
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySalesforce.salesforceUpdateRecord(${inputs.credentialName}, ${inputs.sobjectType}, ${inputs.id}, JSON.parse(${inputs.fieldsJson}));`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SALESFORCE_IMPORT],
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
    execOutPin(),
    successPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSalesforceCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const auth = await SalesforceManager.forCredential(resolved.data);
    if (!auth.ok) return { nextExec: "exec-out", outputs: { success: false, error: auth.error } };
    const result = await auth.manager.deleteRecord(String(inputs.sobjectType ?? ""), String(inputs.id ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySalesforce.salesforceDeleteRecord(${inputs.credentialName}, ${inputs.sobjectType}, ${inputs.id});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SALESFORCE_IMPORT],
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
    execOutPin(),
    successPin(),
    { id: "id", label: i18n.nodes.salesforce.upsertRecord.pin_id, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSalesforceCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, id: "", error: resolved.error } };
    let fields: Record<string, unknown>;
    try {
      fields = JSON.parse(String(inputs.fieldsJson ?? "{}"));
    } catch {
      return { nextExec: "exec-out", outputs: { success: false, id: "", error: "Fields JSON is not valid JSON" } };
    }
    const auth = await SalesforceManager.forCredential(resolved.data);
    if (!auth.ok) return { nextExec: "exec-out", outputs: { success: false, id: "", error: auth.error } };
    const result = await auth.manager.upsertRecord(String(inputs.sobjectType ?? ""), String(inputs.externalIdField ?? ""), String(inputs.externalIdValue ?? ""), fields);
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await functionLibrarySalesforce.salesforceUpsertRecord(${inputs.credentialName}, ${inputs.sobjectType}, ${inputs.externalIdField}, ${inputs.externalIdValue}, JSON.parse(${inputs.fieldsJson}));`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, id: `${v}.id`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SALESFORCE_IMPORT],
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
    execOutPin(),
    successPin(),
    { id: "fields", label: i18n.nodes.salesforce.describeSobject.pin_fields, type: "struct", subType: SALESFORCE_DESCRIBE_FIELD_STRUCT_TYPE, container: "array", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = resolveSalesforceCredential(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, fields: [], error: resolved.error } };
    const auth = await SalesforceManager.forCredential(resolved.data);
    if (!auth.ok) return { nextExec: "exec-out", outputs: { success: false, fields: [], error: auth.error } };
    const result = await auth.manager.describeSobject(String(inputs.sobjectType ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibrarySalesforce.salesforceDescribeSobject(${inputs.credentialName}, ${inputs.sobjectType});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, fields: `${v}.fields`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_SALESFORCE_IMPORT],
});
