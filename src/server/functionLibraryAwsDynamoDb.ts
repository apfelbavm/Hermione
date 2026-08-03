import { DynamoDbManager, type DynamoDbWriteTransactItem } from "../lib/dynamoDbManager.ts";
import type { ScalarAttributeType, BillingMode } from "@aws-sdk/client-dynamodb";

/** Mirrors nodes/AwsdynamoDb.ts's own JSON parse/stringify helpers — duplicated rather than shared
 * since this module and the node file are never imported by the same runtime (see
 * dynamoDbManagerFromEnv below, same reasoning as functionLibraryAzureStorage.ts's header comment). */
function parseJsonObject(json: string): Record<string, unknown> {
  if (!json) return {};
  const parsed: unknown = JSON.parse(json);
  return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
}

function parseJsonArray(json: string): unknown[] {
  if (!json) return [];
  const parsed: unknown = JSON.parse(json);
  return Array.isArray(parsed) ? parsed : [];
}

/** Compile-time-only counterpart of nodes/AwsdynamoDb.ts's execute() vault lookup
 * (resolveDynamoDbCredential) — the compiled/deployed script has no access to the Credential Vault
 * database, only the interpreter does, so it reads the same credential's access key back from
 * environment variables instead, the same "HERMIONE_CRED_<NAME>_<FIELD>" naming
 * credentialEnv.ts's applyCredentialEnvVars writes. Never called by the interpreter — genuinely
 * different credential-sourcing behavior, not duplicated logic. */
function dynamoDbManagerFromEnv(credentialName: string): { ok: true; manager: DynamoDbManager } | { ok: false; error: string } {
  const prefix = `HERMIONE_CRED_${String(credentialName)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")}`;
  const type = process.env[`${prefix}_CREDENTIAL_TYPE`];
  if (type !== "awsAccessKey") return { ok: false, error: `Credential "${credentialName}" not found in the vault, or is not an AWS Access Key credential` };
  return {
    ok: true,
    manager: DynamoDbManager.forCredential(process.env[`${prefix}_ACCESS_KEY_ID`] || "", process.env[`${prefix}_SECRET_ACCESS_KEY`] || "", process.env[`${prefix}_REGION`] || "", process.env[`${prefix}_SESSION_TOKEN`] || "", process.env[`${prefix}_ENDPOINT`] || ""),
  };
}

export async function dynamoDbListTables(credentialName: string, exclusiveStartTableName: string, limit: number) {
  const cred = dynamoDbManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, tableNames: [], lastEvaluatedTableName: "", error: cred.error };
  return cred.manager.listTables(exclusiveStartTableName, limit);
}

export async function dynamoDbCreateTable(credentialName: string, tableName: string, partitionKeyName: string, partitionKeyType: ScalarAttributeType, sortKeyName: string, sortKeyType: ScalarAttributeType, billingMode: BillingMode, readCapacityUnits: number, writeCapacityUnits: number) {
  const cred = dynamoDbManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.createTable(tableName, partitionKeyName, partitionKeyType, sortKeyName, sortKeyType, billingMode, readCapacityUnits, writeCapacityUnits);
}

export async function dynamoDbDeleteTable(credentialName: string, tableName: string) {
  const cred = dynamoDbManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.deleteTable(tableName);
}

export async function dynamoDbDescribeTable(credentialName: string, tableName: string) {
  const cred = dynamoDbManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, status: "", itemCount: 0, sizeBytes: 0, partitionKeyName: "", partitionKeyType: "", sortKeyName: "", sortKeyType: "", billingMode: "", readCapacityUnits: 0, writeCapacityUnits: 0, error: cred.error };
  return cred.manager.describeTable(tableName);
}

export async function dynamoDbUpdateTableCapacity(credentialName: string, tableName: string, billingMode: BillingMode, readCapacityUnits: number, writeCapacityUnits: number) {
  const cred = dynamoDbManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.updateTableCapacity(tableName, billingMode, readCapacityUnits, writeCapacityUnits);
}

export async function dynamoDbPutItem(credentialName: string, tableName: string, itemJson: string, conditionExpression: string, expressionAttributeNamesJson: string, expressionAttributeValuesJson: string, returnValues: "NONE" | "ALL_OLD") {
  const cred = dynamoDbManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, attributesJson: "null", error: cred.error };
  const result = await cred.manager.putItem(tableName, parseJsonObject(itemJson), conditionExpression, parseJsonObject(expressionAttributeNamesJson) as Record<string, string>, parseJsonObject(expressionAttributeValuesJson), returnValues);
  return { success: result.success, attributesJson: JSON.stringify(result.attributes), error: result.error };
}

export async function dynamoDbGetItem(credentialName: string, tableName: string, keyJson: string, consistentRead: boolean, projectionExpression: string) {
  const cred = dynamoDbManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, itemJson: "null", error: cred.error };
  const result = await cred.manager.getItem(tableName, parseJsonObject(keyJson), consistentRead, projectionExpression);
  return { success: result.success, itemJson: JSON.stringify(result.item), error: result.error };
}

