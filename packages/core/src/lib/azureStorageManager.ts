import { BlobSASPermissions, BlobServiceClient, type BlockBlobUploadOptions, type ContainerListBlobsOptions, type ContainerSASPermissions, type PublicAccessType } from "@azure/storage-blob";
import { getDatabaseManager } from "../server/DatabaseManager.ts";
import { resolveAllCredentials } from "../server/vaultCredentials.ts";
import type { AzureStorageConnectionStringCredentialData } from "@hermione/shared/types";

// ContainerSASPermissions is a class, but the SDK's browser build (this file can end up bundled
// client-side, unlike Node-only managers such as DropboxManager) doesn't export it — only its
// type, and only a `.toString()` method off an instance, so a plain object standing in for one
// works at runtime without ever needing the real class.
function containerSasPermissions(permissions: string): ContainerSASPermissions {
  return { toString: () => permissions } as unknown as ContainerSASPermissions;
}

/** Every Azure Storage node (containers, blobs, metadata, SAS links) needs the same boilerplate:
 * build a BlobServiceClient from a connection string, drill down to the right Container/Blob
 * client, call one SDK method, and turn either a result or a thrown error into a plain
 * {success, error} shape. Centralized here once instead of repeated per node (see
 * nodes/azureStorage.ts, which only wires pins to these methods). */

export interface AzureStorageAuth {
  connectionString: string;
}

export interface AzureStorageOpResult {
  success: boolean;
  error: string;
  [key: string]: unknown;
}

export interface AzureStorageListContainersResult extends AzureStorageOpResult {
  containers: string[];
}

export interface AzureStorageContainerPropertiesResult extends AzureStorageOpResult {
  etag: string;
  lastModified: string;
  publicAccess: string;
  metadata: Record<string, string>;
}

export interface AzureStorageListBlobsResult extends AzureStorageOpResult {
  blobs: string[];
}

export interface AzureStorageDownloadResult extends AzureStorageOpResult {
  content: string;
}

export interface AzureStorageBlobPropertiesResult extends AzureStorageOpResult {
  size: number;
  contentType: string;
  etag: string;
  lastModified: string;
  metadata: Record<string, string>;
}

export interface AzureStorageExistsResult extends AzureStorageOpResult {
  exists: boolean;
}

export interface AzureStorageSasUrlResult extends AzureStorageOpResult {
  url: string;
}

export interface AzureStorageAccountInfoResult extends AzureStorageOpResult {
  accountKind: string;
  skuName: string;
}

/** The fields of BlockBlobUploadOptions this app exposes as a struct pin type (see
 * nodes/azureStorage.ts's registered "azureStorageBlobUploadOptions" struct and nodes/struct.ts's
 * generic Make/Break Struct nodes) — an empty string/{} field means "leave that SDK option unset". */
export interface AzureStorageBlobUploadOptions {
  contentType: string;
  cacheControl: string;
  contentEncoding: string;
  contentLanguage: string;
  contentDisposition: string;
  tier: string;
  metadata: Record<string, string>;
}

const managerCache = new Map<string, AzureStorageManager>();

export class AzureStorageManager {
  private readonly client: BlobServiceClient;

  /** Reuses one AzureStorageManager (and its underlying BlobServiceClient) per distinct connection
   * string instead of building a fresh one per node execution, same reasoning as
   * DropboxManager.forCredential. */
  static getInstance(auth: AzureStorageAuth): AzureStorageManager {
    let manager = managerCache.get(auth.connectionString);
    if (!manager) {
      manager = new AzureStorageManager(auth.connectionString);
      managerCache.set(auth.connectionString, manager);
    }
    return manager;
  }

  private constructor(connectionString: string) {
    this.client = BlobServiceClient.fromConnectionString(connectionString);
  }

  static errorMessage(err: unknown): string {
    if (err && typeof err === "object" && "details" in err) {
      const details = (err as { details?: { errorCode?: string; message?: string } }).details;
      if (details?.message) return details.message;
      if (details?.errorCode) return details.errorCode;
    }
    return err instanceof Error ? err.message : String(err);
  }

  private static async findCredential(credentialName: string): Promise<{ ok: true; auth: AzureStorageAuth } | { ok: false; error: string }> {
    const credRecord = (await resolveAllCredentials(getDatabaseManager())).get(credentialName);
    if (!credRecord) return { ok: false, error: `Credential "${credentialName}" not found in the vault` };
    if (credRecord.type !== "azureStorageConnectionString") return { ok: false, error: `Credential "${credentialName}" is not an Azure Storage credential` };
    const data = credRecord.data as AzureStorageConnectionStringCredentialData;
    return { ok: true, auth: { connectionString: data.connectionString } };
  }

