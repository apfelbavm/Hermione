import { DynamoDBClient, CreateTableCommand, DeleteTableCommand, DescribeTableCommand, ListTablesCommand, UpdateTableCommand, type BillingMode, type ScalarAttributeType } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, DeleteCommand, QueryCommand, ScanCommand, BatchGetCommand, BatchWriteCommand, TransactGetCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";

/** Every DynamoDB node (table management, items, queries, batches, transactions) needs the same
 * boilerplate: build a client from an access key pair, call one SDK method, and turn either a
 * result or a thrown error into a plain {success, error} shape. Centralized here once instead of
 * repeated per node (see nodes/AwsdynamoDb.ts, which only wires pins to these methods). Uses
 * DynamoDBDocumentClient (from @aws-sdk/lib-dynamodb) rather than the low-level DynamoDBClient
 * directly, so callers deal in plain JS objects instead of DynamoDB's own {S, N, M, L, ...}
 * AttributeValue wire format. */

function dynamoDbErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
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

export interface DynamoDbAttributesResult extends DynamoDbOpResult {
  attributes: Record<string, unknown> | null;
}

export interface DynamoDbQueryResult extends DynamoDbOpResult {
  items: Record<string, unknown>[];
  lastEvaluatedKey: Record<string, unknown> | null;
  count: number;
  scannedCount: number;
}

export interface DynamoDbBatchGetResult extends DynamoDbOpResult {
  items: Record<string, unknown>[];
  unprocessedKeys: Record<string, unknown>[];
}

export interface DynamoDbBatchWriteResult extends DynamoDbOpResult {
  unprocessedCount: number;
}

export interface DynamoDbTransactGetResult extends DynamoDbOpResult {
  items: (Record<string, unknown> | null)[];
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

  constructor(accessKeyId: string, secretAccessKey: string, region: string, sessionToken: string, endpoint: string) {
    this.client = new DynamoDBClient({
      region: region || "us-east-1",
      endpoint: endpoint || undefined,
      credentials: { accessKeyId, secretAccessKey, sessionToken: sessionToken || undefined },
    });
    this.doc = DynamoDBDocumentClient.from(this.client, { marshallOptions: { removeUndefinedValues: true } });
  }

  /** Reuses one DynamoDbManager (and its underlying clients) per distinct credential instead of
   * building a fresh one per node execution, same reasoning as AzureStorageManager.forCredential. */
  static forCredential(accessKeyId: string, secretAccessKey: string, region: string, sessionToken: string, endpoint: string): DynamoDbManager {
    const cacheKey = [accessKeyId, secretAccessKey, region, sessionToken, endpoint].join("\u0000");
    let manager = managerCache.get(cacheKey);
    if (!manager) {
      manager = new DynamoDbManager(accessKeyId, secretAccessKey, region, sessionToken, endpoint);
      managerCache.set(cacheKey, manager);
    }
    return manager;
  }

  async listTables(exclusiveStartTableName: string, limit: number): Promise<DynamoDbListTablesResult> {
    try {
      const result = await this.client.send(new ListTablesCommand({ ExclusiveStartTableName: exclusiveStartTableName || undefined, Limit: limit > 0 ? limit : undefined }));
      return { success: true, tableNames: result.TableNames ?? [], lastEvaluatedTableName: result.LastEvaluatedTableName ?? "", error: "" };
    } catch (err) {
      return { success: false, tableNames: [], lastEvaluatedTableName: "", error: dynamoDbErrorMessage(err) };
    }
  }

