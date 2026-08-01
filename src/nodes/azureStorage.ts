import { NodeColorCategory, type ExecutionContext } from "../engine/types";
import { registerNode } from "../engine/registry";
import { registerStructType } from "../engine/structRegistry";
import { AzureStorageManager } from "../lib/azureStorageManager";
import type { AzureStorageBlobUploadOptions } from "../lib/azureStorageManager";
import type { AzureStorageConnectionStringCredentialData } from "../credentials/types";
import { i18n } from "@i18n";

// Every operation below is a thin pin-wiring shim over AzureStorageManager (src/lib/azureStorageManager.ts),
// which owns the actual SDK calls and error normalization — this file only ever translates pins to
// method arguments and method results back to pins. Interpreter-only for now (no compileExecute/
// compileImports), same "out of scope for now" deferral as nodes/dropbox.ts.
//
// Every operation node takes a Credential Name directly (no separate auth/refresh node): each
// resolves the named vault entry and hands its connection string to AzureStorageManager.forCredential,
// which caches the underlying BlobServiceClient — see azureStorageManager.ts.

const ENCODING_OPTIONS = ["utf8", "base64"];
const ACCESS_OPTIONS = ["private", "blob", "container"];
const TIER_OPTIONS = ["", "Hot", "Cool", "Cold", "Archive"];
const GROUP_NAME = "Request.AzureStorage";

// The concrete example: Upload Blob's "options" pin is a struct (see engine/structRegistry.ts and
// nodes/struct.ts's generic Make/Break Struct nodes) instead of one bare contentType string, so a
// flow can build one full BlockBlobUploadOptions-shaped value with Make Struct (or plug in a
// literal built right on this pin) and reuse it across multiple uploads.
const UPLOAD_OPTIONS_STRUCT_TYPE = "azureStorageBlobUploadOptions";

registerStructType({
  id: UPLOAD_OPTIONS_STRUCT_TYPE,
  label: i18n.nodes.azureStorage.uploadOptions.label,
  fields: [
    {
      id: "contentType",
      label: i18n.nodes.azureStorage.uploadOptions.pin_content_type,
      type: "string",
      defaultValue: "",
    },
    {
      id: "cacheControl",
      label: i18n.nodes.azureStorage.uploadOptions.pin_cache_control,
      type: "string",
      defaultValue: "",
    },
    {
      id: "contentEncoding",
      label: i18n.nodes.azureStorage.uploadOptions.pin_content_encoding,
      type: "string",
      defaultValue: "",
    },
    {
      id: "contentLanguage",
      label: i18n.nodes.azureStorage.uploadOptions.pin_content_language,
      type: "string",
      defaultValue: "",
    },
    {
      id: "contentDisposition",
      label: i18n.nodes.azureStorage.uploadOptions.pin_content_disposition,
      type: "string",
      defaultValue: "",
    },
    {
      id: "tier",
      label: i18n.nodes.azureStorage.uploadOptions.pin_tier,
      type: "string",
      defaultValue: TIER_OPTIONS[0],
      options: TIER_OPTIONS,
    },
    {
      id: "metadata",
      label: i18n.nodes.azureStorage.__shared.pin_metadata,
      type: "string",
      container: "map",
      keyType: "string",
      defaultValue: [],
    },
  ],
});

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

