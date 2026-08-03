import { NodeColorCategory, type ExecutionContext } from "../engine/types";
import { registerNode } from "../engine/registry";
import { compileResultVar, FUNCTION_LIBRARY_DYNAMODB_IMPORT } from "../engine/compileUtils";
import { DynamoDbManager } from "../../lib/dynamoDbManager";
import type { AwsAccessKeyCredentialData } from "../../credentials/types";
import { DYNAMODB_TABLE_DESCRIPTION_STRUCT_TYPE } from "../structs/dynamoDb";
import { DYNAMODB_ATTRIBUTE_TYPE_ENUM_TYPE, DYNAMODB_BILLING_MODE_ENUM_TYPE, DYNAMODB_RETURN_VALUES_PUT_ENUM_TYPE, DYNAMODB_RETURN_VALUES_UPDATE_ENUM_TYPE } from "../enum/dynamoDb";
import { enumOptionIds } from "../engine/enumRegistry";
import { i18n } from "@i18n";

// Every operation below is a thin pin-wiring shim over DynamoDbManager (src/lib/dynamoDbManager.ts),
// which owns the actual SDK calls and error normalization — this file only ever translates pins to
// method arguments and method results back to pins.
//
// Every operation node takes a Credential Name directly (no separate auth/refresh node): each
// resolves the named vault entry and hands its access key pair to DynamoDbManager.forCredential,
// which caches the underlying DynamoDBClient/DynamoDBDocumentClient — see dynamoDbManager.ts.
//
// Items/keys/expressions with dynamic shapes (items, keys, expression attribute names/values,
// batch/transact specs) are carried as JSON string pins rather than "map"/"struct" pins, since
// DynamoDB attribute values can be arbitrarily nested (lists, maps, numbers, sets) unlike e.g. Azure
// Storage's flat string/string metadata maps — same convention as soap.ts's Args/Headers pins.
//
// Every node here also has a compileExecute: the compiled path calls a same-named
// `functionLibraryDynamoDb.dynamoDb*` wrapper (see server/functionLibraryDynamoDb.ts), which reads
// the credential's access key back from environment variables instead of the vault — same split as
// azureStorage.ts's execute()/compileExecute().

const GROUP_NAME = "Request.AWS DynamoDB";

