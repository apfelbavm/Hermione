import { NodeColorCategory } from "@hermione/graph/engine/types";
import { registerNode } from "@hermione/graph/engine/registry";
import { compileResultVar, AZURE_STORAGE_MANAGER_IMPORT } from "@hermione/graph/engine/compileUtils";
import { UPLOAD_OPTIONS_STRUCT_TYPE, CONTAINER_PROPERTIES_STRUCT_TYPE, BLOB_PROPERTIES_STRUCT_TYPE, ACCOUNT_INFO_STRUCT_TYPE } from "@hermione/graph/structs/azureStorage";
import { AZURE_STORAGE_CONTAINER_ACCESS_ENUM_TYPE } from "@hermione/graph/enum/azureStorage";
import { TEXT_ENCODING_ENUM_TYPE } from "@hermione/graph/enum/common";
import { enumOptionIds } from "@hermione/graph/engine/enumRegistry";
import type { AzureStorageBlobUploadOptions } from "@hermione/core/lib/azureStorageManager";
import { i18n } from "@i18n";

// Every operation below calls the exact same AzureStorageManager static method (packages/core/src/
// lib/azureStorageManager.ts) from both execute() (interpreter path) and compileExecute()
// (compiled/deployed path) -- AzureStorageManager resolves the named credential straight from the
// database itself (see its findCredential), so unlike the old two-layer split there is no separate
// functionLibraryAzureStorage.ts env-var-reading layer and no ctx.getCredential vault lookup here:
// both paths are already identical. Same structure as nodes/twilio.ts.
//
// AzureStorageManager now reaches the database directly, which pulls in better-sqlite3 and Node
// builtins -- fine for execute(), which only ever runs server-side, but this file is still
// statically imported client-side too (for the node-creation menu), so it's loaded with a runtime
// `import()` instead of a top-level import (ignored by both bundlers) -- see nodes/twilio.ts's
// loadTwilioManager for the same pattern.
async function loadAzureStorageManager(): Promise<typeof import("@hermione/core/lib/azureStorageManager").AzureStorageManager> {
  const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "@hermione/core/lib/azureStorageManager");
  return mod.AzureStorageManager;
}

const GROUP_NAME = "Request.AzureStorage";

function credentialNamePin() {
  return {
    id: "credentialName",
    label: i18n.nodes.azureStorage.__shared.pin_credential_name,
    type: "string" as const,
    direction: "input" as const,
    defaultValue: "",
  };
}

function containerNamePin() {
  return {
    id: "containerName",
    label: i18n.nodes.azureStorage.__shared.pin_container_name,
    type: "string" as const,
    direction: "input" as const,
    defaultValue: "",
  };
}

function blobNamePin() {
  return {
    id: "blobName",
    label: i18n.nodes.azureStorage.__shared.pin_blob_name,
    type: "string" as const,
    direction: "input" as const,
    defaultValue: "",
  };
}

function metadataInPin() {
  return {
    id: "metadata",
    label: i18n.nodes.azureStorage.__shared.pin_metadata,
    type: "string" as const,
    direction: "input" as const,
    container: "map" as const,
    keyType: "string" as const,
    defaultValue: [],
  };
}

function execInPin() {
  return {
    id: "exec-in",
    label: "",
    type: "exec" as const,
    direction: "input" as const,
  };
}

function execOutPin() {
  return {
    id: "exec-out",
    label: i18n.nodes.__shared.pin_completed,
    type: "exec" as const,
    direction: "output" as const,
  };
}

function successPin() {
  return {
    id: "success",
    label: i18n.nodes.__shared.pin_success,
    type: "boolean" as const,
    direction: "output" as const,
  };
}

function errorPin() {
  return {
    id: "error",
    label: i18n.nodes.__shared.pin_error,
    type: "string" as const,
    direction: "output" as const,
  };
}

interface MapEntry {
  key: unknown;
  value: unknown;
}

