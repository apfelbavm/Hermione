import { google, type admin_directory_v1 } from "googleapis";
import { googleErrorMessage, serviceAccountClient } from "./googleAuthManager.ts";
import { getDatabaseManager } from "../server/DatabaseManager.ts";
import { resolveAllCredentials } from "../server/vaultCredentials.ts";
import type { GoogleServiceAccountCredentialData } from "@hermione/shared/types";

/** Every Google Workspace Admin node (list/get/create/update/delete users and groups, group
 * membership) needs the same boilerplate: call one googleapis Admin SDK Directory API v1 route
 * and turn either a result or a thrown GaxiosError into a plain {success, error} shape.
 * Centralized here once instead of repeated per node (see nodes/google.ts).
 *
 * Unlike the other Google services, the Directory API only works via domain-wide delegation: a
 * service account impersonating a super admin (credential's impersonateUser) — Google rejects
 * every Directory API call from a service account with no subject, and OAuth2 user credentials
 * can't call it unless that user IS a super admin, so this manager only ever builds from
 * GoogleServiceAccountCredentialData (see findCredential below, which rejects googleOAuth2). */

const SCOPES = ["https://www.googleapis.com/auth/admin.directory.user", "https://www.googleapis.com/auth/admin.directory.group", "https://www.googleapis.com/auth/admin.directory.group.member"];

export interface GoogleAdminOpResult {
  success: boolean;
  error: string;
  [key: string]: unknown;
}

export interface GoogleAdminUser {
  id: string;
  primaryEmail: string;
  fullName: string;
  suspended: boolean;
}

export interface GoogleAdminListUsersResult extends GoogleAdminOpResult {
  users: GoogleAdminUser[];
}

export interface GoogleAdminUserResult extends GoogleAdminOpResult, Partial<GoogleAdminUser> {}

export interface GoogleAdminGroup {
  id: string;
  email: string;
  name: string;
}

export interface GoogleAdminListGroupsResult extends GoogleAdminOpResult {
  groups: GoogleAdminGroup[];
}

export interface GoogleAdminGroupResult extends GoogleAdminOpResult, Partial<GoogleAdminGroup> {}

function toUser(user: admin_directory_v1.Schema$User): GoogleAdminUser {
  return {
    id: user.id ?? "",
    primaryEmail: user.primaryEmail ?? "",
    fullName: user.name?.fullName ?? "",
    suspended: user.suspended ?? false,
  };
}

function toGroup(group: admin_directory_v1.Schema$Group): GoogleAdminGroup {
  return { id: group.id ?? "", email: group.email ?? "", name: group.name ?? "" };
}

const managerCache = new Map<string, GoogleAdminManager>();

export class GoogleAdminManager {
  private readonly client: admin_directory_v1.Admin;

  private constructor(auth: ReturnType<typeof serviceAccountClient>) {
    this.client = google.admin({ version: "directory_v1", auth });
  }

  private static forServiceAccount(data: GoogleServiceAccountCredentialData): GoogleAdminManager {
    const key = `sa:${data.serviceAccountKeyJson}:${data.impersonateUser}`;
    let manager = managerCache.get(key);
    if (!manager) {
      manager = new GoogleAdminManager(serviceAccountClient(data, SCOPES));
      managerCache.set(key, manager);
    }
    return manager;
  }

  /** Admin SDK Directory API only accepts a service account impersonating a super admin — see this
   * class's own header comment — so unlike the other Google managers, this rejects googleOAuth2
   * credentials outright instead of accepting either shape. */
  private static async findCredential(credentialName: string): Promise<{ ok: true; data: GoogleServiceAccountCredentialData } | { ok: false; error: string }> {
    const credRecord = (await resolveAllCredentials(getDatabaseManager())).get(credentialName);
    if (!credRecord) return { ok: false, error: `Credential "${credentialName}" not found in the vault` };
    if (credRecord.type !== "googleServiceAccount") return { ok: false, error: `Credential "${credentialName}" must be a Google Service Account credential (Admin SDK requires domain-wide delegation)` };
    return { ok: true, data: credRecord.data as GoogleServiceAccountCredentialData };
  }