export async function dynamoDbUpdateItem(
  credentialName: string,
  tableName: string,
  keyJson: string,
  updateExpression: string,
  conditionExpression: string,
  expressionAttributeNamesJson: string,
  expressionAttributeValuesJson: string,
  returnValues: "NONE" | "ALL_OLD" | "UPDATED_OLD" | "ALL_NEW" | "UPDATED_NEW",
) {
  const cred = dynamoDbManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, attributesJson: "null", error: cred.error };
  const result = await cred.manager.updateItem(tableName, parseJsonObject(keyJson), updateExpression, conditionExpression, parseJsonObject(expressionAttributeNamesJson) as Record<string, string>, parseJsonObject(expressionAttributeValuesJson), returnValues);
  return { success: result.success, attributesJson: JSON.stringify(result.attributes), error: result.error };
}

export async function dynamoDbDeleteItem(credentialName: string, tableName: string, keyJson: string, conditionExpression: string, expressionAttributeNamesJson: string, expressionAttributeValuesJson: string, returnValues: "NONE" | "ALL_OLD") {
  const cred = dynamoDbManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, attributesJson: "null", error: cred.error };
  const result = await cred.manager.deleteItem(tableName, parseJsonObject(keyJson), conditionExpression, parseJsonObject(expressionAttributeNamesJson) as Record<string, string>, parseJsonObject(expressionAttributeValuesJson), returnValues);
  return { success: result.success, attributesJson: JSON.stringify(result.attributes), error: result.error };
}

export async function dynamoDbQuery(
  credentialName: string,
  tableName: string,
  keyConditionExpression: string,
  filterExpression: string,
  expressionAttributeNamesJson: string,
  expressionAttributeValuesJson: string,
  indexName: string,
  scanIndexForward: boolean,
  limit: number,
  exclusiveStartKeyJson: string,
  consistentRead: boolean,
) {
  const cred = dynamoDbManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, itemsJson: "[]", lastEvaluatedKeyJson: "null", count: 0, scannedCount: 0, error: cred.error };
  const exclusiveStartKey = exclusiveStartKeyJson ? parseJsonObject(exclusiveStartKeyJson) : null;
  const result = await cred.manager.query(tableName, keyConditionExpression, filterExpression, parseJsonObject(expressionAttributeNamesJson) as Record<string, string>, parseJsonObject(expressionAttributeValuesJson), indexName, scanIndexForward, limit, exclusiveStartKey, consistentRead);
  return { success: result.success, itemsJson: JSON.stringify(result.items), lastEvaluatedKeyJson: JSON.stringify(result.lastEvaluatedKey), count: result.count, scannedCount: result.scannedCount, error: result.error };
}

export async function dynamoDbScan(credentialName: string, tableName: string, filterExpression: string, expressionAttributeNamesJson: string, expressionAttributeValuesJson: string, indexName: string, limit: number, exclusiveStartKeyJson: string, consistentRead: boolean) {
  const cred = dynamoDbManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, itemsJson: "[]", lastEvaluatedKeyJson: "null", count: 0, scannedCount: 0, error: cred.error };
  const exclusiveStartKey = exclusiveStartKeyJson ? parseJsonObject(exclusiveStartKeyJson) : null;
  const result = await cred.manager.scan(tableName, filterExpression, parseJsonObject(expressionAttributeNamesJson) as Record<string, string>, parseJsonObject(expressionAttributeValuesJson), indexName, limit, exclusiveStartKey, consistentRead);
  return { success: result.success, itemsJson: JSON.stringify(result.items), lastEvaluatedKeyJson: JSON.stringify(result.lastEvaluatedKey), count: result.count, scannedCount: result.scannedCount, error: result.error };
}

export async function dynamoDbBatchGetItem(credentialName: string, tableName: string, keysJson: string, consistentRead: boolean) {
  const cred = dynamoDbManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, itemsJson: "[]", unprocessedKeysJson: "[]", error: cred.error };
  const result = await cred.manager.batchGetItem(tableName, parseJsonArray(keysJson) as Record<string, unknown>[], consistentRead);
  return { success: result.success, itemsJson: JSON.stringify(result.items), unprocessedKeysJson: JSON.stringify(result.unprocessedKeys), error: result.error };
}

export async function dynamoDbBatchWriteItem(credentialName: string, tableName: string, putItemsJson: string, deleteKeysJson: string) {
  const cred = dynamoDbManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, unprocessedCount: 0, error: cred.error };
  return cred.manager.batchWriteItem(tableName, parseJsonArray(putItemsJson) as Record<string, unknown>[], parseJsonArray(deleteKeysJson) as Record<string, unknown>[]);
}

export async function dynamoDbTransactGetItems(credentialName: string, itemsJson: string) {
  const cred = dynamoDbManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, itemsJson: "[]", error: cred.error };
  const items = parseJsonArray(itemsJson) as { tableName: string; key: Record<string, unknown> }[];
  const result = await cred.manager.transactGetItems(items);
  return { success: result.success, itemsJson: JSON.stringify(result.items), error: result.error };
}

export async function dynamoDbTransactWriteItems(credentialName: string, operationsJson: string) {
  const cred = dynamoDbManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  const operations = parseJsonArray(operationsJson) as DynamoDbWriteTransactItem[];
  return cred.manager.transactWriteItems(operations);
}