function parseJsonObject(json: unknown): Record<string, unknown> {
  const str = String(json ?? "");
  if (!str) return {};
  try {
    const parsed: unknown = JSON.parse(str);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function parseJsonArray(json: unknown): unknown[] {
  const str = String(json ?? "");
  if (!str) return [];
  try {
    const parsed: unknown = JSON.parse(str);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function credentialNamePin() {
  return { id: "credentialName", label: i18n.nodes.dynamoDb.__shared.pin_credential_name, type: "string" as const, direction: "input" as const, defaultValue: "" };
}

function tableNamePin() {
  return { id: "tableName", label: i18n.nodes.dynamoDb.__shared.pin_table_name, type: "string" as const, direction: "input" as const, defaultValue: "" };
}

function keyPin() {
  return { id: "key", label: i18n.nodes.dynamoDb.__shared.pin_key, type: "string" as const, direction: "input" as const, defaultValue: "{}" };
}

function conditionExpressionPin() {
  return { id: "conditionExpression", label: i18n.nodes.dynamoDb.__shared.pin_condition_expression, type: "string" as const, direction: "input" as const, defaultValue: "" };
}

function expressionAttributeNamesPin() {
  return { id: "expressionAttributeNames", label: i18n.nodes.dynamoDb.__shared.pin_expression_attribute_names, type: "string" as const, direction: "input" as const, defaultValue: "{}" };
}

function expressionAttributeValuesPin() {
  return { id: "expressionAttributeValues", label: i18n.nodes.dynamoDb.__shared.pin_expression_attribute_values, type: "string" as const, direction: "input" as const, defaultValue: "{}" };
}

function attributesOutPin() {
  return { id: "attributes", label: i18n.nodes.dynamoDb.__shared.pin_attributes, type: "string" as const, direction: "output" as const };
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

/** Shared by every DynamoDB node — looks up a named Credential Vault entry and returns its access
 * key data, or a clear error if the name is wrong/missing. */
function resolveDynamoDbCredential(ctx: ExecutionContext, credentialName: string): { ok: true; data: AwsAccessKeyCredentialData } | { ok: false; error: string } {
  const credential = ctx.getCredential?.(credentialName);
  if (!credential) return { ok: false, error: `Credential "${credentialName}" not found in the vault` };
  if (credential.type !== "awsAccessKey") return { ok: false, error: `Credential "${credentialName}" is not an AWS Access Key credential` };
  return { ok: true, data: credential.data as AwsAccessKeyCredentialData };
}

function managerFor(ctx: ExecutionContext, credentialName: string): { ok: true; manager: DynamoDbManager } | { ok: false; error: string } {
  const resolved = resolveDynamoDbCredential(ctx, credentialName);
  if (!resolved.ok) return resolved;
  const data = resolved.data;
  return { ok: true, manager: DynamoDbManager.forCredential(data.accessKeyId, data.secretAccessKey, data.region, data.sessionToken, data.endpoint) };
}

registerNode({
  type: "dynamoDb.listTables",
  label: i18n.nodes.dynamoDb.listTables.label,
  description: i18n.nodes.dynamoDb.listTables.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "exclusiveStartTableName", label: i18n.nodes.dynamoDb.listTables.pin_exclusive_start_table_name, type: "string", direction: "input", defaultValue: "" },
    { id: "limit", label: i18n.nodes.dynamoDb.__shared.pin_limit, type: "number", direction: "input", defaultValue: 0, integer: true },
    execOutPin(),
    successPin(),
    { id: "tableNames", label: i18n.nodes.dynamoDb.listTables.pin_table_names, type: "string", container: "array", direction: "output" },
    { id: "lastEvaluatedTableName", label: i18n.nodes.dynamoDb.listTables.pin_last_evaluated_table_name, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, tableNames: [], lastEvaluatedTableName: "", error: resolved.error } };
    const result = await resolved.manager.listTables(String(inputs.exclusiveStartTableName ?? ""), Number(inputs.limit) || 0);
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryDynamoDb.dynamoDbListTables(${inputs.credentialName}, ${inputs.exclusiveStartTableName}, ${inputs.limit});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, tableNames: `${v}.tableNames`, lastEvaluatedTableName: `${v}.lastEvaluatedTableName`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_DYNAMODB_IMPORT],
});

registerNode({
  type: "dynamoDb.createTable",
  label: i18n.nodes.dynamoDb.createTable.label,
  description: i18n.nodes.dynamoDb.createTable.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    tableNamePin(),
    { id: "partitionKeyName", label: i18n.nodes.dynamoDb.__shared.pin_partition_key_name, type: "string", direction: "input", defaultValue: "" },
    { id: "partitionKeyType", label: i18n.nodes.dynamoDb.__shared.pin_partition_key_type, type: "enum", subType: DYNAMODB_ATTRIBUTE_TYPE_ENUM_TYPE, direction: "input", defaultValue: "S", options: enumOptionIds(DYNAMODB_ATTRIBUTE_TYPE_ENUM_TYPE) },
    { id: "sortKeyName", label: i18n.nodes.dynamoDb.__shared.pin_sort_key_name, type: "string", direction: "input", defaultValue: "" },
    { id: "sortKeyType", label: i18n.nodes.dynamoDb.__shared.pin_sort_key_type, type: "enum", subType: DYNAMODB_ATTRIBUTE_TYPE_ENUM_TYPE, direction: "input", defaultValue: "S", options: enumOptionIds(DYNAMODB_ATTRIBUTE_TYPE_ENUM_TYPE) },
    { id: "billingMode", label: i18n.nodes.dynamoDb.__shared.pin_billing_mode, type: "enum", subType: DYNAMODB_BILLING_MODE_ENUM_TYPE, direction: "input", defaultValue: "PAY_PER_REQUEST", options: enumOptionIds(DYNAMODB_BILLING_MODE_ENUM_TYPE) },
    { id: "readCapacityUnits", label: i18n.nodes.dynamoDb.__shared.pin_read_capacity_units, type: "number", direction: "input", defaultValue: 5, integer: true },
    { id: "writeCapacityUnits", label: i18n.nodes.dynamoDb.__shared.pin_write_capacity_units, type: "number", direction: "input", defaultValue: 5, integer: true },
    execOutPin(),
    successPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const partitionKeyType = inputs.partitionKeyType === "N" || inputs.partitionKeyType === "B" ? inputs.partitionKeyType : "S";
    const sortKeyType = inputs.sortKeyType === "N" || inputs.sortKeyType === "B" ? inputs.sortKeyType : "S";
    const billingMode = inputs.billingMode === "PROVISIONED" ? "PROVISIONED" : "PAY_PER_REQUEST";
    const result = await resolved.manager.createTable(String(inputs.tableName ?? ""), String(inputs.partitionKeyName ?? ""), partitionKeyType, String(inputs.sortKeyName ?? ""), sortKeyType, billingMode, Number(inputs.readCapacityUnits) || 0, Number(inputs.writeCapacityUnits) || 0);
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await functionLibraryDynamoDb.dynamoDbCreateTable(${inputs.credentialName}, ${inputs.tableName}, ${inputs.partitionKeyName}, ${inputs.partitionKeyType}, ${inputs.sortKeyName}, ${inputs.sortKeyType}, ${inputs.billingMode}, ${inputs.readCapacityUnits}, ${inputs.writeCapacityUnits});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_DYNAMODB_IMPORT],
});

registerNode({
  type: "dynamoDb.deleteTable",
  label: i18n.nodes.dynamoDb.deleteTable.label,
  description: i18n.nodes.dynamoDb.deleteTable.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), tableNamePin(), execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const result = await resolved.manager.deleteTable(String(inputs.tableName ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryDynamoDb.dynamoDbDeleteTable(${inputs.credentialName}, ${inputs.tableName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_DYNAMODB_IMPORT],
});

registerNode({
  type: "dynamoDb.describeTable",
  label: i18n.nodes.dynamoDb.describeTable.label,
  description: i18n.nodes.dynamoDb.describeTable.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), tableNamePin(), execOutPin(), successPin(), { id: "table", label: i18n.nodes.dynamoDb.tableDescription.label, type: "struct", subType: DYNAMODB_TABLE_DESCRIPTION_STRUCT_TYPE, direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: { success: false, table: { status: "", itemCount: 0, sizeBytes: 0, partitionKeyName: "", partitionKeyType: "", sortKeyName: "", sortKeyType: "", billingMode: "", readCapacityUnits: 0, writeCapacityUnits: 0 }, error: resolved.error },
      };
    const result = await resolved.manager.describeTable(String(inputs.tableName ?? ""));
    const { success, error, ...table } = result;
    return { nextExec: "exec-out", outputs: { success, table, error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryDynamoDb.dynamoDbDescribeTable(${inputs.credentialName}, ${inputs.tableName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return {
      success: `${v}.success`,
      table: `{ status: ${v}.status, itemCount: ${v}.itemCount, sizeBytes: ${v}.sizeBytes, partitionKeyName: ${v}.partitionKeyName, partitionKeyType: ${v}.partitionKeyType, sortKeyName: ${v}.sortKeyName, sortKeyType: ${v}.sortKeyType, billingMode: ${v}.billingMode, readCapacityUnits: ${v}.readCapacityUnits, writeCapacityUnits: ${v}.writeCapacityUnits }`,
      error: `${v}.error`,
    };
  },
  compileImports: [FUNCTION_LIBRARY_DYNAMODB_IMPORT],
});

registerNode({
  type: "dynamoDb.updateTableCapacity",
  label: i18n.nodes.dynamoDb.updateTableCapacity.label,
  description: i18n.nodes.dynamoDb.updateTableCapacity.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    tableNamePin(),
    { id: "billingMode", label: i18n.nodes.dynamoDb.__shared.pin_billing_mode, type: "enum", subType: DYNAMODB_BILLING_MODE_ENUM_TYPE, direction: "input", defaultValue: "PAY_PER_REQUEST", options: enumOptionIds(DYNAMODB_BILLING_MODE_ENUM_TYPE) },
    { id: "readCapacityUnits", label: i18n.nodes.dynamoDb.__shared.pin_read_capacity_units, type: "number", direction: "input", defaultValue: 5, integer: true },
    { id: "writeCapacityUnits", label: i18n.nodes.dynamoDb.__shared.pin_write_capacity_units, type: "number", direction: "input", defaultValue: 5, integer: true },
    execOutPin(),
    successPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const billingMode = inputs.billingMode === "PROVISIONED" ? "PROVISIONED" : "PAY_PER_REQUEST";
    const result = await resolved.manager.updateTableCapacity(String(inputs.tableName ?? ""), billingMode, Number(inputs.readCapacityUnits) || 0, Number(inputs.writeCapacityUnits) || 0);
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await functionLibraryDynamoDb.dynamoDbUpdateTableCapacity(${inputs.credentialName}, ${inputs.tableName}, ${inputs.billingMode}, ${inputs.readCapacityUnits}, ${inputs.writeCapacityUnits});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_DYNAMODB_IMPORT],
});

registerNode({
  type: "dynamoDb.putItem",
  label: i18n.nodes.dynamoDb.putItem.label,
  description: i18n.nodes.dynamoDb.putItem.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    tableNamePin(),
    { id: "item", label: i18n.nodes.dynamoDb.__shared.pin_item, type: "string", direction: "input", defaultValue: "{}" },
    conditionExpressionPin(),
    expressionAttributeNamesPin(),
    expressionAttributeValuesPin(),
    { id: "returnValues", label: i18n.nodes.dynamoDb.__shared.pin_return_values, type: "enum", subType: DYNAMODB_RETURN_VALUES_PUT_ENUM_TYPE, direction: "input", defaultValue: "NONE", options: enumOptionIds(DYNAMODB_RETURN_VALUES_PUT_ENUM_TYPE) },
    execOutPin(),
    successPin(),
    attributesOutPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, attributes: "null", error: resolved.error } };
    const returnValues = inputs.returnValues === "ALL_OLD" ? "ALL_OLD" : "NONE";
    const result = await resolved.manager.putItem(String(inputs.tableName ?? ""), parseJsonObject(inputs.item), String(inputs.conditionExpression ?? ""), parseJsonObject(inputs.expressionAttributeNames) as Record<string, string>, parseJsonObject(inputs.expressionAttributeValues), returnValues);
    return { nextExec: "exec-out", outputs: { success: result.success, attributes: JSON.stringify(result.attributes), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await functionLibraryDynamoDb.dynamoDbPutItem(${inputs.credentialName}, ${inputs.tableName}, ${inputs.item}, ${inputs.conditionExpression}, ${inputs.expressionAttributeNames}, ${inputs.expressionAttributeValues}, ${inputs.returnValues});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, attributes: `${v}.attributesJson`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_DYNAMODB_IMPORT],
});

registerNode({
  type: "dynamoDb.getItem",
  label: i18n.nodes.dynamoDb.getItem.label,
  description: i18n.nodes.dynamoDb.getItem.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    tableNamePin(),
    keyPin(),
    { id: "consistentRead", label: i18n.nodes.dynamoDb.__shared.pin_consistent_read, type: "boolean", direction: "input", defaultValue: false },
    { id: "projectionExpression", label: i18n.nodes.dynamoDb.getItem.pin_projection_expression, type: "string", direction: "input", defaultValue: "" },
    execOutPin(),
    successPin(),
    { id: "item", label: i18n.nodes.dynamoDb.__shared.pin_item, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, item: "null", error: resolved.error } };
    const result = await resolved.manager.getItem(String(inputs.tableName ?? ""), parseJsonObject(inputs.key), Boolean(inputs.consistentRead), String(inputs.projectionExpression ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, item: JSON.stringify(result.item), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryDynamoDb.dynamoDbGetItem(${inputs.credentialName}, ${inputs.tableName}, ${inputs.key}, ${inputs.consistentRead}, ${inputs.projectionExpression});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, item: `${v}.itemJson`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_DYNAMODB_IMPORT],
});

registerNode({
  type: "dynamoDb.updateItem",
  label: i18n.nodes.dynamoDb.updateItem.label,
  description: i18n.nodes.dynamoDb.updateItem.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    tableNamePin(),
    keyPin(),
    { id: "updateExpression", label: i18n.nodes.dynamoDb.updateItem.pin_update_expression, type: "string", direction: "input", defaultValue: "" },
    conditionExpressionPin(),
    expressionAttributeNamesPin(),
    expressionAttributeValuesPin(),
    { id: "returnValues", label: i18n.nodes.dynamoDb.__shared.pin_return_values, type: "enum", subType: DYNAMODB_RETURN_VALUES_UPDATE_ENUM_TYPE, direction: "input", defaultValue: "NONE", options: enumOptionIds(DYNAMODB_RETURN_VALUES_UPDATE_ENUM_TYPE) },
    execOutPin(),
    successPin(),
    attributesOutPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, attributes: "null", error: resolved.error } };
    const returnValues = ["ALL_OLD", "UPDATED_OLD", "ALL_NEW", "UPDATED_NEW"].includes(String(inputs.returnValues)) ? (inputs.returnValues as "ALL_OLD" | "UPDATED_OLD" | "ALL_NEW" | "UPDATED_NEW") : "NONE";
    const result = await resolved.manager.updateItem(
      String(inputs.tableName ?? ""),
      parseJsonObject(inputs.key),
      String(inputs.updateExpression ?? ""),
      String(inputs.conditionExpression ?? ""),
      parseJsonObject(inputs.expressionAttributeNames) as Record<string, string>,
      parseJsonObject(inputs.expressionAttributeValues),
      returnValues,
    );
    return { nextExec: "exec-out", outputs: { success: result.success, attributes: JSON.stringify(result.attributes), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await functionLibraryDynamoDb.dynamoDbUpdateItem(${inputs.credentialName}, ${inputs.tableName}, ${inputs.key}, ${inputs.updateExpression}, ${inputs.conditionExpression}, ${inputs.expressionAttributeNames}, ${inputs.expressionAttributeValues}, ${inputs.returnValues});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, attributes: `${v}.attributesJson`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_DYNAMODB_IMPORT],
});

registerNode({
  type: "dynamoDb.deleteItem",
  label: i18n.nodes.dynamoDb.deleteItem.label,
  description: i18n.nodes.dynamoDb.deleteItem.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    tableNamePin(),
    keyPin(),
    conditionExpressionPin(),
    expressionAttributeNamesPin(),
    expressionAttributeValuesPin(),
    { id: "returnValues", label: i18n.nodes.dynamoDb.__shared.pin_return_values, type: "enum", subType: DYNAMODB_RETURN_VALUES_PUT_ENUM_TYPE, direction: "input", defaultValue: "NONE", options: enumOptionIds(DYNAMODB_RETURN_VALUES_PUT_ENUM_TYPE) },
    execOutPin(),
    successPin(),
    attributesOutPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, attributes: "null", error: resolved.error } };
    const returnValues = inputs.returnValues === "ALL_OLD" ? "ALL_OLD" : "NONE";
    const result = await resolved.manager.deleteItem(String(inputs.tableName ?? ""), parseJsonObject(inputs.key), String(inputs.conditionExpression ?? ""), parseJsonObject(inputs.expressionAttributeNames) as Record<string, string>, parseJsonObject(inputs.expressionAttributeValues), returnValues);
    return { nextExec: "exec-out", outputs: { success: result.success, attributes: JSON.stringify(result.attributes), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await functionLibraryDynamoDb.dynamoDbDeleteItem(${inputs.credentialName}, ${inputs.tableName}, ${inputs.key}, ${inputs.conditionExpression}, ${inputs.expressionAttributeNames}, ${inputs.expressionAttributeValues}, ${inputs.returnValues});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, attributes: `${v}.attributesJson`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_DYNAMODB_IMPORT],
});

registerNode({
  type: "dynamoDb.query",
  label: i18n.nodes.dynamoDb.query.label,
  description: i18n.nodes.dynamoDb.query.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    tableNamePin(),
    { id: "keyConditionExpression", label: i18n.nodes.dynamoDb.query.pin_key_condition_expression, type: "string", direction: "input", defaultValue: "" },
    { id: "filterExpression", label: i18n.nodes.dynamoDb.__shared.pin_filter_expression, type: "string", direction: "input", defaultValue: "" },
    expressionAttributeNamesPin(),
    expressionAttributeValuesPin(),
    { id: "indexName", label: i18n.nodes.dynamoDb.__shared.pin_index_name, type: "string", direction: "input", defaultValue: "" },
    { id: "scanIndexForward", label: i18n.nodes.dynamoDb.query.pin_scan_index_forward, type: "boolean", direction: "input", defaultValue: true },
    { id: "limit", label: i18n.nodes.dynamoDb.__shared.pin_limit, type: "number", direction: "input", defaultValue: 0, integer: true },
    { id: "exclusiveStartKey", label: i18n.nodes.dynamoDb.__shared.pin_exclusive_start_key, type: "string", direction: "input", defaultValue: "" },
    { id: "consistentRead", label: i18n.nodes.dynamoDb.__shared.pin_consistent_read, type: "boolean", direction: "input", defaultValue: false },
    execOutPin(),
    successPin(),
    { id: "items", label: i18n.nodes.dynamoDb.__shared.pin_items, type: "string", direction: "output" },
    { id: "lastEvaluatedKey", label: i18n.nodes.dynamoDb.__shared.pin_last_evaluated_key, type: "string", direction: "output" },
    { id: "count", label: i18n.nodes.dynamoDb.__shared.pin_count, type: "number", direction: "output" },
    { id: "scannedCount", label: i18n.nodes.dynamoDb.__shared.pin_scanned_count, type: "number", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, items: "[]", lastEvaluatedKey: "null", count: 0, scannedCount: 0, error: resolved.error } };
    const exclusiveStartKeyStr = String(inputs.exclusiveStartKey ?? "");
    const result = await resolved.manager.query(
      String(inputs.tableName ?? ""),
      String(inputs.keyConditionExpression ?? ""),
      String(inputs.filterExpression ?? ""),
      parseJsonObject(inputs.expressionAttributeNames) as Record<string, string>,
      parseJsonObject(inputs.expressionAttributeValues),
      String(inputs.indexName ?? ""),
      Boolean(inputs.scanIndexForward),
      Number(inputs.limit) || 0,
      exclusiveStartKeyStr ? parseJsonObject(exclusiveStartKeyStr) : null,
      Boolean(inputs.consistentRead),
    );
    return { nextExec: "exec-out", outputs: { success: result.success, items: JSON.stringify(result.items), lastEvaluatedKey: JSON.stringify(result.lastEvaluatedKey), count: result.count, scannedCount: result.scannedCount, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await functionLibraryDynamoDb.dynamoDbQuery(${inputs.credentialName}, ${inputs.tableName}, ${inputs.keyConditionExpression}, ${inputs.filterExpression}, ${inputs.expressionAttributeNames}, ${inputs.expressionAttributeValues}, ${inputs.indexName}, ${inputs.scanIndexForward}, ${inputs.limit}, ${inputs.exclusiveStartKey}, ${inputs.consistentRead});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, items: `${v}.itemsJson`, lastEvaluatedKey: `${v}.lastEvaluatedKeyJson`, count: `${v}.count`, scannedCount: `${v}.scannedCount`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_DYNAMODB_IMPORT],
});

registerNode({
  type: "dynamoDb.scan",
  label: i18n.nodes.dynamoDb.scan.label,
  description: i18n.nodes.dynamoDb.scan.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    tableNamePin(),
    { id: "filterExpression", label: i18n.nodes.dynamoDb.__shared.pin_filter_expression, type: "string", direction: "input", defaultValue: "" },
    expressionAttributeNamesPin(),
    expressionAttributeValuesPin(),
    { id: "indexName", label: i18n.nodes.dynamoDb.__shared.pin_index_name, type: "string", direction: "input", defaultValue: "" },
    { id: "limit", label: i18n.nodes.dynamoDb.__shared.pin_limit, type: "number", direction: "input", defaultValue: 0, integer: true },
    { id: "exclusiveStartKey", label: i18n.nodes.dynamoDb.__shared.pin_exclusive_start_key, type: "string", direction: "input", defaultValue: "" },
    { id: "consistentRead", label: i18n.nodes.dynamoDb.__shared.pin_consistent_read, type: "boolean", direction: "input", defaultValue: false },
    execOutPin(),
    successPin(),
    { id: "items", label: i18n.nodes.dynamoDb.__shared.pin_items, type: "string", direction: "output" },
    { id: "lastEvaluatedKey", label: i18n.nodes.dynamoDb.__shared.pin_last_evaluated_key, type: "string", direction: "output" },
    { id: "count", label: i18n.nodes.dynamoDb.__shared.pin_count, type: "number", direction: "output" },
    { id: "scannedCount", label: i18n.nodes.dynamoDb.__shared.pin_scanned_count, type: "number", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, items: "[]", lastEvaluatedKey: "null", count: 0, scannedCount: 0, error: resolved.error } };
    const exclusiveStartKeyStr = String(inputs.exclusiveStartKey ?? "");
    const result = await resolved.manager.scan(
      String(inputs.tableName ?? ""),
      String(inputs.filterExpression ?? ""),
      parseJsonObject(inputs.expressionAttributeNames) as Record<string, string>,
      parseJsonObject(inputs.expressionAttributeValues),
      String(inputs.indexName ?? ""),
      Number(inputs.limit) || 0,
      exclusiveStartKeyStr ? parseJsonObject(exclusiveStartKeyStr) : null,
      Boolean(inputs.consistentRead),
    );
    return { nextExec: "exec-out", outputs: { success: result.success, items: JSON.stringify(result.items), lastEvaluatedKey: JSON.stringify(result.lastEvaluatedKey), count: result.count, scannedCount: result.scannedCount, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await functionLibraryDynamoDb.dynamoDbScan(${inputs.credentialName}, ${inputs.tableName}, ${inputs.filterExpression}, ${inputs.expressionAttributeNames}, ${inputs.expressionAttributeValues}, ${inputs.indexName}, ${inputs.limit}, ${inputs.exclusiveStartKey}, ${inputs.consistentRead});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, items: `${v}.itemsJson`, lastEvaluatedKey: `${v}.lastEvaluatedKeyJson`, count: `${v}.count`, scannedCount: `${v}.scannedCount`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_DYNAMODB_IMPORT],
});

registerNode({
  type: "dynamoDb.batchGetItem",
  label: i18n.nodes.dynamoDb.batchGetItem.label,
  description: i18n.nodes.dynamoDb.batchGetItem.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    tableNamePin(),
    { id: "keys", label: i18n.nodes.dynamoDb.batchGetItem.pin_keys, type: "string", direction: "input", defaultValue: "[]" },
    { id: "consistentRead", label: i18n.nodes.dynamoDb.__shared.pin_consistent_read, type: "boolean", direction: "input", defaultValue: false },
    execOutPin(),
    successPin(),
    { id: "items", label: i18n.nodes.dynamoDb.__shared.pin_items, type: "string", direction: "output" },
    { id: "unprocessedKeys", label: i18n.nodes.dynamoDb.batchGetItem.pin_unprocessed_keys, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, items: "[]", unprocessedKeys: "[]", error: resolved.error } };
    const result = await resolved.manager.batchGetItem(String(inputs.tableName ?? ""), parseJsonArray(inputs.keys) as Record<string, unknown>[], Boolean(inputs.consistentRead));
    return { nextExec: "exec-out", outputs: { success: result.success, items: JSON.stringify(result.items), unprocessedKeys: JSON.stringify(result.unprocessedKeys), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryDynamoDb.dynamoDbBatchGetItem(${inputs.credentialName}, ${inputs.tableName}, ${inputs.keys}, ${inputs.consistentRead});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, items: `${v}.itemsJson`, unprocessedKeys: `${v}.unprocessedKeysJson`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_DYNAMODB_IMPORT],
});

registerNode({
  type: "dynamoDb.batchWriteItem",
  label: i18n.nodes.dynamoDb.batchWriteItem.label,
  description: i18n.nodes.dynamoDb.batchWriteItem.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    tableNamePin(),
    { id: "putItems", label: i18n.nodes.dynamoDb.batchWriteItem.pin_put_items, type: "string", direction: "input", defaultValue: "[]" },
    { id: "deleteKeys", label: i18n.nodes.dynamoDb.batchWriteItem.pin_delete_keys, type: "string", direction: "input", defaultValue: "[]" },
    execOutPin(),
    successPin(),
    { id: "unprocessedCount", label: i18n.nodes.dynamoDb.batchWriteItem.pin_unprocessed_count, type: "number", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, unprocessedCount: 0, error: resolved.error } };
    const result = await resolved.manager.batchWriteItem(String(inputs.tableName ?? ""), parseJsonArray(inputs.putItems) as Record<string, unknown>[], parseJsonArray(inputs.deleteKeys) as Record<string, unknown>[]);
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryDynamoDb.dynamoDbBatchWriteItem(${inputs.credentialName}, ${inputs.tableName}, ${inputs.putItems}, ${inputs.deleteKeys});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, unprocessedCount: `${v}.unprocessedCount`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_DYNAMODB_IMPORT],
});

