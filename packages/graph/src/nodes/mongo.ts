import { NodeColorCategory } from "@hermione/graph/engine/types";
import { registerNode } from "@hermione/graph/engine/registry";
import { compileResultVar, MONGO_MANAGER_IMPORT } from "@hermione/graph/engine/compileUtils";
import { MONGO_RETURN_DOCUMENT_ENUM_TYPE } from "@hermione/graph/enum/mongo";
import { enumOptionIds } from "@hermione/graph/engine/enumRegistry";
import { i18n } from "@i18n";

// Every operation below calls the exact same MongoManager static method (packages/core/src/lib/
// mongoManager.ts) from both execute() (interpreter path) and compileExecute() (compiled/deployed
// path) -- MongoManager resolves the named credential straight from the database itself (see its
// findCredential), so unlike the old two-layer split there is no separate functionLibraryMongo.ts
// env-var-reading layer and no ctx.getCredential vault lookup here: both paths are already identical.
// Same structure as nodes/twilio.ts.
//
// Filters/documents/updates/pipelines with dynamic shapes are carried as JSON string pins rather
// than "map"/"struct" pins, since MongoDB documents can be arbitrarily nested -- same convention as
// awsDynamoDb.ts's item/key/expression pins. MongoManager's public static methods take/return those
// same JSON strings directly (parsing/stringifying around its object-shaped private methods).
//
// MongoManager now reaches the database directly, which pulls in the mongodb driver and Node
// builtins -- fine for execute(), which only ever runs server-side, but this file is still
// statically imported client-side too (for the node-creation menu), so it's loaded with a runtime
// `import()` instead of a top-level import (ignored by both bundlers) -- see nodes/twilio.ts's
// loadTwilioManager for the same pattern.
async function loadMongoManager(): Promise<typeof import("@hermione/core/lib/mongoManager").MongoManager> {
  const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "@hermione/core/lib/mongoManager");
  return mod.MongoManager;
}

const GROUP_NAME = "Request.MongoDB";

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

registerNode({
  type: "mongo.listDatabases",
  label: i18n.nodes.mongo.listDatabases.label,
  description: i18n.nodes.mongo.listDatabases.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), execOutPin(), successPin(), { id: "databaseNames", label: i18n.nodes.mongo.listDatabases.pin_database_names, type: "string", container: "array", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadMongoManager()).listDatabases(String(inputs.credentialName ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await MongoManager.listDatabases(${inputs.credentialName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, databaseNames: `${v}.databaseNames`, error: `${v}.error` };
  },
  compileImports: [MONGO_MANAGER_IMPORT],
});

registerNode({
  type: "mongo.listCollections",
  label: i18n.nodes.mongo.listCollections.label,
  description: i18n.nodes.mongo.listCollections.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), databasePin(), execOutPin(), successPin(), { id: "collectionNames", label: i18n.nodes.mongo.listCollections.pin_collection_names, type: "string", container: "array", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadMongoManager()).listCollections(String(inputs.credentialName ?? ""), String(inputs.database ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await MongoManager.listCollections(${inputs.credentialName}, ${inputs.database});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, collectionNames: `${v}.collectionNames`, error: `${v}.error` };
  },
  compileImports: [MONGO_MANAGER_IMPORT],
});

registerNode({
  type: "mongo.createCollection",
  label: i18n.nodes.mongo.createCollection.label,
  description: i18n.nodes.mongo.createCollection.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), databasePin(), collectionPin(), execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadMongoManager()).createCollection(String(inputs.credentialName ?? ""), String(inputs.database ?? ""), String(inputs.collection ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await MongoManager.createCollection(${inputs.credentialName}, ${inputs.database}, ${inputs.collection});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [MONGO_MANAGER_IMPORT],
});

registerNode({
  type: "mongo.dropCollection",
  label: i18n.nodes.mongo.dropCollection.label,
  description: i18n.nodes.mongo.dropCollection.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), databasePin(), collectionPin(), execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadMongoManager()).dropCollection(String(inputs.credentialName ?? ""), String(inputs.database ?? ""), String(inputs.collection ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await MongoManager.dropCollection(${inputs.credentialName}, ${inputs.database}, ${inputs.collection});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [MONGO_MANAGER_IMPORT],
});

