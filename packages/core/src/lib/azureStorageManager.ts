import { BlobSASPermissions, BlobServiceClient, type BlockBlobUploadOptions, type ContainerListBlobsOptions, type ContainerSASPermissions, type PublicAccessType } from "@azure/storage-blob";

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

function azureErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "details" in err) {
    const details = (err as { details?: { errorCode?: string; message?: string } }).details;
    if (details?.message) return details.message;
    if (details?.errorCode) return details.errorCode;
  }
  return err instanceof Error ? err.message : String(err);
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

  constructor(connectionString: string) {
    this.client = BlobServiceClient.fromConnectionString(connectionString);
  }

  /** Reuses one AzureStorageManager (and its underlying BlobServiceClient) per distinct connection
   * string instead of building a fresh one per node execution, same reasoning as
   * DropboxManager.forCredential. */
  static forCredential(connectionString: string): AzureStorageManager {
    let manager = managerCache.get(connectionString);
    if (!manager) {
      manager = new AzureStorageManager(connectionString);
      managerCache.set(connectionString, manager);
    }
    return manager;
  }

  async listContainers(prefix: string): Promise<AzureStorageListContainersResult> {
    try {
      const containers: string[] = [];
      for await (const container of this.client.listContainers({
        prefix: prefix || undefined,
      })) {
        containers.push(container.name);
      }
      return { success: true, containers, error: "" };
    } catch (err) {
      return { success: false, containers: [], error: azureErrorMessage(err) };
    }
  }

  async createContainer(containerName: string, access: "private" | "blob" | "container"): Promise<AzureStorageOpResult> {
    try {
      const containerClient = this.client.getContainerClient(containerName);
      await containerClient.createIfNotExists(access === "private" ? {} : { access: access as PublicAccessType });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: azureErrorMessage(err) };
    }
  }

  async deleteContainer(containerName: string): Promise<AzureStorageOpResult> {
    try {
      await this.client.getContainerClient(containerName).deleteIfExists();
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: azureErrorMessage(err) };
    }
  }

  async getContainerProperties(containerName: string): Promise<AzureStorageContainerPropertiesResult> {
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
        error: azureErrorMessage(err),
      };
    }
  }

  async setContainerMetadata(containerName: string, metadata: Record<string, string>): Promise<AzureStorageOpResult> {
    try {
      await this.client.getContainerClient(containerName).setMetadata(metadata);
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: azureErrorMessage(err) };
    }
  }

  async listBlobs(containerName: string, prefix: string, recursive: boolean): Promise<AzureStorageListBlobsResult> {
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
      return { success: false, blobs: [], error: azureErrorMessage(err) };
    }
  }

  async uploadBlob(containerName: string, blobName: string, content: string, encoding: "utf8" | "base64", uploadOptions: AzureStorageBlobUploadOptions, overwrite: boolean): Promise<AzureStorageOpResult> {
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
      return { success: false, error: azureErrorMessage(err) };
    }
  }

  async downloadBlob(containerName: string, blobName: string, encoding: "utf8" | "base64"): Promise<AzureStorageDownloadResult> {
    try {
      const blockBlobClient = this.client.getContainerClient(containerName).getBlockBlobClient(blobName);
      const buffer = await blockBlobClient.downloadToBuffer();
      return { success: true, content: buffer.toString(encoding), error: "" };
    } catch (err) {
      return { success: false, content: "", error: azureErrorMessage(err) };
    }
  }

  async deleteBlob(containerName: string, blobName: string): Promise<AzureStorageOpResult> {
    try {
      await this.client.getContainerClient(containerName).getBlockBlobClient(blobName).deleteIfExists();
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: azureErrorMessage(err) };
    }
  }

  /** Blob storage has no server-side rename/move route — copying to the new location then deleting
   * the original IS the move, same reasoning as DropboxManager.rename aliasing move(). */
  async copyBlob(sourceContainer: string, sourceBlob: string, destContainer: string, destBlob: string): Promise<AzureStorageOpResult> {
    try {
      const sourceClient = this.client.getContainerClient(sourceContainer).getBlockBlobClient(sourceBlob);
      const destClient = this.client.getContainerClient(destContainer).getBlockBlobClient(destBlob);
      const poller = await destClient.beginCopyFromURL(sourceClient.url);
      await poller.pollUntilDone();
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: azureErrorMessage(err) };
    }
  }

  async moveBlob(sourceContainer: string, sourceBlob: string, destContainer: string, destBlob: string): Promise<AzureStorageOpResult> {
    const copyResult = await this.copyBlob(sourceContainer, sourceBlob, destContainer, destBlob);
    if (!copyResult.success) return copyResult;
    return this.deleteBlob(sourceContainer, sourceBlob);
  }

  async getBlobProperties(containerName: string, blobName: string): Promise<AzureStorageBlobPropertiesResult> {
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
        error: azureErrorMessage(err),
      };
    }
  }

  async setBlobMetadata(containerName: string, blobName: string, metadata: Record<string, string>): Promise<AzureStorageOpResult> {
    try {
      await this.client.getContainerClient(containerName).getBlockBlobClient(blobName).setMetadata(metadata);
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: azureErrorMessage(err) };
    }
  }

  async blobExists(containerName: string, blobName: string): Promise<AzureStorageExistsResult> {
    try {
      const exists = await this.client.getContainerClient(containerName).getBlockBlobClient(blobName).exists();
      return { success: true, exists, error: "" };
    } catch (err) {
      return { success: false, exists: false, error: azureErrorMessage(err) };
    }
  }

  async generateBlobSasUrl(containerName: string, blobName: string, permissions: string, expiresInMinutes: number): Promise<AzureStorageSasUrlResult> {
    try {
      const blockBlobClient = this.client.getContainerClient(containerName).getBlockBlobClient(blobName);
      const url = await blockBlobClient.generateSasUrl({
        permissions: BlobSASPermissions.parse(permissions),
        expiresOn: new Date(Date.now() + expiresInMinutes * 60_000),
      });
      return { success: true, url, error: "" };
    } catch (err) {
      return { success: false, url: "", error: azureErrorMessage(err) };
    }
  }

  async generateContainerSasUrl(containerName: string, permissions: string, expiresInMinutes: number): Promise<AzureStorageSasUrlResult> {
    try {
      const containerClient = this.client.getContainerClient(containerName);
      const url = await containerClient.generateSasUrl({
        permissions: containerSasPermissions(permissions),
        expiresOn: new Date(Date.now() + expiresInMinutes * 60_000),
      });
      return { success: true, url, error: "" };
    } catch (err) {
      return { success: false, url: "", error: azureErrorMessage(err) };
    }
  }

  async getAccountInfo(): Promise<AzureStorageAccountInfoResult> {
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
        error: azureErrorMessage(err),
      };
    }
  }
}
