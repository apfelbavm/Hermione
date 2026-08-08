import { google, type drive_v3 } from "googleapis";
import { Readable } from "node:stream";
import { googleErrorMessage, serviceAccountClient, oauth2Client, type GoogleAuthClient } from "./googleAuthManager.ts";
import { getDatabaseManager } from "../server/DatabaseManager.ts";
import { resolveAllCredentials } from "../server/vaultCredentials.ts";
import type { GoogleServiceAccountCredentialData, GoogleOAuth2CredentialData } from "@hermione/shared/types";

/** Every Google Drive node (list, get, upload, download, copy, move, delete, share, create folder)
 * needs the same boilerplate: call one googleapis Drive v3 route and turn either a result or a
 * thrown GaxiosError into a plain {success, error} shape. Centralized here once instead of
 * repeated per node (see nodes/google.ts), mirrors dropboxManager.ts/githubManager.ts. */

const SCOPES = ["https://www.googleapis.com/auth/drive"];

export interface GoogleDriveOpResult {
  success: boolean;
  error: string;
  [key: string]: unknown;
}

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  size: number;
  webViewLink: string;
}

export interface GoogleDriveListFilesResult extends GoogleDriveOpResult {
  files: GoogleDriveFile[];
}

export interface GoogleDriveFileResult extends GoogleDriveOpResult, Partial<GoogleDriveFile> {}

export interface GoogleDriveDownloadResult extends GoogleDriveOpResult {
  content: string;
}

export interface GoogleDrivePermission {
  id: string;
  type: string;
  role: string;
  emailAddress: string;
}

export interface GoogleDriveListPermissionsResult extends GoogleDriveOpResult {
  permissions: GoogleDrivePermission[];
}

export interface GoogleDrivePermissionResult extends GoogleDriveOpResult {
  id: string;
}

type ResolvedGoogleCredential = { kind: "serviceAccount"; data: GoogleServiceAccountCredentialData } | { kind: "oauth2"; data: GoogleOAuth2CredentialData };

function toFile(file: drive_v3.Schema$File): GoogleDriveFile {
  return {
    id: file.id ?? "",
    name: file.name ?? "",
    mimeType: file.mimeType ?? "",
    isFolder: file.mimeType === "application/vnd.google-apps.folder",
    size: Number(file.size ?? 0),
    webViewLink: file.webViewLink ?? "",
  };
}

const managerCache = new Map<string, GoogleDriveManager>();

export class GoogleDriveManager {
  private readonly client: drive_v3.Drive;

  private constructor(auth: GoogleAuthClient) {
    this.client = google.drive({ version: "v3", auth });
  }

  private static forServiceAccount(data: GoogleServiceAccountCredentialData): GoogleDriveManager {
    const key = `sa:${data.serviceAccountKeyJson}:${data.impersonateUser}`;
    let manager = managerCache.get(key);
    if (!manager) {
      manager = new GoogleDriveManager(serviceAccountClient(data, SCOPES));
      managerCache.set(key, manager);
    }
    return manager;
  }

  private static forOAuth2(data: GoogleOAuth2CredentialData): GoogleDriveManager {
    const key = `oauth2:${data.clientId}:${data.refreshToken}`;
    let manager = managerCache.get(key);
    if (!manager) {
      manager = new GoogleDriveManager(oauth2Client(data));
      managerCache.set(key, manager);
    }
    return manager;
  }

  private static getInstance(resolved: ResolvedGoogleCredential): GoogleDriveManager {
    return resolved.kind === "serviceAccount" ? GoogleDriveManager.forServiceAccount(resolved.data) : GoogleDriveManager.forOAuth2(resolved.data);
  }

  /** Looks up a named Credential Vault entry and accepts either a Google Service Account or a
   * Google OAuth2 credential — Drive works fine under either auth flow (see nodes/google.ts's
   * former resolveGoogleCredential, now owned here). */
  private static async findCredential(credentialName: string): Promise<{ ok: true; resolved: ResolvedGoogleCredential } | { ok: false; error: string }> {
    const credRecord = (await resolveAllCredentials(getDatabaseManager())).get(credentialName);
    if (!credRecord) return { ok: false, error: `Credential "${credentialName}" not found in the vault` };
    if (credRecord.type === "googleServiceAccount") return { ok: true, resolved: { kind: "serviceAccount", data: credRecord.data as GoogleServiceAccountCredentialData } };
    if (credRecord.type === "googleOAuth2") return { ok: true, resolved: { kind: "oauth2", data: credRecord.data as GoogleOAuth2CredentialData } };
    return { ok: false, error: `Credential "${credentialName}" is not a Google Service Account or Google OAuth2 credential` };
  }

