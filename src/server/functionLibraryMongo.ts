import { MongoManager, parseMongoJsonArray, parseMongoJsonObject, stringifyMongo } from "../lib/mongoManager.ts";
import type { Document, Filter, Sort, UpdateFilter, AnyBulkWriteOperation, IndexSpecification } from "mongodb";

/** Compile-time-only counterpart of nodes/mongo.ts's execute() vault lookup (resolveMongoCredential)
 * \u2014 the compiled/deployed script has no access to the Credential Vault database, only the
 * interpreter does, so it reads the same credential's connection string back from environment
 * variables instead, the same "HERMIONE_CRED_<NAME>_<FIELD>" naming credentialEnv.ts's
 * applyCredentialEnvVars writes. Never called by the interpreter \u2014 genuinely different
 * credential-sourcing behavior, not duplicated logic. */
function mongoManagerFromEnv(credentialName: string): { ok: true; manager: MongoManager } | { ok: false; error: string } {
  const prefix = `HERMIONE_CRED_${String(credentialName)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")}`;
  const type = process.env[`${prefix}_CREDENTIAL_TYPE`];
  if (type !== "mongoConnectionString") return { ok: false, error: `Credential "${credentialName}" not found in the vault, or is not a MongoDB Connection String credential` };
  return { ok: true, manager: MongoManager.forCredential(process.env[`${prefix}_CONNECTION_STRING`] || "", process.env[`${prefix}_DEFAULT_DATABASE`] || "") };
}

export async function mongoListDatabases(credentialName: string) {
  const cred = mongoManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, databaseNames: [], error: cred.error };
  return cred.manager.listDatabases();
}

export async function mongoListCollections(credentialName: string, database: string) {
  const cred = mongoManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, collectionNames: [], error: cred.error };
  return cred.manager.listCollections(database);
}

export async function mongoCreateCollection(credentialName: string, database: string, collection: string) {
  const cred = mongoManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.createCollection(database, collection);
}

export async function mongoDropCollection(credentialName: string, database: string, collection: string) {
  const cred = mongoManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.dropCollection(database, collection);
}

export async function mongoDropDatabase(credentialName: string, database: string) {
  const cred = mongoManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.dropDatabase(database);
}

export async function mongoRenameCollection(credentialName: string, database: string, collection: string, newName: string, dropTarget: boolean) {
  const cred = mongoManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.renameCollection(database, collection, newName, dropTarget);
}

export async function mongoInsertOne(credentialName: string, database: string, collection: string, documentJson: string) {
  const cred = mongoManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, insertedId: "", error: cred.error };
  return cred.manager.insertOne(database, collection, parseMongoJsonObject(documentJson));
}

export async function mongoInsertMany(credentialName: string, database: string, collection: string, documentsJson: string) {
  const cred = mongoManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, insertedIds: [], insertedCount: 0, error: cred.error };
  return cred.manager.insertMany(database, collection, parseMongoJsonArray(documentsJson) as Document[]);
}

export async function mongoFindOne(credentialName: string, database: string, collection: string, filterJson: string, projectionJson: string, sortJson: string) {
  const cred = mongoManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, documentJson: "null", error: cred.error };
  const result = await cred.manager.findOne(database, collection, parseMongoJsonObject(filterJson) as Filter<Document>, parseMongoJsonObject(projectionJson), parseMongoJsonObject(sortJson) as Sort);
  return { success: result.success, documentJson: stringifyMongo(result.document), error: result.error };
}

export async function mongoFind(credentialName: string, database: string, collection: string, filterJson: string, projectionJson: string, sortJson: string, limit: number, skip: number) {
  const cred = mongoManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, documentsJson: "[]", error: cred.error };
  const result = await cred.manager.find(database, collection, parseMongoJsonObject(filterJson) as Filter<Document>, parseMongoJsonObject(projectionJson), parseMongoJsonObject(sortJson) as Sort, limit, skip);
  return { success: result.success, documentsJson: stringifyMongo(result.documents), error: result.error };
}

export async function mongoCountDocuments(credentialName: string, database: string, collection: string, filterJson: string) {
  const cred = mongoManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, count: 0, error: cred.error };
  return cred.manager.countDocuments(database, collection, parseMongoJsonObject(filterJson) as Filter<Document>);
}

export async function mongoUpdateOne(credentialName: string, database: string, collection: string, filterJson: string, updateJson: string, upsert: boolean) {
  const cred = mongoManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, matchedCount: 0, modifiedCount: 0, upsertedId: "", error: cred.error };
  return cred.manager.updateOne(database, collection, parseMongoJsonObject(filterJson) as Filter<Document>, parseMongoJsonObject(updateJson) as UpdateFilter<Document>, upsert);
}

