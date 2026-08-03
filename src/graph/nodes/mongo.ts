import { NodeColorCategory, type ExecutionContext } from "../engine/types";
import { registerNode } from "../engine/registry";
import { compileResultVar, FUNCTION_LIBRARY_MONGO_IMPORT } from "../engine/compileUtils";
import { MongoManager, parseMongoJsonArray, parseMongoJsonObject, stringifyMongo } from "../../lib/mongoManager";
import type { MongoConnectionStringCredentialData } from "../../credentials/types";
import { MONGO_RETURN_DOCUMENT_ENUM_TYPE } from "../enum/mongo";
import { enumOptionIds } from "../engine/enumRegistry";
import { i18n } from "@i18n";
import type { Document, Filter, Sort, UpdateFilter, AnyBulkWriteOperation, IndexSpecification } from "mongodb";

// Every operation below is a thin pin-wiring shim over MongoManager (src/lib/mongoManager.ts), which
// owns the actual driver calls and error normalization — this file only ever translates pins to
// method arguments and method results back to pins.
//
// Every operation node takes a Credential Name directly (no separate auth/connect node): each
// resolves the named vault entry and hands its connection string to MongoManager.forCredential,
// which caches the underlying MongoClient (and its connection pool) — see mongoManager.ts.
//
// Filters/documents/updates/pipelines with dynamic shapes are carried as JSON string pins rather
// than "map"/"struct" pins, since MongoDB documents can be arbitrarily nested — same convention as
// AwsdynamoDb.ts's item/key/expression pins.
//
// Every node here also has a compileExecute: the compiled path calls a same-named
// `functionLibraryMongo.mongo*` wrapper (see server/functionLibraryMongo.ts), which reads the
// credential's connection string back from environment variables instead of the vault — same split
// as AwsdynamoDb.ts's execute()/compileExecute().

const GROUP_NAME = "Request.MongoDB";

function parseJsonObject(json: unknown): Record<string, unknown> {
  return parseMongoJsonObject(String(json ?? ""));
}

function parseJsonArray(json: unknown): unknown[] {
  return parseMongoJsonArray(String(json ?? ""));
}

function credentialNamePin() {
  return { id: "credentialName", label: i18n.nodes.mongo.__shared.pin_credential_name, type: "string" as const, direction: "input" as const, defaultValue: "" };
}

function databasePin() {
  return { id: "database", label: i18n.nodes.mongo.__shared.pin_database, type: "string" as const, direction: "input" as const, defaultValue: "" };
}

function collectionPin() {
  return { id: "collection", label: i18n.nodes.mongo.__shared.pin_collection, type: "string" as const, direction: "input" as const, defaultValue: "" };
}

function filterPin() {
  return { id: "filter", label: i18n.nodes.mongo.__shared.pin_filter, type: "string" as const, direction: "input" as const, defaultValue: "{}" };
}

function upsertPin() {
  return { id: "upsert", label: i18n.nodes.mongo.__shared.pin_upsert, type: "boolean" as const, direction: "input" as const, defaultValue: false };
}

function documentOutPin() {
  return { id: "document", label: i18n.nodes.mongo.__shared.pin_document, type: "string" as const, direction: "output" as const };
}

