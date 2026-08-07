import { NodeColorCategory } from "@hermione/graph/engine/types";
import { registerNode } from "@hermione/graph/engine/registry";
import type { ExecutionContext } from "@hermione/graph/engine/types";
import { compileResultVar, FUNCTION_LIBRARY_AZURE_STORAGE_IMPORT } from "@hermione/graph/engine/compileUtils";
import { UPLOAD_OPTIONS_STRUCT_TYPE, CONTAINER_PROPERTIES_STRUCT_TYPE, BLOB_PROPERTIES_STRUCT_TYPE, ACCOUNT_INFO_STRUCT_TYPE } from "@hermione/graph/structs/azureStorage";
import { AZURE_STORAGE_CONTAINER_ACCESS_ENUM_TYPE } from "@hermione/graph/enum/azureStorage";
import { TEXT_ENCODING_ENUM_TYPE } from "@hermione/graph/enum/common";
import { enumOptionIds } from "@hermione/graph/engine/enumRegistry";
import { AzureStorageManager } from "@hermione/core/lib/azureStorageManager";
import type { AzureStorageBlobUploadOptions } from "@hermione/core/lib/azureStorageManager";
import type { AzureStorageConnectionStringCredentialData } from "@hermione/shared/types";
import { i18n } from "@i18n";

// Every operation below is a thin pin-wiring shim over AzureStorageManager (src/lib/azureStorageManager.ts)
// — this file only ever translates pins to method arguments and method results back to pins.
//
// Every operation node takes a Credential Name directly (no separate auth/refresh node): each
// resolves the named vault entry and hands its connection string to AzureStorageManager.forCredential,
// which caches the underlying BlobServiceClient — see azureStorageManager.ts.
//
// Every node here also has a compileExecute: the compiled path calls a same-named
// `functionLibraryAzureStorage.azureStorage*` wrapper (see server/functionLibraryAzureStorage.ts),
// which reads the credential's connection string back from environment variables instead of the
// vault — same split as jira.ts's execute()/compileExecute().

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
 * nodes/map.ts) rather than a plain object — these convert to/from the Record<string, string>
 * AzureStorageManager actually expects/returns. */
function mapEntriesToRecord(value: unknown): Record<string, string> {
  const entries = Array.isArray(value) ? (value as MapEntry[]) : [];
  const record: Record<string, string> = {};
  for (const entry of entries) record[String(entry.key ?? "")] = String(entry.value ?? "");
  return record;
}

function recordToMapEntries(record: Record<string, string>): MapEntry[] {
  return Object.entries(record).map(([key, value]) => ({ key, value }));
}

/** Shared by every Azure Storage node — looks up a named Credential Vault entry and returns its
 * connection string, or a clear error if the name is wrong/missing. */
function resolveAzureStorageCredential(ctx: ExecutionContext, credentialName: string): { ok: true; data: AzureStorageConnectionStringCredentialData } | { ok: false; error: string } {
  const credential = ctx.getCredential?.(credentialName);
  if (!credential)
    return {
      ok: false,
      error: `Credential "${credentialName}" not found in the vault`,
    };
  if (credential.type !== "azureStorageConnectionString")
    return {
      ok: false,
      error: `Credential "${credentialName}" is not an Azure Storage credential`,
    };
  return {
    ok: true,
    data: credential.data as AzureStorageConnectionStringCredentialData,
  };
}

function managerFor(ctx: ExecutionContext, credentialName: string): { ok: true; manager: AzureStorageManager } | { ok: false; error: string } {
  const resolved = resolveAzureStorageCredential(ctx, credentialName);
  if (!resolved.ok) return resolved;
  return {
    ok: true,
    manager: AzureStorageManager.forCredential(resolved.data.connectionString),
  };
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
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: { success: false, containers: [], error: resolved.error },
      };
    const result = await resolved.manager.listContainers(String(inputs.prefix ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryAzureStorage.azureStorageListContainers(${inputs.credentialName}, ${inputs.prefix});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, containers: `${v}.containers`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_AZURE_STORAGE_IMPORT],
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
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: { success: false, error: resolved.error },
      };
    const access = inputs.access === "blob" || inputs.access === "container" ? inputs.access : "private";
    const result = await resolved.manager.createContainer(String(inputs.containerName ?? ""), access);
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryAzureStorage.azureStorageCreateContainer(${inputs.credentialName}, ${inputs.containerName}, ${inputs.access});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_AZURE_STORAGE_IMPORT],
});