registerNode({
  type: "mongo.dropDatabase",
  label: i18n.nodes.mongo.dropDatabase.label,
  description: i18n.nodes.mongo.dropDatabase.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), databasePin(), execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadMongoManager()).dropDatabase(String(inputs.credentialName ?? ""), String(inputs.database ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await MongoManager.dropDatabase(${inputs.credentialName}, ${inputs.database});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [MONGO_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadMongoManager()).renameCollection(String(inputs.credentialName ?? ""), String(inputs.database ?? ""), String(inputs.collection ?? ""), String(inputs.newName ?? ""), Boolean(inputs.dropTarget));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await MongoManager.renameCollection(${inputs.credentialName}, ${inputs.database}, ${inputs.collection}, ${inputs.newName}, ${inputs.dropTarget});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [MONGO_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadMongoManager()).insertOne(String(inputs.credentialName ?? ""), String(inputs.database ?? ""), String(inputs.collection ?? ""), String(inputs.document ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await MongoManager.insertOne(${inputs.credentialName}, ${inputs.database}, ${inputs.collection}, ${inputs.document});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, insertedId: `${v}.insertedId`, error: `${v}.error` };
  },
  compileImports: [MONGO_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadMongoManager()).insertMany(String(inputs.credentialName ?? ""), String(inputs.database ?? ""), String(inputs.collection ?? ""), String(inputs.documents ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await MongoManager.insertMany(${inputs.credentialName}, ${inputs.database}, ${inputs.collection}, ${inputs.documents});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, insertedIds: `${v}.insertedIds`, insertedCount: `${v}.insertedCount`, error: `${v}.error` };
  },
  compileImports: [MONGO_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadMongoManager()).findOne(String(inputs.credentialName ?? ""), String(inputs.database ?? ""), String(inputs.collection ?? ""), String(inputs.filter ?? ""), String(inputs.projection ?? ""), String(inputs.sort ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, document: result.documentJson, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await MongoManager.findOne(${inputs.credentialName}, ${inputs.database}, ${inputs.collection}, ${inputs.filter}, ${inputs.projection}, ${inputs.sort});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, document: `${v}.documentJson`, error: `${v}.error` };
  },
  compileImports: [MONGO_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadMongoManager()).find(String(inputs.credentialName ?? ""), String(inputs.database ?? ""), String(inputs.collection ?? ""), String(inputs.filter ?? ""), String(inputs.projection ?? ""), String(inputs.sort ?? ""), Number(inputs.limit) || 0, Number(inputs.skip) || 0);
    return { nextExec: "exec-out", outputs: { success: result.success, documents: result.documentsJson, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await MongoManager.find(${inputs.credentialName}, ${inputs.database}, ${inputs.collection}, ${inputs.filter}, ${inputs.projection}, ${inputs.sort}, ${inputs.limit}, ${inputs.skip});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, documents: `${v}.documentsJson`, error: `${v}.error` };
  },
  compileImports: [MONGO_MANAGER_IMPORT],
});

registerNode({
  type: "mongo.countDocuments",
  label: i18n.nodes.mongo.countDocuments.label,
  description: i18n.nodes.mongo.countDocuments.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), databasePin(), collectionPin(), filterPin(), execOutPin(), successPin(), { id: "count", label: i18n.nodes.mongo.__shared.pin_count, type: "number", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadMongoManager()).countDocuments(String(inputs.credentialName ?? ""), String(inputs.database ?? ""), String(inputs.collection ?? ""), String(inputs.filter ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await MongoManager.countDocuments(${inputs.credentialName}, ${inputs.database}, ${inputs.collection}, ${inputs.filter});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, count: `${v}.count`, error: `${v}.error` };
  },
  compileImports: [MONGO_MANAGER_IMPORT],
});

registerNode({
  type: "mongo.updateOne",
  label: i18n.nodes.mongo.updateOne.label,
  description: i18n.nodes.mongo.updateOne.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), databasePin(), collectionPin(), filterPin(), { id: "update", label: i18n.nodes.mongo.__shared.pin_update, type: "string", direction: "input", defaultValue: "{}" }, upsertPin(), execOutPin(), successPin(), ...matchedModifiedPins(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadMongoManager()).updateOne(String(inputs.credentialName ?? ""), String(inputs.database ?? ""), String(inputs.collection ?? ""), String(inputs.filter ?? ""), String(inputs.update ?? ""), Boolean(inputs.upsert));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await MongoManager.updateOne(${inputs.credentialName}, ${inputs.database}, ${inputs.collection}, ${inputs.filter}, ${inputs.update}, ${inputs.upsert});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, matchedCount: `${v}.matchedCount`, modifiedCount: `${v}.modifiedCount`, upsertedId: `${v}.upsertedId`, error: `${v}.error` };
  },
  compileImports: [MONGO_MANAGER_IMPORT],
});