function matchedModifiedPins() {
  return [
    { id: "matchedCount", label: i18n.nodes.mongo.__shared.pin_matched_count, type: "number" as const, direction: "output" as const },
    { id: "modifiedCount", label: i18n.nodes.mongo.__shared.pin_modified_count, type: "number" as const, direction: "output" as const },
    { id: "upsertedId", label: i18n.nodes.mongo.__shared.pin_upserted_id, type: "string" as const, direction: "output" as const },
  ];
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

/** Shared by every Mongo node — looks up a named Credential Vault entry and returns its connection
 * string data, or a clear error if the name is wrong/missing. */
function resolveMongoCredential(ctx: ExecutionContext, credentialName: string): { ok: true; data: MongoConnectionStringCredentialData } | { ok: false; error: string } {
  const credential = ctx.getCredential?.(credentialName);
  if (!credential) return { ok: false, error: `Credential "${credentialName}" not found in the vault` };
  if (credential.type !== "mongoConnectionString") return { ok: false, error: `Credential "${credentialName}" is not a MongoDB Connection String credential` };
  return { ok: true, data: credential.data as MongoConnectionStringCredentialData };
}

function managerFor(ctx: ExecutionContext, credentialName: string): { ok: true; manager: MongoManager } | { ok: false; error: string } {
  const resolved = resolveMongoCredential(ctx, credentialName);
  if (!resolved.ok) return resolved;
  const data = resolved.data;
  return { ok: true, manager: MongoManager.forCredential(data.connectionString, data.defaultDatabase) };
}

registerNode({
  type: "mongo.listDatabases",
  label: i18n.nodes.mongo.listDatabases.label,
  description: i18n.nodes.mongo.listDatabases.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), execOutPin(), successPin(), { id: "databaseNames", label: i18n.nodes.mongo.listDatabases.pin_database_names, type: "string", container: "array", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, databaseNames: [], error: resolved.error } };
    const result = await resolved.manager.listDatabases();
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryMongo.mongoListDatabases(${inputs.credentialName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, databaseNames: `${v}.databaseNames`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_MONGO_IMPORT],
});

registerNode({
  type: "mongo.listCollections",
  label: i18n.nodes.mongo.listCollections.label,
  description: i18n.nodes.mongo.listCollections.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), databasePin(), execOutPin(), successPin(), { id: "collectionNames", label: i18n.nodes.mongo.listCollections.pin_collection_names, type: "string", container: "array", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, collectionNames: [], error: resolved.error } };
    const result = await resolved.manager.listCollections(String(inputs.database ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryMongo.mongoListCollections(${inputs.credentialName}, ${inputs.database});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, collectionNames: `${v}.collectionNames`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_MONGO_IMPORT],
});

registerNode({
  type: "mongo.createCollection",
  label: i18n.nodes.mongo.createCollection.label,
  description: i18n.nodes.mongo.createCollection.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), databasePin(), collectionPin(), execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const result = await resolved.manager.createCollection(String(inputs.database ?? ""), String(inputs.collection ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryMongo.mongoCreateCollection(${inputs.credentialName}, ${inputs.database}, ${inputs.collection});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_MONGO_IMPORT],
});

registerNode({
  type: "mongo.dropCollection",
  label: i18n.nodes.mongo.dropCollection.label,
  description: i18n.nodes.mongo.dropCollection.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), databasePin(), collectionPin(), execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const result = await resolved.manager.dropCollection(String(inputs.database ?? ""), String(inputs.collection ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryMongo.mongoDropCollection(${inputs.credentialName}, ${inputs.database}, ${inputs.collection});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_MONGO_IMPORT],
});

registerNode({
  type: "mongo.dropDatabase",
  label: i18n.nodes.mongo.dropDatabase.label,
  description: i18n.nodes.mongo.dropDatabase.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), databasePin(), execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const result = await resolved.manager.dropDatabase(String(inputs.database ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryMongo.mongoDropDatabase(${inputs.credentialName}, ${inputs.database});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_MONGO_IMPORT],
});

registerNode({
  type: "mongo.renameCollection",
  label: i18n.nodes.mongo.renameCollection.label,
  description: i18n.nodes.mongo.renameCollection.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    databasePin(),
    collectionPin(),
    { id: "newName", label: i18n.nodes.mongo.renameCollection.pin_new_name, type: "string", direction: "input", defaultValue: "" },
    { id: "dropTarget", label: i18n.nodes.mongo.renameCollection.pin_drop_target, type: "boolean", direction: "input", defaultValue: false },
    execOutPin(),
    successPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const result = await resolved.manager.renameCollection(String(inputs.database ?? ""), String(inputs.collection ?? ""), String(inputs.newName ?? ""), Boolean(inputs.dropTarget));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryMongo.mongoRenameCollection(${inputs.credentialName}, ${inputs.database}, ${inputs.collection}, ${inputs.newName}, ${inputs.dropTarget});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_MONGO_IMPORT],
});