export async function mongoUpdateMany(credentialName: string, database: string, collection: string, filterJson: string, updateJson: string, upsert: boolean) {
  const cred = mongoManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, matchedCount: 0, modifiedCount: 0, upsertedId: "", error: cred.error };
  return cred.manager.updateMany(database, collection, parseMongoJsonObject(filterJson) as Filter<Document>, parseMongoJsonObject(updateJson) as UpdateFilter<Document>, upsert);
}

export async function mongoReplaceOne(credentialName: string, database: string, collection: string, filterJson: string, replacementJson: string, upsert: boolean) {
  const cred = mongoManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, matchedCount: 0, modifiedCount: 0, upsertedId: "", error: cred.error };
  return cred.manager.replaceOne(database, collection, parseMongoJsonObject(filterJson) as Filter<Document>, parseMongoJsonObject(replacementJson), upsert);
}

export async function mongoDeleteOne(credentialName: string, database: string, collection: string, filterJson: string) {
  const cred = mongoManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, deletedCount: 0, error: cred.error };
  return cred.manager.deleteOne(database, collection, parseMongoJsonObject(filterJson) as Filter<Document>);
}

export async function mongoDeleteMany(credentialName: string, database: string, collection: string, filterJson: string) {
  const cred = mongoManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, deletedCount: 0, error: cred.error };
  return cred.manager.deleteMany(database, collection, parseMongoJsonObject(filterJson) as Filter<Document>);
}

export async function mongoFindOneAndUpdate(credentialName: string, database: string, collection: string, filterJson: string, updateJson: string, upsert: boolean, returnDocument: "before" | "after") {
  const cred = mongoManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, documentJson: "null", error: cred.error };
  const result = await cred.manager.findOneAndUpdate(database, collection, parseMongoJsonObject(filterJson) as Filter<Document>, parseMongoJsonObject(updateJson) as UpdateFilter<Document>, upsert, returnDocument);
  return { success: result.success, documentJson: stringifyMongo(result.document), error: result.error };
}

export async function mongoFindOneAndReplace(credentialName: string, database: string, collection: string, filterJson: string, replacementJson: string, upsert: boolean, returnDocument: "before" | "after") {
  const cred = mongoManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, documentJson: "null", error: cred.error };
  const result = await cred.manager.findOneAndReplace(database, collection, parseMongoJsonObject(filterJson) as Filter<Document>, parseMongoJsonObject(replacementJson), upsert, returnDocument);
  return { success: result.success, documentJson: stringifyMongo(result.document), error: result.error };
}

export async function mongoFindOneAndDelete(credentialName: string, database: string, collection: string, filterJson: string) {
  const cred = mongoManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, documentJson: "null", error: cred.error };
  const result = await cred.manager.findOneAndDelete(database, collection, parseMongoJsonObject(filterJson) as Filter<Document>);
  return { success: result.success, documentJson: stringifyMongo(result.document), error: result.error };
}

export async function mongoAggregate(credentialName: string, database: string, collection: string, pipelineJson: string) {
  const cred = mongoManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, resultsJson: "[]", error: cred.error };
  const result = await cred.manager.aggregate(database, collection, parseMongoJsonArray(pipelineJson) as Document[]);
  return { success: result.success, resultsJson: stringifyMongo(result.results), error: result.error };
}

export async function mongoDistinct(credentialName: string, database: string, collection: string, field: string, filterJson: string) {
  const cred = mongoManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, valuesJson: "[]", error: cred.error };
  const result = await cred.manager.distinct(database, collection, field, parseMongoJsonObject(filterJson) as Filter<Document>);
  return { success: result.success, valuesJson: stringifyMongo(result.values), error: result.error };
}

export async function mongoCreateIndex(credentialName: string, database: string, collection: string, keysJson: string, unique: boolean, name: string) {
  const cred = mongoManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, indexName: "", error: cred.error };
  return cred.manager.createIndex(database, collection, parseMongoJsonObject(keysJson) as IndexSpecification, unique, name);
}

export async function mongoDropIndex(credentialName: string, database: string, collection: string, indexName: string) {
  const cred = mongoManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.dropIndex(database, collection, indexName);
}

export async function mongoListIndexes(credentialName: string, database: string, collection: string) {
  const cred = mongoManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, indexesJson: "[]", error: cred.error };
  const result = await cred.manager.listIndexes(database, collection);
  return { success: result.success, indexesJson: stringifyMongo(result.indexes), error: result.error };
}

export async function mongoBulkWrite(credentialName: string, database: string, collection: string, operationsJson: string) {
  const cred = mongoManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, insertedCount: 0, matchedCount: 0, modifiedCount: 0, deletedCount: 0, upsertedCount: 0, error: cred.error };
  return cred.manager.bulkWrite(database, collection, parseMongoJsonArray(operationsJson) as AnyBulkWriteOperation<Document>[]);
}
