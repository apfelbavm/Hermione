import { NodeColorCategory } from "@hermione/graph/engine/types";
import { registerNode } from "@hermione/graph/engine/registry";
import { compileResultVar, DYNAMODB_MANAGER_IMPORT, RETRY_HELPER_IMPORT } from "@hermione/graph/engine/compileUtils";
import { DYNAMODB_TABLE_DESCRIPTION_STRUCT_TYPE } from "@hermione/graph/structs/dynamoDb";
import { DYNAMODB_ATTRIBUTE_TYPE_ENUM_TYPE, DYNAMODB_BILLING_MODE_ENUM_TYPE, DYNAMODB_RETURN_VALUES_PUT_ENUM_TYPE, DYNAMODB_RETURN_VALUES_UPDATE_ENUM_TYPE } from "@hermione/graph/enum/dynamoDb";
import { enumOptionIds } from "@hermione/graph/engine/enumRegistry";
import { withRetry } from "@hermione/core/lib/retry";
import { retryCountPin, retryDelayMsPin, attemptsPin } from "@hermione/graph/nodes/shared/retryPins";
import { i18n } from "@i18n";

// Every operation below is a thin pin-wiring shim over DynamoDbManager (src/lib/dynamoDbManager.ts),
// which owns the actual SDK calls and error normalization — this file only ever translates pins to
// method arguments and method results back to pins. DynamoDbManager resolves its own named
// credential straight from the database (mirrors twilioManager.ts), so there is no separate
// functionLibraryAwsDynamoDb.ts env-var-reading layer — both execute() and compileExecute() call the
// exact same static manager methods.
//
// Items/keys/expressions with dynamic shapes (items, keys, expression attribute names/values,
// batch/transact specs) are carried as JSON string pins rather than "map"/"struct" pins, since
// DynamoDB attribute values can be arbitrarily nested (lists, maps, numbers, sets) unlike e.g. Azure
// Storage's flat string/string metadata maps — same convention as soap.ts's Args/Headers pins.
// DynamoDbManager's public static methods take/return those same JSON strings directly.
//
// DynamoDbManager now reaches the database directly, which pulls in better-sqlite3 and Node
// builtins — fine for execute(), which only ever runs server-side, but this file is still
// statically imported client-side too (for the node-creation menu), so it's loaded with a runtime
// `import()` instead of a top-level import (ignored by both bundlers) — see nodes/twilio.ts's
// loadTwilioManager for the same pattern.
async function loadDynamoDbManager(): Promise<typeof import("@hermione/core/lib/dynamoDbManager").DynamoDbManager> {
  const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "@hermione/core/lib/dynamoDbManager");
  return mod.DynamoDbManager;
}

const GROUP_NAME = "Request.AWS DynamoDB";

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
    retryCountPin(),
    retryDelayMsPin(),
    execOutPin(),
    successPin(),
    { id: "tableNames", label: i18n.nodes.dynamoDb.listTables.pin_table_names, type: "string", container: "array", direction: "output" },
    { id: "lastEvaluatedTableName", label: i18n.nodes.dynamoDb.listTables.pin_last_evaluated_table_name, type: "string", direction: "output" },
    attemptsPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const manager = await loadDynamoDbManager();
    const result = await withRetry(() => manager.listTables(String(inputs.credentialName ?? ""), String(inputs.exclusiveStartTableName ?? ""), Number(inputs.limit) || 0), Number(inputs.retryCount ?? 0), Number(inputs.retryDelayMs ?? 0));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await withRetry(() => DynamoDbManager.listTables(${inputs.credentialName}, ${inputs.exclusiveStartTableName}, ${inputs.limit}), ${inputs.retryCount}, ${inputs.retryDelayMs});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, tableNames: `${v}.tableNames`, lastEvaluatedTableName: `${v}.lastEvaluatedTableName`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [DYNAMODB_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
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
    retryCountPin(),
    retryDelayMsPin(),
    execOutPin(),
    successPin(),
    attemptsPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const partitionKeyType = inputs.partitionKeyType === "N" || inputs.partitionKeyType === "B" ? inputs.partitionKeyType : "S";
    const sortKeyType = inputs.sortKeyType === "N" || inputs.sortKeyType === "B" ? inputs.sortKeyType : "S";
    const billingMode = inputs.billingMode === "PROVISIONED" ? "PROVISIONED" : "PAY_PER_REQUEST";
    const manager = await loadDynamoDbManager();
    const result = await withRetry(
      () => manager.createTable(String(inputs.credentialName ?? ""), String(inputs.tableName ?? ""), String(inputs.partitionKeyName ?? ""), partitionKeyType, String(inputs.sortKeyName ?? ""), sortKeyType, billingMode, Number(inputs.readCapacityUnits) || 0, Number(inputs.writeCapacityUnits) || 0),
      Number(inputs.retryCount ?? 0),
      Number(inputs.retryDelayMs ?? 0),
    );
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await withRetry(() => DynamoDbManager.createTable(${inputs.credentialName}, ${inputs.tableName}, ${inputs.partitionKeyName}, ${inputs.partitionKeyType}, ${inputs.sortKeyName}, ${inputs.sortKeyType}, ${inputs.billingMode}, ${inputs.readCapacityUnits}, ${inputs.writeCapacityUnits}), ${inputs.retryCount}, ${inputs.retryDelayMs});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [DYNAMODB_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
});