registerNode({
  type: "dynamoDb.transactGetItems",
  label: i18n.nodes.dynamoDb.transactGetItems.label,
  description: i18n.nodes.dynamoDb.transactGetItems.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "items", label: i18n.nodes.dynamoDb.transactGetItems.pin_items_spec, type: "string", direction: "input", defaultValue: "[]" },
    execOutPin(),
    successPin(),
    { id: "items-out", label: i18n.nodes.dynamoDb.__shared.pin_items, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, "items-out": "[]", error: resolved.error } };
    const items = parseJsonArray(inputs.items) as { tableName: string; key: Record<string, unknown> }[];
    const result = await resolved.manager.transactGetItems(items);
    return { nextExec: "exec-out", outputs: { success: result.success, "items-out": JSON.stringify(result.items), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryDynamoDb.dynamoDbTransactGetItems(${inputs.credentialName}, ${inputs.items});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, "items-out": `${v}.itemsJson`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_DYNAMODB_IMPORT],
});

registerNode({
  type: "dynamoDb.transactWriteItems",
  label: i18n.nodes.dynamoDb.transactWriteItems.label,
  description: i18n.nodes.dynamoDb.transactWriteItems.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), { id: "operations", label: i18n.nodes.dynamoDb.transactWriteItems.pin_operations, type: "string", direction: "input", defaultValue: "[]" }, execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const operations = parseJsonArray(inputs.operations) as Parameters<DynamoDbManager["transactWriteItems"]>[0];
    const result = await resolved.manager.transactWriteItems(operations);
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryDynamoDb.dynamoDbTransactWriteItems(${inputs.credentialName}, ${inputs.operations});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_DYNAMODB_IMPORT],
});
