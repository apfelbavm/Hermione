import { Dropbox, DropboxAuth, DropboxResponseError } from "dropbox";

/** Every Dropbox node (auth, upload, download, move, copy, delete, rename) needs the same
 * boilerplate: build a client/auth object, call one SDK route, and turn either a result or a
 * thrown DropboxResponseError into a plain {success, error} shape. Centralized here once instead
 * of repeated per node (see nodes/dropbox.ts, which only wires pins to these methods). */

function dropboxErrorMessage(err: unknown): string {
  if (err instanceof DropboxResponseError) {
    // Two different error shapes depending on which endpoint failed: the file-operation RPC
    // endpoints (upload/download/move/...) use Dropbox's own {error_summary}, while the OAuth2
    // token endpoint (refreshAccessToken) uses the standard OAuth2 {error, error_description}
    // shape instead — checking only error_summary silently swallowed every token-refresh failure
    // behind a generic "status 400" message.
    const error = err.error as { error_summary?: string; error?: string; error_description?: string } | string | undefined;
    if (typeof error === "string") return error;
    if (error?.error_summary) return error.error_summary;
    if (error?.error) return error.error_description ? `${error.error}: ${error.error_description}` : error.error;
    return `Dropbox API error (status ${err.status})`;
  }
  return err instanceof Error ? err.message : String(err);
}

export interface DropboxTokenResult {
  success: boolean;
  accessToken: string;
  expiresIn: number;
  error: string;
  [key: string]: unknown;
}

export interface DropboxOpResult {
  success: boolean;
  error: string;
  [key: string]: unknown;
}

export interface DropboxDownloadResult extends DropboxOpResult {
  content: string;
}

export interface DropboxListFoldersResult extends DropboxOpResult {
  folders: string[];
}

export interface DropboxAuthorizeResult extends DropboxTokenResult {
  refreshToken: string;
}

export interface DropboxMetadataResult extends DropboxOpResult {
  isFolder: boolean;
  size: number;
  contentHash: string;
  serverModified: string;
}

export interface DropboxSearchResult extends DropboxOpResult {
  paths: string[];
}

export interface DropboxRevision {
  rev: string;
  size: number;
  serverModified: string;
  [key: string]: unknown;
}

export interface DropboxListRevisionsResult extends DropboxOpResult {
  revisions: DropboxRevision[];
}

export interface DropboxLinkResult extends DropboxOpResult {
  link: string;
}

export interface DropboxListSharedLinksResult extends DropboxOpResult {
  urls: string[];
}

export interface DropboxShareFolderResult extends DropboxOpResult {
  sharedFolderId: string;
}

export interface DropboxAccountResult extends DropboxOpResult {
  accountId: string;
  name: string;
  email: string;
}

export interface DropboxSpaceUsageResult extends DropboxOpResult {
  used: number;
  allocated: number;
}

const managerCache = new Map<string, DropboxManager>();

export class DropboxManager {
  private readonly client: Dropbox;

  /** Builds the client from the app key/secret + refresh token, not a pre-obtained access token —
   * the Dropbox SDK's own DropboxAuth then transparently mints/refreshes the actual access token
   * on demand before every request (see checkAndRefreshAccessToken in the SDK), so nothing here
   * has to track expiry itself. */
  constructor(appKey: string, appSecret: string, refreshToken: string) {
    this.client = new Dropbox({
      auth: new DropboxAuth({
        clientId: appKey,
        clientSecret: appSecret,
        refreshToken,
        fetch: globalThis.fetch.bind(globalThis),
      }),
    });
  }

  /** Reuses one DropboxManager (and its underlying DropboxAuth) per distinct credential instead of
   * building a fresh one per node execution — DropboxAuth caches the current access token on itself,
   * so only a reused instance benefits from that cache instead of re-minting a token every call. */
  static forCredential(appKey: string, appSecret: string, refreshToken: string): DropboxManager {
    const key = `${appKey}:${refreshToken}`;
    let manager = managerCache.get(key);
    if (!manager) {
      manager = new DropboxManager(appKey, appSecret, refreshToken);
      managerCache.set(key, manager);
    }
    return manager;
  }