registerNode({
  type: "dynamoDb.deleteTable",
  label: i18n.nodes.dynamoDb.deleteTable.label,
  description: i18n.nodes.dynamoDb.deleteTable.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), tableNamePin(), retryCountPin(), retryDelayMsPin(), execOutPin(), successPin(), attemptsPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const manager = await loadDynamoDbManager();
    const result = await withRetry(() => manager.deleteTable(String(inputs.credentialName ?? ""), String(inputs.tableName ?? "")), Number(inputs.retryCount ?? 0), Number(inputs.retryDelayMs ?? 0));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await withRetry(() => DynamoDbManager.deleteTable(${inputs.credentialName}, ${inputs.tableName}), ${inputs.retryCount}, ${inputs.retryDelayMs});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [DYNAMODB_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
});

registerNode({
  type: "dynamoDb.describeTable",
  label: i18n.nodes.dynamoDb.describeTable.label,
  description: i18n.nodes.dynamoDb.describeTable.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    tableNamePin(),
    retryCountPin(),
    retryDelayMsPin(),
    execOutPin(),
    successPin(),
    { id: "table", label: i18n.nodes.dynamoDb.tableDescription.label, type: "struct", subType: DYNAMODB_TABLE_DESCRIPTION_STRUCT_TYPE, direction: "output" },
    attemptsPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const manager = await loadDynamoDbManager();
    const result = await withRetry(() => manager.describeTable(String(inputs.credentialName ?? ""), String(inputs.tableName ?? "")), Number(inputs.retryCount ?? 0), Number(inputs.retryDelayMs ?? 0));
    const { success, error, attempts, ...table } = result;
    return { nextExec: "exec-out", outputs: { success, table, attempts, error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await withRetry(() => DynamoDbManager.describeTable(${inputs.credentialName}, ${inputs.tableName}), ${inputs.retryCount}, ${inputs.retryDelayMs});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return {
      success: `${v}.success`,
      table: `{ status: ${v}.status, itemCount: ${v}.itemCount, sizeBytes: ${v}.sizeBytes, partitionKeyName: ${v}.partitionKeyName, partitionKeyType: ${v}.partitionKeyType, sortKeyName: ${v}.sortKeyName, sortKeyType: ${v}.sortKeyType, billingMode: ${v}.billingMode, readCapacityUnits: ${v}.readCapacityUnits, writeCapacityUnits: ${v}.writeCapacityUnits }`,
      attempts: `${v}.attempts`,
      error: `${v}.error`,
    };
  },
  compileImports: [DYNAMODB_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
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
    retryCountPin(),
    retryDelayMsPin(),
    execOutPin(),
    successPin(),
    attemptsPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const billingMode = inputs.billingMode === "PROVISIONED" ? "PROVISIONED" : "PAY_PER_REQUEST";
    const manager = await loadDynamoDbManager();
    const result = await withRetry(() => manager.updateTableCapacity(String(inputs.credentialName ?? ""), String(inputs.tableName ?? ""), billingMode, Number(inputs.readCapacityUnits) || 0, Number(inputs.writeCapacityUnits) || 0), Number(inputs.retryCount ?? 0), Number(inputs.retryDelayMs ?? 0));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await withRetry(() => DynamoDbManager.updateTableCapacity(${inputs.credentialName}, ${inputs.tableName}, ${inputs.billingMode}, ${inputs.readCapacityUnits}, ${inputs.writeCapacityUnits}), ${inputs.retryCount}, ${inputs.retryDelayMs});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [DYNAMODB_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
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
    retryCountPin(),
    retryDelayMsPin(),
    execOutPin(),
    successPin(),
    attributesOutPin(),
    attemptsPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const returnValues = inputs.returnValues === "ALL_OLD" ? "ALL_OLD" : "NONE";
    const manager = await loadDynamoDbManager();
    const result = await withRetry(
      () => manager.putItem(String(inputs.credentialName ?? ""), String(inputs.tableName ?? ""), String(inputs.item ?? ""), String(inputs.conditionExpression ?? ""), String(inputs.expressionAttributeNames ?? ""), String(inputs.expressionAttributeValues ?? ""), returnValues),
      Number(inputs.retryCount ?? 0),
      Number(inputs.retryDelayMs ?? 0),
    );
    return { nextExec: "exec-out", outputs: { success: result.success, attributes: result.attributesJson, attempts: result.attempts, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await withRetry(() => DynamoDbManager.putItem(${inputs.credentialName}, ${inputs.tableName}, ${inputs.item}, ${inputs.conditionExpression}, ${inputs.expressionAttributeNames}, ${inputs.expressionAttributeValues}, ${inputs.returnValues}), ${inputs.retryCount}, ${inputs.retryDelayMs});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, attributes: `${v}.attributesJson`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [DYNAMODB_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
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
    retryCountPin(),
    retryDelayMsPin(),
    execOutPin(),
    successPin(),
    { id: "item", label: i18n.nodes.dynamoDb.__shared.pin_item, type: "string", direction: "output" },
    attemptsPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const manager = await loadDynamoDbManager();
    const result = await withRetry(() => manager.getItem(String(inputs.credentialName ?? ""), String(inputs.tableName ?? ""), String(inputs.key ?? ""), Boolean(inputs.consistentRead), String(inputs.projectionExpression ?? "")), Number(inputs.retryCount ?? 0), Number(inputs.retryDelayMs ?? 0));
    return { nextExec: "exec-out", outputs: { success: result.success, item: result.itemJson, attempts: result.attempts, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await withRetry(() => DynamoDbManager.getItem(${inputs.credentialName}, ${inputs.tableName}, ${inputs.key}, ${inputs.consistentRead}, ${inputs.projectionExpression}), ${inputs.retryCount}, ${inputs.retryDelayMs});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, item: `${v}.itemJson`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [DYNAMODB_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
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
    retryCountPin(),
    retryDelayMsPin(),
    execOutPin(),
    successPin(),
    attributesOutPin(),
    attemptsPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const returnValues = ["ALL_OLD", "UPDATED_OLD", "ALL_NEW", "UPDATED_NEW"].includes(String(inputs.returnValues)) ? (inputs.returnValues as "ALL_OLD" | "UPDATED_OLD" | "ALL_NEW" | "UPDATED_NEW") : "NONE";
    const manager = await loadDynamoDbManager();
    const result = await withRetry(
      () =>
        manager.updateItem(
          String(inputs.credentialName ?? ""),
          String(inputs.tableName ?? ""),
          String(inputs.key ?? ""),
          String(inputs.updateExpression ?? ""),
          String(inputs.conditionExpression ?? ""),
          String(inputs.expressionAttributeNames ?? ""),
          String(inputs.expressionAttributeValues ?? ""),
          returnValues,
        ),
      Number(inputs.retryCount ?? 0),
      Number(inputs.retryDelayMs ?? 0),
    );
    return { nextExec: "exec-out", outputs: { success: result.success, attributes: result.attributesJson, attempts: result.attempts, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await withRetry(() => DynamoDbManager.updateItem(${inputs.credentialName}, ${inputs.tableName}, ${inputs.key}, ${inputs.updateExpression}, ${inputs.conditionExpression}, ${inputs.expressionAttributeNames}, ${inputs.expressionAttributeValues}, ${inputs.returnValues}), ${inputs.retryCount}, ${inputs.retryDelayMs});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, attributes: `${v}.attributesJson`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [DYNAMODB_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
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
    retryCountPin(),
    retryDelayMsPin(),
    execOutPin(),
    successPin(),
    attributesOutPin(),
    attemptsPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const returnValues = inputs.returnValues === "ALL_OLD" ? "ALL_OLD" : "NONE";
    const manager = await loadDynamoDbManager();
    const result = await withRetry(
      () => manager.deleteItem(String(inputs.credentialName ?? ""), String(inputs.tableName ?? ""), String(inputs.key ?? ""), String(inputs.conditionExpression ?? ""), String(inputs.expressionAttributeNames ?? ""), String(inputs.expressionAttributeValues ?? ""), returnValues),
      Number(inputs.retryCount ?? 0),
      Number(inputs.retryDelayMs ?? 0),
    );
    return { nextExec: "exec-out", outputs: { success: result.success, attributes: result.attributesJson, attempts: result.attempts, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await withRetry(() => DynamoDbManager.deleteItem(${inputs.credentialName}, ${inputs.tableName}, ${inputs.key}, ${inputs.conditionExpression}, ${inputs.expressionAttributeNames}, ${inputs.expressionAttributeValues}, ${inputs.returnValues}), ${inputs.retryCount}, ${inputs.retryDelayMs});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, attributes: `${v}.attributesJson`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [DYNAMODB_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
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
    retryCountPin(),
    retryDelayMsPin(),
    execOutPin(),
    successPin(),
    { id: "items", label: i18n.nodes.dynamoDb.__shared.pin_items, type: "string", direction: "output" },
    { id: "lastEvaluatedKey", label: i18n.nodes.dynamoDb.__shared.pin_last_evaluated_key, type: "string", direction: "output" },
    { id: "count", label: i18n.nodes.dynamoDb.__shared.pin_count, type: "number", direction: "output" },
    { id: "scannedCount", label: i18n.nodes.dynamoDb.__shared.pin_scanned_count, type: "number", direction: "output" },
    attemptsPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const manager = await loadDynamoDbManager();
    const result = await withRetry(
      () =>
        manager.query(
          String(inputs.credentialName ?? ""),
          String(inputs.tableName ?? ""),
          String(inputs.keyConditionExpression ?? ""),
          String(inputs.filterExpression ?? ""),
          String(inputs.expressionAttributeNames ?? ""),
          String(inputs.expressionAttributeValues ?? ""),
          String(inputs.indexName ?? ""),
          Boolean(inputs.scanIndexForward),
          Number(inputs.limit) || 0,
          String(inputs.exclusiveStartKey ?? ""),
          Boolean(inputs.consistentRead),
        ),
      Number(inputs.retryCount ?? 0),
      Number(inputs.retryDelayMs ?? 0),
    );
    return { nextExec: "exec-out", outputs: { success: result.success, items: result.itemsJson, lastEvaluatedKey: result.lastEvaluatedKeyJson, count: result.count, scannedCount: result.scannedCount, attempts: result.attempts, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await withRetry(() => DynamoDbManager.query(${inputs.credentialName}, ${inputs.tableName}, ${inputs.keyConditionExpression}, ${inputs.filterExpression}, ${inputs.expressionAttributeNames}, ${inputs.expressionAttributeValues}, ${inputs.indexName}, ${inputs.scanIndexForward}, ${inputs.limit}, ${inputs.exclusiveStartKey}, ${inputs.consistentRead}), ${inputs.retryCount}, ${inputs.retryDelayMs});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, items: `${v}.itemsJson`, lastEvaluatedKey: `${v}.lastEvaluatedKeyJson`, count: `${v}.count`, scannedCount: `${v}.scannedCount`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [DYNAMODB_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
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
    retryCountPin(),
    retryDelayMsPin(),
    execOutPin(),
    successPin(),
    { id: "items", label: i18n.nodes.dynamoDb.__shared.pin_items, type: "string", direction: "output" },
    { id: "lastEvaluatedKey", label: i18n.nodes.dynamoDb.__shared.pin_last_evaluated_key, type: "string", direction: "output" },
    { id: "count", label: i18n.nodes.dynamoDb.__shared.pin_count, type: "number", direction: "output" },
    { id: "scannedCount", label: i18n.nodes.dynamoDb.__shared.pin_scanned_count, type: "number", direction: "output" },
    attemptsPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const manager = await loadDynamoDbManager();
    const result = await withRetry(
      () =>
        manager.scan(
          String(inputs.credentialName ?? ""),
          String(inputs.tableName ?? ""),
          String(inputs.filterExpression ?? ""),
          String(inputs.expressionAttributeNames ?? ""),
          String(inputs.expressionAttributeValues ?? ""),
          String(inputs.indexName ?? ""),
          Number(inputs.limit) || 0,
          String(inputs.exclusiveStartKey ?? ""),
          Boolean(inputs.consistentRead),
        ),
      Number(inputs.retryCount ?? 0),
      Number(inputs.retryDelayMs ?? 0),
    );
    return { nextExec: "exec-out", outputs: { success: result.success, items: result.itemsJson, lastEvaluatedKey: result.lastEvaluatedKeyJson, count: result.count, scannedCount: result.scannedCount, attempts: result.attempts, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await withRetry(() => DynamoDbManager.scan(${inputs.credentialName}, ${inputs.tableName}, ${inputs.filterExpression}, ${inputs.expressionAttributeNames}, ${inputs.expressionAttributeValues}, ${inputs.indexName}, ${inputs.limit}, ${inputs.exclusiveStartKey}, ${inputs.consistentRead}), ${inputs.retryCount}, ${inputs.retryDelayMs});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, items: `${v}.itemsJson`, lastEvaluatedKey: `${v}.lastEvaluatedKeyJson`, count: `${v}.count`, scannedCount: `${v}.scannedCount`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [DYNAMODB_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
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
    retryCountPin(),
    retryDelayMsPin(),
    execOutPin(),
    successPin(),
    { id: "items", label: i18n.nodes.dynamoDb.__shared.pin_items, type: "string", direction: "output" },
    { id: "unprocessedKeys", label: i18n.nodes.dynamoDb.batchGetItem.pin_unprocessed_keys, type: "string", direction: "output" },
    attemptsPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const manager = await loadDynamoDbManager();
    const result = await withRetry(() => manager.batchGetItem(String(inputs.credentialName ?? ""), String(inputs.tableName ?? ""), String(inputs.keys ?? ""), Boolean(inputs.consistentRead)), Number(inputs.retryCount ?? 0), Number(inputs.retryDelayMs ?? 0));
    return { nextExec: "exec-out", outputs: { success: result.success, items: result.itemsJson, unprocessedKeys: result.unprocessedKeysJson, attempts: result.attempts, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await withRetry(() => DynamoDbManager.batchGetItem(${inputs.credentialName}, ${inputs.tableName}, ${inputs.keys}, ${inputs.consistentRead}), ${inputs.retryCount}, ${inputs.retryDelayMs});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, items: `${v}.itemsJson`, unprocessedKeys: `${v}.unprocessedKeysJson`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [DYNAMODB_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
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
    retryCountPin(),
    retryDelayMsPin(),
    execOutPin(),
    successPin(),
    { id: "unprocessedCount", label: i18n.nodes.dynamoDb.batchWriteItem.pin_unprocessed_count, type: "number", direction: "output" },
    attemptsPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const manager = await loadDynamoDbManager();
    const result = await withRetry(() => manager.batchWriteItem(String(inputs.credentialName ?? ""), String(inputs.tableName ?? ""), String(inputs.putItems ?? ""), String(inputs.deleteKeys ?? "")), Number(inputs.retryCount ?? 0), Number(inputs.retryDelayMs ?? 0));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await withRetry(() => DynamoDbManager.batchWriteItem(${inputs.credentialName}, ${inputs.tableName}, ${inputs.putItems}, ${inputs.deleteKeys}), ${inputs.retryCount}, ${inputs.retryDelayMs});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, unprocessedCount: `${v}.unprocessedCount`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [DYNAMODB_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
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
    retryCountPin(),
    retryDelayMsPin(),
    execOutPin(),
    successPin(),
    { id: "items-out", label: i18n.nodes.dynamoDb.__shared.pin_items, type: "string", direction: "output" },
    attemptsPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const manager = await loadDynamoDbManager();
    const result = await withRetry(() => manager.transactGetItems(String(inputs.credentialName ?? ""), String(inputs.items ?? "")), Number(inputs.retryCount ?? 0), Number(inputs.retryDelayMs ?? 0));
    return { nextExec: "exec-out", outputs: { success: result.success, "items-out": result.itemsJson, attempts: result.attempts, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await withRetry(() => DynamoDbManager.transactGetItems(${inputs.credentialName}, ${inputs.items}), ${inputs.retryCount}, ${inputs.retryDelayMs});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, "items-out": `${v}.itemsJson`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [DYNAMODB_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
});

registerNode({
  type: "dynamoDb.transactWriteItems",
  label: i18n.nodes.dynamoDb.transactWriteItems.label,
  description: i18n.nodes.dynamoDb.transactWriteItems.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), { id: "operations", label: i18n.nodes.dynamoDb.transactWriteItems.pin_operations, type: "string", direction: "input", defaultValue: "[]" }, retryCountPin(), retryDelayMsPin(), execOutPin(), successPin(), attemptsPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const manager = await loadDynamoDbManager();
    const result = await withRetry(() => manager.transactWriteItems(String(inputs.credentialName ?? ""), String(inputs.operations ?? "")), Number(inputs.retryCount ?? 0), Number(inputs.retryDelayMs ?? 0));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await withRetry(() => DynamoDbManager.transactWriteItems(${inputs.credentialName}, ${inputs.operations}), ${inputs.retryCount}, ${inputs.retryDelayMs});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, attempts: `${v}.attempts`, error: `${v}.error` };
  },
  compileImports: [DYNAMODB_MANAGER_IMPORT, RETRY_HELPER_IMPORT],
});