/** The engine's "map" container pin carries its value as an array of {key, value} entries (see
 * nodes/map.ts) rather than a plain object -- these convert to/from the Record<string, string>
 * AzureStorageManager actually expects/returns. compileExecute below inlines the equivalent
 * conversion as generated JS, since the compiled path has no access to these helpers at runtime. */
function mapEntriesToRecord(value: unknown): Record<string, string> {
  const entries = Array.isArray(value) ? (value as MapEntry[]) : [];
  const record: Record<string, string> = {};
  for (const entry of entries) record[String(entry.key ?? "")] = String(entry.value ?? "");
  return record;
}

function recordToMapEntries(record: Record<string, string>): MapEntry[] {
  return Object.entries(record).map(([key, value]) => ({ key, value }));
}

/** Inline JS (for compileExecute-generated source) that turns a compiled "map" pin's {key,value}[]
 * literal into the Record<string,string> AzureStorageManager's static methods expect. */
function inlineRecordFromEntries(entriesExpr: string): string {
  return `Object.fromEntries((${entriesExpr} || []).map((e) => [e.key, e.value]))`;
}

/** Inline JS that turns a Record<string,string> result field back into the {key,value}[] shape a
 * "map" output pin expects. */
function inlineEntriesFromRecord(recordExpr: string): string {
  return `Object.entries(${recordExpr}).map(([key, value]) => ({ key, value }))`;
}

registerNode({
  type: "azureStorage.listContainers",
  label: i18n.nodes.azureStorage.listContainers.label,
  description: i18n.nodes.azureStorage.listContainers.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    { id: "prefix", label: i18n.nodes.azureStorage.__shared.pin_prefix, type: "string", direction: "input", defaultValue: "" },
    execOutPin(),
    successPin(),
    { id: "containers", label: i18n.nodes.azureStorage.listContainers.pin_containers, type: "string", container: "array", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadAzureStorageManager()).listContainers(String(inputs.credentialName ?? ""), String(inputs.prefix ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await AzureStorageManager.listContainers(${inputs.credentialName}, ${inputs.prefix});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, containers: `${v}.containers`, error: `${v}.error` };
  },
  compileImports: [AZURE_STORAGE_MANAGER_IMPORT],
});

registerNode({
  type: "azureStorage.createContainer",
  label: i18n.nodes.azureStorage.createContainer.label,
  description: i18n.nodes.azureStorage.createContainer.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    containerNamePin(),
    { id: "access", label: i18n.nodes.azureStorage.createContainer.pin_access, type: "enum", subType: AZURE_STORAGE_CONTAINER_ACCESS_ENUM_TYPE, direction: "input", defaultValue: "private", options: enumOptionIds(AZURE_STORAGE_CONTAINER_ACCESS_ENUM_TYPE) },
    execOutPin(),
    successPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const access = inputs.access === "blob" || inputs.access === "container" ? inputs.access : "private";
    const result = await (await loadAzureStorageManager()).createContainer(String(inputs.credentialName ?? ""), String(inputs.containerName ?? ""), access);
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await AzureStorageManager.createContainer(${inputs.credentialName}, ${inputs.containerName}, ${inputs.access});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [AZURE_STORAGE_MANAGER_IMPORT],
});