  /** One-time setup step: exchanges a single-use authorization code (obtained by a human visiting
   * Dropbox's /oauth2/authorize consent page with token_access_type=offline) for a long-lived
   * refresh token — the value that then goes into the Credential Vault for every other node's
   * forCredential() to use. */
  static async exchangeAuthCode(authCode: string, appKey: string, appSecret: string): Promise<DropboxAuthorizeResult> {
    try {
      const auth = new DropboxAuth({
        clientId: appKey,
        clientSecret: appSecret,
        fetch: globalThis.fetch.bind(globalThis),
      });
      const res = await auth.getAccessTokenFromCode("", authCode);
      const result = res.result as {
        access_token: string;
        expires_in?: number;
        refresh_token?: string;
      };
      return {
        success: true,
        accessToken: result.access_token,
        refreshToken: result.refresh_token || "",
        expiresIn: Number(result.expires_in ?? 0),
        error: "",
      };
    } catch (err) {
      return {
        success: false,
        accessToken: "",
        refreshToken: "",
        expiresIn: 0,
        error: dropboxErrorMessage(err),
      };
    }
  }

  async upload(path: string, content: string, encoding: "utf8" | "base64", mode: "add" | "overwrite", autorename: boolean): Promise<DropboxOpResult> {
    try {
      const contents = encoding === "base64" ? Buffer.from(content, "base64") : content;
      await this.client.filesUpload({
        path,
        contents,
        mode: { ".tag": mode },
        autorename,
      });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: dropboxErrorMessage(err) };
    }
  }

  async download(path: string, encoding: "utf8" | "base64"): Promise<DropboxDownloadResult> {
    try {
      const res = await this.client.filesDownload({ path });
      const result = res.result as unknown as {
        fileBinary?: Uint8Array;
        fileBlob?: Blob;
      };
      const bytes = result.fileBinary ? Buffer.from(result.fileBinary) : Buffer.from(await result.fileBlob!.arrayBuffer());
      return { success: true, content: bytes.toString(encoding), error: "" };
    } catch (err) {
      return { success: false, content: "", error: dropboxErrorMessage(err) };
    }
  }

  /** Paginates through filesListFolder/filesListFolderContinue (Dropbox caps entries per response)
   * until has_more is false, keeping only .tag === "folder" entries. */
  async listFolders(path: string, recursive: boolean): Promise<DropboxListFoldersResult> {
    try {
      const folders: string[] = [];
      let res = await this.client.filesListFolder({ path, recursive });
      for (;;) {
        for (const entry of res.result.entries) {
          if (entry[".tag"] === "folder") folders.push(entry.path_display ?? entry.path_lower ?? entry.name);
        }
        if (!res.result.has_more) break;
        res = await this.client.filesListFolderContinue({
          cursor: res.result.cursor,
        });
      }
      return { success: true, folders, error: "" };
    } catch (err) {
      return { success: false, folders: [], error: dropboxErrorMessage(err) };
    }
  }

  async move(fromPath: string, toPath: string, autorename: boolean): Promise<DropboxOpResult> {
    try {
      await this.client.filesMoveV2({
        from_path: fromPath,
        to_path: toPath,
        autorename,
      });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: dropboxErrorMessage(err) };
    }
  }

  async copy(fromPath: string, toPath: string, autorename: boolean): Promise<DropboxOpResult> {
    try {
      await this.client.filesCopyV2({
        from_path: fromPath,
        to_path: toPath,
        autorename,
      });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: dropboxErrorMessage(err) };
    }
  }

  async delete(path: string): Promise<DropboxOpResult> {
    try {
      await this.client.filesDeleteV2({ path });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: dropboxErrorMessage(err) };
    }
  }

  /** Dropbox has no dedicated rename route — moving a file to a new path within the same folder
   * IS the rename, so this is a thin alias over move() kept separate only for node-menu discoverability. */
  async rename(fromPath: string, toPath: string, autorename: boolean): Promise<DropboxOpResult> {
    return this.move(fromPath, toPath, autorename);
  }

  async createFolder(path: string, autorename: boolean): Promise<DropboxOpResult> {
    try {
      await this.client.filesCreateFolderV2({ path, autorename });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: dropboxErrorMessage(err) };
    }
  }

  async getMetadata(path: string): Promise<DropboxMetadataResult> {
    try {
      const meta = (await this.client.filesGetMetadata({ path })).result as {
        ".tag": string;
        size?: number;
        content_hash?: string;
        server_modified?: string;
      };
      return {
        success: true,
        isFolder: meta[".tag"] === "folder",
        size: meta.size ?? 0,
        contentHash: meta.content_hash ?? "",
        serverModified: meta.server_modified ?? "",
        error: "",
      };
    } catch (err) {
      return {
        success: false,
        isFolder: false,
        size: 0,
        contentHash: "",
        serverModified: "",
        error: dropboxErrorMessage(err),
      };
    }
  }

  async search(query: string, path: string, maxResults: number): Promise<DropboxSearchResult> {
    try {
      const res = await this.client.filesSearchV2({
        query,
        options: { path: path || undefined, max_results: maxResults },
      });
      const paths = res.result.matches
        .map(
          (m) =>
            m.metadata as {
              metadata?: {
                path_display?: string;
                path_lower?: string;
                name?: string;
              };
            },
        )
        .map((m) => m.metadata?.path_display ?? m.metadata?.path_lower ?? m.metadata?.name ?? "")
        .filter((p) => p !== "");
      return { success: true, paths, error: "" };
    } catch (err) {
      return { success: false, paths: [], error: dropboxErrorMessage(err) };
    }
  }

  async listRevisions(path: string, limit: number): Promise<DropboxListRevisionsResult> {
    try {
      const res = await this.client.filesListRevisions({ path, limit });
      const revisions = res.result.entries.map((entry) => ({
        rev: entry.rev,
        size: entry.size,
        serverModified: entry.server_modified,
      }));
      return { success: true, revisions, error: "" };
    } catch (err) {
      return { success: false, revisions: [], error: dropboxErrorMessage(err) };
    }
  }

  async restore(path: string, rev: string): Promise<DropboxOpResult> {
    try {
      await this.client.filesRestore({ path, rev });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: dropboxErrorMessage(err) };
    }
  }

  async permanentlyDelete(path: string): Promise<DropboxOpResult> {
    try {
      await this.client.filesPermanentlyDelete({ path });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: dropboxErrorMessage(err) };
    }
  }

  async getTemporaryLink(path: string): Promise<DropboxLinkResult> {
    try {
      const res = await this.client.filesGetTemporaryLink({ path });
      return { success: true, link: res.result.link, error: "" };
    } catch (err) {
      return { success: false, link: "", error: dropboxErrorMessage(err) };
    }
  }

  async getTemporaryUploadLink(path: string, durationSeconds: number): Promise<DropboxLinkResult> {
    try {
      const res = await this.client.filesGetTemporaryUploadLink({
        commit_info: { path },
        duration: durationSeconds,
      });
      return { success: true, link: res.result.link, error: "" };
    } catch (err) {
      return { success: false, link: "", error: dropboxErrorMessage(err) };
    }
  }

  /** moveBatchV2/copyBatchV2/deleteBatch may either complete synchronously or hand back an
   * async_job_id that has to be polled (via the matching *BatchCheck route) until it settles —
   * this drives that poll loop for whichever launch/checker pair the caller passes in. */
  private async pollBatchJob(launch: { [key: string]: unknown }, check: (asyncJobId: string) => Promise<{ [key: string]: unknown }>): Promise<DropboxOpResult> {
    let current = launch;
    while (current[".tag"] === "async_job_id") {
      await new Promise((resolve) => setTimeout(resolve, 500));
      current = await check(String(current.async_job_id));
    }
    if (current[".tag"] === "failed") return { success: false, error: JSON.stringify(current.failed) };
    return { success: true, error: "" };
  }

  async moveBatch(fromPaths: string[], toPaths: string[], autorename: boolean): Promise<DropboxOpResult> {
    try {
      const entries = fromPaths.map((from_path, i) => ({
        from_path,
        to_path: toPaths[i],
      }));
      const launch = (await this.client.filesMoveBatchV2({ entries, autorename })).result as unknown as { [key: string]: unknown };
      return await this.pollBatchJob(
        launch,
        async (asyncJobId) =>
          (
            await this.client.filesMoveBatchCheckV2({
              async_job_id: asyncJobId,
            })
          ).result as unknown as { [key: string]: unknown },
      );
    } catch (err) {
      return { success: false, error: dropboxErrorMessage(err) };
    }
  }

  async copyBatch(fromPaths: string[], toPaths: string[], autorename: boolean): Promise<DropboxOpResult> {
    try {
      const entries = fromPaths.map((from_path, i) => ({
        from_path,
        to_path: toPaths[i],
      }));
      const launch = (await this.client.filesCopyBatchV2({ entries, autorename })).result as unknown as { [key: string]: unknown };
      return await this.pollBatchJob(
        launch,
        async (asyncJobId) =>
          (
            await this.client.filesCopyBatchCheckV2({
              async_job_id: asyncJobId,
            })
          ).result as unknown as { [key: string]: unknown },
      );
    } catch (err) {
      return { success: false, error: dropboxErrorMessage(err) };
    }
  }

  async deleteBatch(paths: string[]): Promise<DropboxOpResult> {
    try {
      const entries = paths.map((path) => ({ path }));
      const launch = (await this.client.filesDeleteBatch({ entries })).result as unknown as { [key: string]: unknown };
      return await this.pollBatchJob(
        launch,
        async (asyncJobId) =>
          (
            await this.client.filesDeleteBatchCheck({
              async_job_id: asyncJobId,
            })
          ).result as unknown as { [key: string]: unknown },
      );
    } catch (err) {
      return { success: false, error: dropboxErrorMessage(err) };
    }
  }

  async createSharedLink(path: string): Promise<DropboxLinkResult> {
    try {
      const res = await this.client.sharingCreateSharedLinkWithSettings({
        path,
      });
      return { success: true, link: res.result.url, error: "" };
    } catch (err) {
      return { success: false, link: "", error: dropboxErrorMessage(err) };
    }
  }

  async listSharedLinks(path: string): Promise<DropboxListSharedLinksResult> {
    try {
      const res = await this.client.sharingListSharedLinks({
        path: path || undefined,
      });
      return {
        success: true,
        urls: res.result.links.map((l) => l.url),
        error: "",
      };
    } catch (err) {
      return { success: false, urls: [], error: dropboxErrorMessage(err) };
    }
  }

  /** shareFolder may complete synchronously or launch an async job — same poll-until-settled
   * shape as pollBatchJob, but the "complete" result here carries the shared_folder_id we need
   * rather than just a success flag, so it isn't reused as-is. */
  async shareFolder(path: string): Promise<DropboxShareFolderResult> {
    try {
      let current = (await this.client.sharingShareFolder({ path })).result as unknown as {
        [key: string]: unknown;
      };
      while (current[".tag"] === "async_job_id") {
        await new Promise((resolve) => setTimeout(resolve, 500));
        current = (
          await this.client.sharingCheckShareJobStatus({
            async_job_id: String(current.async_job_id),
          })
        ).result as unknown as { [key: string]: unknown };
      }
      if (current[".tag"] === "failed")
        return {
          success: false,
          sharedFolderId: "",
          error: JSON.stringify(current.failed),
        };
      return {
        success: true,
        sharedFolderId: String(current.shared_folder_id ?? ""),
        error: "",
      };
    } catch (err) {
      return {
        success: false,
        sharedFolderId: "",
        error: dropboxErrorMessage(err),
      };
    }
  }

  async addFolderMember(sharedFolderId: string, email: string, accessLevel: string): Promise<DropboxOpResult> {
    try {
      await this.client.sharingAddFolderMember({
        shared_folder_id: sharedFolderId,
        members: [
          {
            member: { ".tag": "email", email },
            access_level: { ".tag": accessLevel } as never,
          },
        ],
      });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: dropboxErrorMessage(err) };
    }
  }

  async getCurrentAccount(): Promise<DropboxAccountResult> {
    try {
      const res = await this.client.usersGetCurrentAccount();
      return {
        success: true,
        accountId: res.result.account_id,
        name: res.result.name.display_name,
        email: res.result.email,
        error: "",
      };
    } catch (err) {
      return {
        success: false,
        accountId: "",
        name: "",
        email: "",
        error: dropboxErrorMessage(err),
      };
    }
  }

  async getSpaceUsage(): Promise<DropboxSpaceUsageResult> {
    try {
      const res = await this.client.usersGetSpaceUsage();
      const allocation = res.result.allocation as { allocated?: number };
      return {
        success: true,
        used: res.result.used,
        allocated: allocation.allocated ?? 0,
        error: "",
      };
    } catch (err) {
      return {
        success: false,
        used: 0,
        allocated: 0,
        error: dropboxErrorMessage(err),
      };
    }
  }
}