registerNode({
  type: "mongo.updateMany",
  label: i18n.nodes.mongo.updateMany.label,
  description: i18n.nodes.mongo.updateMany.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), databasePin(), collectionPin(), filterPin(), { id: "update", label: i18n.nodes.mongo.__shared.pin_update, type: "string", direction: "input", defaultValue: "{}" }, upsertPin(), execOutPin(), successPin(), ...matchedModifiedPins(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadMongoManager()).updateMany(String(inputs.credentialName ?? ""), String(inputs.database ?? ""), String(inputs.collection ?? ""), String(inputs.filter ?? ""), String(inputs.update ?? ""), Boolean(inputs.upsert));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await MongoManager.updateMany(${inputs.credentialName}, ${inputs.database}, ${inputs.collection}, ${inputs.filter}, ${inputs.update}, ${inputs.upsert});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, matchedCount: `${v}.matchedCount`, modifiedCount: `${v}.modifiedCount`, upsertedId: `${v}.upsertedId`, error: `${v}.error` };
  },
  compileImports: [MONGO_MANAGER_IMPORT],
});

registerNode({
  type: "mongo.replaceOne",
  label: i18n.nodes.mongo.replaceOne.label,
  description: i18n.nodes.mongo.replaceOne.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), databasePin(), collectionPin(), filterPin(), { id: "replacement", label: i18n.nodes.mongo.__shared.pin_replacement, type: "string", direction: "input", defaultValue: "{}" }, upsertPin(), execOutPin(), successPin(), ...matchedModifiedPins(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadMongoManager()).replaceOne(String(inputs.credentialName ?? ""), String(inputs.database ?? ""), String(inputs.collection ?? ""), String(inputs.filter ?? ""), String(inputs.replacement ?? ""), Boolean(inputs.upsert));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await MongoManager.replaceOne(${inputs.credentialName}, ${inputs.database}, ${inputs.collection}, ${inputs.filter}, ${inputs.replacement}, ${inputs.upsert});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, matchedCount: `${v}.matchedCount`, modifiedCount: `${v}.modifiedCount`, upsertedId: `${v}.upsertedId`, error: `${v}.error` };
  },
  compileImports: [MONGO_MANAGER_IMPORT],
});

registerNode({
  type: "mongo.deleteOne",
  label: i18n.nodes.mongo.deleteOne.label,
  description: i18n.nodes.mongo.deleteOne.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), databasePin(), collectionPin(), filterPin(), execOutPin(), successPin(), { id: "deletedCount", label: i18n.nodes.mongo.__shared.pin_deleted_count, type: "number", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadMongoManager()).deleteOne(String(inputs.credentialName ?? ""), String(inputs.database ?? ""), String(inputs.collection ?? ""), String(inputs.filter ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await MongoManager.deleteOne(${inputs.credentialName}, ${inputs.database}, ${inputs.collection}, ${inputs.filter});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, deletedCount: `${v}.deletedCount`, error: `${v}.error` };
  },
  compileImports: [MONGO_MANAGER_IMPORT],
});