function metadataOutPin() {
  return {
    id: "metadata",
    label: i18n.nodes.azureStorage.__shared.pin_metadata,
    type: "string" as const,
    direction: "output" as const,
    container: "map" as const,
    keyType: "string" as const,
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
    {
      id: "prefix",
      label: i18n.nodes.azureStorage.__shared.pin_prefix,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    execOutPin(),
    successPin(),
    {
      id: "containers",
      label: i18n.nodes.azureStorage.listContainers.pin_containers,
      type: "string",
      container: "array",
      direction: "output",
    },
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
    {
      id: "access",
      label: i18n.nodes.azureStorage.createContainer.pin_access,
      type: "string",
      direction: "input",
      defaultValue: ACCESS_OPTIONS[0],
      options: ACCESS_OPTIONS,
    },
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
});

registerNode({
  type: "azureStorage.getContainerProperties",
  label: i18n.nodes.azureStorage.getContainerProperties.label,
  description: i18n.nodes.azureStorage.getContainerProperties.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    containerNamePin(),
    execOutPin(),
    successPin(),
    {
      id: "etag",
      label: i18n.nodes.azureStorage.__shared.pin_etag,
      type: "string",
      direction: "output",
    },
    {
      id: "lastModified",
      label: i18n.nodes.azureStorage.__shared.pin_last_modified,
      type: "string",
      direction: "output",
    },
    {
      id: "publicAccess",
      label: i18n.nodes.azureStorage.getContainerProperties.pin_public_access,
      type: "string",
      direction: "output",
    },
    metadataOutPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: {
          success: false,
          etag: "",
          lastModified: "",
          publicAccess: "",
          metadata: [],
          error: resolved.error,
        },
      };
    const result = await resolved.manager.getContainerProperties(String(inputs.containerName ?? ""));
    return {
      nextExec: "exec-out",
      outputs: { ...result, metadata: recordToMapEntries(result.metadata) },
    };
  },
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
    {
      id: "prefix",
      label: i18n.nodes.azureStorage.__shared.pin_prefix,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "recursive",
      label: i18n.nodes.azureStorage.listBlobs.pin_recursive,
      type: "boolean",
      direction: "input",
      defaultValue: false,
    },
    execOutPin(),
    successPin(),
    {
      id: "blobs",
      label: i18n.nodes.azureStorage.listBlobs.pin_blobs,
      type: "string",
      container: "array",
      direction: "output",
    },
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
    {
      id: "content",
      label: i18n.nodes.azureStorage.uploadBlob.pin_content,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "encoding",
      label: i18n.nodes.azureStorage.__shared.pin_encoding,
      type: "string",
      direction: "input",
      defaultValue: ENCODING_OPTIONS[0],
      options: ENCODING_OPTIONS,
    },
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
        tier: TIER_OPTIONS[0],
        metadata: [],
      },
    },
    {
      id: "overwrite",
      label: i18n.nodes.azureStorage.uploadBlob.pin_overwrite,
      type: "boolean",
      direction: "input",
      defaultValue: true,
    },
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
    {
      id: "encoding",
      label: i18n.nodes.azureStorage.__shared.pin_encoding,
      type: "string",
      direction: "input",
      defaultValue: ENCODING_OPTIONS[0],
      options: ENCODING_OPTIONS,
    },
    execOutPin(),
    successPin(),
    {
      id: "content",
      label: i18n.nodes.azureStorage.downloadBlob.pin_content,
      type: "string",
      direction: "output",
    },
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
      {
        id: "sourceContainer",
        label: i18n.nodes.azureStorage.__shared.pin_source_container,
        type: "string",
        direction: "input",
        defaultValue: "",
      },
      {
        id: "sourceBlob",
        label: i18n.nodes.azureStorage.__shared.pin_source_blob,
        type: "string",
        direction: "input",
        defaultValue: "",
      },
      {
        id: "destContainer",
        label: i18n.nodes.azureStorage.__shared.pin_dest_container,
        type: "string",
        direction: "input",
        defaultValue: "",
      },
      {
        id: "destBlob",
        label: i18n.nodes.azureStorage.__shared.pin_dest_blob,
        type: "string",
        direction: "input",
        defaultValue: "",
      },
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
  pins: [
    execInPin(),
    credentialNamePin(),
    containerNamePin(),
    blobNamePin(),
    execOutPin(),
    successPin(),
    {
      id: "size",
      label: i18n.nodes.azureStorage.getBlobProperties.pin_size,
      type: "number",
      direction: "output",
    },
    {
      id: "contentType",
      label: i18n.nodes.azureStorage.uploadOptions.pin_content_type,
      type: "string",
      direction: "output",
    },
    {
      id: "etag",
      label: i18n.nodes.azureStorage.__shared.pin_etag,
      type: "string",
      direction: "output",
    },
    {
      id: "lastModified",
      label: i18n.nodes.azureStorage.__shared.pin_last_modified,
      type: "string",
      direction: "output",
    },
    metadataOutPin(),
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: {
          success: false,
          size: 0,
          contentType: "",
          etag: "",
          lastModified: "",
          metadata: [],
          error: resolved.error,
        },
      };
    const result = await resolved.manager.getBlobProperties(String(inputs.containerName ?? ""), String(inputs.blobName ?? ""));
    return {
      nextExec: "exec-out",
      outputs: { ...result, metadata: recordToMapEntries(result.metadata) },
    };
  },
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
});

registerNode({
  type: "azureStorage.blobExists",
  label: i18n.nodes.azureStorage.blobExists.label,
  description: i18n.nodes.azureStorage.blobExists.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    containerNamePin(),
    blobNamePin(),
    execOutPin(),
    successPin(),
    {
      id: "exists",
      label: i18n.nodes.azureStorage.blobExists.pin_exists,
      type: "boolean",
      direction: "output",
    },
    errorPin(),
  ],
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
    {
      id: "permissions",
      label: i18n.nodes.azureStorage.__shared.pin_permissions,
      type: "string",
      direction: "input",
      defaultValue: "r",
    },
    {
      id: "expiresInMinutes",
      label: i18n.nodes.azureStorage.__shared.pin_expires_in_minutes,
      type: "number",
      direction: "input",
      defaultValue: 60,
    },
    execOutPin(),
    successPin(),
    {
      id: "url",
      label: i18n.nodes.azureStorage.__shared.pin_url,
      type: "string",
      direction: "output",
    },
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
    {
      id: "permissions",
      label: i18n.nodes.azureStorage.__shared.pin_permissions,
      type: "string",
      direction: "input",
      defaultValue: "r",
    },
    {
      id: "expiresInMinutes",
      label: i18n.nodes.azureStorage.__shared.pin_expires_in_minutes,
      type: "number",
      direction: "input",
      defaultValue: 60,
    },
    execOutPin(),
    successPin(),
    {
      id: "url",
      label: i18n.nodes.azureStorage.__shared.pin_url,
      type: "string",
      direction: "output",
    },
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
});

registerNode({
  type: "azureStorage.getAccountInfo",
  label: i18n.nodes.azureStorage.getAccountInfo.label,
  description: i18n.nodes.azureStorage.getAccountInfo.description,
  group: GROUP_NAME,
  colorCategory: NodeColorCategory.Integration,
  pins: [
    execInPin(),
    credentialNamePin(),
    execOutPin(),
    successPin(),
    {
      id: "accountKind",
      label: i18n.nodes.azureStorage.getAccountInfo.pin_account_kind,
      type: "string",
      direction: "output",
    },
    {
      id: "skuName",
      label: i18n.nodes.azureStorage.getAccountInfo.pin_sku_name,
      type: "string",
      direction: "output",
    },
    errorPin(),
  ],
  latent: true,
  execute: async ({ inputs, ctx }) => {
    const resolved = managerFor(ctx, String(inputs.credentialName ?? ""));
    if (!resolved.ok)
      return {
        nextExec: "exec-out",
        outputs: {
          success: false,
          accountKind: "",
          skuName: "",
          error: resolved.error,
        },
      };
    const result = await resolved.manager.getAccountInfo();
    return { nextExec: "exec-out", outputs: result };
  },
});
