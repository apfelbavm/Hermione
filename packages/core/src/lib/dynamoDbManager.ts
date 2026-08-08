import { DynamoDBClient, CreateTableCommand, DeleteTableCommand, DescribeTableCommand, ListTablesCommand, UpdateTableCommand, type BillingMode, type ScalarAttributeType } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, DeleteCommand, QueryCommand, ScanCommand, BatchGetCommand, BatchWriteCommand, TransactGetCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { getDatabaseManager } from "../server/DatabaseManager.ts";
import { resolveAllCredentials } from "../server/vaultCredentials.ts";
import type { AwsAccessKeyCredentialData } from "@hermione/shared/types";

/** Every DynamoDB node (table management, items, queries, batches, transactions) needs the same
 * boilerplate: build a client from an access key pair, call one SDK method, and turn either a
 * result or a thrown error into a plain {success, error} shape. Centralized here once instead of
 * repeated per node (see nodes/awsDynamoDb.ts, which only wires pins to these methods). Uses
 * DynamoDBDocumentClient (from @aws-sdk/lib-dynamodb) rather than the low-level DynamoDBClient
 * directly, so callers deal in plain JS objects instead of DynamoDB's own {S, N, M, L, ...}
 * AttributeValue wire format. Resolves credentials straight from the vault itself (mirrors
 * twilioManager.ts) — no separate functionLibraryAwsDynamoDb.ts env-var-reading layer.
 *
 * DynamoDB attribute values can be arbitrarily nested (lists, maps, numbers, sets), so pins carry
 * them as JSON string pins rather than "map"/"struct" pins (see nodes/awsDynamoDb.ts). The public
 * static wrappers below therefore take/return JSON strings directly — matching the pin shapes —
 * and parse/stringify around the object-shaped private instance methods that do the actual SDK calls. */

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

export interface DynamoDbAuth {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  sessionToken: string;
  endpoint: string;
}

export interface DynamoDbOpResult {
  success: boolean;
  error: string;
  [key: string]: unknown;
}

export interface DynamoDbListTablesResult extends DynamoDbOpResult {
  tableNames: string[];
  lastEvaluatedTableName: string;
}

export interface DynamoDbTableDescription extends DynamoDbOpResult {
  status: string;
  itemCount: number;
  sizeBytes: number;
  partitionKeyName: string;
  partitionKeyType: string;
  sortKeyName: string;
  sortKeyType: string;
  billingMode: string;
  readCapacityUnits: number;
  writeCapacityUnits: number;
}

export interface DynamoDbItemResult extends DynamoDbOpResult {
  item: Record<string, unknown> | null;
}

export interface DynamoDbItemJsonResult extends DynamoDbOpResult {
  itemJson: string;
}

export interface DynamoDbAttributesResult extends DynamoDbOpResult {
  attributes: Record<string, unknown> | null;
}

export interface DynamoDbAttributesJsonResult extends DynamoDbOpResult {
  attributesJson: string;
}

export interface DynamoDbQueryResult extends DynamoDbOpResult {
  items: Record<string, unknown>[];
  lastEvaluatedKey: Record<string, unknown> | null;
  count: number;
  scannedCount: number;
}

export interface DynamoDbQueryJsonResult extends DynamoDbOpResult {
  itemsJson: string;
  lastEvaluatedKeyJson: string;
  count: number;
  scannedCount: number;
}

export interface DynamoDbBatchGetResult extends DynamoDbOpResult {
  items: Record<string, unknown>[];
  unprocessedKeys: Record<string, unknown>[];
}

export interface DynamoDbBatchGetJsonResult extends DynamoDbOpResult {
  itemsJson: string;
  unprocessedKeysJson: string;
}

export interface DynamoDbBatchWriteResult extends DynamoDbOpResult {
  unprocessedCount: number;
}

export interface DynamoDbTransactGetResult extends DynamoDbOpResult {
  items: (Record<string, unknown> | null)[];
}

export interface DynamoDbTransactGetJsonResult extends DynamoDbOpResult {
  itemsJson: string;
}

export interface DynamoDbWriteTransactItem {
  operation: "put" | "update" | "delete" | "conditionCheck";
  tableName: string;
  item?: Record<string, unknown>;
  key?: Record<string, unknown>;
  updateExpression?: string;
  conditionExpression?: string;
  expressionAttributeNames?: Record<string, string>;
  expressionAttributeValues?: Record<string, unknown>;
}