registerNode({
  type: "azureStorage.deleteContainer",
  label: i18n.nodes.azureStorage.deleteContainer.label,
  description: i18n.nodes.azureStorage.deleteContainer.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), containerNamePin(), execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: { success: false, error: resolved.error },
      };
    const result = await resolved.manager.deleteContainer(String(inputs.containerName ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryAzureStorage.azureStorageDeleteContainer(${inputs.credentialName}, ${inputs.containerName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_AZURE_STORAGE_IMPORT],
});

registerNode({
  type: "azureStorage.getContainerProperties",
  label: i18n.nodes.azureStorage.getContainerProperties.label,
  description: i18n.nodes.azureStorage.getContainerProperties.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), containerNamePin(), execOutPin(), successPin(), { id: "properties", label: i18n.nodes.azureStorage.containerProperties.label, type: "struct", subType: CONTAINER_PROPERTIES_STRUCT_TYPE, direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: {
          success: false,
          properties: {
            etag: "",
            lastModified: "",
            publicAccess: "",
            metadata: [],
          },
          error: resolved.error,
        },
      };
    const result = await resolved.manager.getContainerProperties(String(inputs.containerName ?? ""));
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
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryAzureStorage.azureStorageGetContainerProperties(${inputs.credentialName}, ${inputs.containerName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, properties: `${v}.properties`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_AZURE_STORAGE_IMPORT],
});

registerNode({
  type: "azureStorage.setContainerMetadata",
  label: i18n.nodes.azureStorage.setContainerMetadata.label,
  description: i18n.nodes.azureStorage.setContainerMetadata.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), containerNamePin(), metadataInPin(), execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: { success: false, error: resolved.error },
      };
    const result = await resolved.manager.setContainerMetadata(String(inputs.containerName ?? ""), mapEntriesToRecord(inputs.metadata));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryAzureStorage.azureStorageSetContainerMetadata(${inputs.credentialName}, ${inputs.containerName}, ${inputs.metadata});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_AZURE_STORAGE_IMPORT],
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
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: { success: false, blobs: [], error: resolved.error },
      };
    const result = await resolved.manager.listBlobs(String(inputs.containerName ?? ""), String(inputs.prefix ?? ""), Boolean(inputs.recursive));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryAzureStorage.azureStorageListBlobs(${inputs.credentialName}, ${inputs.containerName}, ${inputs.prefix}, ${inputs.recursive});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, blobs: `${v}.blobs`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_AZURE_STORAGE_IMPORT],
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
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: { success: false, error: resolved.error },
      };
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
    const result = await resolved.manager.uploadBlob(String(inputs.containerName ?? ""), String(inputs.blobName ?? ""), String(inputs.content ?? ""), inputs.encoding === "base64" ? "base64" : "utf8", uploadOptions, Boolean(inputs.overwrite));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await functionLibraryAzureStorage.azureStorageUploadBlob(${inputs.credentialName}, ${inputs.containerName}, ${inputs.blobName}, ${inputs.content}, ${inputs.encoding}, ${inputs.options}, ${inputs.overwrite});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_AZURE_STORAGE_IMPORT],
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
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: { success: false, content: "", error: resolved.error },
      };
    const result = await resolved.manager.downloadBlob(String(inputs.containerName ?? ""), String(inputs.blobName ?? ""), inputs.encoding === "base64" ? "base64" : "utf8");
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryAzureStorage.azureStorageDownloadBlob(${inputs.credentialName}, ${inputs.containerName}, ${inputs.blobName}, ${inputs.encoding});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, content: `${v}.content`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_AZURE_STORAGE_IMPORT],
});

registerNode({
  type: "azureStorage.deleteBlob",
  label: i18n.nodes.azureStorage.deleteBlob.label,
  description: i18n.nodes.azureStorage.deleteBlob.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), containerNamePin(), blobNamePin(), execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: { success: false, error: resolved.error },
      };
    const result = await resolved.manager.deleteBlob(String(inputs.containerName ?? ""), String(inputs.blobName ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryAzureStorage.azureStorageDeleteBlob(${inputs.credentialName}, ${inputs.containerName}, ${inputs.blobName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_AZURE_STORAGE_IMPORT],
});

function registerRelocationNode(type: "copyBlob" | "moveBlob") {
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
    execute: async ({ inputs, ctx }) => {
      const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
      if (!resolved.ok)
        return {
          nextExec: "exec-out",
          outputs: { success: false, error: resolved.error },
        };
      const result = await resolved.manager[type](String(inputs.sourceContainer ?? ""), String(inputs.sourceBlob ?? ""), String(inputs.destContainer ?? ""), String(inputs.destBlob ?? ""));
      return { nextExec: "exec-out", outputs: result };
    },
    compileExecute: ({ node, inputs, compileFrom }) => {
      const fn = type === "copyBlob" ? "azureStorageCopyBlob" : "azureStorageMoveBlob";
      return [`const ${compileResultVar(node.id)} = await functionLibraryAzureStorage.${fn}(${inputs.credentialName}, ${inputs.sourceContainer}, ${inputs.sourceBlob}, ${inputs.destContainer}, ${inputs.destBlob});`, ...compileFrom("exec-out")];
    },
    compileExecuteOutputs: ({ node }) => {
      const v = compileResultVar(node.id);
      return { success: `${v}.success`, error: `${v}.error` };
    },
    compileImports: [FUNCTION_LIBRARY_AZURE_STORAGE_IMPORT],
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
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: {
          success: false,
          properties: {
            size: 0,
            contentType: "",
            etag: "",
            lastModified: "",
            metadata: [],
          },
          error: resolved.error,
        },
      };
    const result = await resolved.manager.getBlobProperties(String(inputs.containerName ?? ""), String(inputs.blobName ?? ""));
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
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryAzureStorage.azureStorageGetBlobProperties(${inputs.credentialName}, ${inputs.containerName}, ${inputs.blobName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, properties: `${v}.properties`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_AZURE_STORAGE_IMPORT],
});

