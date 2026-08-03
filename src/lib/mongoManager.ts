import { MongoClient, ObjectId, type Document, type Filter, type Sort, type UpdateFilter, type FindOneAndUpdateOptions, type FindOneAndReplaceOptions, type AnyBulkWriteOperation, type IndexSpecification, type CreateIndexesOptions } from "mongodb";

/** Every Mongo node (collections, documents, indexes, aggregation) needs the same boilerplate: get
 * a connected client from a connection string, run one driver call, and turn either a result or a
 * thrown error into a plain {success, error} shape. Centralized here once instead of repeated per
 * node (see nodes/mongo.ts, which only wires pins to these methods) \u2014 same reasoning as
 * DynamoDbManager. */

function mongoErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** "_id" fields carrying a 24-char hex string are revived into ObjectId so filters/documents built
 * from JSON (e.g. `{"_id":"..."}` copied from a prior findOne's output) round-trip correctly \u2014
 * Mongo's own hex string representation of an ObjectId, not a full Extended JSON encoding. */
function mongoJsonReviver(key: string, value: unknown): unknown {
  if (key === "_id" && typeof value === "string" && ObjectId.isValid(value) && value.length === 24) return new ObjectId(value);
  return value;
}

function mongoJsonReplacer(_key: string, value: unknown): unknown {
  if (value instanceof ObjectId) return value.toHexString();
  if (value instanceof Date) return value.toISOString();
  return value;
}

export function parseMongoJsonObject(json: string): Document {
  if (!json) return {};
  const parsed: unknown = JSON.parse(json, mongoJsonReviver);
  return parsed && typeof parsed === "object" ? (parsed as Document) : {};
}

export function parseMongoJsonArray(json: string): unknown[] {
  if (!json) return [];
  const parsed: unknown = JSON.parse(json, mongoJsonReviver);
  return Array.isArray(parsed) ? parsed : [];
}

export function stringifyMongo(value: unknown): string {
  return JSON.stringify(value ?? null, mongoJsonReplacer);
}

export interface MongoOpResult {
  success: boolean;
  error: string;
  [key: string]: unknown;
}

const managerCache = new Map<string, MongoManager>();

export class MongoManager {
  private readonly client: MongoClient;
  private readonly defaultDatabase: string;
  private connecting: Promise<MongoClient> | null = null;

  constructor(connectionString: string, defaultDatabase: string) {
    this.client = new MongoClient(connectionString);
    this.defaultDatabase = defaultDatabase;
  }

  /** Reuses one MongoManager (and its underlying MongoClient's connection pool) per distinct
   * connection string instead of reconnecting per node execution \u2014 same reasoning as
   * DynamoDbManager.forCredential/AzureStorageManager.forCredential. */
  static forCredential(connectionString: string, defaultDatabase: string): MongoManager {
    const cacheKey = `${connectionString}\u0000${defaultDatabase}`;
    let manager = managerCache.get(cacheKey);
    if (!manager) {
      manager = new MongoManager(connectionString, defaultDatabase);
      managerCache.set(cacheKey, manager);
    }
    return manager;
  }

  private async connectedClient(): Promise<MongoClient> {
    if (!this.connecting) this.connecting = this.client.connect();
    return this.connecting;
  }

  private async db(databaseName: string) {
    const client = await this.connectedClient();
    return client.db(databaseName || this.defaultDatabase || undefined);
  }

  private async collection(databaseName: string, collectionName: string) {
    const db = await this.db(databaseName);
    return db.collection(collectionName);
  }

  async listDatabases(): Promise<MongoOpResult & { databaseNames: string[] }> {
    try {
      const client = await this.connectedClient();
      const result = await client.db().admin().listDatabases();
      return { success: true, databaseNames: result.databases.map((d) => d.name), error: "" };
    } catch (err) {
      return { success: false, databaseNames: [], error: mongoErrorMessage(err) };
    }
  }

  async listCollections(databaseName: string): Promise<MongoOpResult & { collectionNames: string[] }> {
    try {
      const db = await this.db(databaseName);
      const collections = await db.listCollections().toArray();
      return { success: true, collectionNames: collections.map((c) => c.name), error: "" };
    } catch (err) {
      return { success: false, collectionNames: [], error: mongoErrorMessage(err) };
    }
  }

  async createCollection(databaseName: string, collectionName: string): Promise<MongoOpResult> {
    try {
      const db = await this.db(databaseName);
      await db.createCollection(collectionName);
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: mongoErrorMessage(err) };
    }
  }

  async dropCollection(databaseName: string, collectionName: string): Promise<MongoOpResult> {
    try {
      const db = await this.db(databaseName);
      await db.dropCollection(collectionName);
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: mongoErrorMessage(err) };
    }
  }

  async dropDatabase(databaseName: string): Promise<MongoOpResult> {
    try {
      const db = await this.db(databaseName);
      await db.dropDatabase();
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: mongoErrorMessage(err) };
    }
  }

  async renameCollection(databaseName: string, collectionName: string, newName: string, dropTarget: boolean): Promise<MongoOpResult> {
    try {
      const db = await this.db(databaseName);
      await db.renameCollection(collectionName, newName, { dropTarget });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: mongoErrorMessage(err) };
    }
  }

  async insertOne(databaseName: string, collectionName: string, document: Document): Promise<MongoOpResult & { insertedId: string }> {
    try {
      const col = await this.collection(databaseName, collectionName);
      const result = await col.insertOne(document);
      return { success: true, insertedId: result.insertedId.toHexString(), error: "" };
    } catch (err) {
      return { success: false, insertedId: "", error: mongoErrorMessage(err) };
    }
  }

  async insertMany(databaseName: string, collectionName: string, documents: Document[]): Promise<MongoOpResult & { insertedIds: string[]; insertedCount: number }> {
    try {
      const col = await this.collection(databaseName, collectionName);
      const result = await col.insertMany(documents);
      return { success: true, insertedIds: Object.values(result.insertedIds).map((id) => id.toHexString()), insertedCount: result.insertedCount, error: "" };
    } catch (err) {
      return { success: false, insertedIds: [], insertedCount: 0, error: mongoErrorMessage(err) };
    }
  }

  async findOne(databaseName: string, collectionName: string, filter: Filter<Document>, projection: Document, sort: Sort): Promise<MongoOpResult & { document: Document | null }> {
    try {
      const col = await this.collection(databaseName, collectionName);
      const document = await col.findOne(filter, { projection, sort });
      return { success: true, document: document ?? null, error: "" };
    } catch (err) {
      return { success: false, document: null, error: mongoErrorMessage(err) };
    }
  }

  async find(databaseName: string, collectionName: string, filter: Filter<Document>, projection: Document, sort: Sort, limit: number, skip: number): Promise<MongoOpResult & { documents: Document[] }> {
    try {
      const col = await this.collection(databaseName, collectionName);
      let cursor = col.find(filter, { projection, sort });
      if (skip > 0) cursor = cursor.skip(skip);
      if (limit > 0) cursor = cursor.limit(limit);
      const documents = await cursor.toArray();
      return { success: true, documents, error: "" };
    } catch (err) {
      return { success: false, documents: [], error: mongoErrorMessage(err) };
    }
  }

  async countDocuments(databaseName: string, collectionName: string, filter: Filter<Document>): Promise<MongoOpResult & { count: number }> {
    try {
      const col = await this.collection(databaseName, collectionName);
      const count = await col.countDocuments(filter);
      return { success: true, count, error: "" };
    } catch (err) {
      return { success: false, count: 0, error: mongoErrorMessage(err) };
    }
  }

  async updateOne(databaseName: string, collectionName: string, filter: Filter<Document>, update: UpdateFilter<Document> | Document[], upsert: boolean): Promise<MongoOpResult & { matchedCount: number; modifiedCount: number; upsertedId: string }> {
    try {
      const col = await this.collection(databaseName, collectionName);
      const result = await col.updateOne(filter, update, { upsert });
      return { success: true, matchedCount: result.matchedCount, modifiedCount: result.modifiedCount, upsertedId: result.upsertedId?.toHexString() ?? "", error: "" };
    } catch (err) {
      return { success: false, matchedCount: 0, modifiedCount: 0, upsertedId: "", error: mongoErrorMessage(err) };
    }
  }

  async updateMany(databaseName: string, collectionName: string, filter: Filter<Document>, update: UpdateFilter<Document> | Document[], upsert: boolean): Promise<MongoOpResult & { matchedCount: number; modifiedCount: number; upsertedId: string }> {
    try {
      const col = await this.collection(databaseName, collectionName);
      const result = await col.updateMany(filter, update, { upsert });
      return { success: true, matchedCount: result.matchedCount, modifiedCount: result.modifiedCount, upsertedId: result.upsertedId?.toHexString() ?? "", error: "" };
    } catch (err) {
      return { success: false, matchedCount: 0, modifiedCount: 0, upsertedId: "", error: mongoErrorMessage(err) };
    }
  }

  async replaceOne(databaseName: string, collectionName: string, filter: Filter<Document>, replacement: Document, upsert: boolean): Promise<MongoOpResult & { matchedCount: number; modifiedCount: number; upsertedId: string }> {
    try {
      const col = await this.collection(databaseName, collectionName);
      const result = await col.replaceOne(filter, replacement, { upsert });
      return { success: true, matchedCount: result.matchedCount, modifiedCount: result.modifiedCount, upsertedId: result.upsertedId?.toHexString() ?? "", error: "" };
    } catch (err) {
      return { success: false, matchedCount: 0, modifiedCount: 0, upsertedId: "", error: mongoErrorMessage(err) };
    }
  }

  async deleteOne(databaseName: string, collectionName: string, filter: Filter<Document>): Promise<MongoOpResult & { deletedCount: number }> {
    try {
      const col = await this.collection(databaseName, collectionName);
      const result = await col.deleteOne(filter);
      return { success: true, deletedCount: result.deletedCount ?? 0, error: "" };
    } catch (err) {
      return { success: false, deletedCount: 0, error: mongoErrorMessage(err) };
    }
  }

  async deleteMany(databaseName: string, collectionName: string, filter: Filter<Document>): Promise<MongoOpResult & { deletedCount: number }> {
    try {
      const col = await this.collection(databaseName, collectionName);
      const result = await col.deleteMany(filter);
      return { success: true, deletedCount: result.deletedCount ?? 0, error: "" };
    } catch (err) {
      return { success: false, deletedCount: 0, error: mongoErrorMessage(err) };
    }
  }

  async findOneAndUpdate(databaseName: string, collectionName: string, filter: Filter<Document>, update: UpdateFilter<Document> | Document[], upsert: boolean, returnDocument: "before" | "after"): Promise<MongoOpResult & { document: Document | null }> {
    try {
      const col = await this.collection(databaseName, collectionName);
      const options: FindOneAndUpdateOptions = { upsert, returnDocument, includeResultMetadata: false };
      const document = await col.findOneAndUpdate(filter, update, options);
      return { success: true, document: document ?? null, error: "" };
    } catch (err) {
      return { success: false, document: null, error: mongoErrorMessage(err) };
    }
  }

  async findOneAndReplace(databaseName: string, collectionName: string, filter: Filter<Document>, replacement: Document, upsert: boolean, returnDocument: "before" | "after"): Promise<MongoOpResult & { document: Document | null }> {
    try {
      const col = await this.collection(databaseName, collectionName);
      const options: FindOneAndReplaceOptions = { upsert, returnDocument, includeResultMetadata: false };
      const document = await col.findOneAndReplace(filter, replacement, options);
      return { success: true, document: document ?? null, error: "" };
    } catch (err) {
      return { success: false, document: null, error: mongoErrorMessage(err) };
    }
  }

  async findOneAndDelete(databaseName: string, collectionName: string, filter: Filter<Document>): Promise<MongoOpResult & { document: Document | null }> {
    try {
      const col = await this.collection(databaseName, collectionName);
      const document = await col.findOneAndDelete(filter, { includeResultMetadata: false });
      return { success: true, document: document ?? null, error: "" };
    } catch (err) {
      return { success: false, document: null, error: mongoErrorMessage(err) };
    }
  }

  async aggregate(databaseName: string, collectionName: string, pipeline: Document[]): Promise<MongoOpResult & { results: Document[] }> {
    try {
      const col = await this.collection(databaseName, collectionName);
      const results = await col.aggregate(pipeline).toArray();
      return { success: true, results, error: "" };
    } catch (err) {
      return { success: false, results: [], error: mongoErrorMessage(err) };
    }
  }

  async distinct(databaseName: string, collectionName: string, field: string, filter: Filter<Document>): Promise<MongoOpResult & { values: unknown[] }> {
    try {
      const col = await this.collection(databaseName, collectionName);
      const values = await col.distinct(field, filter);
      return { success: true, values, error: "" };
    } catch (err) {
      return { success: false, values: [], error: mongoErrorMessage(err) };
    }
  }

  async createIndex(databaseName: string, collectionName: string, keys: IndexSpecification, unique: boolean, name: string): Promise<MongoOpResult & { indexName: string }> {
    try {
      const col = await this.collection(databaseName, collectionName);
      const options: CreateIndexesOptions = { unique, name: name || undefined };
      const indexName = await col.createIndex(keys, options);
      return { success: true, indexName, error: "" };
    } catch (err) {
      return { success: false, indexName: "", error: mongoErrorMessage(err) };
    }
  }

  async dropIndex(databaseName: string, collectionName: string, indexName: string): Promise<MongoOpResult> {
    try {
      const col = await this.collection(databaseName, collectionName);
      await col.dropIndex(indexName);
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: mongoErrorMessage(err) };
    }
  }

  async listIndexes(databaseName: string, collectionName: string): Promise<MongoOpResult & { indexes: Document[] }> {
    try {
      const col = await this.collection(databaseName, collectionName);
      const indexes = await col.listIndexes().toArray();
      return { success: true, indexes, error: "" };
    } catch (err) {
      return { success: false, indexes: [], error: mongoErrorMessage(err) };
    }
  }

  async bulkWrite(databaseName: string, collectionName: string, operations: AnyBulkWriteOperation<Document>[]): Promise<MongoOpResult & { insertedCount: number; matchedCount: number; modifiedCount: number; deletedCount: number; upsertedCount: number }> {
    try {
      const col = await this.collection(databaseName, collectionName);
      const result = await col.bulkWrite(operations);
      return { success: true, insertedCount: result.insertedCount, matchedCount: result.matchedCount, modifiedCount: result.modifiedCount, deletedCount: result.deletedCount, upsertedCount: result.upsertedCount, error: "" };
    } catch (err) {
      return { success: false, insertedCount: 0, matchedCount: 0, modifiedCount: 0, deletedCount: 0, upsertedCount: 0, error: mongoErrorMessage(err) };
    }
  }
}