  async createTable(tableName: string, partitionKeyName: string, partitionKeyType: ScalarAttributeType, sortKeyName: string, sortKeyType: ScalarAttributeType, billingMode: BillingMode, readCapacityUnits: number, writeCapacityUnits: number): Promise<DynamoDbOpResult> {
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
      return { success: false, error: dynamoDbErrorMessage(err) };
    }
  }

  async deleteTable(tableName: string): Promise<DynamoDbOpResult> {
    try {
      await this.client.send(new DeleteTableCommand({ TableName: tableName }));
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: dynamoDbErrorMessage(err) };
    }
  }

  async describeTable(tableName: string): Promise<DynamoDbTableDescription> {
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
      return { success: false, ...empty, error: dynamoDbErrorMessage(err) };
    }
  }

  async updateTableCapacity(tableName: string, billingMode: BillingMode, readCapacityUnits: number, writeCapacityUnits: number): Promise<DynamoDbOpResult> {
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
      return { success: false, error: dynamoDbErrorMessage(err) };
    }
  }

  async putItem(tableName: string, item: Record<string, unknown>, conditionExpression: string, expressionAttributeNames: Record<string, string>, expressionAttributeValues: Record<string, unknown>, returnValues: "NONE" | "ALL_OLD"): Promise<DynamoDbAttributesResult> {
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
      return { success: false, attributes: null, error: dynamoDbErrorMessage(err) };
    }
  }

  async getItem(tableName: string, key: Record<string, unknown>, consistentRead: boolean, projectionExpression: string): Promise<DynamoDbItemResult> {
    try {
      const result = await this.doc.send(new GetCommand({ TableName: tableName, Key: key, ConsistentRead: consistentRead, ProjectionExpression: projectionExpression || undefined }));
      return { success: true, item: (result.Item as Record<string, unknown>) ?? null, error: "" };
    } catch (err) {
      return { success: false, item: null, error: dynamoDbErrorMessage(err) };
    }
  }

  async updateItem(
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
      return { success: false, attributes: null, error: dynamoDbErrorMessage(err) };
    }
  }

  async deleteItem(tableName: string, key: Record<string, unknown>, conditionExpression: string, expressionAttributeNames: Record<string, string>, expressionAttributeValues: Record<string, unknown>, returnValues: "NONE" | "ALL_OLD"): Promise<DynamoDbAttributesResult> {
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
      return { success: false, attributes: null, error: dynamoDbErrorMessage(err) };
    }
  }

  async query(
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
      return { success: false, items: [], lastEvaluatedKey: null, count: 0, scannedCount: 0, error: dynamoDbErrorMessage(err) };
    }
  }

  async scan(
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
      return { success: false, items: [], lastEvaluatedKey: null, count: 0, scannedCount: 0, error: dynamoDbErrorMessage(err) };
    }
  }

  async batchGetItem(tableName: string, keys: Record<string, unknown>[], consistentRead: boolean): Promise<DynamoDbBatchGetResult> {
    try {
      const result = await this.doc.send(new BatchGetCommand({ RequestItems: { [tableName]: { Keys: keys, ConsistentRead: consistentRead } } }));
      const unprocessed = result.UnprocessedKeys?.[tableName]?.Keys as Record<string, unknown>[] | undefined;
      return { success: true, items: (result.Responses?.[tableName] as Record<string, unknown>[]) ?? [], unprocessedKeys: unprocessed ?? [], error: "" };
    } catch (err) {
      return { success: false, items: [], unprocessedKeys: [], error: dynamoDbErrorMessage(err) };
    }
  }

  async batchWriteItem(tableName: string, putItems: Record<string, unknown>[], deleteKeys: Record<string, unknown>[]): Promise<DynamoDbBatchWriteResult> {
    try {
      const requests = [...putItems.map((item) => ({ PutRequest: { Item: item } })), ...deleteKeys.map((key) => ({ DeleteRequest: { Key: key } }))];
      const result = await this.doc.send(new BatchWriteCommand({ RequestItems: { [tableName]: requests } }));
      const unprocessed = result.UnprocessedItems?.[tableName];
      return { success: true, unprocessedCount: unprocessed?.length ?? 0, error: "" };
    } catch (err) {
      return { success: false, unprocessedCount: 0, error: dynamoDbErrorMessage(err) };
    }
  }

  async transactGetItems(items: { tableName: string; key: Record<string, unknown> }[]): Promise<DynamoDbTransactGetResult> {
    try {
      const result = await this.doc.send(new TransactGetCommand({ TransactItems: items.map((i) => ({ Get: { TableName: i.tableName, Key: i.key } })) }));
      return { success: true, items: (result.Responses ?? []).map((r) => (r?.Item as Record<string, unknown>) ?? null), error: "" };
    } catch (err) {
      return { success: false, items: [], error: dynamoDbErrorMessage(err) };
    }
  }

  async transactWriteItems(operations: DynamoDbWriteTransactItem[]): Promise<DynamoDbOpResult> {
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
      return { success: false, error: dynamoDbErrorMessage(err) };
    }
  }
}