registerNode({
  type: "azureStorage.deleteContainer",
  label: i18n.nodes.azureStorage.deleteContainer.label,
  description: i18n.nodes.azureStorage.deleteContainer.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), containerNamePin(), execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadAzureStorageManager()).deleteContainer(String(inputs.credentialName ?? ""), String(inputs.containerName ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await AzureStorageManager.deleteContainer(${inputs.credentialName}, ${inputs.containerName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [AZURE_STORAGE_MANAGER_IMPORT],
});

registerNode({
  type: "azureStorage.getContainerProperties",
  label: i18n.nodes.azureStorage.getContainerProperties.label,
  description: i18n.nodes.azureStorage.getContainerProperties.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), containerNamePin(), execOutPin(), successPin(), { id: "properties", label: i18n.nodes.azureStorage.containerProperties.label, type: "struct", subType: CONTAINER_PROPERTIES_STRUCT_TYPE, direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadAzureStorageManager()).getContainerProperties(String(inputs.credentialName ?? ""), String(inputs.containerName ?? ""));
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        properties: {
          etag: result.etag,
          lastModified: result.lastModified,
          publicAccess: result.publicAccess,
          metadata: recordToMapEntries(result.metadata),
        },
        error: result.error,
      },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await AzureStorageManager.getContainerProperties(${inputs.credentialName}, ${inputs.containerName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, properties: `{ etag: ${v}.etag, lastModified: ${v}.lastModified, publicAccess: ${v}.publicAccess, metadata: ${inlineEntriesFromRecord(`${v}.metadata`)} }`, error: `${v}.error` };
  },
  compileImports: [AZURE_STORAGE_MANAGER_IMPORT],
});

registerNode({
  type: "azureStorage.setContainerMetadata",
  label: i18n.nodes.azureStorage.setContainerMetadata.label,
  description: i18n.nodes.azureStorage.setContainerMetadata.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), containerNamePin(), metadataInPin(), execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadAzureStorageManager()).setContainerMetadata(String(inputs.credentialName ?? ""), String(inputs.containerName ?? ""), mapEntriesToRecord(inputs.metadata));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await AzureStorageManager.setContainerMetadata(${inputs.credentialName}, ${inputs.containerName}, ${inlineRecordFromEntries(inputs.metadata)});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [AZURE_STORAGE_MANAGER_IMPORT],
});

registerNode({
  type: "azureStorage.listBlobs",
  label: i18n.nodes.azureStorage.listBlobs.label,
  description: i18n.nodes.azureStorage.listBlobs.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    containerNamePin(),
    { id: "prefix", label: i18n.nodes.azureStorage.__shared.pin_prefix, type: "string", direction: "input", defaultValue: "" },
    { id: "recursive", label: i18n.nodes.azureStorage.listBlobs.pin_recursive, type: "boolean", direction: "input", defaultValue: false },
    execOutPin(),
    successPin(),
    { id: "blobs", label: i18n.nodes.azureStorage.listBlobs.pin_blobs, type: "string", container: "array", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadAzureStorageManager()).listBlobs(String(inputs.credentialName ?? ""), String(inputs.containerName ?? ""), String(inputs.prefix ?? ""), Boolean(inputs.recursive));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await AzureStorageManager.listBlobs(${inputs.credentialName}, ${inputs.containerName}, ${inputs.prefix}, ${inputs.recursive});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, blobs: `${v}.blobs`, error: `${v}.error` };
  },
  compileImports: [AZURE_STORAGE_MANAGER_IMPORT],
});

