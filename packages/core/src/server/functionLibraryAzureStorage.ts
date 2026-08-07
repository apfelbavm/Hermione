import { AzureStorageManager, type AzureStorageBlobUploadOptions } from "../lib/azureStorageManager.ts";

interface MapEntry {
  key: unknown;
  value: unknown;
}

/** Mirrors nodes/azureStorage.ts's own mapEntriesToRecord/recordToMapEntries — duplicated rather
 * than shared since this module and the node file are never imported by the same runtime (see
 * azureStorageCredentialFromEnv below). */
function mapEntriesToRecord(value: unknown): Record<string, string> {
  const entries = Array.isArray(value) ? (value as MapEntry[]) : [];
  const record: Record<string, string> = {};
  for (const entry of entries) record[String(entry.key ?? "")] = String(entry.value ?? "");
  return record;
}

function recordToMapEntries(record: Record<string, string>): MapEntry[] {
  return Object.entries(record).map(([key, value]) => ({ key, value }));
}

/** Compile-time-only counterpart of nodes/azureStorage.ts's execute() vault lookup
 * (resolveAzureStorageCredential) — the compiled/deployed script has no access to the Credential
 * Vault database, only the interpreter does, so it reads the same credential's connection string
 * back from environment variables instead, the same "HERMIONE_CRED_<NAME>_<FIELD>" naming
 * credentialEnv.ts's applyCredentialEnvVars writes. Never called by the interpreter — genuinely
 * different credential-sourcing behavior, not duplicated logic.
 *
 * Kept in its own file, separate from functionLibrary.ts, purely to mirror
 * functionLibraryJira.ts/functionLibrarySftp.ts's one-node-family-per-file convention. */
function azureStorageManagerFromEnv(credentialName: string): { ok: true; manager: AzureStorageManager } | { ok: false; error: string } {
  const prefix = `HERMIONE_CRED_${String(credentialName)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")}`;
  const type = process.env[`${prefix}_CREDENTIAL_TYPE`];
  if (type !== "azureStorageConnectionString") return { ok: false, error: `Credential "${credentialName}" not found in the vault, or is not an Azure Storage credential` };
  return { ok: true, manager: AzureStorageManager.forCredential(process.env[`${prefix}_CONNECTION_STRING`] || "") };
}

export async function azureStorageListContainers(credentialName: string, prefix: string) {
  const cred = azureStorageManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, containers: [], error: cred.error };
  return cred.manager.listContainers(prefix);
}

export async function azureStorageCreateContainer(credentialName: string, containerName: string, access: "private" | "blob" | "container") {
  const cred = azureStorageManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.createContainer(containerName, access);
}

export async function azureStorageDeleteContainer(credentialName: string, containerName: string) {
  const cred = azureStorageManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.deleteContainer(containerName);
}

export async function azureStorageGetContainerProperties(credentialName: string, containerName: string) {
  const cred = azureStorageManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, properties: { etag: "", lastModified: "", publicAccess: "", metadata: [] }, error: cred.error };
  const result = await cred.manager.getContainerProperties(containerName);
  return {
    success: result.success,
    properties: { etag: result.etag, lastModified: result.lastModified, publicAccess: result.publicAccess, metadata: recordToMapEntries(result.metadata) },
    error: result.error,
  };
}

export async function azureStorageSetContainerMetadata(credentialName: string, containerName: string, metadata: unknown) {
  const cred = azureStorageManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.setContainerMetadata(containerName, mapEntriesToRecord(metadata));
}

export async function azureStorageListBlobs(credentialName: string, containerName: string, prefix: string, recursive: boolean) {
  const cred = azureStorageManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, blobs: [], error: cred.error };
  return cred.manager.listBlobs(containerName, prefix, recursive);
}

export async function azureStorageUploadBlob(credentialName: string, containerName: string, blobName: string, content: string, encoding: "utf8" | "base64", options: Partial<AzureStorageBlobUploadOptions> & { metadata?: unknown }, overwrite: boolean) {
  const cred = azureStorageManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  const uploadOptions: AzureStorageBlobUploadOptions = {
    contentType: String(options.contentType ?? ""),
    cacheControl: String(options.cacheControl ?? ""),
    contentEncoding: String(options.contentEncoding ?? ""),
    contentLanguage: String(options.contentLanguage ?? ""),
    contentDisposition: String(options.contentDisposition ?? ""),
    tier: String(options.tier ?? ""),
    metadata: mapEntriesToRecord(options.metadata),
  };
  return cred.manager.uploadBlob(containerName, blobName, content, encoding, uploadOptions, overwrite);
}

export async function azureStorageDownloadBlob(credentialName: string, containerName: string, blobName: string, encoding: "utf8" | "base64") {
  const cred = azureStorageManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, content: "", error: cred.error };
  return cred.manager.downloadBlob(containerName, blobName, encoding);
}

export async function azureStorageDeleteBlob(credentialName: string, containerName: string, blobName: string) {
  const cred = azureStorageManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.deleteBlob(containerName, blobName);
}

export async function azureStorageCopyBlob(credentialName: string, sourceContainer: string, sourceBlob: string, destContainer: string, destBlob: string) {
  const cred = azureStorageManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.copyBlob(sourceContainer, sourceBlob, destContainer, destBlob);
}

export async function azureStorageMoveBlob(credentialName: string, sourceContainer: string, sourceBlob: string, destContainer: string, destBlob: string) {
  const cred = azureStorageManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.moveBlob(sourceContainer, sourceBlob, destContainer, destBlob);
}

export async function azureStorageGetBlobProperties(credentialName: string, containerName: string, blobName: string) {
  const cred = azureStorageManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, properties: { size: 0, contentType: "", etag: "", lastModified: "", metadata: [] }, error: cred.error };
  const result = await cred.manager.getBlobProperties(containerName, blobName);
  return {
    success: result.success,
    properties: { size: result.size, contentType: result.contentType, etag: result.etag, lastModified: result.lastModified, metadata: recordToMapEntries(result.metadata) },
    error: result.error,
  };
}

export async function azureStorageSetBlobMetadata(credentialName: string, containerName: string, blobName: string, metadata: unknown) {
  const cred = azureStorageManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.setBlobMetadata(containerName, blobName, mapEntriesToRecord(metadata));
}

export async function azureStorageBlobExists(credentialName: string, containerName: string, blobName: string) {
  const cred = azureStorageManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, exists: false, error: cred.error };
  return cred.manager.blobExists(containerName, blobName);
}

export async function azureStorageGenerateBlobSasUrl(credentialName: string, containerName: string, blobName: string, permissions: string, expiresInMinutes: number) {
  const cred = azureStorageManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, url: "", error: cred.error };
  return cred.manager.generateBlobSasUrl(containerName, blobName, permissions, expiresInMinutes);
}

export async function azureStorageGenerateContainerSasUrl(credentialName: string, containerName: string, permissions: string, expiresInMinutes: number) {
  const cred = azureStorageManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, url: "", error: cred.error };
  return cred.manager.generateContainerSasUrl(containerName, permissions, expiresInMinutes);
}

export async function azureStorageGetAccountInfo(credentialName: string) {
  const cred = azureStorageManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, accountInfo: { accountKind: "", skuName: "" }, error: cred.error };
  const result = await cred.manager.getAccountInfo();
  return { success: result.success, accountInfo: { accountKind: result.accountKind, skuName: result.skuName }, error: result.error };
}