  static async listFiles(credentialName: string, query: string, pageSize: number): Promise<GoogleDriveListFilesResult> {
    const cred = await GoogleDriveManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, files: [], error: cred.error };
    return GoogleDriveManager.getInstance(cred.resolved).listFiles(query, pageSize);
  }

  static async getFile(credentialName: string, fileId: string): Promise<GoogleDriveFileResult> {
    const cred = await GoogleDriveManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return GoogleDriveManager.getInstance(cred.resolved).getFile(fileId);
  }

  static async uploadFile(credentialName: string, name: string, parentFolderId: string, mimeType: string, content: string, encoding: "utf8" | "base64"): Promise<GoogleDriveFileResult> {
    const cred = await GoogleDriveManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return GoogleDriveManager.getInstance(cred.resolved).uploadFile(name, parentFolderId, mimeType, content, encoding);
  }

  static async updateFileContent(credentialName: string, fileId: string, mimeType: string, content: string, encoding: "utf8" | "base64"): Promise<GoogleDriveOpResult> {
    const cred = await GoogleDriveManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return GoogleDriveManager.getInstance(cred.resolved).updateFileContent(fileId, mimeType, content, encoding);
  }

  static async downloadFile(credentialName: string, fileId: string, encoding: "utf8" | "base64"): Promise<GoogleDriveDownloadResult> {
    const cred = await GoogleDriveManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, content: "", error: cred.error };
    return GoogleDriveManager.getInstance(cred.resolved).downloadFile(fileId, encoding);
  }

  static async createFolder(credentialName: string, name: string, parentFolderId: string): Promise<GoogleDriveFileResult> {
    const cred = await GoogleDriveManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return GoogleDriveManager.getInstance(cred.resolved).createFolder(name, parentFolderId);
  }

  static async copyFile(credentialName: string, fileId: string, newName: string, destinationFolderId: string): Promise<GoogleDriveFileResult> {
    const cred = await GoogleDriveManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return GoogleDriveManager.getInstance(cred.resolved).copyFile(fileId, newName, destinationFolderId);
  }

  static async moveFile(credentialName: string, fileId: string, destinationFolderId: string): Promise<GoogleDriveOpResult> {
    const cred = await GoogleDriveManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return GoogleDriveManager.getInstance(cred.resolved).moveFile(fileId, destinationFolderId);
  }

  static async renameFile(credentialName: string, fileId: string, newName: string): Promise<GoogleDriveOpResult> {
    const cred = await GoogleDriveManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return GoogleDriveManager.getInstance(cred.resolved).renameFile(fileId, newName);
  }

  static async deleteFile(credentialName: string, fileId: string): Promise<GoogleDriveOpResult> {
    const cred = await GoogleDriveManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return GoogleDriveManager.getInstance(cred.resolved).deleteFile(fileId);
  }

  static async shareFile(credentialName: string, fileId: string, role: string, type: string, emailAddress: string): Promise<GoogleDrivePermissionResult> {
    const cred = await GoogleDriveManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, id: "", error: cred.error };
    return GoogleDriveManager.getInstance(cred.resolved).shareFile(fileId, role, type, emailAddress);
  }

  static async listPermissions(credentialName: string, fileId: string): Promise<GoogleDriveListPermissionsResult> {
    const cred = await GoogleDriveManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, permissions: [], error: cred.error };
    return GoogleDriveManager.getInstance(cred.resolved).listPermissions(fileId);
  }

  static async deletePermission(credentialName: string, fileId: string, permissionId: string): Promise<GoogleDriveOpResult> {
    const cred = await GoogleDriveManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return GoogleDriveManager.getInstance(cred.resolved).deletePermission(fileId, permissionId);
  }

  private async listFiles(query: string, pageSize: number): Promise<GoogleDriveListFilesResult> {
    try {
      const res = await this.client.files.list({
        q: query || undefined,
        pageSize,
        fields: "files(id,name,mimeType,size,webViewLink)",
      });
      return { success: true, files: (res.data.files ?? []).map(toFile), error: "" };
    } catch (err) {
      return { success: false, files: [], error: googleErrorMessage(err) };
    }
  }

  private async getFile(fileId: string): Promise<GoogleDriveFileResult> {
    try {
      const res = await this.client.files.get({
        fileId,
        fields: "id,name,mimeType,size,webViewLink",
      });
      return { success: true, ...toFile(res.data), error: "" };
    } catch (err) {
      return { success: false, error: googleErrorMessage(err) };
    }
  }

  private async uploadFile(name: string, parentFolderId: string, mimeType: string, content: string, encoding: "utf8" | "base64"): Promise<GoogleDriveFileResult> {
    try {
      const body = Readable.from([encoding === "base64" ? Buffer.from(content, "base64") : Buffer.from(content, "utf8")]);
      const res = await this.client.files.create({
        requestBody: { name, parents: parentFolderId ? [parentFolderId] : undefined },
        media: { mimeType: mimeType || "application/octet-stream", body },
        fields: "id,name,mimeType,size,webViewLink",
      });
      return { success: true, ...toFile(res.data), error: "" };
    } catch (err) {
      return { success: false, error: googleErrorMessage(err) };
    }
  }

  private async updateFileContent(fileId: string, mimeType: string, content: string, encoding: "utf8" | "base64"): Promise<GoogleDriveOpResult> {
    try {
      const body = Readable.from([encoding === "base64" ? Buffer.from(content, "base64") : Buffer.from(content, "utf8")]);
      await this.client.files.update({
        fileId,
        media: { mimeType: mimeType || "application/octet-stream", body },
      });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: googleErrorMessage(err) };
    }
  }

  private async downloadFile(fileId: string, encoding: "utf8" | "base64"): Promise<GoogleDriveDownloadResult> {
    try {
      const res = await this.client.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" });
      const bytes = Buffer.from(res.data as ArrayBuffer);
      return { success: true, content: bytes.toString(encoding), error: "" };
    } catch (err) {
      return { success: false, content: "", error: googleErrorMessage(err) };
    }
  }

  private async createFolder(name: string, parentFolderId: string): Promise<GoogleDriveFileResult> {
    try {
      const res = await this.client.files.create({
        requestBody: {
          name,
          mimeType: "application/vnd.google-apps.folder",
          parents: parentFolderId ? [parentFolderId] : undefined,
        },
        fields: "id,name,mimeType,size,webViewLink",
      });
      return { success: true, ...toFile(res.data), error: "" };
    } catch (err) {
      return { success: false, error: googleErrorMessage(err) };
    }
  }

  private async copyFile(fileId: string, newName: string, destinationFolderId: string): Promise<GoogleDriveFileResult> {
    try {
      const res = await this.client.files.copy({
        fileId,
        requestBody: { name: newName || undefined, parents: destinationFolderId ? [destinationFolderId] : undefined },
        fields: "id,name,mimeType,size,webViewLink",
      });
      return { success: true, ...toFile(res.data), error: "" };
    } catch (err) {
      return { success: false, error: googleErrorMessage(err) };
    }
  }

  /** Drive has no dedicated move route — a file's "parents" IS its location, so moving means
   * adding the destination folder and removing every current parent in one files.update call. */
  private async moveFile(fileId: string, destinationFolderId: string): Promise<GoogleDriveOpResult> {
    try {
      const current = await this.client.files.get({ fileId, fields: "parents" });
      const previousParents = (current.data.parents ?? []).join(",");
      await this.client.files.update({
        fileId,
        addParents: destinationFolderId,
        removeParents: previousParents || undefined,
      });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: googleErrorMessage(err) };
    }
  }

  private async renameFile(fileId: string, newName: string): Promise<GoogleDriveOpResult> {
    try {
      await this.client.files.update({ fileId, requestBody: { name: newName } });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: googleErrorMessage(err) };
    }
  }

  private async deleteFile(fileId: string): Promise<GoogleDriveOpResult> {
    try {
      await this.client.files.delete({ fileId });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: googleErrorMessage(err) };
    }
  }

  private async shareFile(fileId: string, role: string, type: string, emailAddress: string): Promise<GoogleDrivePermissionResult> {
    try {
      const res = await this.client.permissions.create({
        fileId,
        requestBody: { role, type, emailAddress: emailAddress || undefined },
        fields: "id",
        sendNotificationEmail: false,
      });
      return { success: true, id: res.data.id ?? "", error: "" };
    } catch (err) {
      return { success: false, id: "", error: googleErrorMessage(err) };
    }
  }

  private async listPermissions(fileId: string): Promise<GoogleDriveListPermissionsResult> {
    try {
      const res = await this.client.permissions.list({
        fileId,
        fields: "permissions(id,type,role,emailAddress)",
      });
      const permissions = (res.data.permissions ?? []).map((p) => ({
        id: p.id ?? "",
        type: p.type ?? "",
        role: p.role ?? "",
        emailAddress: p.emailAddress ?? "",
      }));
      return { success: true, permissions, error: "" };
    } catch (err) {
      return { success: false, permissions: [], error: googleErrorMessage(err) };
    }
  }

  private async deletePermission(fileId: string, permissionId: string): Promise<GoogleDriveOpResult> {
    try {
      await this.client.permissions.delete({ fileId, permissionId });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: googleErrorMessage(err) };
    }
  }
}
