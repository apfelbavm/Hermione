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

export interface DropboxAuthorizeResult extends DropboxTokenResult {
  refreshToken: string;
}

export class DropboxManager {
  private readonly client: Dropbox;

  constructor(accessToken: string) {
    this.client = new Dropbox({ accessToken, fetch: globalThis.fetch.bind(globalThis) });
  }

  /** One-time setup step, NOT part of the normal per-run auth flow (see dropbox.auth): exchanges a
   * single-use authorization code (obtained by a human visiting Dropbox's /oauth2/authorize consent
   * page with token_access_type=offline) for a long-lived refresh token — the value that then goes
   * into the Credential Vault for dropbox.auth to use on every subsequent run. */
  static async exchangeAuthCode(authCode: string, appKey: string, appSecret: string): Promise<DropboxAuthorizeResult> {
    try {
      const auth = new DropboxAuth({ clientId: appKey, clientSecret: appSecret, fetch: globalThis.fetch.bind(globalThis) });
      const res = await auth.getAccessTokenFromCode("", authCode);
      const result = res.result as { access_token: string; expires_in?: number; refresh_token?: string };
      return {
        success: true,
        accessToken: result.access_token,
        refreshToken: result.refresh_token || "",
        expiresIn: Number(result.expires_in ?? 0),
        error: "",
      };
    } catch (err) {
      return { success: false, accessToken: "", refreshToken: "", expiresIn: 0, error: dropboxErrorMessage(err) };
    }
  }

  /** Exchanges a long-lived refresh token (app key + app secret) for a fresh short-lived access
   * token — the flow Dropbox recommends over the deprecated non-expiring token type. */
  static async refreshAccessToken(refreshToken: string, appKey: string, appSecret: string): Promise<DropboxTokenResult> {
    try {
      const auth = new DropboxAuth({
        clientId: appKey,
        clientSecret: appSecret,
        refreshToken,
        fetch: globalThis.fetch.bind(globalThis),
      });
      await auth.refreshAccessToken();
      const expiresAt = auth.getAccessTokenExpiresAt();
      return {
        success: true,
        accessToken: auth.getAccessToken(),
        expiresIn: expiresAt ? Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 1000)) : 0,
        error: "",
      };
    } catch (err) {
      return { success: false, accessToken: "", expiresIn: 0, error: dropboxErrorMessage(err) };
    }
  }

  async upload(path: string, content: string, encoding: "utf8" | "base64", mode: "add" | "overwrite", autorename: boolean): Promise<DropboxOpResult> {
    try {
      const contents = encoding === "base64" ? Buffer.from(content, "base64") : content;
      await this.client.filesUpload({ path, contents, mode: { ".tag": mode }, autorename });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: dropboxErrorMessage(err) };
    }
  }

  async download(path: string, encoding: "utf8" | "base64"): Promise<DropboxDownloadResult> {
    try {
      const res = await this.client.filesDownload({ path });
      const result = res.result as unknown as { fileBinary?: Uint8Array; fileBlob?: Blob };
      const bytes = result.fileBinary ? Buffer.from(result.fileBinary) : Buffer.from(await result.fileBlob!.arrayBuffer());
      return { success: true, content: bytes.toString(encoding), error: "" };
    } catch (err) {
      return { success: false, content: "", error: dropboxErrorMessage(err) };
    }
  }

  async move(fromPath: string, toPath: string, autorename: boolean): Promise<DropboxOpResult> {
    try {
      await this.client.filesMoveV2({ from_path: fromPath, to_path: toPath, autorename });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: dropboxErrorMessage(err) };
    }
  }

  async copy(fromPath: string, toPath: string, autorename: boolean): Promise<DropboxOpResult> {
    try {
      await this.client.filesCopyV2({ from_path: fromPath, to_path: toPath, autorename });
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
}