registerNode({
  type: "mongo.insertOne",
  label: i18n.nodes.mongo.insertOne.label,
  description: i18n.nodes.mongo.insertOne.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    databasePin(),
    collectionPin(),
    { id: "document", label: i18n.nodes.mongo.__shared.pin_document, type: "string", direction: "input", defaultValue: "{}" },
    execOutPin(),
    successPin(),
    { id: "insertedId", label: i18n.nodes.mongo.__shared.pin_inserted_id, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, insertedId: "", error: resolved.error } };
    const result = await resolved.manager.insertOne(String(inputs.database ?? ""), String(inputs.collection ?? ""), parseJsonObject(inputs.document) as Document);
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryMongo.mongoInsertOne(${inputs.credentialName}, ${inputs.database}, ${inputs.collection}, ${inputs.document});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, insertedId: `${v}.insertedId`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_MONGO_IMPORT],
});

registerNode({
  type: "mongo.insertMany",
  label: i18n.nodes.mongo.insertMany.label,
  description: i18n.nodes.mongo.insertMany.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    databasePin(),
    collectionPin(),
    { id: "documents", label: i18n.nodes.mongo.insertMany.pin_documents, type: "string", direction: "input", defaultValue: "[]" },
    execOutPin(),
    successPin(),
    { id: "insertedIds", label: i18n.nodes.mongo.insertMany.pin_inserted_ids, type: "string", container: "array", direction: "output" },
    { id: "insertedCount", label: i18n.nodes.mongo.__shared.pin_count, type: "number", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, insertedIds: [], insertedCount: 0, error: resolved.error } };
    const result = await resolved.manager.insertMany(String(inputs.database ?? ""), String(inputs.collection ?? ""), parseJsonArray(inputs.documents) as Document[]);
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryMongo.mongoInsertMany(${inputs.credentialName}, ${inputs.database}, ${inputs.collection}, ${inputs.documents});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, insertedIds: `${v}.insertedIds`, insertedCount: `${v}.insertedCount`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_MONGO_IMPORT],
});

registerNode({
  type: "mongo.findOne",
  label: i18n.nodes.mongo.findOne.label,
  description: i18n.nodes.mongo.findOne.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    databasePin(),
    collectionPin(),
    filterPin(),
    { id: "projection", label: i18n.nodes.mongo.__shared.pin_projection, type: "string", direction: "input", defaultValue: "{}" },
    { id: "sort", label: i18n.nodes.mongo.__shared.pin_sort, type: "string", direction: "input", defaultValue: "{}" },
    execOutPin(),
    successPin(),
    documentOutPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, document: "null", error: resolved.error } };
    const result = await resolved.manager.findOne(String(inputs.database ?? ""), String(inputs.collection ?? ""), parseJsonObject(inputs.filter) as Filter<Document>, parseJsonObject(inputs.projection), parseJsonObject(inputs.sort) as Sort);
    return { nextExec: "exec-out", outputs: { success: result.success, document: stringifyMongo(result.document), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryMongo.mongoFindOne(${inputs.credentialName}, ${inputs.database}, ${inputs.collection}, ${inputs.filter}, ${inputs.projection}, ${inputs.sort});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, document: `${v}.documentJson`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_MONGO_IMPORT],
});

registerNode({
  type: "mongo.find",
  label: i18n.nodes.mongo.find.label,
  description: i18n.nodes.mongo.find.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    databasePin(),
    collectionPin(),
    filterPin(),
    { id: "projection", label: i18n.nodes.mongo.__shared.pin_projection, type: "string", direction: "input", defaultValue: "{}" },
    { id: "sort", label: i18n.nodes.mongo.__shared.pin_sort, type: "string", direction: "input", defaultValue: "{}" },
    { id: "limit", label: i18n.nodes.mongo.__shared.pin_limit, type: "number", direction: "input", defaultValue: 0, integer: true },
    { id: "skip", label: i18n.nodes.mongo.__shared.pin_skip, type: "number", direction: "input", defaultValue: 0, integer: true },
    execOutPin(),
    successPin(),
    { id: "documents", label: i18n.nodes.mongo.__shared.pin_documents, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, documents: "[]", error: resolved.error } };
    const result = await resolved.manager.find(String(inputs.database ?? ""), String(inputs.collection ?? ""), parseJsonObject(inputs.filter) as Filter<Document>, parseJsonObject(inputs.projection), parseJsonObject(inputs.sort) as Sort, Number(inputs.limit) || 0, Number(inputs.skip) || 0);
    return { nextExec: "exec-out", outputs: { success: result.success, documents: stringifyMongo(result.documents), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await functionLibraryMongo.mongoFind(${inputs.credentialName}, ${inputs.database}, ${inputs.collection}, ${inputs.filter}, ${inputs.projection}, ${inputs.sort}, ${inputs.limit}, ${inputs.skip});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, documents: `${v}.documentsJson`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_MONGO_IMPORT],
});