const managerCache = new Map<string, DynamoDbManager>();

export class DynamoDbManager {
  private readonly client: DynamoDBClient;
  private readonly doc: DynamoDBDocumentClient;

  private constructor(auth: DynamoDbAuth) {
    this.client = new DynamoDBClient({
      region: auth.region || "us-east-1",
      endpoint: auth.endpoint || undefined,
      credentials: { accessKeyId: auth.accessKeyId, secretAccessKey: auth.secretAccessKey, sessionToken: auth.sessionToken || undefined },
    });
    this.doc = DynamoDBDocumentClient.from(this.client, { marshallOptions: { removeUndefinedValues: true } });
  }

  /** Reuses one DynamoDbManager (and its underlying clients) per distinct credential instead of
   * building a fresh one per node execution. */
  static getInstance(auth: DynamoDbAuth): DynamoDbManager {
    const cacheKey = [auth.accessKeyId, auth.secretAccessKey, auth.region, auth.sessionToken, auth.endpoint].join(" ");
    let manager = managerCache.get(cacheKey);
    if (!manager) {
      manager = new DynamoDbManager(auth);
      managerCache.set(cacheKey, manager);
    }
    return manager;
  }

  static errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  private static async findCredential(credentialName: string): Promise<{ ok: true; auth: DynamoDbAuth } | { ok: false; error: string }> {
    const credRecord = (await resolveAllCredentials(getDatabaseManager())).get(credentialName);
    if (!credRecord) return { ok: false, error: `Credential "${credentialName}" not found in the vault` };
    if (credRecord.type !== "awsAccessKey") return { ok: false, error: `Credential "${credentialName}" is not an AWS Access Key credential` };
    const data = credRecord.data as AwsAccessKeyCredentialData;
    return { ok: true, auth: { accessKeyId: data.accessKeyId, secretAccessKey: data.secretAccessKey, region: data.region, sessionToken: data.sessionToken, endpoint: data.endpoint } };
  }

