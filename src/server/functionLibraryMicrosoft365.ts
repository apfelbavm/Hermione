import { GraphManager } from "../lib/graphManager.ts";

/** Compile-time-only counterpart of nodes/microsoft365.ts's execute() vault lookup
 * (resolveGraphCredential) — the compiled/deployed script has no access to the Credential Vault
 * database, only the interpreter does, so it reads the same credential's tenantId/clientId/
 * clientSecret fields back from environment variables instead, the same "HERMIONE_CRED_<NAME>_
 * <FIELD>" naming credentialEnv.ts's applyCredentialEnvVars writes. Never called by the
 * interpreter — genuinely different credential-sourcing behavior, not duplicated logic.
 *
 * Kept in its own file, separate from functionLibrary.ts, purely to mirror
 * functionLibraryJira.ts/functionLibrarySftp.ts's one-node-family-per-file convention. */
function microsoft365ManagerFromEnv(credentialName: string): { ok: true; manager: GraphManager } | { ok: false; error: string } {
  const prefix = `HERMIONE_CRED_${String(credentialName)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")}`;
  const type = process.env[`${prefix}_CREDENTIAL_TYPE`];
  if (type !== "microsoftGraphClientCredentials") return { ok: false, error: `Credential "${credentialName}" not found in the vault, or is not a Microsoft Graph credential` };
  const tenantId = process.env[`${prefix}_TENANT_ID`] || "";
  const clientId = process.env[`${prefix}_CLIENT_ID`] || "";
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`] || "";
  return { ok: true, manager: GraphManager.forCredential(tenantId, clientId, clientSecret) };
}

export async function microsoft365ListUsers(credentialName: string, filter: string, top: number) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, users: [], error: cred.error };
  return cred.manager.listUsers(filter, top);
}

export async function microsoft365GetUser(credentialName: string, userId: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, id: "", displayName: "", userPrincipalName: "", mail: "", error: cred.error };
  return cred.manager.getUser(userId);
}

export async function microsoft365CreateUser(credentialName: string, displayName: string, userPrincipalName: string, mailNickname: string, password: string, forceChangePasswordNextSignIn: boolean) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, id: "", error: cred.error };
  return cred.manager.createUser(displayName, userPrincipalName, mailNickname, password, forceChangePasswordNextSignIn);
}

export async function microsoft365UpdateUser(credentialName: string, userId: string, propertiesJson: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.updateUser(userId, propertiesJson);
}

export async function microsoft365DeleteUser(credentialName: string, userId: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.deleteUser(userId);
}

export async function microsoft365ListGroups(credentialName: string, filter: string, top: number) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, groups: [], error: cred.error };
  return cred.manager.listGroups(filter, top);
}

export async function microsoft365CreateGroup(credentialName: string, displayName: string, mailNickname: string, description: string, securityEnabled: boolean, mailEnabled: boolean) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, id: "", error: cred.error };
  return cred.manager.createGroup(displayName, mailNickname, description, securityEnabled, mailEnabled);
}

export async function microsoft365DeleteGroup(credentialName: string, groupId: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.deleteGroup(groupId);
}

export async function microsoft365AddGroupMember(credentialName: string, groupId: string, userId: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.addGroupMember(groupId, userId);
}

export async function microsoft365SendMail(credentialName: string, userId: string, to: string[], subject: string, body: string, bodyType: "text" | "html", saveToSentItems: boolean) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.sendMail(userId, to, subject, body, bodyType, saveToSentItems);
}

export async function microsoft365ListMessages(credentialName: string, userId: string, top: number, filter: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, messages: [], error: cred.error };
  return cred.manager.listMessages(userId, top, filter);
}

export async function microsoft365GetMessage(credentialName: string, userId: string, messageId: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, subject: "", from: "", bodyContent: "", receivedDateTime: "", error: cred.error };
  return cred.manager.getMessage(userId, messageId);
}

export async function microsoft365DeleteMessage(credentialName: string, userId: string, messageId: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.deleteMessage(userId, messageId);
}

export async function microsoft365ListEvents(credentialName: string, userId: string, top: number) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, events: [], error: cred.error };
  return cred.manager.listEvents(userId, top);
}

export async function microsoft365CreateEvent(credentialName: string, userId: string, subject: string, start: string, end: string, timeZone: string, body: string, attendees: string[]) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, id: "", error: cred.error };
  return cred.manager.createEvent(userId, subject, start, end, timeZone, body, attendees);
}

export async function microsoft365DeleteEvent(credentialName: string, userId: string, eventId: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.deleteEvent(userId, eventId);
}

export async function microsoft365ListDriveItems(credentialName: string, userId: string, folderPath: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, items: [], error: cred.error };
  return cred.manager.listDriveItems(userId, folderPath);
}

export async function microsoft365DownloadFile(credentialName: string, userId: string, filePath: string, encoding: "utf8" | "base64") {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, content: "", error: cred.error };
  return cred.manager.downloadFile(userId, filePath, encoding);
}

export async function microsoft365UploadFile(credentialName: string, userId: string, filePath: string, content: string, encoding: "utf8" | "base64") {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.uploadFile(userId, filePath, content, encoding);
}

export async function microsoft365DeleteDriveItem(credentialName: string, userId: string, path: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.deleteDriveItem(userId, path);
}

export async function microsoft365ListJoinedTeams(credentialName: string, userId: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, teams: [], error: cred.error };
  return cred.manager.listJoinedTeams(userId);
}

export async function microsoft365SendChannelMessage(credentialName: string, teamId: string, channelId: string, message: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.sendChannelMessage(teamId, channelId, message);
}

export async function microsoft365Request(credentialName: string, method: string, path: string, bodyJson: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, status: 0, data: undefined, error: cred.error };
  return cred.manager.rawRequest(method, path, bodyJson);
}

export async function microsoft365ListChannels(credentialName: string, teamId: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, channels: [], error: cred.error };
  return cred.manager.listChannels(teamId);
}

export async function microsoft365CreateChannel(credentialName: string, teamId: string, displayName: string, description: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, id: "", error: cred.error };
  return cred.manager.createChannel(teamId, displayName, description);
}

export async function microsoft365ListChannelMessages(credentialName: string, teamId: string, channelId: string, top: number) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, messages: [], error: cred.error };
  return cred.manager.listChannelMessages(teamId, channelId, top);
}

export async function microsoft365ListChats(credentialName: string, userId: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, chats: [], error: cred.error };
  return cred.manager.listChats(userId);
}

export async function microsoft365SendChatMessage(credentialName: string, chatId: string, message: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.sendChatMessage(chatId, message);
}

export async function microsoft365ListSites(credentialName: string, search: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, sites: [], error: cred.error };
  return cred.manager.listSites(search);
}

export async function microsoft365ListSiteLists(credentialName: string, siteId: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, lists: [], error: cred.error };
  return cred.manager.listSiteLists(siteId);
}

export async function microsoft365ListListItems(credentialName: string, siteId: string, listId: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, items: [], error: cred.error };
  return cred.manager.listListItems(siteId, listId);
}

export async function microsoft365CreateListItem(credentialName: string, siteId: string, listId: string, fieldsJson: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, id: "", error: cred.error };
  return cred.manager.createListItem(siteId, listId, fieldsJson);
}

export async function microsoft365CreateFolder(credentialName: string, userId: string, parentPath: string, name: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, id: "", error: cred.error };
  return cred.manager.createFolder(userId, parentPath, name);
}

export async function microsoft365MoveDriveItem(credentialName: string, userId: string, path: string, destinationFolderPath: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.moveDriveItem(userId, path, destinationFolderPath);
}

export async function microsoft365CopyDriveItem(credentialName: string, userId: string, path: string, destinationFolderPath: string, newName: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.copyDriveItem(userId, path, destinationFolderPath, newName);
}

export async function microsoft365CreateSharingLink(credentialName: string, userId: string, path: string, type: string, scope: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, link: "", error: cred.error };
  return cred.manager.createSharingLink(userId, path, type, scope);
}

export async function microsoft365SearchDriveItems(credentialName: string, userId: string, query: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, items: [], error: cred.error };
  return cred.manager.searchDriveItems(userId, query);
}

export async function microsoft365ListWorksheets(credentialName: string, userId: string, path: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, worksheets: [], error: cred.error };
  return cred.manager.listWorksheets(userId, path);
}

export async function microsoft365GetWorksheetRange(credentialName: string, userId: string, path: string, worksheetName: string, address: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, valuesJson: "", error: cred.error };
  return cred.manager.getWorksheetRange(userId, path, worksheetName, address);
}

export async function microsoft365SetWorksheetRange(credentialName: string, userId: string, path: string, worksheetName: string, address: string, valuesJson: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.setWorksheetRange(userId, path, worksheetName, address, valuesJson);
}

export async function microsoft365ListTables(credentialName: string, userId: string, path: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, tables: [], error: cred.error };
  return cred.manager.listTables(userId, path);
}

export async function microsoft365AddTableRow(credentialName: string, userId: string, path: string, tableName: string, valuesJson: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.addTableRow(userId, path, tableName, valuesJson);
}

export async function microsoft365ListPlannerPlans(credentialName: string, groupId: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, plans: [], error: cred.error };
  return cred.manager.listPlannerPlans(groupId);
}

export async function microsoft365CreatePlannerTask(credentialName: string, planId: string, bucketId: string, title: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, id: "", error: cred.error };
  return cred.manager.createPlannerTask(planId, bucketId, title);
}

export async function microsoft365ListPlannerTasks(credentialName: string, planId: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, tasks: [], error: cred.error };
  return cred.manager.listPlannerTasks(planId);
}

export async function microsoft365ListTodoLists(credentialName: string, userId: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, lists: [], error: cred.error };
  return cred.manager.listTodoLists(userId);
}

export async function microsoft365CreateTodoTask(credentialName: string, userId: string, listId: string, title: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, id: "", error: cred.error };
  return cred.manager.createTodoTask(userId, listId, title);
}

export async function microsoft365ListTodoTasks(credentialName: string, userId: string, listId: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, tasks: [], error: cred.error };
  return cred.manager.listTodoTasks(userId, listId);
}

export async function microsoft365ListContacts(credentialName: string, userId: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, contacts: [], error: cred.error };
  return cred.manager.listContacts(userId);
}

export async function microsoft365CreateContact(credentialName: string, userId: string, displayName: string, email: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, id: "", error: cred.error };
  return cred.manager.createContact(userId, displayName, email);
}

export async function microsoft365DeleteContact(credentialName: string, userId: string, contactId: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.deleteContact(userId, contactId);
}

export async function microsoft365ListApplications(credentialName: string, filter: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, applications: [], error: cred.error };
  return cred.manager.listApplications(filter);
}

export async function microsoft365ListDirectoryRoles(credentialName: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, roles: [], error: cred.error };
  return cred.manager.listDirectoryRoles();
}

export async function microsoft365ListUserLicenses(credentialName: string, userId: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, skuIds: [], error: cred.error };
  return cred.manager.listUserLicenses(userId);
}

export async function microsoft365CreateSubscription(credentialName: string, resource: string, changeType: string, notificationUrl: string, expirationDateTime: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, id: "", error: cred.error };
  return cred.manager.createSubscription(resource, changeType, notificationUrl, expirationDateTime);
}

export async function microsoft365DeleteSubscription(credentialName: string, subscriptionId: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return cred.manager.deleteSubscription(subscriptionId);
}

export async function microsoft365ListTrendingDocuments(credentialName: string, userId: string) {
  const cred = microsoft365ManagerFromEnv(credentialName);
  if (!cred.ok) return { success: false, documents: [], error: cred.error };
  return cred.manager.listTrendingDocuments(userId);
}