registerNode({
  type: "mongo.countDocuments",
  label: i18n.nodes.mongo.countDocuments.label,
  description: i18n.nodes.mongo.countDocuments.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), databasePin(), collectionPin(), filterPin(), execOutPin(), successPin(), { id: "count", label: i18n.nodes.mongo.__shared.pin_count, type: "number", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, count: 0, error: resolved.error } };
    const result = await resolved.manager.countDocuments(String(inputs.database ?? ""), String(inputs.collection ?? ""), parseJsonObject(inputs.filter) as Filter<Document>);
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryMongo.mongoCountDocuments(${inputs.credentialName}, ${inputs.database}, ${inputs.collection}, ${inputs.filter});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, count: `${v}.count`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_MONGO_IMPORT],
});

registerNode({
  type: "mongo.updateOne",
  label: i18n.nodes.mongo.updateOne.label,
  description: i18n.nodes.mongo.updateOne.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), databasePin(), collectionPin(), filterPin(), { id: "update", label: i18n.nodes.mongo.__shared.pin_update, type: "string", direction: "input", defaultValue: "{}" }, upsertPin(), execOutPin(), successPin(), ...matchedModifiedPins(), errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, matchedCount: 0, modifiedCount: 0, upsertedId: "", error: resolved.error } };
    const result = await resolved.manager.updateOne(String(inputs.database ?? ""), String(inputs.collection ?? ""), parseJsonObject(inputs.filter) as Filter<Document>, parseJsonObject(inputs.update) as UpdateFilter<Document>, Boolean(inputs.upsert));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryMongo.mongoUpdateOne(${inputs.credentialName}, ${inputs.database}, ${inputs.collection}, ${inputs.filter}, ${inputs.update}, ${inputs.upsert});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, matchedCount: `${v}.matchedCount`, modifiedCount: `${v}.modifiedCount`, upsertedId: `${v}.upsertedId`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_MONGO_IMPORT],
});

registerNode({
  type: "mongo.updateMany",
  label: i18n.nodes.mongo.updateMany.label,
  description: i18n.nodes.mongo.updateMany.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), databasePin(), collectionPin(), filterPin(), { id: "update", label: i18n.nodes.mongo.__shared.pin_update, type: "string", direction: "input", defaultValue: "{}" }, upsertPin(), execOutPin(), successPin(), ...matchedModifiedPins(), errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, matchedCount: 0, modifiedCount: 0, upsertedId: "", error: resolved.error } };
    const result = await resolved.manager.updateMany(String(inputs.database ?? ""), String(inputs.collection ?? ""), parseJsonObject(inputs.filter) as Filter<Document>, parseJsonObject(inputs.update) as UpdateFilter<Document>, Boolean(inputs.upsert));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryMongo.mongoUpdateMany(${inputs.credentialName}, ${inputs.database}, ${inputs.collection}, ${inputs.filter}, ${inputs.update}, ${inputs.upsert});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, matchedCount: `${v}.matchedCount`, modifiedCount: `${v}.modifiedCount`, upsertedId: `${v}.upsertedId`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_MONGO_IMPORT],
});

registerNode({
  type: "mongo.replaceOne",
  label: i18n.nodes.mongo.replaceOne.label,
  description: i18n.nodes.mongo.replaceOne.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), databasePin(), collectionPin(), filterPin(), { id: "replacement", label: i18n.nodes.mongo.__shared.pin_replacement, type: "string", direction: "input", defaultValue: "{}" }, upsertPin(), execOutPin(), successPin(), ...matchedModifiedPins(), errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, matchedCount: 0, modifiedCount: 0, upsertedId: "", error: resolved.error } };
    const result = await resolved.manager.replaceOne(String(inputs.database ?? ""), String(inputs.collection ?? ""), parseJsonObject(inputs.filter) as Filter<Document>, parseJsonObject(inputs.replacement) as Document, Boolean(inputs.upsert));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryMongo.mongoReplaceOne(${inputs.credentialName}, ${inputs.database}, ${inputs.collection}, ${inputs.filter}, ${inputs.replacement}, ${inputs.upsert});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, matchedCount: `${v}.matchedCount`, modifiedCount: `${v}.modifiedCount`, upsertedId: `${v}.upsertedId`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_MONGO_IMPORT],
});