  static async listUsers(credentialName: string, domain: string, query: string, maxResults: number): Promise<GoogleAdminListUsersResult> {
    const cred = await GoogleAdminManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, users: [], error: cred.error };
    return GoogleAdminManager.forServiceAccount(cred.data).listUsers(domain, query, maxResults);
  }

  static async getUser(credentialName: string, userKey: string): Promise<GoogleAdminUserResult> {
    const cred = await GoogleAdminManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return GoogleAdminManager.forServiceAccount(cred.data).getUser(userKey);
  }

  static async createUser(credentialName: string, primaryEmail: string, givenName: string, familyName: string, password: string): Promise<GoogleAdminUserResult> {
    const cred = await GoogleAdminManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return GoogleAdminManager.forServiceAccount(cred.data).createUser(primaryEmail, givenName, familyName, password);
  }

  static async updateUser(credentialName: string, userKey: string, propertiesJson: string): Promise<GoogleAdminUserResult> {
    const cred = await GoogleAdminManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return GoogleAdminManager.forServiceAccount(cred.data).updateUser(userKey, propertiesJson);
  }

  static async deleteUser(credentialName: string, userKey: string): Promise<GoogleAdminOpResult> {
    const cred = await GoogleAdminManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return GoogleAdminManager.forServiceAccount(cred.data).deleteUser(userKey);
  }

  static async listGroups(credentialName: string, domain: string, maxResults: number): Promise<GoogleAdminListGroupsResult> {
    const cred = await GoogleAdminManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, groups: [], error: cred.error };
    return GoogleAdminManager.forServiceAccount(cred.data).listGroups(domain, maxResults);
  }

  static async getGroup(credentialName: string, groupKey: string): Promise<GoogleAdminGroupResult> {
    const cred = await GoogleAdminManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return GoogleAdminManager.forServiceAccount(cred.data).getGroup(groupKey);
  }

  static async createGroup(credentialName: string, email: string, name: string, description: string): Promise<GoogleAdminGroupResult> {
    const cred = await GoogleAdminManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return GoogleAdminManager.forServiceAccount(cred.data).createGroup(email, name, description);
  }

  static async deleteGroup(credentialName: string, groupKey: string): Promise<GoogleAdminOpResult> {
    const cred = await GoogleAdminManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return GoogleAdminManager.forServiceAccount(cred.data).deleteGroup(groupKey);
  }

  static async addGroupMember(credentialName: string, groupKey: string, email: string, role: string): Promise<GoogleAdminOpResult> {
    const cred = await GoogleAdminManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return GoogleAdminManager.forServiceAccount(cred.data).addGroupMember(groupKey, email, role);
  }

  static async removeGroupMember(credentialName: string, groupKey: string, memberKey: string): Promise<GoogleAdminOpResult> {
    const cred = await GoogleAdminManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return GoogleAdminManager.forServiceAccount(cred.data).removeGroupMember(groupKey, memberKey);
  }

  private async listUsers(domain: string, query: string, maxResults: number): Promise<GoogleAdminListUsersResult> {
    try {
      const res = await this.client.users.list({ domain: domain || undefined, query: query || undefined, maxResults });
      return { success: true, users: (res.data.users ?? []).map(toUser), error: "" };
    } catch (err) {
      return { success: false, users: [], error: googleErrorMessage(err) };
    }
  }

  private async getUser(userKey: string): Promise<GoogleAdminUserResult> {
    try {
      const res = await this.client.users.get({ userKey });
      return { success: true, ...toUser(res.data), error: "" };
    } catch (err) {
      return { success: false, error: googleErrorMessage(err) };
    }
  }

  private async createUser(primaryEmail: string, givenName: string, familyName: string, password: string): Promise<GoogleAdminUserResult> {
    try {
      const res = await this.client.users.insert({
        requestBody: { primaryEmail, name: { givenName, familyName }, password },
      });
      return { success: true, ...toUser(res.data), error: "" };
    } catch (err) {
      return { success: false, error: googleErrorMessage(err) };
    }
  }

  private async updateUser(userKey: string, propertiesJson: string): Promise<GoogleAdminUserResult> {
    try {
      const requestBody = JSON.parse(propertiesJson || "{}") as admin_directory_v1.Schema$User;
      const res = await this.client.users.update({ userKey, requestBody });
      return { success: true, ...toUser(res.data), error: "" };
    } catch (err) {
      return { success: false, error: googleErrorMessage(err) };
    }
  }

  private async deleteUser(userKey: string): Promise<GoogleAdminOpResult> {
    try {
      await this.client.users.delete({ userKey });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: googleErrorMessage(err) };
    }
  }

  private async listGroups(domain: string, maxResults: number): Promise<GoogleAdminListGroupsResult> {
    try {
      const res = await this.client.groups.list({ domain: domain || undefined, maxResults });
      return { success: true, groups: (res.data.groups ?? []).map(toGroup), error: "" };
    } catch (err) {
      return { success: false, groups: [], error: googleErrorMessage(err) };
    }
  }

  private async getGroup(groupKey: string): Promise<GoogleAdminGroupResult> {
    try {
      const res = await this.client.groups.get({ groupKey });
      return { success: true, ...toGroup(res.data), error: "" };
    } catch (err) {
      return { success: false, error: googleErrorMessage(err) };
    }
  }

  private async createGroup(email: string, name: string, description: string): Promise<GoogleAdminGroupResult> {
    try {
      const res = await this.client.groups.insert({ requestBody: { email, name, description: description || undefined } });
      return { success: true, ...toGroup(res.data), error: "" };
    } catch (err) {
      return { success: false, error: googleErrorMessage(err) };
    }
  }

  private async deleteGroup(groupKey: string): Promise<GoogleAdminOpResult> {
    try {
      await this.client.groups.delete({ groupKey });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: googleErrorMessage(err) };
    }
  }

  private async addGroupMember(groupKey: string, email: string, role: string): Promise<GoogleAdminOpResult> {
    try {
      await this.client.members.insert({ groupKey, requestBody: { email, role: role || "MEMBER" } });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: googleErrorMessage(err) };
    }
  }

  private async removeGroupMember(groupKey: string, memberKey: string): Promise<GoogleAdminOpResult> {
    try {
      await this.client.members.delete({ groupKey, memberKey });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: googleErrorMessage(err) };
    }
  }
}
