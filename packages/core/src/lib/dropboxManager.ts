import { Dropbox, DropboxAuth, DropboxResponseError } from "dropbox";
import { getDatabaseManager } from "../server/DatabaseManager.ts";
import { resolveAllCredentials } from "../server/vaultCredentials.ts";
import type { DropboxOAuth2CredentialData } from "@hermione/shared/types";

/** Every Dropbox node (auth, upload, download, move, copy, delete, rename) needs the same
 * boilerplate: build a client/auth object, call one SDK route, and turn either a result or a
 * thrown DropboxResponseError into a plain {success, error} shape. Centralized here once instead
 * of repeated per node (see nodes/dropbox.ts, which only wires pins to these methods). */

export interface DropboxAuthCredential {
  appKey: string;
  appSecret: string;
  refreshToken: string;
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
  private constructor(appKey: string, appSecret: string, refreshToken: string) {
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
  static getInstance(auth: DropboxAuthCredential): DropboxManager {
    const key = `${auth.appKey}:${auth.refreshToken}`;
    let manager = managerCache.get(key);
    if (!manager) {
      manager = new DropboxManager(auth.appKey, auth.appSecret, auth.refreshToken);
      managerCache.set(key, manager);
    }
    return manager;
  }

  static errorMessage(err: unknown): string {
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

  private static async findCredential(credentialName: string): Promise<{ ok: true; auth: DropboxAuthCredential } | { ok: false; error: string }> {
    const credRecord = (await resolveAllCredentials(getDatabaseManager())).get(credentialName);
    if (!credRecord) return { ok: false, error: `Credential "${credentialName}" not found in the vault` };
    if (credRecord.type !== "dropboxOAuth2") return { ok: false, error: `Credential "${credentialName}" is not a Dropbox OAuth2 credential` };
    const data = credRecord.data as DropboxOAuth2CredentialData;
    return { ok: true, auth: { appKey: data.appKey, appSecret: data.appSecret, refreshToken: data.refreshToken } };
  }

  /** One-time setup step: reads the vault credential's own appKey/appSecret/authCode fields (the
   * human enters these via the Credential Vault dialog before the refresh token exists) and
   * exchanges the single-use authorization code for a long-lived refresh token — the value that
   * then goes back into that same Credential Vault entry for every other node's getInstance() to
   * use. Mirrors FacebookManager.authorize's shape exactly. */
  static async authorize(credentialName: string): Promise<DropboxAuthorizeResult> {
    const credRecord = (await resolveAllCredentials(getDatabaseManager())).get(credentialName);
    if (!credRecord) return { success: false, accessToken: "", refreshToken: "", expiresIn: 0, error: `Credential "${credentialName}" not found in the vault` };
    if (credRecord.type !== "dropboxOAuth2") return { success: false, accessToken: "", refreshToken: "", expiresIn: 0, error: `Credential "${credentialName}" is not a Dropbox OAuth2 credential` };
    const data = credRecord.data as DropboxOAuth2CredentialData;
    return DropboxManager.exchangeAuthCode(data.authCode, data.appKey, data.appSecret);
  }

  /** Exchanges a single-use authorization code (obtained by a human visiting Dropbox's
   * /oauth2/authorize consent page with token_access_type=offline) for a long-lived refresh token.
   * Takes appKey/appSecret/authCode directly rather than a credentialName — the SDK-level operation
   * itself doesn't need a vault lookup; `authorize` above is the credentialName-taking entry point
   * every node actually calls. */
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
        error: DropboxManager.errorMessage(err),
      };
    }
  }

  static async upload(credentialName: string, path: string, content: string, encoding: "utf8" | "base64", mode: "add" | "overwrite", autorename: boolean): Promise<DropboxOpResult> {
    const cred = await DropboxManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return DropboxManager.getInstance(cred.auth).upload(path, content, encoding, mode, autorename);
  }

  static async download(credentialName: string, path: string, encoding: "utf8" | "base64"): Promise<DropboxDownloadResult> {
    const cred = await DropboxManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, content: "", error: cred.error };
    return DropboxManager.getInstance(cred.auth).download(path, encoding);
  }

  static async listFolders(credentialName: string, path: string, recursive: boolean): Promise<DropboxListFoldersResult> {
    const cred = await DropboxManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, folders: [], error: cred.error };
    return DropboxManager.getInstance(cred.auth).listFolders(path, recursive);
  }

  static async move(credentialName: string, fromPath: string, toPath: string, autorename: boolean): Promise<DropboxOpResult> {
    const cred = await DropboxManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return DropboxManager.getInstance(cred.auth).move(fromPath, toPath, autorename);
  }

  static async copy(credentialName: string, fromPath: string, toPath: string, autorename: boolean): Promise<DropboxOpResult> {
    const cred = await DropboxManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return DropboxManager.getInstance(cred.auth).copy(fromPath, toPath, autorename);
  }

  static async delete(credentialName: string, path: string): Promise<DropboxOpResult> {
    const cred = await DropboxManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return DropboxManager.getInstance(cred.auth).delete(path);
  }

  /** Dropbox has no dedicated rename route — moving a file to a new path within the same folder
   * IS the rename, so this is a thin alias over move() kept separate only for node-menu discoverability. */
  static async rename(credentialName: string, fromPath: string, toPath: string, autorename: boolean): Promise<DropboxOpResult> {
    const cred = await DropboxManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return DropboxManager.getInstance(cred.auth).rename(fromPath, toPath, autorename);
  }

  static async createFolder(credentialName: string, path: string, autorename: boolean): Promise<DropboxOpResult> {
    const cred = await DropboxManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return DropboxManager.getInstance(cred.auth).createFolder(path, autorename);
  }

  static async getMetadata(credentialName: string, path: string): Promise<DropboxMetadataResult> {
    const cred = await DropboxManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, isFolder: false, size: 0, contentHash: "", serverModified: "", error: cred.error };
    return DropboxManager.getInstance(cred.auth).getMetadata(path);
  }

  static async search(credentialName: string, query: string, path: string, maxResults: number): Promise<DropboxSearchResult> {
    const cred = await DropboxManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, paths: [], error: cred.error };
    return DropboxManager.getInstance(cred.auth).search(query, path, maxResults);
  }

  static async listRevisions(credentialName: string, path: string, limit: number): Promise<DropboxListRevisionsResult> {
    const cred = await DropboxManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, revisions: [], error: cred.error };
    return DropboxManager.getInstance(cred.auth).listRevisions(path, limit);
  }

  static async restore(credentialName: string, path: string, rev: string): Promise<DropboxOpResult> {
    const cred = await DropboxManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return DropboxManager.getInstance(cred.auth).restore(path, rev);
  }

  static async permanentlyDelete(credentialName: string, path: string): Promise<DropboxOpResult> {
    const cred = await DropboxManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return DropboxManager.getInstance(cred.auth).permanentlyDelete(path);
  }

  static async getTemporaryLink(credentialName: string, path: string): Promise<DropboxLinkResult> {
    const cred = await DropboxManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, link: "", error: cred.error };
    return DropboxManager.getInstance(cred.auth).getTemporaryLink(path);
  }

  static async getTemporaryUploadLink(credentialName: string, path: string, durationSeconds: number): Promise<DropboxLinkResult> {
    const cred = await DropboxManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, link: "", error: cred.error };
    return DropboxManager.getInstance(cred.auth).getTemporaryUploadLink(path, durationSeconds);
  }

  static async moveBatch(credentialName: string, fromPaths: string[], toPaths: string[], autorename: boolean): Promise<DropboxOpResult> {
    const cred = await DropboxManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return DropboxManager.getInstance(cred.auth).moveBatch(fromPaths, toPaths, autorename);
  }

  static async copyBatch(credentialName: string, fromPaths: string[], toPaths: string[], autorename: boolean): Promise<DropboxOpResult> {
    const cred = await DropboxManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return DropboxManager.getInstance(cred.auth).copyBatch(fromPaths, toPaths, autorename);
  }

  static async deleteBatch(credentialName: string, paths: string[]): Promise<DropboxOpResult> {
    const cred = await DropboxManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return DropboxManager.getInstance(cred.auth).deleteBatch(paths);
  }

  static async createSharedLink(credentialName: string, path: string): Promise<DropboxLinkResult> {
    const cred = await DropboxManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, link: "", error: cred.error };
    return DropboxManager.getInstance(cred.auth).createSharedLink(path);
  }

  static async listSharedLinks(credentialName: string, path: string): Promise<DropboxListSharedLinksResult> {
    const cred = await DropboxManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, urls: [], error: cred.error };
    return DropboxManager.getInstance(cred.auth).listSharedLinks(path);
  }

  static async shareFolder(credentialName: string, path: string): Promise<DropboxShareFolderResult> {
    const cred = await DropboxManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, sharedFolderId: "", error: cred.error };
    return DropboxManager.getInstance(cred.auth).shareFolder(path);
  }

  static async addFolderMember(credentialName: string, sharedFolderId: string, email: string, accessLevel: string): Promise<DropboxOpResult> {
    const cred = await DropboxManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return DropboxManager.getInstance(cred.auth).addFolderMember(sharedFolderId, email, accessLevel);
  }

  static async getCurrentAccount(credentialName: string): Promise<DropboxAccountResult> {
    const cred = await DropboxManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, accountId: "", name: "", email: "", error: cred.error };
    return DropboxManager.getInstance(cred.auth).getCurrentAccount();
  }

  static async getSpaceUsage(credentialName: string): Promise<DropboxSpaceUsageResult> {
    const cred = await DropboxManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, used: 0, allocated: 0, error: cred.error };
    return DropboxManager.getInstance(cred.auth).getSpaceUsage();
  }

  private async upload(path: string, content: string, encoding: "utf8" | "base64", mode: "add" | "overwrite", autorename: boolean): Promise<DropboxOpResult> {
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
      return { success: false, error: DropboxManager.errorMessage(err) };
    }
  }

  private async download(path: string, encoding: "utf8" | "base64"): Promise<DropboxDownloadResult> {
    try {
      const res = await this.client.filesDownload({ path });
      const result = res.result as unknown as {
        fileBinary?: Uint8Array;
        fileBlob?: Blob;
      };
      const bytes = result.fileBinary ? Buffer.from(result.fileBinary) : Buffer.from(await result.fileBlob!.arrayBuffer());
      return { success: true, content: bytes.toString(encoding), error: "" };
    } catch (err) {
      return { success: false, content: "", error: DropboxManager.errorMessage(err) };
    }
  }

  /** Paginates through filesListFolder/filesListFolderContinue (Dropbox caps entries per response)
   * until has_more is false, keeping only .tag === "folder" entries. */
  private async listFolders(path: string, recursive: boolean): Promise<DropboxListFoldersResult> {
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
      return { success: false, folders: [], error: DropboxManager.errorMessage(err) };
    }
  }

  private async move(fromPath: string, toPath: string, autorename: boolean): Promise<DropboxOpResult> {
    try {
      await this.client.filesMoveV2({
        from_path: fromPath,
        to_path: toPath,
        autorename,
      });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: DropboxManager.errorMessage(err) };
    }
  }

  private async copy(fromPath: string, toPath: string, autorename: boolean): Promise<DropboxOpResult> {
    try {
      await this.client.filesCopyV2({
        from_path: fromPath,
        to_path: toPath,
        autorename,
      });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: DropboxManager.errorMessage(err) };
    }
  }

  private async delete(path: string): Promise<DropboxOpResult> {
    try {
      await this.client.filesDeleteV2({ path });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: DropboxManager.errorMessage(err) };
    }
  }

  /** Dropbox has no dedicated rename route — moving a file to a new path within the same folder
   * IS the rename, so this is a thin alias over move() kept separate only for node-menu discoverability. */
  private async rename(fromPath: string, toPath: string, autorename: boolean): Promise<DropboxOpResult> {
    return this.move(fromPath, toPath, autorename);
  }

  private async createFolder(path: string, autorename: boolean): Promise<DropboxOpResult> {
    try {
      await this.client.filesCreateFolderV2({ path, autorename });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: DropboxManager.errorMessage(err) };
    }
  }

  private async getMetadata(path: string): Promise<DropboxMetadataResult> {
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
        error: DropboxManager.errorMessage(err),
      };
    }
  }

  private async search(query: string, path: string, maxResults: number): Promise<DropboxSearchResult> {
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
      return { success: false, paths: [], error: DropboxManager.errorMessage(err) };
    }
  }

  private async listRevisions(path: string, limit: number): Promise<DropboxListRevisionsResult> {
    try {
      const res = await this.client.filesListRevisions({ path, limit });
      const revisions = res.result.entries.map((entry) => ({
        rev: entry.rev,
        size: entry.size,
        serverModified: entry.server_modified,
      }));
      return { success: true, revisions, error: "" };
    } catch (err) {
      return { success: false, revisions: [], error: DropboxManager.errorMessage(err) };
    }
  }

  private async restore(path: string, rev: string): Promise<DropboxOpResult> {
    try {
      await this.client.filesRestore({ path, rev });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: DropboxManager.errorMessage(err) };
    }
  }

  private async permanentlyDelete(path: string): Promise<DropboxOpResult> {
    try {
      await this.client.filesPermanentlyDelete({ path });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: DropboxManager.errorMessage(err) };
    }
  }

  private async getTemporaryLink(path: string): Promise<DropboxLinkResult> {
    try {
      const res = await this.client.filesGetTemporaryLink({ path });
      return { success: true, link: res.result.link, error: "" };
    } catch (err) {
      return { success: false, link: "", error: DropboxManager.errorMessage(err) };
    }
  }

  private async getTemporaryUploadLink(path: string, durationSeconds: number): Promise<DropboxLinkResult> {
    try {
      const res = await this.client.filesGetTemporaryUploadLink({
        commit_info: { path },
        duration: durationSeconds,
      });
      return { success: true, link: res.result.link, error: "" };
    } catch (err) {
      return { success: false, link: "", error: DropboxManager.errorMessage(err) };
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

  private async moveBatch(fromPaths: string[], toPaths: string[], autorename: boolean): Promise<DropboxOpResult> {
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
      return { success: false, error: DropboxManager.errorMessage(err) };
    }
  }

  private async copyBatch(fromPaths: string[], toPaths: string[], autorename: boolean): Promise<DropboxOpResult> {
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
      return { success: false, error: DropboxManager.errorMessage(err) };
    }
  }

  private async deleteBatch(paths: string[]): Promise<DropboxOpResult> {
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
      return { success: false, error: DropboxManager.errorMessage(err) };
    }
  }

  private async createSharedLink(path: string): Promise<DropboxLinkResult> {
    try {
      const res = await this.client.sharingCreateSharedLinkWithSettings({
        path,
      });
      return { success: true, link: res.result.url, error: "" };
    } catch (err) {
      return { success: false, link: "", error: DropboxManager.errorMessage(err) };
    }
  }

  private async listSharedLinks(path: string): Promise<DropboxListSharedLinksResult> {
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
      return { success: false, urls: [], error: DropboxManager.errorMessage(err) };
    }
  }

  /** shareFolder may complete synchronously or launch an async job — same poll-until-settled
   * shape as pollBatchJob, but the "complete" result here carries the shared_folder_id we need
   * rather than just a success flag, so it isn't reused as-is. */
  private async shareFolder(path: string): Promise<DropboxShareFolderResult> {
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
        error: DropboxManager.errorMessage(err),
      };
    }
  }

  private async addFolderMember(sharedFolderId: string, email: string, accessLevel: string): Promise<DropboxOpResult> {
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
      return { success: false, error: DropboxManager.errorMessage(err) };
    }
  }

  private async getCurrentAccount(): Promise<DropboxAccountResult> {
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
        error: DropboxManager.errorMessage(err),
      };
    }
  }

  private async getSpaceUsage(): Promise<DropboxSpaceUsageResult> {
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
        error: DropboxManager.errorMessage(err),
      };
    }
  }
}