registerNode({
  type: "mongo.deleteOne",
  label: i18n.nodes.mongo.deleteOne.label,
  description: i18n.nodes.mongo.deleteOne.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), databasePin(), collectionPin(), filterPin(), execOutPin(), successPin(), { id: "deletedCount", label: i18n.nodes.mongo.__shared.pin_deleted_count, type: "number", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, deletedCount: 0, error: resolved.error } };
    const result = await resolved.manager.deleteOne(String(inputs.database ?? ""), String(inputs.collection ?? ""), parseJsonObject(inputs.filter) as Filter<Document>);
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryMongo.mongoDeleteOne(${inputs.credentialName}, ${inputs.database}, ${inputs.collection}, ${inputs.filter});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, deletedCount: `${v}.deletedCount`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_MONGO_IMPORT],
});

registerNode({
  type: "mongo.deleteMany",
  label: i18n.nodes.mongo.deleteMany.label,
  description: i18n.nodes.mongo.deleteMany.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), databasePin(), collectionPin(), filterPin(), execOutPin(), successPin(), { id: "deletedCount", label: i18n.nodes.mongo.__shared.pin_deleted_count, type: "number", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, deletedCount: 0, error: resolved.error } };
    const result = await resolved.manager.deleteMany(String(inputs.database ?? ""), String(inputs.collection ?? ""), parseJsonObject(inputs.filter) as Filter<Document>);
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryMongo.mongoDeleteMany(${inputs.credentialName}, ${inputs.database}, ${inputs.collection}, ${inputs.filter});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, deletedCount: `${v}.deletedCount`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_MONGO_IMPORT],
});

registerNode({
  type: "mongo.findOneAndUpdate",
  label: i18n.nodes.mongo.findOneAndUpdate.label,
  description: i18n.nodes.mongo.findOneAndUpdate.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    databasePin(),
    collectionPin(),
    filterPin(),
    { id: "update", label: i18n.nodes.mongo.__shared.pin_update, type: "string", direction: "input", defaultValue: "{}" },
    upsertPin(),
    { id: "returnDocument", label: i18n.nodes.mongo.__shared.pin_return_document, type: "enum", subType: MONGO_RETURN_DOCUMENT_ENUM_TYPE, direction: "input", defaultValue: "after", options: enumOptionIds(MONGO_RETURN_DOCUMENT_ENUM_TYPE) },
    execOutPin(),
    successPin(),
    documentOutPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, document: "null", error: resolved.error } };
    const returnDocument = inputs.returnDocument === "before" ? "before" : "after";
    const result = await resolved.manager.findOneAndUpdate(String(inputs.database ?? ""), String(inputs.collection ?? ""), parseJsonObject(inputs.filter) as Filter<Document>, parseJsonObject(inputs.update) as UpdateFilter<Document>, Boolean(inputs.upsert), returnDocument);
    return { nextExec: "exec-out", outputs: { success: result.success, document: stringifyMongo(result.document), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await functionLibraryMongo.mongoFindOneAndUpdate(${inputs.credentialName}, ${inputs.database}, ${inputs.collection}, ${inputs.filter}, ${inputs.update}, ${inputs.upsert}, ${inputs.returnDocument});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, document: `${v}.documentJson`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_MONGO_IMPORT],
});