registerNode({
  type: "azureStorage.uploadBlob",
  label: i18n.nodes.azureStorage.uploadBlob.label,
  description: i18n.nodes.azureStorage.uploadBlob.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    containerNamePin(),
    blobNamePin(),
    { id: "content", label: i18n.nodes.azureStorage.uploadBlob.pin_content, type: "string", direction: "input", defaultValue: "" },
    { id: "encoding", label: i18n.nodes.azureStorage.__shared.pin_encoding, type: "enum", subType: TEXT_ENCODING_ENUM_TYPE, direction: "input", defaultValue: "utf8", options: enumOptionIds(TEXT_ENCODING_ENUM_TYPE) },
    {
      id: "options",
      label: i18n.nodes.azureStorage.uploadOptions.label,
      type: "struct",
      subType: UPLOAD_OPTIONS_STRUCT_TYPE,
      direction: "input",
      defaultValue: {
        contentType: "",
        cacheControl: "",
        contentEncoding: "",
        contentLanguage: "",
        contentDisposition: "",
        tier: "",
        metadata: [],
      },
    },
    { id: "overwrite", label: i18n.nodes.azureStorage.uploadBlob.pin_overwrite, type: "boolean", direction: "input", defaultValue: true },
    execOutPin(),
    successPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const options = (inputs.options ?? {}) as Partial<AzureStorageBlobUploadOptions>;
    const uploadOptions: AzureStorageBlobUploadOptions = {
      contentType: String(options.contentType ?? ""),
      cacheControl: String(options.cacheControl ?? ""),
      contentEncoding: String(options.contentEncoding ?? ""),
      contentLanguage: String(options.contentLanguage ?? ""),
      contentDisposition: String(options.contentDisposition ?? ""),
      tier: String(options.tier ?? ""),
      metadata: mapEntriesToRecord(options.metadata),
    };
    const result = await (await loadAzureStorageManager()).uploadBlob(String(inputs.credentialName ?? ""), String(inputs.containerName ?? ""), String(inputs.blobName ?? ""), String(inputs.content ?? ""), inputs.encoding === "base64" ? "base64" : "utf8", uploadOptions, Boolean(inputs.overwrite));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await AzureStorageManager.uploadBlob(${inputs.credentialName}, ${inputs.containerName}, ${inputs.blobName}, ${inputs.content}, ${inputs.encoding}, { ...${inputs.options}, metadata: ${inlineRecordFromEntries(`${inputs.options}.metadata`)} }, ${inputs.overwrite});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [AZURE_STORAGE_MANAGER_IMPORT],
});

registerNode({
  type: "azureStorage.downloadBlob",
  label: i18n.nodes.azureStorage.downloadBlob.label,
  description: i18n.nodes.azureStorage.downloadBlob.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    containerNamePin(),
    blobNamePin(),
    { id: "encoding", label: i18n.nodes.azureStorage.__shared.pin_encoding, type: "enum", subType: TEXT_ENCODING_ENUM_TYPE, direction: "input", defaultValue: "utf8", options: enumOptionIds(TEXT_ENCODING_ENUM_TYPE) },
    execOutPin(),
    successPin(),
    { id: "content", label: i18n.nodes.azureStorage.downloadBlob.pin_content, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadAzureStorageManager()).downloadBlob(String(inputs.credentialName ?? ""), String(inputs.containerName ?? ""), String(inputs.blobName ?? ""), inputs.encoding === "base64" ? "base64" : "utf8");
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await AzureStorageManager.downloadBlob(${inputs.credentialName}, ${inputs.containerName}, ${inputs.blobName}, ${inputs.encoding});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, content: `${v}.content`, error: `${v}.error` };
  },
  compileImports: [AZURE_STORAGE_MANAGER_IMPORT],
});

