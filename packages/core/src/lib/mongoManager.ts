import { MongoClient, ObjectId, type Document, type Filter, type Sort, type UpdateFilter, type FindOneAndUpdateOptions, type FindOneAndReplaceOptions, type AnyBulkWriteOperation, type IndexSpecification, type CreateIndexesOptions } from "mongodb";
import { getDatabaseManager } from "../server/DatabaseManager.ts";
import { resolveAllCredentials } from "../server/vaultCredentials.ts";
import type { MongoConnectionStringCredentialData } from "@hermione/shared/types";

/** Every Mongo node (collections, documents, indexes, aggregation) needs the same boilerplate: get
 * a connected client from a connection string, run one driver call, and turn either a result or a
 * thrown error into a plain {success, error} shape. Centralized here once instead of repeated per
 * node (see nodes/mongo.ts, which only wires pins to these methods) -- same reasoning as
 * DynamoDbManager. Resolves its own named credential straight from the database (mirrors
 * twilioManager.ts) -- no separate functionLibraryMongo.ts env-var-reading layer. */

/** "_id" fields carrying a 24-char hex string are revived into ObjectId so filters/documents built
 * from JSON (e.g. `{"_id":"..."}` copied from a prior findOne's output) round-trip correctly --
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

export interface MongoAuth {
  connectionString: string;
  defaultDatabase: string;
}

const managerCache = new Map<string, MongoManager>();

export class MongoManager {
  private readonly client: MongoClient;
  private readonly defaultDatabase: string;
  private connecting: Promise<MongoClient> | null = null;

  private constructor(connectionString: string, defaultDatabase: string) {
    this.client = new MongoClient(connectionString);
    this.defaultDatabase = defaultDatabase;
  }

  /** Reuses one MongoManager (and its underlying MongoClient's connection pool) per distinct
   * connection string instead of reconnecting per node execution -- same reasoning as
   * DynamoDbManager.getInstance/AzureStorageManager.getInstance. */
  static getInstance(auth: MongoAuth): MongoManager {
    const cacheKey = `${auth.connectionString}::${auth.defaultDatabase}`;
    let manager = managerCache.get(cacheKey);
    if (!manager) {
      manager = new MongoManager(auth.connectionString, auth.defaultDatabase);
      managerCache.set(cacheKey, manager);
    }
    return manager;
  }

  static errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  private static async findCredential(credentialName: string): Promise<{ ok: true; auth: MongoAuth } | { ok: false; error: string }> {
    const credRecord = (await resolveAllCredentials(getDatabaseManager())).get(credentialName);
    if (!credRecord) return { ok: false, error: `Credential "${credentialName}" not found in the vault` };
    if (credRecord.type !== "mongoConnectionString") return { ok: false, error: `Credential "${credentialName}" is not a MongoDB Connection String credential` };
    const data = credRecord.data as MongoConnectionStringCredentialData;
    return { ok: true, auth: { connectionString: data.connectionString, defaultDatabase: data.defaultDatabase } };
  }

  static async listDatabases(credentialName: string): Promise<MongoOpResult & { databaseNames: string[] }> {
    const cred = await MongoManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, databaseNames: [], error: cred.error };
    return MongoManager.getInstance(cred.auth).listDatabases();
  }

  static async listCollections(credentialName: string, databaseName: string): Promise<MongoOpResult & { collectionNames: string[] }> {
    const cred = await MongoManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, collectionNames: [], error: cred.error };
    return MongoManager.getInstance(cred.auth).listCollections(databaseName);
  }

  static async createCollection(credentialName: string, databaseName: string, collectionName: string): Promise<MongoOpResult> {
    const cred = await MongoManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return MongoManager.getInstance(cred.auth).createCollection(databaseName, collectionName);
  }

  static async dropCollection(credentialName: string, databaseName: string, collectionName: string): Promise<MongoOpResult> {
    const cred = await MongoManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return MongoManager.getInstance(cred.auth).dropCollection(databaseName, collectionName);
  }

  static async dropDatabase(credentialName: string, databaseName: string): Promise<MongoOpResult> {
    const cred = await MongoManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return MongoManager.getInstance(cred.auth).dropDatabase(databaseName);
  }

  static async renameCollection(credentialName: string, databaseName: string, collectionName: string, newName: string, dropTarget: boolean): Promise<MongoOpResult> {
    const cred = await MongoManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return MongoManager.getInstance(cred.auth).renameCollection(databaseName, collectionName, newName, dropTarget);
  }

  static async insertOne(credentialName: string, databaseName: string, collectionName: string, documentJson: string): Promise<MongoOpResult & { insertedId: string }> {
    const cred = await MongoManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, insertedId: "", error: cred.error };
    return MongoManager.getInstance(cred.auth).insertOne(databaseName, collectionName, parseMongoJsonObject(documentJson));
  }

  static async insertMany(credentialName: string, databaseName: string, collectionName: string, documentsJson: string): Promise<MongoOpResult & { insertedIds: string[]; insertedCount: number }> {
    const cred = await MongoManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, insertedIds: [], insertedCount: 0, error: cred.error };
    return MongoManager.getInstance(cred.auth).insertMany(databaseName, collectionName, parseMongoJsonArray(documentsJson) as Document[]);
  }

  static async findOne(credentialName: string, databaseName: string, collectionName: string, filterJson: string, projectionJson: string, sortJson: string): Promise<MongoOpResult & { documentJson: string }> {
    const cred = await MongoManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, documentJson: "null", error: cred.error };
    const result = await MongoManager.getInstance(cred.auth).findOne(databaseName, collectionName, parseMongoJsonObject(filterJson) as Filter<Document>, parseMongoJsonObject(projectionJson), parseMongoJsonObject(sortJson) as Sort);
    return { success: result.success, documentJson: stringifyMongo(result.document), error: result.error };
  }

  static async find(credentialName: string, databaseName: string, collectionName: string, filterJson: string, projectionJson: string, sortJson: string, limit: number, skip: number): Promise<MongoOpResult & { documentsJson: string }> {
    const cred = await MongoManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, documentsJson: "[]", error: cred.error };
    const result = await MongoManager.getInstance(cred.auth).find(databaseName, collectionName, parseMongoJsonObject(filterJson) as Filter<Document>, parseMongoJsonObject(projectionJson), parseMongoJsonObject(sortJson) as Sort, limit, skip);
    return { success: result.success, documentsJson: stringifyMongo(result.documents), error: result.error };
  }

  static async countDocuments(credentialName: string, databaseName: string, collectionName: string, filterJson: string): Promise<MongoOpResult & { count: number }> {
    const cred = await MongoManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, count: 0, error: cred.error };
    return MongoManager.getInstance(cred.auth).countDocuments(databaseName, collectionName, parseMongoJsonObject(filterJson) as Filter<Document>);
  }

  static async updateOne(credentialName: string, databaseName: string, collectionName: string, filterJson: string, updateJson: string, upsert: boolean): Promise<MongoOpResult & { matchedCount: number; modifiedCount: number; upsertedId: string }> {
    const cred = await MongoManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, matchedCount: 0, modifiedCount: 0, upsertedId: "", error: cred.error };
    return MongoManager.getInstance(cred.auth).updateOne(databaseName, collectionName, parseMongoJsonObject(filterJson) as Filter<Document>, parseMongoJsonObject(updateJson) as UpdateFilter<Document>, upsert);
  }

  static async updateMany(credentialName: string, databaseName: string, collectionName: string, filterJson: string, updateJson: string, upsert: boolean): Promise<MongoOpResult & { matchedCount: number; modifiedCount: number; upsertedId: string }> {
    const cred = await MongoManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, matchedCount: 0, modifiedCount: 0, upsertedId: "", error: cred.error };
    return MongoManager.getInstance(cred.auth).updateMany(databaseName, collectionName, parseMongoJsonObject(filterJson) as Filter<Document>, parseMongoJsonObject(updateJson) as UpdateFilter<Document>, upsert);
  }

  static async replaceOne(credentialName: string, databaseName: string, collectionName: string, filterJson: string, replacementJson: string, upsert: boolean): Promise<MongoOpResult & { matchedCount: number; modifiedCount: number; upsertedId: string }> {
    const cred = await MongoManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, matchedCount: 0, modifiedCount: 0, upsertedId: "", error: cred.error };
    return MongoManager.getInstance(cred.auth).replaceOne(databaseName, collectionName, parseMongoJsonObject(filterJson) as Filter<Document>, parseMongoJsonObject(replacementJson), upsert);
  }

  static async deleteOne(credentialName: string, databaseName: string, collectionName: string, filterJson: string): Promise<MongoOpResult & { deletedCount: number }> {
    const cred = await MongoManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, deletedCount: 0, error: cred.error };
    return MongoManager.getInstance(cred.auth).deleteOne(databaseName, collectionName, parseMongoJsonObject(filterJson) as Filter<Document>);
  }

  static async deleteMany(credentialName: string, databaseName: string, collectionName: string, filterJson: string): Promise<MongoOpResult & { deletedCount: number }> {
    const cred = await MongoManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, deletedCount: 0, error: cred.error };
    return MongoManager.getInstance(cred.auth).deleteMany(databaseName, collectionName, parseMongoJsonObject(filterJson) as Filter<Document>);
  }

  static async findOneAndUpdate(credentialName: string, databaseName: string, collectionName: string, filterJson: string, updateJson: string, upsert: boolean, returnDocument: "before" | "after"): Promise<MongoOpResult & { documentJson: string }> {
    const cred = await MongoManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, documentJson: "null", error: cred.error };
    const result = await MongoManager.getInstance(cred.auth).findOneAndUpdate(databaseName, collectionName, parseMongoJsonObject(filterJson) as Filter<Document>, parseMongoJsonObject(updateJson) as UpdateFilter<Document>, upsert, returnDocument);
    return { success: result.success, documentJson: stringifyMongo(result.document), error: result.error };
  }

  static async findOneAndReplace(credentialName: string, databaseName: string, collectionName: string, filterJson: string, replacementJson: string, upsert: boolean, returnDocument: "before" | "after"): Promise<MongoOpResult & { documentJson: string }> {
    const cred = await MongoManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, documentJson: "null", error: cred.error };
    const result = await MongoManager.getInstance(cred.auth).findOneAndReplace(databaseName, collectionName, parseMongoJsonObject(filterJson) as Filter<Document>, parseMongoJsonObject(replacementJson), upsert, returnDocument);
    return { success: result.success, documentJson: stringifyMongo(result.document), error: result.error };
  }

  static async findOneAndDelete(credentialName: string, databaseName: string, collectionName: string, filterJson: string): Promise<MongoOpResult & { documentJson: string }> {
    const cred = await MongoManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, documentJson: "null", error: cred.error };
    const result = await MongoManager.getInstance(cred.auth).findOneAndDelete(databaseName, collectionName, parseMongoJsonObject(filterJson) as Filter<Document>);
    return { success: result.success, documentJson: stringifyMongo(result.document), error: result.error };
  }

  static async aggregate(credentialName: string, databaseName: string, collectionName: string, pipelineJson: string): Promise<MongoOpResult & { resultsJson: string }> {
    const cred = await MongoManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, resultsJson: "[]", error: cred.error };
    const result = await MongoManager.getInstance(cred.auth).aggregate(databaseName, collectionName, parseMongoJsonArray(pipelineJson) as Document[]);
    return { success: result.success, resultsJson: stringifyMongo(result.results), error: result.error };
  }

  static async distinct(credentialName: string, databaseName: string, collectionName: string, field: string, filterJson: string): Promise<MongoOpResult & { valuesJson: string }> {
    const cred = await MongoManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, valuesJson: "[]", error: cred.error };
    const result = await MongoManager.getInstance(cred.auth).distinct(databaseName, collectionName, field, parseMongoJsonObject(filterJson) as Filter<Document>);
    return { success: result.success, valuesJson: stringifyMongo(result.values), error: result.error };
  }

  static async createIndex(credentialName: string, databaseName: string, collectionName: string, keysJson: string, unique: boolean, name: string): Promise<MongoOpResult & { indexName: string }> {
    const cred = await MongoManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, indexName: "", error: cred.error };
    return MongoManager.getInstance(cred.auth).createIndex(databaseName, collectionName, parseMongoJsonObject(keysJson) as IndexSpecification, unique, name);
  }

  static async dropIndex(credentialName: string, databaseName: string, collectionName: string, indexName: string): Promise<MongoOpResult> {
    const cred = await MongoManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return MongoManager.getInstance(cred.auth).dropIndex(databaseName, collectionName, indexName);
  }

  static async listIndexes(credentialName: string, databaseName: string, collectionName: string): Promise<MongoOpResult & { indexesJson: string }> {
    const cred = await MongoManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, indexesJson: "[]", error: cred.error };
    const result = await MongoManager.getInstance(cred.auth).listIndexes(databaseName, collectionName);
    return { success: result.success, indexesJson: stringifyMongo(result.indexes), error: result.error };
  }

  static async bulkWrite(credentialName: string, databaseName: string, collectionName: string, operationsJson: string): Promise<MongoOpResult & { insertedCount: number; matchedCount: number; modifiedCount: number; deletedCount: number; upsertedCount: number }> {
    const cred = await MongoManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, insertedCount: 0, matchedCount: 0, modifiedCount: 0, deletedCount: 0, upsertedCount: 0, error: cred.error };
    return MongoManager.getInstance(cred.auth).bulkWrite(databaseName, collectionName, parseMongoJsonArray(operationsJson) as AnyBulkWriteOperation<Document>[]);
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

  private async listDatabases(): Promise<MongoOpResult & { databaseNames: string[] }> {
    try {
      const client = await this.connectedClient();
      const result = await client.db().admin().listDatabases();
      return { success: true, databaseNames: result.databases.map((d) => d.name), error: "" };
    } catch (err) {
      return { success: false, databaseNames: [], error: MongoManager.errorMessage(err) };
    }
  }

  private async listCollections(databaseName: string): Promise<MongoOpResult & { collectionNames: string[] }> {
    try {
      const db = await this.db(databaseName);
      const collections = await db.listCollections().toArray();
      return { success: true, collectionNames: collections.map((c) => c.name), error: "" };
    } catch (err) {
      return { success: false, collectionNames: [], error: MongoManager.errorMessage(err) };
    }
  }

  private async createCollection(databaseName: string, collectionName: string): Promise<MongoOpResult> {
    try {
      const db = await this.db(databaseName);
      await db.createCollection(collectionName);
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: MongoManager.errorMessage(err) };
    }
  }

  private async dropCollection(databaseName: string, collectionName: string): Promise<MongoOpResult> {
    try {
      const db = await this.db(databaseName);
      await db.dropCollection(collectionName);
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: MongoManager.errorMessage(err) };
    }
  }

  private async dropDatabase(databaseName: string): Promise<MongoOpResult> {
    try {
      const db = await this.db(databaseName);
      await db.dropDatabase();
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: MongoManager.errorMessage(err) };
    }
  }

  private async renameCollection(databaseName: string, collectionName: string, newName: string, dropTarget: boolean): Promise<MongoOpResult> {
    try {
      const db = await this.db(databaseName);
      await db.renameCollection(collectionName, newName, { dropTarget });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: MongoManager.errorMessage(err) };
    }
  }

  private async insertOne(databaseName: string, collectionName: string, document: Document): Promise<MongoOpResult & { insertedId: string }> {
    try {
      const col = await this.collection(databaseName, collectionName);
      const result = await col.insertOne(document);
      return { success: true, insertedId: result.insertedId.toHexString(), error: "" };
    } catch (err) {
      return { success: false, insertedId: "", error: MongoManager.errorMessage(err) };
    }
  }

  private async insertMany(databaseName: string, collectionName: string, documents: Document[]): Promise<MongoOpResult & { insertedIds: string[]; insertedCount: number }> {
    try {
      const col = await this.collection(databaseName, collectionName);
      const result = await col.insertMany(documents);
      return { success: true, insertedIds: Object.values(result.insertedIds).map((id) => id.toHexString()), insertedCount: result.insertedCount, error: "" };
    } catch (err) {
      return { success: false, insertedIds: [], insertedCount: 0, error: MongoManager.errorMessage(err) };
    }
  }

  private async findOne(databaseName: string, collectionName: string, filter: Filter<Document>, projection: Document, sort: Sort): Promise<MongoOpResult & { document: Document | null }> {
    try {
      const col = await this.collection(databaseName, collectionName);
      const document = await col.findOne(filter, { projection, sort });
      return { success: true, document: document ?? null, error: "" };
    } catch (err) {
      return { success: false, document: null, error: MongoManager.errorMessage(err) };
    }
  }

  private async find(databaseName: string, collectionName: string, filter: Filter<Document>, projection: Document, sort: Sort, limit: number, skip: number): Promise<MongoOpResult & { documents: Document[] }> {
    try {
      const col = await this.collection(databaseName, collectionName);
      let cursor = col.find(filter, { projection, sort });
      if (skip > 0) cursor = cursor.skip(skip);
      if (limit > 0) cursor = cursor.limit(limit);
      const documents = await cursor.toArray();
      return { success: true, documents, error: "" };
    } catch (err) {
      return { success: false, documents: [], error: MongoManager.errorMessage(err) };
    }
  }

  private async countDocuments(databaseName: string, collectionName: string, filter: Filter<Document>): Promise<MongoOpResult & { count: number }> {
    try {
      const col = await this.collection(databaseName, collectionName);
      const count = await col.countDocuments(filter);
      return { success: true, count, error: "" };
    } catch (err) {
      return { success: false, count: 0, error: MongoManager.errorMessage(err) };
    }
  }

  private async updateOne(databaseName: string, collectionName: string, filter: Filter<Document>, update: UpdateFilter<Document> | Document[], upsert: boolean): Promise<MongoOpResult & { matchedCount: number; modifiedCount: number; upsertedId: string }> {
    try {
      const col = await this.collection(databaseName, collectionName);
      const result = await col.updateOne(filter, update, { upsert });
      return { success: true, matchedCount: result.matchedCount, modifiedCount: result.modifiedCount, upsertedId: result.upsertedId?.toHexString() ?? "", error: "" };
    } catch (err) {
      return { success: false, matchedCount: 0, modifiedCount: 0, upsertedId: "", error: MongoManager.errorMessage(err) };
    }
  }

  private async updateMany(databaseName: string, collectionName: string, filter: Filter<Document>, update: UpdateFilter<Document> | Document[], upsert: boolean): Promise<MongoOpResult & { matchedCount: number; modifiedCount: number; upsertedId: string }> {
    try {
      const col = await this.collection(databaseName, collectionName);
      const result = await col.updateMany(filter, update, { upsert });
      return { success: true, matchedCount: result.matchedCount, modifiedCount: result.modifiedCount, upsertedId: result.upsertedId?.toHexString() ?? "", error: "" };
    } catch (err) {
      return { success: false, matchedCount: 0, modifiedCount: 0, upsertedId: "", error: MongoManager.errorMessage(err) };
    }
  }

  private async replaceOne(databaseName: string, collectionName: string, filter: Filter<Document>, replacement: Document, upsert: boolean): Promise<MongoOpResult & { matchedCount: number; modifiedCount: number; upsertedId: string }> {
    try {
      const col = await this.collection(databaseName, collectionName);
      const result = await col.replaceOne(filter, replacement, { upsert });
      return { success: true, matchedCount: result.matchedCount, modifiedCount: result.modifiedCount, upsertedId: result.upsertedId?.toHexString() ?? "", error: "" };
    } catch (err) {
      return { success: false, matchedCount: 0, modifiedCount: 0, upsertedId: "", error: MongoManager.errorMessage(err) };
    }
  }

  private async deleteOne(databaseName: string, collectionName: string, filter: Filter<Document>): Promise<MongoOpResult & { deletedCount: number }> {
    try {
      const col = await this.collection(databaseName, collectionName);
      const result = await col.deleteOne(filter);
      return { success: true, deletedCount: result.deletedCount ?? 0, error: "" };
    } catch (err) {
      return { success: false, deletedCount: 0, error: MongoManager.errorMessage(err) };
    }
  }

  private async deleteMany(databaseName: string, collectionName: string, filter: Filter<Document>): Promise<MongoOpResult & { deletedCount: number }> {
    try {
      const col = await this.collection(databaseName, collectionName);
      const result = await col.deleteMany(filter);
      return { success: true, deletedCount: result.deletedCount ?? 0, error: "" };
    } catch (err) {
      return { success: false, deletedCount: 0, error: MongoManager.errorMessage(err) };
    }
  }

  private async findOneAndUpdate(databaseName: string, collectionName: string, filter: Filter<Document>, update: UpdateFilter<Document> | Document[], upsert: boolean, returnDocument: "before" | "after"): Promise<MongoOpResult & { document: Document | null }> {
    try {
      const col = await this.collection(databaseName, collectionName);
      const options: FindOneAndUpdateOptions = { upsert, returnDocument, includeResultMetadata: false };
      const document = await col.findOneAndUpdate(filter, update, options);
      return { success: true, document: document ?? null, error: "" };
    } catch (err) {
      return { success: false, document: null, error: MongoManager.errorMessage(err) };
    }
  }

  private async findOneAndReplace(databaseName: string, collectionName: string, filter: Filter<Document>, replacement: Document, upsert: boolean, returnDocument: "before" | "after"): Promise<MongoOpResult & { document: Document | null }> {
    try {
      const col = await this.collection(databaseName, collectionName);
      const options: FindOneAndReplaceOptions = { upsert, returnDocument, includeResultMetadata: false };
      const document = await col.findOneAndReplace(filter, replacement, options);
      return { success: true, document: document ?? null, error: "" };
    } catch (err) {
      return { success: false, document: null, error: MongoManager.errorMessage(err) };
    }
  }

  private async findOneAndDelete(databaseName: string, collectionName: string, filter: Filter<Document>): Promise<MongoOpResult & { document: Document | null }> {
    try {
      const col = await this.collection(databaseName, collectionName);
      const document = await col.findOneAndDelete(filter, { includeResultMetadata: false });
      return { success: true, document: document ?? null, error: "" };
    } catch (err) {
      return { success: false, document: null, error: MongoManager.errorMessage(err) };
    }
  }

  private async aggregate(databaseName: string, collectionName: string, pipeline: Document[]): Promise<MongoOpResult & { results: Document[] }> {
    try {
      const col = await this.collection(databaseName, collectionName);
      const results = await col.aggregate(pipeline).toArray();
      return { success: true, results, error: "" };
    } catch (err) {
      return { success: false, results: [], error: MongoManager.errorMessage(err) };
    }
  }

  private async distinct(databaseName: string, collectionName: string, field: string, filter: Filter<Document>): Promise<MongoOpResult & { values: unknown[] }> {
    try {
      const col = await this.collection(databaseName, collectionName);
      const values = await col.distinct(field, filter);
      return { success: true, values, error: "" };
    } catch (err) {
      return { success: false, values: [], error: MongoManager.errorMessage(err) };
    }
  }

  private async createIndex(databaseName: string, collectionName: string, keys: IndexSpecification, unique: boolean, name: string): Promise<MongoOpResult & { indexName: string }> {
    try {
      const col = await this.collection(databaseName, collectionName);
      const options: CreateIndexesOptions = { unique, name: name || undefined };
      const indexName = await col.createIndex(keys, options);
      return { success: true, indexName, error: "" };
    } catch (err) {
      return { success: false, indexName: "", error: MongoManager.errorMessage(err) };
    }
  }

  private async dropIndex(databaseName: string, collectionName: string, indexName: string): Promise<MongoOpResult> {
    try {
      const col = await this.collection(databaseName, collectionName);
      await col.dropIndex(indexName);
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: MongoManager.errorMessage(err) };
    }
  }

  private async listIndexes(databaseName: string, collectionName: string): Promise<MongoOpResult & { indexes: Document[] }> {
    try {
      const col = await this.collection(databaseName, collectionName);
      const indexes = await col.listIndexes().toArray();
      return { success: true, indexes, error: "" };
    } catch (err) {
      return { success: false, indexes: [], error: MongoManager.errorMessage(err) };
    }
  }

  private async bulkWrite(databaseName: string, collectionName: string, operations: AnyBulkWriteOperation<Document>[]): Promise<MongoOpResult & { insertedCount: number; matchedCount: number; modifiedCount: number; deletedCount: number; upsertedCount: number }> {
    try {
      const col = await this.collection(databaseName, collectionName);
      const result = await col.bulkWrite(operations);
      return { success: true, insertedCount: result.insertedCount, matchedCount: result.matchedCount, modifiedCount: result.modifiedCount, deletedCount: result.deletedCount, upsertedCount: result.upsertedCount, error: "" };
    } catch (err) {
      return { success: false, insertedCount: 0, matchedCount: 0, modifiedCount: 0, deletedCount: 0, upsertedCount: 0, error: MongoManager.errorMessage(err) };
    }
  }
}