  static async listTables(credentialName: string, exclusiveStartTableName: string, limit: number): Promise<DynamoDbListTablesResult> {
    const cred = await DynamoDbManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, tableNames: [], lastEvaluatedTableName: "", error: cred.error };
    return DynamoDbManager.getInstance(cred.auth).listTables(exclusiveStartTableName, limit);
  }

  static async createTable(credentialName: string, tableName: string, partitionKeyName: string, partitionKeyType: ScalarAttributeType, sortKeyName: string, sortKeyType: ScalarAttributeType, billingMode: BillingMode, readCapacityUnits: number, writeCapacityUnits: number): Promise<DynamoDbOpResult> {
    const cred = await DynamoDbManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return DynamoDbManager.getInstance(cred.auth).createTable(tableName, partitionKeyName, partitionKeyType, sortKeyName, sortKeyType, billingMode, readCapacityUnits, writeCapacityUnits);
  }

  static async deleteTable(credentialName: string, tableName: string): Promise<DynamoDbOpResult> {
    const cred = await DynamoDbManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return DynamoDbManager.getInstance(cred.auth).deleteTable(tableName);
  }

  static async describeTable(credentialName: string, tableName: string): Promise<DynamoDbTableDescription> {
    const empty = { status: "", itemCount: 0, sizeBytes: 0, partitionKeyName: "", partitionKeyType: "", sortKeyName: "", sortKeyType: "", billingMode: "", readCapacityUnits: 0, writeCapacityUnits: 0 };
    const cred = await DynamoDbManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, ...empty, error: cred.error };
    return DynamoDbManager.getInstance(cred.auth).describeTable(tableName);
  }

  static async updateTableCapacity(credentialName: string, tableName: string, billingMode: BillingMode, readCapacityUnits: number, writeCapacityUnits: number): Promise<DynamoDbOpResult> {
    const cred = await DynamoDbManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return DynamoDbManager.getInstance(cred.auth).updateTableCapacity(tableName, billingMode, readCapacityUnits, writeCapacityUnits);
  }

  static async putItem(credentialName: string, tableName: string, itemJson: string, conditionExpression: string, expressionAttributeNamesJson: string, expressionAttributeValuesJson: string, returnValues: "NONE" | "ALL_OLD"): Promise<DynamoDbAttributesJsonResult> {
    const cred = await DynamoDbManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, attributesJson: "null", error: cred.error };
    const result = await DynamoDbManager.getInstance(cred.auth).putItem(tableName, parseJsonObject(itemJson), conditionExpression, parseJsonObject(expressionAttributeNamesJson) as Record<string, string>, parseJsonObject(expressionAttributeValuesJson), returnValues);
    return { success: result.success, attributesJson: JSON.stringify(result.attributes), error: result.error };
  }

  static async getItem(credentialName: string, tableName: string, keyJson: string, consistentRead: boolean, projectionExpression: string): Promise<DynamoDbItemJsonResult> {
    const cred = await DynamoDbManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, itemJson: "null", error: cred.error };
    const result = await DynamoDbManager.getInstance(cred.auth).getItem(tableName, parseJsonObject(keyJson), consistentRead, projectionExpression);
    return { success: result.success, itemJson: JSON.stringify(result.item), error: result.error };
  }

  static async updateItem(
    credentialName: string,
    tableName: string,
    keyJson: string,
    updateExpression: string,
    conditionExpression: string,
    expressionAttributeNamesJson: string,
    expressionAttributeValuesJson: string,
    returnValues: "NONE" | "ALL_OLD" | "UPDATED_OLD" | "ALL_NEW" | "UPDATED_NEW",
  ): Promise<DynamoDbAttributesJsonResult> {
    const cred = await DynamoDbManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, attributesJson: "null", error: cred.error };
    const result = await DynamoDbManager.getInstance(cred.auth).updateItem(tableName, parseJsonObject(keyJson), updateExpression, conditionExpression, parseJsonObject(expressionAttributeNamesJson) as Record<string, string>, parseJsonObject(expressionAttributeValuesJson), returnValues);
    return { success: result.success, attributesJson: JSON.stringify(result.attributes), error: result.error };
  }

  static async deleteItem(credentialName: string, tableName: string, keyJson: string, conditionExpression: string, expressionAttributeNamesJson: string, expressionAttributeValuesJson: string, returnValues: "NONE" | "ALL_OLD"): Promise<DynamoDbAttributesJsonResult> {
    const cred = await DynamoDbManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, attributesJson: "null", error: cred.error };
    const result = await DynamoDbManager.getInstance(cred.auth).deleteItem(tableName, parseJsonObject(keyJson), conditionExpression, parseJsonObject(expressionAttributeNamesJson) as Record<string, string>, parseJsonObject(expressionAttributeValuesJson), returnValues);
    return { success: result.success, attributesJson: JSON.stringify(result.attributes), error: result.error };
  }

  static async query(
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
  ): Promise<DynamoDbQueryJsonResult> {
    const cred = await DynamoDbManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, itemsJson: "[]", lastEvaluatedKeyJson: "null", count: 0, scannedCount: 0, error: cred.error };
    const exclusiveStartKey = exclusiveStartKeyJson ? parseJsonObject(exclusiveStartKeyJson) : null;
    const result = await DynamoDbManager.getInstance(cred.auth).query(
      tableName,
      keyConditionExpression,
      filterExpression,
      parseJsonObject(expressionAttributeNamesJson) as Record<string, string>,
      parseJsonObject(expressionAttributeValuesJson),
      indexName,
      scanIndexForward,
      limit,
      exclusiveStartKey,
      consistentRead,
    );
    return { success: result.success, itemsJson: JSON.stringify(result.items), lastEvaluatedKeyJson: JSON.stringify(result.lastEvaluatedKey), count: result.count, scannedCount: result.scannedCount, error: result.error };
  }

  static async scan(credentialName: string, tableName: string, filterExpression: string, expressionAttributeNamesJson: string, expressionAttributeValuesJson: string, indexName: string, limit: number, exclusiveStartKeyJson: string, consistentRead: boolean): Promise<DynamoDbQueryJsonResult> {
    const cred = await DynamoDbManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, itemsJson: "[]", lastEvaluatedKeyJson: "null", count: 0, scannedCount: 0, error: cred.error };
    const exclusiveStartKey = exclusiveStartKeyJson ? parseJsonObject(exclusiveStartKeyJson) : null;
    const result = await DynamoDbManager.getInstance(cred.auth).scan(tableName, filterExpression, parseJsonObject(expressionAttributeNamesJson) as Record<string, string>, parseJsonObject(expressionAttributeValuesJson), indexName, limit, exclusiveStartKey, consistentRead);
    return { success: result.success, itemsJson: JSON.stringify(result.items), lastEvaluatedKeyJson: JSON.stringify(result.lastEvaluatedKey), count: result.count, scannedCount: result.scannedCount, error: result.error };
  }

  static async batchGetItem(credentialName: string, tableName: string, keysJson: string, consistentRead: boolean): Promise<DynamoDbBatchGetJsonResult> {
    const cred = await DynamoDbManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, itemsJson: "[]", unprocessedKeysJson: "[]", error: cred.error };
    const result = await DynamoDbManager.getInstance(cred.auth).batchGetItem(tableName, parseJsonArray(keysJson) as Record<string, unknown>[], consistentRead);
    return { success: result.success, itemsJson: JSON.stringify(result.items), unprocessedKeysJson: JSON.stringify(result.unprocessedKeys), error: result.error };
  }

  static async batchWriteItem(credentialName: string, tableName: string, putItemsJson: string, deleteKeysJson: string): Promise<DynamoDbBatchWriteResult> {
    const cred = await DynamoDbManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, unprocessedCount: 0, error: cred.error };
    return DynamoDbManager.getInstance(cred.auth).batchWriteItem(tableName, parseJsonArray(putItemsJson) as Record<string, unknown>[], parseJsonArray(deleteKeysJson) as Record<string, unknown>[]);
  }

  static async transactGetItems(credentialName: string, itemsJson: string): Promise<DynamoDbTransactGetJsonResult> {
    const cred = await DynamoDbManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, itemsJson: "[]", error: cred.error };
    const items = parseJsonArray(itemsJson) as { tableName: string; key: Record<string, unknown> }[];
    const result = await DynamoDbManager.getInstance(cred.auth).transactGetItems(items);
    return { success: result.success, itemsJson: JSON.stringify(result.items), error: result.error };
  }

  static async transactWriteItems(credentialName: string, operationsJson: string): Promise<DynamoDbOpResult> {
    const cred = await DynamoDbManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    const operations = parseJsonArray(operationsJson) as DynamoDbWriteTransactItem[];
    return DynamoDbManager.getInstance(cred.auth).transactWriteItems(operations);
  }

  private async listTables(exclusiveStartTableName: string, limit: number): Promise<DynamoDbListTablesResult> {
    try {
      const result = await this.client.send(new ListTablesCommand({ ExclusiveStartTableName: exclusiveStartTableName || undefined, Limit: limit > 0 ? limit : undefined }));
      return { success: true, tableNames: result.TableNames ?? [], lastEvaluatedTableName: result.LastEvaluatedTableName ?? "", error: "" };
    } catch (err) {
      return { success: false, tableNames: [], lastEvaluatedTableName: "", error: DynamoDbManager.errorMessage(err) };
    }
  }

  private async createTable(tableName: string, partitionKeyName: string, partitionKeyType: ScalarAttributeType, sortKeyName: string, sortKeyType: ScalarAttributeType, billingMode: BillingMode, readCapacityUnits: number, writeCapacityUnits: number): Promise<DynamoDbOpResult> {
    try {
      const attributeDefinitions = [{ AttributeName: partitionKeyName, AttributeType: partitionKeyType }];
      const keySchema: { AttributeName: string; KeyType: "HASH" | "RANGE" }[] = [{ AttributeName: partitionKeyName, KeyType: "HASH" }];
      if (sortKeyName) {
        attributeDefinitions.push({ AttributeName: sortKeyName, AttributeType: sortKeyType });
        keySchema.push({ AttributeName: sortKeyName, KeyType: "RANGE" });
      }
      await this.client.send(
        new CreateTableCommand({
          TableName: tableName,
          AttributeDefinitions: attributeDefinitions,
          KeySchema: keySchema,
          BillingMode: billingMode,
          ProvisionedThroughput: billingMode === "PROVISIONED" ? { ReadCapacityUnits: readCapacityUnits || 1, WriteCapacityUnits: writeCapacityUnits || 1 } : undefined,
        }),
      );
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: DynamoDbManager.errorMessage(err) };
    }
  }

  private async deleteTable(tableName: string): Promise<DynamoDbOpResult> {
    try {
      await this.client.send(new DeleteTableCommand({ TableName: tableName }));
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: DynamoDbManager.errorMessage(err) };
    }
  }

  private async describeTable(tableName: string): Promise<DynamoDbTableDescription> {
    const empty = { status: "", itemCount: 0, sizeBytes: 0, partitionKeyName: "", partitionKeyType: "", sortKeyName: "", sortKeyType: "", billingMode: "", readCapacityUnits: 0, writeCapacityUnits: 0 };
    try {
      const result = await this.client.send(new DescribeTableCommand({ TableName: tableName }));
      const table = result.Table;
      const hash = table?.KeySchema?.find((k) => k.KeyType === "HASH");
      const range = table?.KeySchema?.find((k) => k.KeyType === "RANGE");
      const attrType = (name: string | undefined) => table?.AttributeDefinitions?.find((a) => a.AttributeName === name)?.AttributeType ?? "";
      return {
        success: true,
        status: table?.TableStatus ?? "",
        itemCount: table?.ItemCount ?? 0,
        sizeBytes: table?.TableSizeBytes ?? 0,
        partitionKeyName: hash?.AttributeName ?? "",
        partitionKeyType: attrType(hash?.AttributeName),
        sortKeyName: range?.AttributeName ?? "",
        sortKeyType: attrType(range?.AttributeName),
        billingMode: table?.BillingModeSummary?.BillingMode ?? (table?.ProvisionedThroughput ? "PROVISIONED" : ""),
        readCapacityUnits: table?.ProvisionedThroughput?.ReadCapacityUnits ?? 0,
        writeCapacityUnits: table?.ProvisionedThroughput?.WriteCapacityUnits ?? 0,
        error: "",
      };
    } catch (err) {
      return { success: false, ...empty, error: DynamoDbManager.errorMessage(err) };
    }
  }

  private async updateTableCapacity(tableName: string, billingMode: BillingMode, readCapacityUnits: number, writeCapacityUnits: number): Promise<DynamoDbOpResult> {
    try {
      await this.client.send(
        new UpdateTableCommand({
          TableName: tableName,
          BillingMode: billingMode,
          ProvisionedThroughput: billingMode === "PROVISIONED" ? { ReadCapacityUnits: readCapacityUnits || 1, WriteCapacityUnits: writeCapacityUnits || 1 } : undefined,
        }),
      );
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: DynamoDbManager.errorMessage(err) };
    }
  }

  private async putItem(tableName: string, item: Record<string, unknown>, conditionExpression: string, expressionAttributeNames: Record<string, string>, expressionAttributeValues: Record<string, unknown>, returnValues: "NONE" | "ALL_OLD"): Promise<DynamoDbAttributesResult> {
    try {
      const result = await this.doc.send(
        new PutCommand({
          TableName: tableName,
          Item: item,
          ConditionExpression: conditionExpression || undefined,
          ExpressionAttributeNames: Object.keys(expressionAttributeNames).length ? expressionAttributeNames : undefined,
          ExpressionAttributeValues: Object.keys(expressionAttributeValues).length ? expressionAttributeValues : undefined,
          ReturnValues: returnValues,
        }),
      );
      return { success: true, attributes: (result.Attributes as Record<string, unknown>) ?? null, error: "" };
    } catch (err) {
      return { success: false, attributes: null, error: DynamoDbManager.errorMessage(err) };
    }
  }

  private async getItem(tableName: string, key: Record<string, unknown>, consistentRead: boolean, projectionExpression: string): Promise<DynamoDbItemResult> {
    try {
      const result = await this.doc.send(new GetCommand({ TableName: tableName, Key: key, ConsistentRead: consistentRead, ProjectionExpression: projectionExpression || undefined }));
      return { success: true, item: (result.Item as Record<string, unknown>) ?? null, error: "" };
    } catch (err) {
      return { success: false, item: null, error: DynamoDbManager.errorMessage(err) };
    }
  }

  private async updateItem(
    tableName: string,
    key: Record<string, unknown>,
    updateExpression: string,
    conditionExpression: string,
    expressionAttributeNames: Record<string, string>,
    expressionAttributeValues: Record<string, unknown>,
    returnValues: "NONE" | "ALL_OLD" | "UPDATED_OLD" | "ALL_NEW" | "UPDATED_NEW",
  ): Promise<DynamoDbAttributesResult> {
    try {
      const result = await this.doc.send(
        new UpdateCommand({
          TableName: tableName,
          Key: key,
          UpdateExpression: updateExpression,
          ConditionExpression: conditionExpression || undefined,
          ExpressionAttributeNames: Object.keys(expressionAttributeNames).length ? expressionAttributeNames : undefined,
          ExpressionAttributeValues: Object.keys(expressionAttributeValues).length ? expressionAttributeValues : undefined,
          ReturnValues: returnValues,
        }),
      );
      return { success: true, attributes: (result.Attributes as Record<string, unknown>) ?? null, error: "" };
    } catch (err) {
      return { success: false, attributes: null, error: DynamoDbManager.errorMessage(err) };
    }
  }

  private async deleteItem(tableName: string, key: Record<string, unknown>, conditionExpression: string, expressionAttributeNames: Record<string, string>, expressionAttributeValues: Record<string, unknown>, returnValues: "NONE" | "ALL_OLD"): Promise<DynamoDbAttributesResult> {
    try {
      const result = await this.doc.send(
        new DeleteCommand({
          TableName: tableName,
          Key: key,
          ConditionExpression: conditionExpression || undefined,
          ExpressionAttributeNames: Object.keys(expressionAttributeNames).length ? expressionAttributeNames : undefined,
          ExpressionAttributeValues: Object.keys(expressionAttributeValues).length ? expressionAttributeValues : undefined,
          ReturnValues: returnValues,
        }),
      );
      return { success: true, attributes: (result.Attributes as Record<string, unknown>) ?? null, error: "" };
    } catch (err) {
      return { success: false, attributes: null, error: DynamoDbManager.errorMessage(err) };
    }
  }

  private async query(
    tableName: string,
    keyConditionExpression: string,
    filterExpression: string,
    expressionAttributeNames: Record<string, string>,
    expressionAttributeValues: Record<string, unknown>,
    indexName: string,
    scanIndexForward: boolean,
    limit: number,
    exclusiveStartKey: Record<string, unknown> | null,
    consistentRead: boolean,
  ): Promise<DynamoDbQueryResult> {
    try {
      const result = await this.doc.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: keyConditionExpression,
          FilterExpression: filterExpression || undefined,
          ExpressionAttributeNames: Object.keys(expressionAttributeNames).length ? expressionAttributeNames : undefined,
          ExpressionAttributeValues: Object.keys(expressionAttributeValues).length ? expressionAttributeValues : undefined,
          IndexName: indexName || undefined,
          ScanIndexForward: scanIndexForward,
          Limit: limit > 0 ? limit : undefined,
          ExclusiveStartKey: exclusiveStartKey ?? undefined,
          ConsistentRead: consistentRead,
        }),
      );
      return { success: true, items: (result.Items as Record<string, unknown>[]) ?? [], lastEvaluatedKey: (result.LastEvaluatedKey as Record<string, unknown>) ?? null, count: result.Count ?? 0, scannedCount: result.ScannedCount ?? 0, error: "" };
    } catch (err) {
      return { success: false, items: [], lastEvaluatedKey: null, count: 0, scannedCount: 0, error: DynamoDbManager.errorMessage(err) };
    }
  }

  private async scan(
    tableName: string,
    filterExpression: string,
    expressionAttributeNames: Record<string, string>,
    expressionAttributeValues: Record<string, unknown>,
    indexName: string,
    limit: number,
    exclusiveStartKey: Record<string, unknown> | null,
    consistentRead: boolean,
  ): Promise<DynamoDbQueryResult> {
    try {
      const result = await this.doc.send(
        new ScanCommand({
          TableName: tableName,
          FilterExpression: filterExpression || undefined,
          ExpressionAttributeNames: Object.keys(expressionAttributeNames).length ? expressionAttributeNames : undefined,
          ExpressionAttributeValues: Object.keys(expressionAttributeValues).length ? expressionAttributeValues : undefined,
          IndexName: indexName || undefined,
          Limit: limit > 0 ? limit : undefined,
          ExclusiveStartKey: exclusiveStartKey ?? undefined,
          ConsistentRead: consistentRead,
        }),
      );
      return { success: true, items: (result.Items as Record<string, unknown>[]) ?? [], lastEvaluatedKey: (result.LastEvaluatedKey as Record<string, unknown>) ?? null, count: result.Count ?? 0, scannedCount: result.ScannedCount ?? 0, error: "" };
    } catch (err) {
      return { success: false, items: [], lastEvaluatedKey: null, count: 0, scannedCount: 0, error: DynamoDbManager.errorMessage(err) };
    }
  }

  private async batchGetItem(tableName: string, keys: Record<string, unknown>[], consistentRead: boolean): Promise<DynamoDbBatchGetResult> {
    try {
      const result = await this.doc.send(new BatchGetCommand({ RequestItems: { [tableName]: { Keys: keys, ConsistentRead: consistentRead } } }));
      const unprocessed = result.UnprocessedKeys?.[tableName]?.Keys as Record<string, unknown>[] | undefined;
      return { success: true, items: (result.Responses?.[tableName] as Record<string, unknown>[]) ?? [], unprocessedKeys: unprocessed ?? [], error: "" };
    } catch (err) {
      return { success: false, items: [], unprocessedKeys: [], error: DynamoDbManager.errorMessage(err) };
    }
  }

  private async batchWriteItem(tableName: string, putItems: Record<string, unknown>[], deleteKeys: Record<string, unknown>[]): Promise<DynamoDbBatchWriteResult> {
    try {
      const requests = [...putItems.map((item) => ({ PutRequest: { Item: item } })), ...deleteKeys.map((key) => ({ DeleteRequest: { Key: key } }))];
      const result = await this.doc.send(new BatchWriteCommand({ RequestItems: { [tableName]: requests } }));
      const unprocessed = result.UnprocessedItems?.[tableName];
      return { success: true, unprocessedCount: unprocessed?.length ?? 0, error: "" };
    } catch (err) {
      return { success: false, unprocessedCount: 0, error: DynamoDbManager.errorMessage(err) };
    }
  }

  private async transactGetItems(items: { tableName: string; key: Record<string, unknown> }[]): Promise<DynamoDbTransactGetResult> {
    try {
      const result = await this.doc.send(new TransactGetCommand({ TransactItems: items.map((i) => ({ Get: { TableName: i.tableName, Key: i.key } })) }));
      return { success: true, items: (result.Responses ?? []).map((r) => (r?.Item as Record<string, unknown>) ?? null), error: "" };
    } catch (err) {
      return { success: false, items: [], error: DynamoDbManager.errorMessage(err) };
    }
  }

  private async transactWriteItems(operations: DynamoDbWriteTransactItem[]): Promise<DynamoDbOpResult> {
    try {
      const transactItems = operations.map((op) => {
        const namesGiven = op.expressionAttributeNames && Object.keys(op.expressionAttributeNames).length ? op.expressionAttributeNames : undefined;
        const valuesGiven = op.expressionAttributeValues && Object.keys(op.expressionAttributeValues).length ? op.expressionAttributeValues : undefined;
        if (op.operation === "put") return { Put: { TableName: op.tableName, Item: op.item ?? {}, ConditionExpression: op.conditionExpression || undefined, ExpressionAttributeNames: namesGiven, ExpressionAttributeValues: valuesGiven } };
        if (op.operation === "delete") return { Delete: { TableName: op.tableName, Key: op.key ?? {}, ConditionExpression: op.conditionExpression || undefined, ExpressionAttributeNames: namesGiven, ExpressionAttributeValues: valuesGiven } };
        if (op.operation === "conditionCheck") return { ConditionCheck: { TableName: op.tableName, Key: op.key ?? {}, ConditionExpression: op.conditionExpression ?? "", ExpressionAttributeNames: namesGiven, ExpressionAttributeValues: valuesGiven } };
        return { Update: { TableName: op.tableName, Key: op.key ?? {}, UpdateExpression: op.updateExpression ?? "", ConditionExpression: op.conditionExpression || undefined, ExpressionAttributeNames: namesGiven, ExpressionAttributeValues: valuesGiven } };
      });
      await this.doc.send(new TransactWriteCommand({ TransactItems: transactItems }));
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: DynamoDbManager.errorMessage(err) };
    }
  }
}