registerNode({
  type: "mongo.deleteMany",
  label: i18n.nodes.mongo.deleteMany.label,
  description: i18n.nodes.mongo.deleteMany.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), databasePin(), collectionPin(), filterPin(), execOutPin(), successPin(), { id: "deletedCount", label: i18n.nodes.mongo.__shared.pin_deleted_count, type: "number", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadMongoManager()).deleteMany(String(inputs.credentialName ?? ""), String(inputs.database ?? ""), String(inputs.collection ?? ""), String(inputs.filter ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await MongoManager.deleteMany(${inputs.credentialName}, ${inputs.database}, ${inputs.collection}, ${inputs.filter});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, deletedCount: `${v}.deletedCount`, error: `${v}.error` };
  },
  compileImports: [MONGO_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const returnDocument = inputs.returnDocument === "before" ? "before" : "after";
    const result = await (await loadMongoManager()).findOneAndUpdate(String(inputs.credentialName ?? ""), String(inputs.database ?? ""), String(inputs.collection ?? ""), String(inputs.filter ?? ""), String(inputs.update ?? ""), Boolean(inputs.upsert), returnDocument);
    return { nextExec: "exec-out", outputs: { success: result.success, document: result.documentJson, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await MongoManager.findOneAndUpdate(${inputs.credentialName}, ${inputs.database}, ${inputs.collection}, ${inputs.filter}, ${inputs.update}, ${inputs.upsert}, ${inputs.returnDocument});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, document: `${v}.documentJson`, error: `${v}.error` };
  },
  compileImports: [MONGO_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const returnDocument = inputs.returnDocument === "before" ? "before" : "after";
    const result = await (await loadMongoManager()).findOneAndReplace(String(inputs.credentialName ?? ""), String(inputs.database ?? ""), String(inputs.collection ?? ""), String(inputs.filter ?? ""), String(inputs.replacement ?? ""), Boolean(inputs.upsert), returnDocument);
    return { nextExec: "exec-out", outputs: { success: result.success, document: result.documentJson, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await MongoManager.findOneAndReplace(${inputs.credentialName}, ${inputs.database}, ${inputs.collection}, ${inputs.filter}, ${inputs.replacement}, ${inputs.upsert}, ${inputs.returnDocument});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, document: `${v}.documentJson`, error: `${v}.error` };
  },
  compileImports: [MONGO_MANAGER_IMPORT],
});

registerNode({
  type: "mongo.findOneAndDelete",
  label: i18n.nodes.mongo.findOneAndDelete.label,
  description: i18n.nodes.mongo.findOneAndDelete.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), databasePin(), collectionPin(), filterPin(), execOutPin(), successPin(), documentOutPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadMongoManager()).findOneAndDelete(String(inputs.credentialName ?? ""), String(inputs.database ?? ""), String(inputs.collection ?? ""), String(inputs.filter ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, document: result.documentJson, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await MongoManager.findOneAndDelete(${inputs.credentialName}, ${inputs.database}, ${inputs.collection}, ${inputs.filter});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, document: `${v}.documentJson`, error: `${v}.error` };
  },
  compileImports: [MONGO_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadMongoManager()).aggregate(String(inputs.credentialName ?? ""), String(inputs.database ?? ""), String(inputs.collection ?? ""), String(inputs.pipeline ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, results: result.resultsJson, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await MongoManager.aggregate(${inputs.credentialName}, ${inputs.database}, ${inputs.collection}, ${inputs.pipeline});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, results: `${v}.resultsJson`, error: `${v}.error` };
  },
  compileImports: [MONGO_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadMongoManager()).distinct(String(inputs.credentialName ?? ""), String(inputs.database ?? ""), String(inputs.collection ?? ""), String(inputs.field ?? ""), String(inputs.filter ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, values: result.valuesJson, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await MongoManager.distinct(${inputs.credentialName}, ${inputs.database}, ${inputs.collection}, ${inputs.field}, ${inputs.filter});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, values: `${v}.valuesJson`, error: `${v}.error` };
  },
  compileImports: [MONGO_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadMongoManager()).createIndex(String(inputs.credentialName ?? ""), String(inputs.database ?? ""), String(inputs.collection ?? ""), String(inputs.keys ?? ""), Boolean(inputs.unique), String(inputs.name ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await MongoManager.createIndex(${inputs.credentialName}, ${inputs.database}, ${inputs.collection}, ${inputs.keys}, ${inputs.unique}, ${inputs.name});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, indexName: `${v}.indexName`, error: `${v}.error` };
  },
  compileImports: [MONGO_MANAGER_IMPORT],
});

registerNode({
  type: "mongo.dropIndex",
  label: i18n.nodes.mongo.dropIndex.label,
  description: i18n.nodes.mongo.dropIndex.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), databasePin(), collectionPin(), { id: "indexName", label: i18n.nodes.mongo.createIndex.pin_index_name, type: "string", direction: "input", defaultValue: "" }, execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadMongoManager()).dropIndex(String(inputs.credentialName ?? ""), String(inputs.database ?? ""), String(inputs.collection ?? ""), String(inputs.indexName ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await MongoManager.dropIndex(${inputs.credentialName}, ${inputs.database}, ${inputs.collection}, ${inputs.indexName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [MONGO_MANAGER_IMPORT],
});

registerNode({
  type: "mongo.listIndexes",
  label: i18n.nodes.mongo.listIndexes.label,
  description: i18n.nodes.mongo.listIndexes.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), databasePin(), collectionPin(), execOutPin(), successPin(), { id: "indexes", label: i18n.nodes.mongo.listIndexes.pin_indexes, type: "string", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadMongoManager()).listIndexes(String(inputs.credentialName ?? ""), String(inputs.database ?? ""), String(inputs.collection ?? ""));
    return { nextExec: "exec-out", outputs: { success: result.success, indexes: result.indexesJson, error: result.error } };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await MongoManager.listIndexes(${inputs.credentialName}, ${inputs.database}, ${inputs.collection});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, indexes: `${v}.indexesJson`, error: `${v}.error` };
  },
  compileImports: [MONGO_MANAGER_IMPORT],
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
  execute: async ({ inputs }) => {
    const result = await (await loadMongoManager()).bulkWrite(String(inputs.credentialName ?? ""), String(inputs.database ?? ""), String(inputs.collection ?? ""), String(inputs.operations ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await MongoManager.bulkWrite(${inputs.credentialName}, ${inputs.database}, ${inputs.collection}, ${inputs.operations});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, insertedCount: `${v}.insertedCount`, matchedCount: `${v}.matchedCount`, modifiedCount: `${v}.modifiedCount`, deletedCount: `${v}.deletedCount`, upsertedCount: `${v}.upsertedCount`, error: `${v}.error` };
  },
  compileImports: [MONGO_MANAGER_IMPORT],
});