registerNode({
  type: "azureStorage.setBlobMetadata",
  label: i18n.nodes.azureStorage.setBlobMetadata.label,
  description: i18n.nodes.azureStorage.setBlobMetadata.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), containerNamePin(), blobNamePin(), metadataInPin(), execOutPin(), successPin(), errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: { success: false, error: resolved.error },
      };
    const result = await resolved.manager.setBlobMetadata(String(inputs.containerName ?? ""), String(inputs.blobName ?? ""), mapEntriesToRecord(inputs.metadata));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryAzureStorage.azureStorageSetBlobMetadata(${inputs.credentialName}, ${inputs.containerName}, ${inputs.blobName}, ${inputs.metadata});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_AZURE_STORAGE_IMPORT],
});

registerNode({
  type: "azureStorage.blobExists",
  label: i18n.nodes.azureStorage.blobExists.label,
  description: i18n.nodes.azureStorage.blobExists.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), containerNamePin(), blobNamePin(), execOutPin(), successPin(), { id: "exists", label: i18n.nodes.azureStorage.blobExists.pin_exists, type: "boolean", direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: { success: false, exists: false, error: resolved.error },
      };
    const result = await resolved.manager.blobExists(String(inputs.containerName ?? ""), String(inputs.blobName ?? ""));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryAzureStorage.azureStorageBlobExists(${inputs.credentialName}, ${inputs.containerName}, ${inputs.blobName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, exists: `${v}.exists`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_AZURE_STORAGE_IMPORT],
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
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: { success: false, url: "", error: resolved.error },
      };
    const result = await resolved.manager.generateBlobSasUrl(String(inputs.containerName ?? ""), String(inputs.blobName ?? ""), String(inputs.permissions ?? "r"), Number(inputs.expiresInMinutes ?? 60));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)} = await functionLibraryAzureStorage.azureStorageGenerateBlobSasUrl(${inputs.credentialName}, ${inputs.containerName}, ${inputs.blobName}, ${inputs.permissions}, ${inputs.expiresInMinutes});`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, url: `${v}.url`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_AZURE_STORAGE_IMPORT],
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
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: { success: false, url: "", error: resolved.error },
      };
    const result = await resolved.manager.generateContainerSasUrl(String(inputs.containerName ?? ""), String(inputs.permissions ?? "r"), Number(inputs.expiresInMinutes ?? 60));
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryAzureStorage.azureStorageGenerateContainerSasUrl(${inputs.credentialName}, ${inputs.containerName}, ${inputs.permissions}, ${inputs.expiresInMinutes});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, url: `${v}.url`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_AZURE_STORAGE_IMPORT],
});

registerNode({
  type: "azureStorage.getAccountInfo",
  label: i18n.nodes.azureStorage.getAccountInfo.label,
  description: i18n.nodes.azureStorage.getAccountInfo.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [execInPin(), credentialNamePin(), execOutPin(), successPin(), { id: "accountInfo", label: i18n.nodes.azureStorage.accountInfo.label, type: "struct", subType: ACCOUNT_INFO_STRUCT_TYPE, direction: "output" }, errorPin()],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: {
          success: false,
          accountInfo: { accountKind: "", skuName: "" },
          error: resolved.error,
        },
      };
    const result = await resolved.manager.getAccountInfo();
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
  compileExecute: ({ node, inputs, compileFrom }) => [`const ${compileResultVar(node.id)} = await functionLibraryAzureStorage.azureStorageGetAccountInfo(${inputs.credentialName});`, ...compileFrom("exec-out")],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return { success: `${v}.success`, accountInfo: `${v}.accountInfo`, error: `${v}.error` };
  },
  compileImports: [FUNCTION_LIBRARY_AZURE_STORAGE_IMPORT],
});