  static async listContainers(credentialName: string, prefix: string): Promise<AzureStorageListContainersResult> {
    const cred = await AzureStorageManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, containers: [], error: cred.error };
    return AzureStorageManager.getInstance(cred.auth).listContainers(prefix);
  }

  static async createContainer(credentialName: string, containerName: string, access: "private" | "blob" | "container"): Promise<AzureStorageOpResult> {
    const cred = await AzureStorageManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return AzureStorageManager.getInstance(cred.auth).createContainer(containerName, access);
  }

  static async deleteContainer(credentialName: string, containerName: string): Promise<AzureStorageOpResult> {
    const cred = await AzureStorageManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return AzureStorageManager.getInstance(cred.auth).deleteContainer(containerName);
  }

  static async getContainerProperties(credentialName: string, containerName: string): Promise<AzureStorageContainerPropertiesResult> {
    const cred = await AzureStorageManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, etag: "", lastModified: "", publicAccess: "", metadata: {}, error: cred.error };
    return AzureStorageManager.getInstance(cred.auth).getContainerProperties(containerName);
  }

  static async setContainerMetadata(credentialName: string, containerName: string, metadata: Record<string, string>): Promise<AzureStorageOpResult> {
    const cred = await AzureStorageManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return AzureStorageManager.getInstance(cred.auth).setContainerMetadata(containerName, metadata);
  }

  static async listBlobs(credentialName: string, containerName: string, prefix: string, recursive: boolean): Promise<AzureStorageListBlobsResult> {
    const cred = await AzureStorageManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, blobs: [], error: cred.error };
    return AzureStorageManager.getInstance(cred.auth).listBlobs(containerName, prefix, recursive);
  }

  static async uploadBlob(credentialName: string, containerName: string, blobName: string, content: string, encoding: "utf8" | "base64", uploadOptions: AzureStorageBlobUploadOptions, overwrite: boolean): Promise<AzureStorageOpResult> {
    const cred = await AzureStorageManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return AzureStorageManager.getInstance(cred.auth).uploadBlob(containerName, blobName, content, encoding, uploadOptions, overwrite);
  }

  static async downloadBlob(credentialName: string, containerName: string, blobName: string, encoding: "utf8" | "base64"): Promise<AzureStorageDownloadResult> {
    const cred = await AzureStorageManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, content: "", error: cred.error };
    return AzureStorageManager.getInstance(cred.auth).downloadBlob(containerName, blobName, encoding);
  }

  static async deleteBlob(credentialName: string, containerName: string, blobName: string): Promise<AzureStorageOpResult> {
    const cred = await AzureStorageManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return AzureStorageManager.getInstance(cred.auth).deleteBlob(containerName, blobName);
  }

  static async copyBlob(credentialName: string, sourceContainer: string, sourceBlob: string, destContainer: string, destBlob: string): Promise<AzureStorageOpResult> {
    const cred = await AzureStorageManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return AzureStorageManager.getInstance(cred.auth).copyBlob(sourceContainer, sourceBlob, destContainer, destBlob);
  }

  static async moveBlob(credentialName: string, sourceContainer: string, sourceBlob: string, destContainer: string, destBlob: string): Promise<AzureStorageOpResult> {
    const cred = await AzureStorageManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return AzureStorageManager.getInstance(cred.auth).moveBlob(sourceContainer, sourceBlob, destContainer, destBlob);
  }

  static async getBlobProperties(credentialName: string, containerName: string, blobName: string): Promise<AzureStorageBlobPropertiesResult> {
    const cred = await AzureStorageManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, size: 0, contentType: "", etag: "", lastModified: "", metadata: {}, error: cred.error };
    return AzureStorageManager.getInstance(cred.auth).getBlobProperties(containerName, blobName);
  }

  static async setBlobMetadata(credentialName: string, containerName: string, blobName: string, metadata: Record<string, string>): Promise<AzureStorageOpResult> {
    const cred = await AzureStorageManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return AzureStorageManager.getInstance(cred.auth).setBlobMetadata(containerName, blobName, metadata);
  }

  static async blobExists(credentialName: string, containerName: string, blobName: string): Promise<AzureStorageExistsResult> {
    const cred = await AzureStorageManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, exists: false, error: cred.error };
    return AzureStorageManager.getInstance(cred.auth).blobExists(containerName, blobName);
  }

  static async generateBlobSasUrl(credentialName: string, containerName: string, blobName: string, permissions: string, expiresInMinutes: number): Promise<AzureStorageSasUrlResult> {
    const cred = await AzureStorageManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, url: "", error: cred.error };
    return AzureStorageManager.getInstance(cred.auth).generateBlobSasUrl(containerName, blobName, permissions, expiresInMinutes);
  }

  static async generateContainerSasUrl(credentialName: string, containerName: string, permissions: string, expiresInMinutes: number): Promise<AzureStorageSasUrlResult> {
    const cred = await AzureStorageManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, url: "", error: cred.error };
    return AzureStorageManager.getInstance(cred.auth).generateContainerSasUrl(containerName, permissions, expiresInMinutes);
  }

  static async getAccountInfo(credentialName: string): Promise<AzureStorageAccountInfoResult> {
    const cred = await AzureStorageManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, accountKind: "", skuName: "", error: cred.error };
    return AzureStorageManager.getInstance(cred.auth).getAccountInfo();
  }

  private async listContainers(prefix: string): Promise<AzureStorageListContainersResult> {
    try {
      const containers: string[] = [];
      for await (const container of this.client.listContainers({
        prefix: prefix || undefined,
      })) {
        containers.push(container.name);
      }
      return { success: true, containers, error: "" };
    } catch (err) {
      return { success: false, containers: [], error: AzureStorageManager.errorMessage(err) };
    }
  }

  private async createContainer(containerName: string, access: "private" | "blob" | "container"): Promise<AzureStorageOpResult> {
    try {
      const containerClient = this.client.getContainerClient(containerName);
      await containerClient.createIfNotExists(access === "private" ? {} : { access: access as PublicAccessType });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: AzureStorageManager.errorMessage(err) };
    }
  }

  private async deleteContainer(containerName: string): Promise<AzureStorageOpResult> {
    try {
      await this.client.getContainerClient(containerName).deleteIfExists();
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: AzureStorageManager.errorMessage(err) };
    }
  }

  private async getContainerProperties(containerName: string): Promise<AzureStorageContainerPropertiesResult> {
    try {
      const props = await this.client.getContainerClient(containerName).getProperties();
      return {
        success: true,
        etag: props.etag ?? "",
        lastModified: props.lastModified?.toISOString() ?? "",
        publicAccess: props.blobPublicAccess ?? "",
        metadata: props.metadata ?? {},
        error: "",
      };
    } catch (err) {
      return {
        success: false,
        etag: "",
        lastModified: "",
        publicAccess: "",
        metadata: {},
        error: AzureStorageManager.errorMessage(err),
      };
    }
  }

  private async setContainerMetadata(containerName: string, metadata: Record<string, string>): Promise<AzureStorageOpResult> {
    try {
      await this.client.getContainerClient(containerName).setMetadata(metadata);
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: AzureStorageManager.errorMessage(err) };
    }
  }

  private async listBlobs(containerName: string, prefix: string, recursive: boolean): Promise<AzureStorageListBlobsResult> {
    try {
      const containerClient = this.client.getContainerClient(containerName);
      const blobs: string[] = [];
      const options: ContainerListBlobsOptions = {
        prefix: prefix || undefined,
      };
      const iterator = recursive ? containerClient.listBlobsFlat(options) : containerClient.listBlobsByHierarchy("/", options);
      for await (const item of iterator) {
        blobs.push(item.name);
      }
      return { success: true, blobs, error: "" };
    } catch (err) {
      return { success: false, blobs: [], error: AzureStorageManager.errorMessage(err) };
    }
  }

  private async uploadBlob(containerName: string, blobName: string, content: string, encoding: "utf8" | "base64", uploadOptions: AzureStorageBlobUploadOptions, overwrite: boolean): Promise<AzureStorageOpResult> {
    try {
      const blockBlobClient = this.client.getContainerClient(containerName).getBlockBlobClient(blobName);
      const buffer = encoding === "base64" ? Buffer.from(content, "base64") : Buffer.from(content, "utf8");
      const { contentType, cacheControl, contentEncoding, contentLanguage, contentDisposition, tier, metadata } = uploadOptions;
      const options: BlockBlobUploadOptions = {
        blobHTTPHeaders:
          contentType || cacheControl || contentEncoding || contentLanguage || contentDisposition
            ? {
                blobContentType: contentType || undefined,
                blobCacheControl: cacheControl || undefined,
                blobContentEncoding: contentEncoding || undefined,
                blobContentLanguage: contentLanguage || undefined,
                blobContentDisposition: contentDisposition || undefined,
              }
            : undefined,
        tier: tier || undefined,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      };
      if (!overwrite && (await blockBlobClient.exists())) {
        return { success: false, error: `Blob "${blobName}" already exists` };
      }
      await blockBlobClient.upload(buffer, buffer.length, options);
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: AzureStorageManager.errorMessage(err) };
    }
  }

  private async downloadBlob(containerName: string, blobName: string, encoding: "utf8" | "base64"): Promise<AzureStorageDownloadResult> {
    try {
      const blockBlobClient = this.client.getContainerClient(containerName).getBlockBlobClient(blobName);
      const buffer = await blockBlobClient.downloadToBuffer();
      return { success: true, content: buffer.toString(encoding), error: "" };
    } catch (err) {
      return { success: false, content: "", error: AzureStorageManager.errorMessage(err) };
    }
  }

  private async deleteBlob(containerName: string, blobName: string): Promise<AzureStorageOpResult> {
    try {
      await this.client.getContainerClient(containerName).getBlockBlobClient(blobName).deleteIfExists();
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: AzureStorageManager.errorMessage(err) };
    }
  }

  /** Blob storage has no server-side rename/move route — copying to the new location then deleting
   * the original IS the move, same reasoning as DropboxManager.rename aliasing move(). */
  private async copyBlob(sourceContainer: string, sourceBlob: string, destContainer: string, destBlob: string): Promise<AzureStorageOpResult> {
    try {
      const sourceClient = this.client.getContainerClient(sourceContainer).getBlockBlobClient(sourceBlob);
      const destClient = this.client.getContainerClient(destContainer).getBlockBlobClient(destBlob);
      const poller = await destClient.beginCopyFromURL(sourceClient.url);
      await poller.pollUntilDone();
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: AzureStorageManager.errorMessage(err) };
    }
  }

  private async moveBlob(sourceContainer: string, sourceBlob: string, destContainer: string, destBlob: string): Promise<AzureStorageOpResult> {
    const copyResult = await this.copyBlob(sourceContainer, sourceBlob, destContainer, destBlob);
    if (!copyResult.success) return copyResult;
    return this.deleteBlob(sourceContainer, sourceBlob);
  }

  private async getBlobProperties(containerName: string, blobName: string): Promise<AzureStorageBlobPropertiesResult> {
    try {
      const props = await this.client.getContainerClient(containerName).getBlockBlobClient(blobName).getProperties();
      return {
        success: true,
        size: props.contentLength ?? 0,
        contentType: props.contentType ?? "",
        etag: props.etag ?? "",
        lastModified: props.lastModified?.toISOString() ?? "",
        metadata: props.metadata ?? {},
        error: "",
      };
    } catch (err) {
      return {
        success: false,
        size: 0,
        contentType: "",
        etag: "",
        lastModified: "",
        metadata: {},
        error: AzureStorageManager.errorMessage(err),
      };
    }
  }

  private async setBlobMetadata(containerName: string, blobName: string, metadata: Record<string, string>): Promise<AzureStorageOpResult> {
    try {
      await this.client.getContainerClient(containerName).getBlockBlobClient(blobName).setMetadata(metadata);
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: AzureStorageManager.errorMessage(err) };
    }
  }

  private async blobExists(containerName: string, blobName: string): Promise<AzureStorageExistsResult> {
    try {
      const exists = await this.client.getContainerClient(containerName).getBlockBlobClient(blobName).exists();
      return { success: true, exists, error: "" };
    } catch (err) {
      return { success: false, exists: false, error: AzureStorageManager.errorMessage(err) };
    }
  }

  private async generateBlobSasUrl(containerName: string, blobName: string, permissions: string, expiresInMinutes: number): Promise<AzureStorageSasUrlResult> {
    try {
      const blockBlobClient = this.client.getContainerClient(containerName).getBlockBlobClient(blobName);
      const url = await blockBlobClient.generateSasUrl({
        permissions: BlobSASPermissions.parse(permissions),
        expiresOn: new Date(Date.now() + expiresInMinutes * 60_000),
      });
      return { success: true, url, error: "" };
    } catch (err) {
      return { success: false, url: "", error: AzureStorageManager.errorMessage(err) };
    }
  }

  private async generateContainerSasUrl(containerName: string, permissions: string, expiresInMinutes: number): Promise<AzureStorageSasUrlResult> {
    try {
      const containerClient = this.client.getContainerClient(containerName);
      const url = await containerClient.generateSasUrl({
        permissions: containerSasPermissions(permissions),
        expiresOn: new Date(Date.now() + expiresInMinutes * 60_000),
      });
      return { success: true, url, error: "" };
    } catch (err) {
      return { success: false, url: "", error: AzureStorageManager.errorMessage(err) };
    }
  }

  private async getAccountInfo(): Promise<AzureStorageAccountInfoResult> {
    try {
      const info = await this.client.getAccountInfo();
      return {
        success: true,
        accountKind: info.accountKind ?? "",
        skuName: info.skuName ?? "",
        error: "",
      };
    } catch (err) {
      return {
        success: false,
        accountKind: "",
        skuName: "",
        error: AzureStorageManager.errorMessage(err),
      };
    }
  }
}
