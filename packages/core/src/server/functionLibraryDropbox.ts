import { DropboxManager } from "../lib/dropboxManager.ts";

/** Compile-time-only counterpart of nodes/dropbox.ts's execute() vault lookup
 * (resolveDropboxCredential) — the compiled/deployed script has no access to the Credential Vault
 * database, only the interpreter does, so it reads the same credential's fields (appKey/appSecret/
 * refreshToken) back from environment variables instead, the same "HERMIONE_CRED_<NAME>_<FIELD>"
 * naming credentialEnv.ts's applyCredentialEnvVars writes. Never called by the interpreter —
 * genuinely different credential-sourcing behavior, not duplicated logic.
 *
 * Kept in its own file, separate from functionLibrary.ts, purely to mirror functionLibrarySftp.ts's
 * one-node-family-per-file convention rather than growing that file's Dropbox section indefinitely —
 * unlike sftp's, this module has no special non-interpreter-safe dependency of its own. */
function dropboxCredentialFromEnv(name: string): { ok: true; appKey: string; appSecret: string; authCode: string; refreshToken: string } | { ok: false; error: string } {
  const prefix = `HERMIONE_CRED_${String(name)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")}`;
  const type = process.env[`${prefix}_CREDENTIAL_TYPE`];
  if (type !== "dropboxOAuth2") return { ok: false, error: `Credential "${name}" not found in the vault, or is not a Dropbox OAuth2 credential` };
  return {
    ok: true,
    appKey: process.env[`${prefix}_APP_KEY`] || "",
    appSecret: process.env[`${prefix}_APP_SECRET`] || "",
    authCode: process.env[`${prefix}_AUTH_CODE`] || "",
    refreshToken: process.env[`${prefix}_REFRESH_TOKEN`] || "",
  };
}

export async function dropboxAuthorize(credentialName: string) {
  const cred = dropboxCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, accessToken: "", refreshToken: "", expiresIn: 0, error: cred.error };
  return DropboxManager.exchangeAuthCode(cred.authCode, cred.appKey, cred.appSecret);
}

function dropboxManagerFromEnv(credentialName: string): { ok: true; manager: DropboxManager } | { ok: false; error: string } {
  const cred = dropboxCredentialFromEnv(credentialName);
  if (!cred.ok) return cred;
  return { ok: true, manager: DropboxManager.forCredential(cred.appKey, cred.appSecret, cred.refreshToken) };
}

export async function dropboxUpload(credentialName: string, path: string, content: string, encoding: "utf8" | "base64", mode: "add" | "overwrite", autorename: boolean) {
  const cred = dropboxManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.upload(path, content, encoding, mode, autorename);
}

export async function dropboxDownload(credentialName: string, path: string, encoding: "utf8" | "base64") {
  const cred = dropboxManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, content: "", error: cred.error };
  return cred.manager.download(path, encoding);
}

export async function dropboxListFolders(credentialName: string, path: string, recursive: boolean) {
  const cred = dropboxManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, folders: [], error: cred.error };
  return cred.manager.listFolders(path, recursive);
}

export async function dropboxMove(credentialName: string, fromPath: string, toPath: string, autorename: boolean) {
  const cred = dropboxManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.move(fromPath, toPath, autorename);
}

export async function dropboxCopy(credentialName: string, fromPath: string, toPath: string, autorename: boolean) {
  const cred = dropboxManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.copy(fromPath, toPath, autorename);
}

export async function dropboxRename(credentialName: string, fromPath: string, toPath: string, autorename: boolean) {
  const cred = dropboxManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.rename(fromPath, toPath, autorename);
}

export async function dropboxDelete(credentialName: string, path: string) {
  const cred = dropboxManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.delete(path);
}

export async function dropboxCreateFolder(credentialName: string, path: string, autorename: boolean) {
  const cred = dropboxManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.createFolder(path, autorename);
}

export async function dropboxGetMetadata(credentialName: string, path: string) {
  const cred = dropboxManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, isFolder: false, size: 0, contentHash: "", serverModified: "", error: cred.error };
  return cred.manager.getMetadata(path);
}

export async function dropboxSearch(credentialName: string, query: string, path: string, maxResults: number) {
  const cred = dropboxManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, paths: [], error: cred.error };
  return cred.manager.search(query, path, maxResults);
}

export async function dropboxListRevisions(credentialName: string, path: string, limit: number) {
  const cred = dropboxManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, revisions: [], error: cred.error };
  return cred.manager.listRevisions(path, limit);
}

export async function dropboxRestore(credentialName: string, path: string, rev: string) {
  const cred = dropboxManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.restore(path, rev);
}

export async function dropboxPermanentlyDelete(credentialName: string, path: string) {
  const cred = dropboxManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.permanentlyDelete(path);
}

export async function dropboxGetTemporaryLink(credentialName: string, path: string) {
  const cred = dropboxManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, link: "", error: cred.error };
  return cred.manager.getTemporaryLink(path);
}

export async function dropboxGetTemporaryUploadLink(credentialName: string, path: string, durationSeconds: number) {
  const cred = dropboxManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, link: "", error: cred.error };
  return cred.manager.getTemporaryUploadLink(path, durationSeconds);
}

export async function dropboxMoveBatch(credentialName: string, fromPaths: string[], toPaths: string[], autorename: boolean) {
  const cred = dropboxManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.moveBatch(fromPaths, toPaths, autorename);
}

export async function dropboxCopyBatch(credentialName: string, fromPaths: string[], toPaths: string[], autorename: boolean) {
  const cred = dropboxManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.copyBatch(fromPaths, toPaths, autorename);
}

export async function dropboxDeleteBatch(credentialName: string, paths: string[]) {
  const cred = dropboxManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.deleteBatch(paths);
}

export async function dropboxCreateSharedLink(credentialName: string, path: string) {
  const cred = dropboxManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, link: "", error: cred.error };
  return cred.manager.createSharedLink(path);
}

export async function dropboxListSharedLinks(credentialName: string, path: string) {
  const cred = dropboxManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, urls: [], error: cred.error };
  return cred.manager.listSharedLinks(path);
}

export async function dropboxShareFolder(credentialName: string, path: string) {
  const cred = dropboxManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, sharedFolderId: "", error: cred.error };
  return cred.manager.shareFolder(path);
}

export async function dropboxAddFolderMember(credentialName: string, sharedFolderId: string, email: string, accessLevel: string) {
  const cred = dropboxManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.addFolderMember(sharedFolderId, email, accessLevel);
}

export async function dropboxGetCurrentAccount(credentialName: string) {
  const cred = dropboxManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, accountId: "", name: "", email: "", error: cred.error };
  return cred.manager.getCurrentAccount();
}

export async function dropboxGetSpaceUsage(credentialName: string) {
  const cred = dropboxManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, used: 0, allocated: 0, error: cred.error };
  return cred.manager.getSpaceUsage();
}