registerNode({
  type: "mongo.findOneAndReplace",
  label: i18n.nodes.mongo.findOneAndReplace.label,
  description: i18n.nodes.mongo.findOneAndReplace.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    databasePin(),
    collectionPin(),
    filterPin(),
    { id: "replacement", label: i18n.nodes.mongo.__shared.pin_replacement, type: "string", direction: "input", defaultValue: "{}" },
    upsertPin(),
    { id: "returnDocument", label: i18n.nodes.mongo.__shared.pin_return_document, type: "enum", subType: MONGO_RETURN_DOCUMENT_ENUM_TYPE, direction: "input", defaultValue: "after", options: enumOptionIds(MONGO_RETURN_DOCUMENT_ENUM_TYPE) },
    execOutPin(),
    successPin(),
    documentOutPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, document: "null", error: resolved.error } };
    const returnDocument = inputs.returnDocument === "before" ? "before" : "after";
    const result = await resolved.manager.findOneAndReplace(String(inputs.database ?? ""), String(inputs.collection ?? ""), parseJsonObject(inputs.filter) as Filter<Document>, parseJsonObject(inputs.replacement) as Document, Boolean(inputs.upsert), returnDocument);
    return { nextExec: "exec-out", outputs: { success: result.success, document: stringifyMongo(result.document), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await functionLibraryMongo.mongoFindOneAndReplace(${inputs.credentialName}, ${inputs.database}, ${inputs.collection}, ${inputs.filter}, ${inputs.replacement}, ${inputs.upsert}, ${inputs.returnDocument});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, document: `${v}.documentJson`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_MONGO_IMPORT],
});

registerNode({
  type: "mongo.findOneAndDelete",
  label: i18n.nodes.mongo.findOneAndDelete.label,
  description: i18n.nodes.mongo.findOneAndDelete.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), databasePin(), collectionPin(), filterPin(), execOutPin(), successPin(), documentOutPin(), errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, document: "null", error: resolved.error } };
    const result = await resolved.manager.findOneAndDelete(String(inputs.database ?? ""), String(inputs.collection ?? ""), parseJsonObject(inputs.filter) as Filter<Document>);
    return { nextExec: "exec-out", outputs: { success: result.success, document: stringifyMongo(result.document), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryMongo.mongoFindOneAndDelete(${inputs.credentialName}, ${inputs.database}, ${inputs.collection}, ${inputs.filter});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, document: `${v}.documentJson`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_MONGO_IMPORT],
});

registerNode({
  type: "mongo.aggregate",
  label: i18n.nodes.mongo.aggregate.label,
  description: i18n.nodes.mongo.aggregate.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    databasePin(),
    collectionPin(),
    { id: "pipeline", label: i18n.nodes.mongo.aggregate.pin_pipeline, type: "string", direction: "input", defaultValue: "[]" },
    execOutPin(),
    successPin(),
    { id: "results", label: i18n.nodes.mongo.aggregate.pin_results, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, results: "[]", error: resolved.error } };
    const result = await resolved.manager.aggregate(String(inputs.database ?? ""), String(inputs.collection ?? ""), parseJsonArray(inputs.pipeline) as Document[]);
    return { nextExec: "exec-out", outputs: { success: result.success, results: stringifyMongo(result.results), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryMongo.mongoAggregate(${inputs.credentialName}, ${inputs.database}, ${inputs.collection}, ${inputs.pipeline});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, results: `${v}.resultsJson`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_MONGO_IMPORT],
});

registerNode({
  type: "mongo.distinct",
  label: i18n.nodes.mongo.distinct.label,
  description: i18n.nodes.mongo.distinct.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    databasePin(),
    collectionPin(),
    { id: "field", label: i18n.nodes.mongo.distinct.pin_field, type: "string", direction: "input", defaultValue: "" },
    filterPin(),
    execOutPin(),
    successPin(),
    { id: "values", label: i18n.nodes.mongo.distinct.pin_values, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, values: "[]", error: resolved.error } };
    const result = await resolved.manager.distinct(String(inputs.database ?? ""), String(inputs.collection ?? ""), String(inputs.field ?? ""), parseJsonObject(inputs.filter) as Filter<Document>);
    return { nextExec: "exec-out", outputs: { success: result.success, values: stringifyMongo(result.values), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryMongo.mongoDistinct(${inputs.credentialName}, ${inputs.database}, ${inputs.collection}, ${inputs.field}, ${inputs.filter});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, values: `${v}.valuesJson`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_MONGO_IMPORT],
});