registerNode({
  type: "azureStorage.deleteBlob",
  label: i18n.nodes.azureStorage.deleteBlob.label,
  description: i18n.nodes.azureStorage.deleteBlob.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), containerNamePin(), blobNamePin(), execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadAzureStorageManager()).deleteBlob(String(inputs.credentialName ?? ""), String(inputs.containerName ?? ""), String(inputs.blobName ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await AzureStorageManager.deleteBlob(${inputs.credentialName}, ${inputs.containerName}, ${inputs.blobName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [AZURE_STORAGE_MANAGER_IMPORT],
});

function registerRelocationNode(type: "copyBlob" | "moveBlob") {
  const fn = type === "copyBlob" ? "copyBlob" : "moveBlob";
  registerNode({
    type: `azureStorage.${type}`,
    label: i18n.nodes.azureStorage[type].label,
    description: i18n.nodes.azureStorage[type].description,
    group: GROUP_NAME,
    colorCategory: NodeColorCategory.Integration,
    pins: [
      execInPin(),
      credentialNamePin(),
      { id: "sourceContainer", label: i18n.nodes.azureStorage.__shared.pin_source_container, type: "string", direction: "input", defaultValue: "" },
      { id: "sourceBlob", label: i18n.nodes.azureStorage.__shared.pin_source_blob, type: "string", direction: "input", defaultValue: "" },
      { id: "destContainer", label: i18n.nodes.azureStorage.__shared.pin_dest_container, type: "string", direction: "input", defaultValue: "" },
      { id: "destBlob", label: i18n.nodes.azureStorage.__shared.pin_dest_blob, type: "string", direction: "input", defaultValue: "" },
      execOutPin(),
      successPin(),
      errorPin(),
    ],
    latent: true,
    execute: async ({ inputs }) => {
      const manager = await loadAzureStorageManager();
      const result = await manager[fn](String(inputs.credentialName ?? ""), String(inputs.sourceContainer ?? ""), String(inputs.sourceBlob ?? ""), String(inputs.destContainer ?? ""), String(inputs.destBlob ?? ""));
      return { nextExec: "exec-out", outputs: result };
    },
    compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await AzureStorageManager.${fn}(${inputs.credentialName}, ${inputs.sourceContainer}, ${inputs.sourceBlob}, ${inputs.destContainer}, ${inputs.destBlob});`, ...compileFrom("exec-out")],
    compileExecuteOutputs: ({ node }) => {
      const v = compileResultVar(node.id);
      return { success: `${v}.success`, error: `${v}.error` };
    },
    compileImports: [AZURE_STORAGE_MANAGER_IMPORT],
  });
}

registerRelocationNode("copyBlob");
registerRelocationNode("moveBlob");

registerNode({
  type: "azureStorage.getBlobProperties",
  label: i18n.nodes.azureStorage.getBlobProperties.label,
  description: i18n.nodes.azureStorage.getBlobProperties.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), containerNamePin(), blobNamePin(), execOutPin(), successPin(), { id: "properties", label: i18n.nodes.azureStorage.blobProperties.label, type: "struct", subType: BLOB_PROPERTIES_STRUCT_TYPE, direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadAzureStorageManager()).getBlobProperties(String(inputs.credentialName ?? ""), String(inputs.containerName ?? ""), String(inputs.blobName ?? ""));
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        properties: {
          size: result.size,
          contentType: result.contentType,
          etag: result.etag,
          lastModified: result.lastModified,
          metadata: recordToMapEntries(result.metadata),
        },
        error: result.error,
      },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await AzureStorageManager.getBlobProperties(${inputs.credentialName}, ${inputs.containerName}, ${inputs.blobName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return {
      success: `${v}.success`,
      properties: `{ size: ${v}.size, contentType: ${v}.contentType, etag: ${v}.etag, lastModified: ${v}.lastModified, metadata: ${inlineEntriesFromRecord(`${v}.metadata`)} }`,
      error: `${v}.error`,
    };
  },
  compileImports: [AZURE_STORAGE_MANAGER_IMPORT],
});

registerNode({
  type: "azureStorage.setBlobMetadata",
  label: i18n.nodes.azureStorage.setBlobMetadata.label,
  description: i18n.nodes.azureStorage.setBlobMetadata.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), containerNamePin(), blobNamePin(), metadataInPin(), execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadAzureStorageManager()).setBlobMetadata(String(inputs.credentialName ?? ""), String(inputs.containerName ?? ""), String(inputs.blobName ?? ""), mapEntriesToRecord(inputs.metadata));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await AzureStorageManager.setBlobMetadata(${inputs.credentialName}, ${inputs.containerName}, ${inputs.blobName}, ${inlineRecordFromEntries(inputs.metadata)});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [AZURE_STORAGE_MANAGER_IMPORT],
});

registerNode({
  type: "azureStorage.blobExists",
  label: i18n.nodes.azureStorage.blobExists.label,
  description: i18n.nodes.azureStorage.blobExists.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), containerNamePin(), blobNamePin(), execOutPin(), successPin(), { id: "exists", label: i18n.nodes.azureStorage.blobExists.pin_exists, type: "boolean", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadAzureStorageManager()).blobExists(String(inputs.credentialName ?? ""), String(inputs.containerName ?? ""), String(inputs.blobName ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await AzureStorageManager.blobExists(${inputs.credentialName}, ${inputs.containerName}, ${inputs.blobName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, exists: `${v}.exists`, error: `${v}.error` };
  },
  compileImports: [AZURE_STORAGE_MANAGER_IMPORT],
});

registerNode({
  type: "azureStorage.generateBlobSasUrl",
  label: i18n.nodes.azureStorage.generateBlobSasUrl.label,
  description: i18n.nodes.azureStorage.generateBlobSasUrl.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    containerNamePin(),
    blobNamePin(),
    { id: "permissions", label: i18n.nodes.azureStorage.__shared.pin_permissions, type: "string", direction: "input", defaultValue: "r" },
    { id: "expiresInMinutes", label: i18n.nodes.azureStorage.__shared.pin_expires_in_minutes, type: "number", direction: "input", defaultValue: 60 },
    execOutPin(),
    successPin(),
    { id: "url", label: i18n.nodes.azureStorage.__shared.pin_url, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadAzureStorageManager()).generateBlobSasUrl(String(inputs.credentialName ?? ""), String(inputs.containerName ?? ""), String(inputs.blobName ?? ""), String(inputs.permissions ?? "r"), Number(inputs.expiresInMinutes ?? 60));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await AzureStorageManager.generateBlobSasUrl(${inputs.credentialName}, ${inputs.containerName}, ${inputs.blobName}, ${inputs.permissions}, ${inputs.expiresInMinutes});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, url: `${v}.url`, error: `${v}.error` };
  },
  compileImports: [AZURE_STORAGE_MANAGER_IMPORT],
});

registerNode({
  type: "azureStorage.generateContainerSasUrl",
  label: i18n.nodes.azureStorage.generateContainerSasUrl.label,
  description: i18n.nodes.azureStorage.generateContainerSasUrl.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    containerNamePin(),
    { id: "permissions", label: i18n.nodes.azureStorage.__shared.pin_permissions, type: "string", direction: "input", defaultValue: "r" },
    { id: "expiresInMinutes", label: i18n.nodes.azureStorage.__shared.pin_expires_in_minutes, type: "number", direction: "input", defaultValue: 60 },
    execOutPin(),
    successPin(),
    { id: "url", label: i18n.nodes.azureStorage.__shared.pin_url, type: "string", direction: "output" },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadAzureStorageManager()).generateContainerSasUrl(String(inputs.credentialName ?? ""), String(inputs.containerName ?? ""), String(inputs.permissions ?? "r"), Number(inputs.expiresInMinutes ?? 60));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await AzureStorageManager.generateContainerSasUrl(${inputs.credentialName}, ${inputs.containerName}, ${inputs.permissions}, ${inputs.expiresInMinutes});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, url: `${v}.url`, error: `${v}.error` };
  },
  compileImports: [AZURE_STORAGE_MANAGER_IMPORT],
});

registerNode({
  type: "azureStorage.getAccountInfo",
  label: i18n.nodes.azureStorage.getAccountInfo.label,
  description: i18n.nodes.azureStorage.getAccountInfo.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), execOutPin(), successPin(), { id: "accountInfo", label: i18n.nodes.azureStorage.accountInfo.label, type: "struct", subType: ACCOUNT_INFO_STRUCT_TYPE, direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs }) => {
    const result = await (await loadAzureStorageManager()).getAccountInfo(String(inputs.credentialName ?? ""));
    return {
      nextExec: "exec-out",
      outputs: {
        success: result.success,
        accountInfo: {
          accountKind: result.accountKind,
          skuName: result.skuName,
        },
        error: result.error,
      },
    };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await AzureStorageManager.getAccountInfo(${inputs.credentialName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, accountInfo: `{ accountKind: ${v}.accountKind, skuName: ${v}.skuName }`, error: `${v}.error` };
  },
  compileImports: [AZURE_STORAGE_MANAGER_IMPORT],
});