registerNode({
  type: "mongo.createIndex",
  label: i18n.nodes.mongo.createIndex.label,
  description: i18n.nodes.mongo.createIndex.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    databasePin(),
    collectionPin(),
    { id: "keys", label: i18n.nodes.mongo.createIndex.pin_keys, type: "string", direction: "input", defaultValue: "{}" },
    { id: "unique", label: i18n.nodes.mongo.createIndex.pin_unique, type: "boolean", direction: "input", defaultValue: false },
    { id: "name", label: i18n.nodes.mongo.createIndex.pin_name, type: "string", direction: "input", defaultValue: "" },
    execOutPin(),
    successPin(),
    { id: "indexName", label: i18n.nodes.mongo.createIndex.pin_index_name, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, indexName: "", error: resolved.error } };
    const result = await resolved.manager.createIndex(String(inputs.database ?? ""), String(inputs.collection ?? ""), parseJsonObject(inputs.keys) as IndexSpecification, Boolean(inputs.unique), String(inputs.name ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryMongo.mongoCreateIndex(${inputs.credentialName}, ${inputs.database}, ${inputs.collection}, ${inputs.keys}, ${inputs.unique}, ${inputs.name});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, indexName: `${v}.indexName`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_MONGO_IMPORT],
});

registerNode({
  type: "mongo.dropIndex",
  label: i18n.nodes.mongo.dropIndex.label,
  description: i18n.nodes.mongo.dropIndex.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), databasePin(), collectionPin(), { id: "indexName", label: i18n.nodes.mongo.createIndex.pin_index_name, type: "string", direction: "input", defaultValue: "" }, execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, error: resolved.error } };
    const result = await resolved.manager.dropIndex(String(inputs.database ?? ""), String(inputs.collection ?? ""), String(inputs.indexName ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryMongo.mongoDropIndex(${inputs.credentialName}, ${inputs.database}, ${inputs.collection}, ${inputs.indexName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_MONGO_IMPORT],
});

registerNode({
  type: "mongo.listIndexes",
  label: i18n.nodes.mongo.listIndexes.label,
  description: i18n.nodes.mongo.listIndexes.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), databasePin(), collectionPin(), execOutPin(), successPin(), { id: "indexes", label: i18n.nodes.mongo.listIndexes.pin_indexes, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, indexes: "[]", error: resolved.error } };
    const result = await resolved.manager.listIndexes(String(inputs.database ?? ""), String(inputs.collection ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, indexes: stringifyMongo(result.indexes), error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryMongo.mongoListIndexes(${inputs.credentialName}, ${inputs.database}, ${inputs.collection});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, indexes: `${v}.indexesJson`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_MONGO_IMPORT],
});

registerNode({
  type: "mongo.bulkWrite",
  label: i18n.nodes.mongo.bulkWrite.label,
  description: i18n.nodes.mongo.bulkWrite.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    databasePin(),
    collectionPin(),
    { id: "operations", label: i18n.nodes.mongo.bulkWrite.pin_operations, type: "string", direction: "input", defaultValue: "[]" },
    execOutPin(),
    successPin(),
    { id: "insertedCount", label: i18n.nodes.mongo.__shared.pin_count, type: "number", direction: "output" },
    { id: "matchedCount", label: i18n.nodes.mongo.__shared.pin_matched_count, type: "number", direction: "output" },
    { id: "modifiedCount", label: i18n.nodes.mongo.__shared.pin_modified_count, type: "number", direction: "output" },
    { id: "deletedCount", label: i18n.nodes.mongo.__shared.pin_deleted_count, type: "number", direction: "output" },
    { id: "upsertedCount", label: i18n.nodes.mongo.bulkWrite.pin_upserted_count, type: "number", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok) return { nextExec: "exec-out", outputs: { success: false, insertedCount: 0, matchedCount: 0, modifiedCount: 0, deletedCount: 0, upsertedCount: 0, error: resolved.error } };
    const result = await resolved.manager.bulkWrite(String(inputs.database ?? ""), String(inputs.collection ?? ""), parseJsonArray(inputs.operations) as AnyBulkWriteOperation<Document>[]);
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryMongo.mongoBulkWrite(${inputs.credentialName}, ${inputs.database}, ${inputs.collection}, ${inputs.operations});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, insertedCount: `${v}.insertedCount`, matchedCount: `${v}.matchedCount`, modifiedCount: `${v}.modifiedCount`, deletedCount: `${v}.deletedCount`, upsertedCount: `${v}.upsertedCount`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_MONGO_IMPORT],
});
