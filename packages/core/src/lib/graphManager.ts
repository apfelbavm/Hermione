import { Client, GraphError, ResponseType } from "@microsoft/microsoft-graph-client";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js";
import { ClientSecretCredential } from "@azure/identity";
import { getDatabaseManager } from "../server/DatabaseManager.ts";
import { resolveAllCredentials } from "../server/vaultCredentials.ts";
import type { MicrosoftGraphClientCredentialsData } from "@hermione/shared/types";
import type {
  Application,
  Channel,
  Chat,
  ChatMessage,
  Contact,
  DirectoryRole,
  DriveItem,
  Event as GraphEventEntity,
  Group,
  List,
  ListItem,
  Message,
  PlannerPlan,
  PlannerTask,
  Site,
  Subscription,
  Team,
  TodoTask,
  TodoTaskList,
  User,
  WorkbookRange,
  WorkbookTable,
  WorkbookWorksheet,
} from "@microsoft/microsoft-graph-types";

/** Every Microsoft 365 node (users, mail, calendar, files, groups, Teams) needs the same
 * boilerplate: obtain an app-only access token for Microsoft Graph, call one REST route, and turn
 * either a JSON result or an error response into a plain {success, error} shape. Centralized here
 * once instead of repeated per node (see nodes/microsoft365.ts, which only wires pins to these
 * methods) — mirrors dropboxManager.ts/githubManager.ts.
 *
 * Requests go through the official @microsoft/microsoft-graph-client SDK, authenticated via
 * @azure/identity's ClientSecretCredential (OAuth2 client credentials grant, RFC 6749 §4.4)
 * scoped to "https://graph.microsoft.com/.default" — both handle token acquisition/caching and
 * request/retry/error handling internally, so this class only wires typed method calls to them.
 *
 * Resolves its own credentials straight from the vault database (see findCredential), so both the
 * interpreter and the compiled/deployed script call the exact same static methods directly instead
 * of going through a separate env-var-reading layer — mirrors TwilioManager/FacebookManager. */

export interface GraphAuth {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

export interface GraphOpResult {
  success: boolean;
  error: string;
  [key: string]: unknown;
}

export interface GraphUser {
  id: string;
  displayName: string;
  userPrincipalName: string;
  mail: string;
}

export interface GraphListUsersResult extends GraphOpResult {
  users: GraphUser[];
}

export interface GraphUserResult extends GraphOpResult, Partial<GraphUser> {}

export interface GraphGroup {
  id: string;
  displayName: string;
  mailNickname: string;
}

export interface GraphListGroupsResult extends GraphOpResult {
  groups: GraphGroup[];
}

export interface GraphGroupResult extends GraphOpResult {
  id: string;
}

export interface GraphMessage {
  id: string;
  subject: string;
  from: string;
  receivedDateTime: string;
}

export interface GraphListMessagesResult extends GraphOpResult {
  messages: GraphMessage[];
}

export interface GraphMessageResult extends GraphOpResult {
  subject: string;
  from: string;
  bodyContent: string;
  receivedDateTime: string;
}

export interface GraphEvent {
  id: string;
  subject: string;
  start: string;
  end: string;
}

export interface GraphListEventsResult extends GraphOpResult {
  events: GraphEvent[];
}

export interface GraphEventResult extends GraphOpResult {
  id: string;
}

export interface GraphDriveItem {
  id: string;
  name: string;
  isFolder: boolean;
  size: number;
}

export interface GraphListDriveItemsResult extends GraphOpResult {
  items: GraphDriveItem[];
}

export interface GraphDownloadResult extends GraphOpResult {
  content: string;
}

export interface GraphTeam {
  id: string;
  displayName: string;
}

export interface GraphListTeamsResult extends GraphOpResult {
  teams: GraphTeam[];
}

export interface GraphRequestResult extends GraphOpResult {
  status: number;
  data: unknown;
}

export interface GraphChannel {
  id: string;
  displayName: string;
  description: string;
}

export interface GraphListChannelsResult extends GraphOpResult {
  channels: GraphChannel[];
}

export interface GraphChannelMessage {
  id: string;
  from: string;
  content: string;
  createdDateTime: string;
}

export interface GraphListChannelMessagesResult extends GraphOpResult {
  messages: GraphChannelMessage[];
}

export interface GraphChat {
  id: string;
  topic: string;
  chatType: string;
}

export interface GraphListChatsResult extends GraphOpResult {
  chats: GraphChat[];
}

export interface GraphSite {
  id: string;
  name: string;
  webUrl: string;
}

export interface GraphListSitesResult extends GraphOpResult {
  sites: GraphSite[];
}

export interface GraphSiteList {
  id: string;
  name: string;
}

export interface GraphListSiteListsResult extends GraphOpResult {
  lists: GraphSiteList[];
}

export interface GraphListItem {
  id: string;
  fieldsJson: string;
}

export interface GraphListListItemsResult extends GraphOpResult {
  items: GraphListItem[];
}

export interface GraphSharingLinkResult extends GraphOpResult {
  link: string;
}

export interface GraphWorksheet {
  id: string;
  name: string;
}

export interface GraphListWorksheetsResult extends GraphOpResult {
  worksheets: GraphWorksheet[];
}

export interface GraphRangeResult extends GraphOpResult {
  valuesJson: string;
}

export interface GraphTable {
  id: string;
  name: string;
}

export interface GraphListTablesResult extends GraphOpResult {
  tables: GraphTable[];
}

export interface GraphPlannerPlan {
  id: string;
  title: string;
}

export interface GraphListPlannerPlansResult extends GraphOpResult {
  plans: GraphPlannerPlan[];
}

export interface GraphPlannerTask {
  id: string;
  title: string;
  percentComplete: number;
}

export interface GraphListPlannerTasksResult extends GraphOpResult {
  tasks: GraphPlannerTask[];
}

export interface GraphTodoList {
  id: string;
  displayName: string;
}

export interface GraphListTodoListsResult extends GraphOpResult {
  lists: GraphTodoList[];
}

export interface GraphTodoTask {
  id: string;
  title: string;
  status: string;
}

export interface GraphListTodoTasksResult extends GraphOpResult {
  tasks: GraphTodoTask[];
}

export interface GraphContact {
  id: string;
  displayName: string;
  email: string;
}

export interface GraphListContactsResult extends GraphOpResult {
  contacts: GraphContact[];
}

export interface GraphApplication {
  id: string;
  displayName: string;
  appId: string;
}

export interface GraphListApplicationsResult extends GraphOpResult {
  applications: GraphApplication[];
}

export interface GraphDirectoryRole {
  id: string;
  displayName: string;
}

export interface GraphListDirectoryRolesResult extends GraphOpResult {
  roles: GraphDirectoryRole[];
}

export interface GraphListLicensesResult extends GraphOpResult {
  skuIds: string[];
}

export interface GraphDriveItemResult extends GraphOpResult {
  id: string;
}

export interface GraphTrendingDocument {
  id: string;
  name: string;
  webUrl: string;
}

export interface GraphListTrendingDocumentsResult extends GraphOpResult {
  documents: GraphTrendingDocument[];
}

const managerCache = new Map<string, GraphManager>();

export class GraphManager {
  private readonly client: Client;

  private constructor(tenantId: string, clientId: string, clientSecret: string) {
    const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
    const authProvider = new TokenCredentialAuthenticationProvider(credential, {
      scopes: ["https://graph.microsoft.com/.default"],
    });
    this.client = Client.initWithMiddleware({ authProvider });
  }

  /** Reuses one GraphManager per distinct app registration instead of building a fresh one per node
   * execution, so its underlying credential/client is actually reused across calls instead of
   * re-authenticating every time — same rationale as DropboxManager.forCredential/GithubManager.forAuth. */
  static getInstance(auth: GraphAuth): GraphManager {
    const key = `${auth.tenantId}:${auth.clientId}:${auth.clientSecret}`;
    let manager = managerCache.get(key);
    if (!manager) {
      manager = new GraphManager(auth.tenantId, auth.clientId, auth.clientSecret);
      managerCache.set(key, manager);
    }
    return manager;
  }

  static errorMessage(err: unknown): string {
    if (err instanceof GraphError) return err.code ? `${err.code}: ${err.message}` : err.message;
    return err instanceof Error ? err.message : String(err);
  }

  private static async findCredential(credentialName: string): Promise<{ ok: true; auth: GraphAuth } | { ok: false; error: string }> {
    const credRecord = (await resolveAllCredentials(getDatabaseManager())).get(credentialName);
    if (!credRecord) return { ok: false, error: `Credential "${credentialName}" not found in the vault` };
    if (credRecord.type !== "microsoftGraphClientCredentials") return { ok: false, error: `Credential "${credentialName}" is not a Microsoft Graph credential` };
    const data = credRecord.data as MicrosoftGraphClientCredentialsData;
    return { ok: true, auth: { tenantId: data.tenantId, clientId: data.clientId, clientSecret: data.clientSecret } };
  }

  static async listUsers(credentialName: string, filter: string, top: number): Promise<GraphListUsersResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, users: [], error: cred.error };
    return GraphManager.getInstance(cred.auth).listUsers(filter, top);
  }

  static async getUser(credentialName: string, userId: string): Promise<GraphUserResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return GraphManager.getInstance(cred.auth).getUser(userId);
  }

  static async createUser(credentialName: string, displayName: string, userPrincipalName: string, mailNickname: string, password: string, forceChangePasswordNextSignIn: boolean): Promise<GraphUserResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return GraphManager.getInstance(cred.auth).createUser(displayName, userPrincipalName, mailNickname, password, forceChangePasswordNextSignIn);
  }

  static async updateUser(credentialName: string, userId: string, propertiesJson: string): Promise<GraphOpResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return GraphManager.getInstance(cred.auth).updateUser(userId, propertiesJson);
  }

  static async deleteUser(credentialName: string, userId: string): Promise<GraphOpResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return GraphManager.getInstance(cred.auth).deleteUser(userId);
  }

  static async listGroups(credentialName: string, filter: string, top: number): Promise<GraphListGroupsResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, groups: [], error: cred.error };
    return GraphManager.getInstance(cred.auth).listGroups(filter, top);
  }

  static async createGroup(credentialName: string, displayName: string, mailNickname: string, description: string, securityEnabled: boolean, mailEnabled: boolean): Promise<GraphGroupResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, id: "", error: cred.error };
    return GraphManager.getInstance(cred.auth).createGroup(displayName, mailNickname, description, securityEnabled, mailEnabled);
  }

  static async deleteGroup(credentialName: string, groupId: string): Promise<GraphOpResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return GraphManager.getInstance(cred.auth).deleteGroup(groupId);
  }

  static async addGroupMember(credentialName: string, groupId: string, userId: string): Promise<GraphOpResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return GraphManager.getInstance(cred.auth).addGroupMember(groupId, userId);
  }

  static async sendMail(credentialName: string, userId: string, to: string[], subject: string, body: string, bodyType: "text" | "html", saveToSentItems: boolean): Promise<GraphOpResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return GraphManager.getInstance(cred.auth).sendMail(userId, to, subject, body, bodyType, saveToSentItems);
  }

  static async listMessages(credentialName: string, userId: string, top: number, filter: string): Promise<GraphListMessagesResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, messages: [], error: cred.error };
    return GraphManager.getInstance(cred.auth).listMessages(userId, top, filter);
  }

  static async getMessage(credentialName: string, userId: string, messageId: string): Promise<GraphMessageResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, subject: "", from: "", bodyContent: "", receivedDateTime: "", error: cred.error };
    return GraphManager.getInstance(cred.auth).getMessage(userId, messageId);
  }

  static async deleteMessage(credentialName: string, userId: string, messageId: string): Promise<GraphOpResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return GraphManager.getInstance(cred.auth).deleteMessage(userId, messageId);
  }

  static async listEvents(credentialName: string, userId: string, top: number): Promise<GraphListEventsResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, events: [], error: cred.error };
    return GraphManager.getInstance(cred.auth).listEvents(userId, top);
  }

  static async createEvent(credentialName: string, userId: string, subject: string, start: string, end: string, timeZone: string, bodyContent: string, attendees: string[]): Promise<GraphEventResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, id: "", error: cred.error };
    return GraphManager.getInstance(cred.auth).createEvent(userId, subject, start, end, timeZone, bodyContent, attendees);
  }

  static async deleteEvent(credentialName: string, userId: string, eventId: string): Promise<GraphOpResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return GraphManager.getInstance(cred.auth).deleteEvent(userId, eventId);
  }

  static async listDriveItems(credentialName: string, userId: string, folderPath: string): Promise<GraphListDriveItemsResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, items: [], error: cred.error };
    return GraphManager.getInstance(cred.auth).listDriveItems(userId, folderPath);
  }

  static async downloadFile(credentialName: string, userId: string, filePath: string, encoding: "utf8" | "base64"): Promise<GraphDownloadResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, content: "", error: cred.error };
    return GraphManager.getInstance(cred.auth).downloadFile(userId, filePath, encoding);
  }

  static async uploadFile(credentialName: string, userId: string, filePath: string, content: string, encoding: "utf8" | "base64"): Promise<GraphOpResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return GraphManager.getInstance(cred.auth).uploadFile(userId, filePath, content, encoding);
  }

  static async deleteDriveItem(credentialName: string, userId: string, path: string): Promise<GraphOpResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return GraphManager.getInstance(cred.auth).deleteDriveItem(userId, path);
  }

  static async listJoinedTeams(credentialName: string, userId: string): Promise<GraphListTeamsResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, teams: [], error: cred.error };
    return GraphManager.getInstance(cred.auth).listJoinedTeams(userId);
  }

  static async sendChannelMessage(credentialName: string, teamId: string, channelId: string, message: string): Promise<GraphOpResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return GraphManager.getInstance(cred.auth).sendChannelMessage(teamId, channelId, message);
  }

  static async listChannels(credentialName: string, teamId: string): Promise<GraphListChannelsResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, channels: [], error: cred.error };
    return GraphManager.getInstance(cred.auth).listChannels(teamId);
  }

  static async createChannel(credentialName: string, teamId: string, displayName: string, description: string): Promise<GraphDriveItemResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, id: "", error: cred.error };
    return GraphManager.getInstance(cred.auth).createChannel(teamId, displayName, description);
  }

  static async listChannelMessages(credentialName: string, teamId: string, channelId: string, top: number): Promise<GraphListChannelMessagesResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, messages: [], error: cred.error };
    return GraphManager.getInstance(cred.auth).listChannelMessages(teamId, channelId, top);
  }

  static async listChats(credentialName: string, userId: string): Promise<GraphListChatsResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, chats: [], error: cred.error };
    return GraphManager.getInstance(cred.auth).listChats(userId);
  }

  static async sendChatMessage(credentialName: string, chatId: string, message: string): Promise<GraphOpResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return GraphManager.getInstance(cred.auth).sendChatMessage(chatId, message);
  }

  static async listSites(credentialName: string, search: string): Promise<GraphListSitesResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, sites: [], error: cred.error };
    return GraphManager.getInstance(cred.auth).listSites(search);
  }

  static async listSiteLists(credentialName: string, siteId: string): Promise<GraphListSiteListsResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, lists: [], error: cred.error };
    return GraphManager.getInstance(cred.auth).listSiteLists(siteId);
  }

  static async listListItems(credentialName: string, siteId: string, listId: string): Promise<GraphListListItemsResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, items: [], error: cred.error };
    return GraphManager.getInstance(cred.auth).listListItems(siteId, listId);
  }

  static async createListItem(credentialName: string, siteId: string, listId: string, fieldsJson: string): Promise<GraphDriveItemResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, id: "", error: cred.error };
    return GraphManager.getInstance(cred.auth).createListItem(siteId, listId, fieldsJson);
  }

  static async createFolder(credentialName: string, userId: string, parentPath: string, name: string): Promise<GraphDriveItemResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, id: "", error: cred.error };
    return GraphManager.getInstance(cred.auth).createFolder(userId, parentPath, name);
  }

  static async moveDriveItem(credentialName: string, userId: string, path: string, destinationFolderPath: string): Promise<GraphOpResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return GraphManager.getInstance(cred.auth).moveDriveItem(userId, path, destinationFolderPath);
  }

  static async copyDriveItem(credentialName: string, userId: string, path: string, destinationFolderPath: string, newName: string): Promise<GraphOpResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return GraphManager.getInstance(cred.auth).copyDriveItem(userId, path, destinationFolderPath, newName);
  }

  static async createSharingLink(credentialName: string, userId: string, path: string, type: string, scope: string): Promise<GraphSharingLinkResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, link: "", error: cred.error };
    return GraphManager.getInstance(cred.auth).createSharingLink(userId, path, type, scope);
  }

  static async searchDriveItems(credentialName: string, userId: string, query: string): Promise<GraphListDriveItemsResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, items: [], error: cred.error };
    return GraphManager.getInstance(cred.auth).searchDriveItems(userId, query);
  }

  static async listWorksheets(credentialName: string, userId: string, path: string): Promise<GraphListWorksheetsResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, worksheets: [], error: cred.error };
    return GraphManager.getInstance(cred.auth).listWorksheets(userId, path);
  }

  static async getWorksheetRange(credentialName: string, userId: string, path: string, worksheetName: string, address: string): Promise<GraphRangeResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, valuesJson: "", error: cred.error };
    return GraphManager.getInstance(cred.auth).getWorksheetRange(userId, path, worksheetName, address);
  }

  static async setWorksheetRange(credentialName: string, userId: string, path: string, worksheetName: string, address: string, valuesJson: string): Promise<GraphOpResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return GraphManager.getInstance(cred.auth).setWorksheetRange(userId, path, worksheetName, address, valuesJson);
  }

  static async listTables(credentialName: string, userId: string, path: string): Promise<GraphListTablesResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, tables: [], error: cred.error };
    return GraphManager.getInstance(cred.auth).listTables(userId, path);
  }

  static async addTableRow(credentialName: string, userId: string, path: string, tableName: string, valuesJson: string): Promise<GraphOpResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return GraphManager.getInstance(cred.auth).addTableRow(userId, path, tableName, valuesJson);
  }

  static async listPlannerPlans(credentialName: string, groupId: string): Promise<GraphListPlannerPlansResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, plans: [], error: cred.error };
    return GraphManager.getInstance(cred.auth).listPlannerPlans(groupId);
  }

  static async createPlannerTask(credentialName: string, planId: string, bucketId: string, title: string): Promise<GraphDriveItemResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, id: "", error: cred.error };
    return GraphManager.getInstance(cred.auth).createPlannerTask(planId, bucketId, title);
  }

  static async listPlannerTasks(credentialName: string, planId: string): Promise<GraphListPlannerTasksResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, tasks: [], error: cred.error };
    return GraphManager.getInstance(cred.auth).listPlannerTasks(planId);
  }

  static async listTodoLists(credentialName: string, userId: string): Promise<GraphListTodoListsResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, lists: [], error: cred.error };
    return GraphManager.getInstance(cred.auth).listTodoLists(userId);
  }

  static async createTodoTask(credentialName: string, userId: string, listId: string, title: string): Promise<GraphDriveItemResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, id: "", error: cred.error };
    return GraphManager.getInstance(cred.auth).createTodoTask(userId, listId, title);
  }

  static async listTodoTasks(credentialName: string, userId: string, listId: string): Promise<GraphListTodoTasksResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, tasks: [], error: cred.error };
    return GraphManager.getInstance(cred.auth).listTodoTasks(userId, listId);
  }

  static async listContacts(credentialName: string, userId: string): Promise<GraphListContactsResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, contacts: [], error: cred.error };
    return GraphManager.getInstance(cred.auth).listContacts(userId);
  }

  static async createContact(credentialName: string, userId: string, displayName: string, email: string): Promise<GraphDriveItemResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, id: "", error: cred.error };
    return GraphManager.getInstance(cred.auth).createContact(userId, displayName, email);
  }

  static async deleteContact(credentialName: string, userId: string, contactId: string): Promise<GraphOpResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return GraphManager.getInstance(cred.auth).deleteContact(userId, contactId);
  }

  static async listApplications(credentialName: string, filter: string): Promise<GraphListApplicationsResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, applications: [], error: cred.error };
    return GraphManager.getInstance(cred.auth).listApplications(filter);
  }

  static async listDirectoryRoles(credentialName: string): Promise<GraphListDirectoryRolesResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, roles: [], error: cred.error };
    return GraphManager.getInstance(cred.auth).listDirectoryRoles();
  }

  static async listUserLicenses(credentialName: string, userId: string): Promise<GraphListLicensesResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, skuIds: [], error: cred.error };
    return GraphManager.getInstance(cred.auth).listUserLicenses(userId);
  }

  static async createSubscription(credentialName: string, resource: string, changeType: string, notificationUrl: string, expirationDateTime: string): Promise<GraphDriveItemResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, id: "", error: cred.error };
    return GraphManager.getInstance(cred.auth).createSubscription(resource, changeType, notificationUrl, expirationDateTime);
  }

  static async deleteSubscription(credentialName: string, subscriptionId: string): Promise<GraphOpResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return GraphManager.getInstance(cred.auth).deleteSubscription(subscriptionId);
  }

  static async listTrendingDocuments(credentialName: string, userId: string): Promise<GraphListTrendingDocumentsResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, documents: [], error: cred.error };
    return GraphManager.getInstance(cred.auth).listTrendingDocuments(userId);
  }

  static async rawRequest(credentialName: string, method: string, path: string, bodyJson: string): Promise<GraphRequestResult> {
    const cred = await GraphManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, status: 0, data: undefined, error: cred.error };
    return GraphManager.getInstance(cred.auth).rawRequest(method, path, bodyJson);
  }

  /** Runs a Graph client call and normalizes both its result and any thrown GraphError/transport
   * error into one {success, error} shape, shared by every operation below. */
  private async call<T>(fn: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
    try {
      return { ok: true, data: await fn() };
    } catch (err) {
      return { ok: false, error: GraphManager.errorMessage(err) };
    }
  }

  private async listUsers(filter: string, top: number): Promise<GraphListUsersResult> {
    const res = await this.call(() => {
      let req = this.client.api("/users").top(top || 100);
      if (filter) req = req.filter(filter);
      return req.get() as Promise<{ value: User[] }>;
    });
    if (!res.ok) return { success: false, users: [], error: res.error };
    const users = res.data.value.map((u) => ({
      id: u.id ?? "",
      displayName: u.displayName ?? "",
      userPrincipalName: u.userPrincipalName ?? "",
      mail: u.mail ?? "",
    }));
    return { success: true, users, error: "" };
  }

  private async getUser(userId: string): Promise<GraphUserResult> {
    const res = await this.call(() => this.client.api(`/users/${encodeURIComponent(userId)}`).get() as Promise<User>);
    if (!res.ok) return { success: false, error: res.error };
    return {
      success: true,
      id: res.data.id ?? "",
      displayName: res.data.displayName ?? "",
      userPrincipalName: res.data.userPrincipalName ?? "",
      mail: res.data.mail ?? "",
      error: "",
    };
  }

  private async createUser(displayName: string, userPrincipalName: string, mailNickname: string, password: string, forceChangePasswordNextSignIn: boolean): Promise<GraphUserResult> {
    const res = await this.call(
      () =>
        this.client.api("/users").post({
          accountEnabled: true,
          displayName,
          userPrincipalName,
          mailNickname,
          passwordProfile: { password, forceChangePasswordNextSignIn },
        }) as Promise<User>,
    );
    if (!res.ok) return { success: false, error: res.error };
    return {
      success: true,
      id: res.data.id ?? "",
      displayName: res.data.displayName ?? "",
      userPrincipalName: res.data.userPrincipalName ?? "",
      error: "",
    };
  }

  private async updateUser(userId: string, propertiesJson: string): Promise<GraphOpResult> {
    const res = await this.call(() => this.client.api(`/users/${encodeURIComponent(userId)}`).patch(JSON.parse(propertiesJson || "{}")));
    return res.ok ? { success: true, error: "" } : { success: false, error: res.error };
  }

  private async deleteUser(userId: string): Promise<GraphOpResult> {
    const res = await this.call(() => this.client.api(`/users/${encodeURIComponent(userId)}`).delete());
    return res.ok ? { success: true, error: "" } : { success: false, error: res.error };
  }

  private async listGroups(filter: string, top: number): Promise<GraphListGroupsResult> {
    const res = await this.call(() => {
      let req = this.client.api("/groups").top(top || 100);
      if (filter) req = req.filter(filter);
      return req.get() as Promise<{ value: Group[] }>;
    });
    if (!res.ok) return { success: false, groups: [], error: res.error };
    const groups = res.data.value.map((g) => ({
      id: g.id ?? "",
      displayName: g.displayName ?? "",
      mailNickname: g.mailNickname ?? "",
    }));
    return { success: true, groups, error: "" };
  }

  private async createGroup(displayName: string, mailNickname: string, description: string, securityEnabled: boolean, mailEnabled: boolean): Promise<GraphGroupResult> {
    const res = await this.call(
      () =>
        this.client.api("/groups").post({
          displayName,
          mailNickname,
          description,
          securityEnabled,
          mailEnabled,
          groupTypes: mailEnabled ? ["Unified"] : [],
        }) as Promise<Group>,
    );
    if (!res.ok) return { success: false, id: "", error: res.error };
    return { success: true, id: res.data.id ?? "", error: "" };
  }

  private async deleteGroup(groupId: string): Promise<GraphOpResult> {
    const res = await this.call(() => this.client.api(`/groups/${encodeURIComponent(groupId)}`).delete());
    return res.ok ? { success: true, error: "" } : { success: false, error: res.error };
  }

  private async addGroupMember(groupId: string, userId: string): Promise<GraphOpResult> {
    const res = await this.call(() =>
      this.client.api(`/groups/${encodeURIComponent(groupId)}/members/$ref`).post({
        "@odata.id": `https://graph.microsoft.com/v1.0/directoryObjects/${userId}`,
      }),
    );
    return res.ok ? { success: true, error: "" } : { success: false, error: res.error };
  }

  private async sendMail(userId: string, to: string[], subject: string, body: string, bodyType: "text" | "html", saveToSentItems: boolean): Promise<GraphOpResult> {
    const res = await this.call(() =>
      this.client.api(`/users/${encodeURIComponent(userId)}/sendMail`).post({
        message: {
          subject,
          body: { contentType: bodyType, content: body },
          toRecipients: to.map((address) => ({ emailAddress: { address } })),
        },
        saveToSentItems,
      }),
    );
    return res.ok ? { success: true, error: "" } : { success: false, error: res.error };
  }

  private async listMessages(userId: string, top: number, filter: string): Promise<GraphListMessagesResult> {
    const res = await this.call(() => {
      let req = this.client.api(`/users/${encodeURIComponent(userId)}/messages`).top(top || 25);
      if (filter) req = req.filter(filter);
      return req.get() as Promise<{ value: Message[] }>;
    });
    if (!res.ok) return { success: false, messages: [], error: res.error };
    const messages = res.data.value.map((m) => ({
      id: m.id ?? "",
      subject: m.subject ?? "",
      from: m.from?.emailAddress?.address ?? "",
      receivedDateTime: m.receivedDateTime ?? "",
    }));
    return { success: true, messages, error: "" };
  }

  private async getMessage(userId: string, messageId: string): Promise<GraphMessageResult> {
    const res = await this.call(() => this.client.api(`/users/${encodeURIComponent(userId)}/messages/${encodeURIComponent(messageId)}`).get() as Promise<Message>);
    if (!res.ok)
      return {
        success: false,
        subject: "",
        from: "",
        bodyContent: "",
        receivedDateTime: "",
        error: res.error,
      };
    return {
      success: true,
      subject: res.data.subject ?? "",
      from: res.data.from?.emailAddress?.address ?? "",
      bodyContent: res.data.body?.content ?? "",
      receivedDateTime: res.data.receivedDateTime ?? "",
      error: "",
    };
  }

  private async deleteMessage(userId: string, messageId: string): Promise<GraphOpResult> {
    const res = await this.call(() => this.client.api(`/users/${encodeURIComponent(userId)}/messages/${encodeURIComponent(messageId)}`).delete());
    return res.ok ? { success: true, error: "" } : { success: false, error: res.error };
  }

  private async listEvents(userId: string, top: number): Promise<GraphListEventsResult> {
    const res = await this.call(
      () =>
        this.client
          .api(`/users/${encodeURIComponent(userId)}/events`)
          .top(top || 25)
          .get() as Promise<{ value: GraphEventEntity[] }>,
    );
    if (!res.ok) return { success: false, events: [], error: res.error };
    const events = res.data.value.map((e) => ({
      id: e.id ?? "",
      subject: e.subject ?? "",
      start: e.start?.dateTime ?? "",
      end: e.end?.dateTime ?? "",
    }));
    return { success: true, events, error: "" };
  }

  private async createEvent(userId: string, subject: string, start: string, end: string, timeZone: string, bodyContent: string, attendees: string[]): Promise<GraphEventResult> {
    const res = await this.call(
      () =>
        this.client.api(`/users/${encodeURIComponent(userId)}/events`).post({
          subject,
          start: { dateTime: start, timeZone },
          end: { dateTime: end, timeZone },
          body: { contentType: "html", content: bodyContent },
          attendees: attendees.map((address) => ({
            emailAddress: { address },
            type: "required",
          })),
        }) as Promise<GraphEventEntity>,
    );
    if (!res.ok) return { success: false, id: "", error: res.error };
    return { success: true, id: res.data.id ?? "", error: "" };
  }

  private async deleteEvent(userId: string, eventId: string): Promise<GraphOpResult> {
    const res = await this.call(() => this.client.api(`/users/${encodeURIComponent(userId)}/events/${encodeURIComponent(eventId)}`).delete());
    return res.ok ? { success: true, error: "" } : { success: false, error: res.error };
  }

  /** Graph addresses OneDrive paths as /drive/root:/{path}: (colon-quoted), or plain /drive/root
   * for the root folder itself — an empty path here means "list/act on the root". */
  private driveItemPath(path: string): string {
    return path ? `/root:/${path.split("/").map(encodeURIComponent).join("/")}:` : "/root";
  }

  private async listDriveItems(userId: string, folderPath: string): Promise<GraphListDriveItemsResult> {
    const res = await this.call(() => this.client.api(`/users/${encodeURIComponent(userId)}/drive${this.driveItemPath(folderPath)}/children`).get() as Promise<{ value: DriveItem[] }>);
    if (!res.ok) return { success: false, items: [], error: res.error };
    const items = res.data.value.map((i) => ({
      id: i.id ?? "",
      name: i.name ?? "",
      isFolder: i.folder !== undefined,
      size: i.size ?? 0,
    }));
    return { success: true, items, error: "" };
  }

  private async downloadFile(userId: string, filePath: string, encoding: "utf8" | "base64"): Promise<GraphDownloadResult> {
    const res = await this.call(
      () =>
        this.client
          .api(`/users/${encodeURIComponent(userId)}/drive${this.driveItemPath(filePath)}/content`)
          .responseType(ResponseType.ARRAYBUFFER)
          .get() as Promise<ArrayBuffer>,
    );
    if (!res.ok) return { success: false, content: "", error: res.error };
    return {
      success: true,
      content: Buffer.from(res.data).toString(encoding),
      error: "",
    };
  }

  private async uploadFile(userId: string, filePath: string, content: string, encoding: "utf8" | "base64"): Promise<GraphOpResult> {
    const res = await this.call(() =>
      this.client
        .api(`/users/${encodeURIComponent(userId)}/drive${this.driveItemPath(filePath)}/content`)
        .header("Content-Type", "application/octet-stream")
        .put(Buffer.from(content, encoding)),
    );
    return res.ok ? { success: true, error: "" } : { success: false, error: res.error };
  }

  private async deleteDriveItem(userId: string, path: string): Promise<GraphOpResult> {
    const res = await this.call(() => this.client.api(`/users/${encodeURIComponent(userId)}/drive${this.driveItemPath(path)}`).delete());
    return res.ok ? { success: true, error: "" } : { success: false, error: res.error };
  }

  private async listJoinedTeams(userId: string): Promise<GraphListTeamsResult> {
    const res = await this.call(() => this.client.api(`/users/${encodeURIComponent(userId)}/joinedTeams`).get() as Promise<{ value: Team[] }>);
    if (!res.ok) return { success: false, teams: [], error: res.error };
    const teams = res.data.value.map((t) => ({
      id: t.id ?? "",
      displayName: t.displayName ?? "",
    }));
    return { success: true, teams, error: "" };
  }

  private async sendChannelMessage(teamId: string, channelId: string, message: string): Promise<GraphOpResult> {
    const res = await this.call(() =>
      this.client.api(`/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages`).post({
        body: { contentType: "html", content: message },
      }),
    );
    return res.ok ? { success: true, error: "" } : { success: false, error: res.error };
  }

  private async listChannels(teamId: string): Promise<GraphListChannelsResult> {
    const res = await this.call(() => this.client.api(`/teams/${encodeURIComponent(teamId)}/channels`).get() as Promise<{ value: Channel[] }>);
    if (!res.ok) return { success: false, channels: [], error: res.error };
    const channels = res.data.value.map((c) => ({
      id: c.id ?? "",
      displayName: c.displayName ?? "",
      description: c.description ?? "",
    }));
    return { success: true, channels, error: "" };
  }

  private async createChannel(teamId: string, displayName: string, description: string): Promise<GraphDriveItemResult> {
    const res = await this.call(
      () =>
        this.client.api(`/teams/${encodeURIComponent(teamId)}/channels`).post({
          displayName,
          description,
        }) as Promise<Channel>,
    );
    if (!res.ok) return { success: false, id: "", error: res.error };
    return { success: true, id: res.data.id ?? "", error: "" };
  }

  private async listChannelMessages(teamId: string, channelId: string, top: number): Promise<GraphListChannelMessagesResult> {
    const res = await this.call(
      () =>
        this.client
          .api(`/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages`)
          .top(top || 25)
          .get() as Promise<{ value: ChatMessage[] }>,
    );
    if (!res.ok) return { success: false, messages: [], error: res.error };
    const messages = res.data.value.map((m) => ({
      id: m.id ?? "",
      from: m.from?.user?.displayName ?? "",
      content: m.body?.content ?? "",
      createdDateTime: m.createdDateTime ?? "",
    }));
    return { success: true, messages, error: "" };
  }

  private async listChats(userId: string): Promise<GraphListChatsResult> {
    const res = await this.call(() => this.client.api(`/users/${encodeURIComponent(userId)}/chats`).get() as Promise<{ value: Chat[] }>);
    if (!res.ok) return { success: false, chats: [], error: res.error };
    const chats = res.data.value.map((c) => ({
      id: c.id ?? "",
      topic: c.topic ?? "",
      chatType: c.chatType ?? "",
    }));
    return { success: true, chats, error: "" };
  }

  private async sendChatMessage(chatId: string, message: string): Promise<GraphOpResult> {
    const res = await this.call(() =>
      this.client.api(`/chats/${encodeURIComponent(chatId)}/messages`).post({
        body: { contentType: "html", content: message },
      }),
    );
    return res.ok ? { success: true, error: "" } : { success: false, error: res.error };
  }

  private async listSites(search: string): Promise<GraphListSitesResult> {
    const res = await this.call(
      () =>
        this.client
          .api("/sites")
          .query({ search: search || "*" })
          .get() as Promise<{ value: Site[] }>,
    );
    if (!res.ok) return { success: false, sites: [], error: res.error };
    const sites = res.data.value.map((s) => ({
      id: s.id ?? "",
      name: s.name ?? "",
      webUrl: s.webUrl ?? "",
    }));
    return { success: true, sites, error: "" };
  }

  private async listSiteLists(siteId: string): Promise<GraphListSiteListsResult> {
    const res = await this.call(() => this.client.api(`/sites/${encodeURIComponent(siteId)}/lists`).get() as Promise<{ value: List[] }>);
    if (!res.ok) return { success: false, lists: [], error: res.error };
    const lists = res.data.value.map((l) => ({
      id: l.id ?? "",
      name: l.name ?? "",
    }));
    return { success: true, lists, error: "" };
  }

  private async listListItems(siteId: string, listId: string): Promise<GraphListListItemsResult> {
    const res = await this.call(
      () =>
        this.client
          .api(`/sites/${encodeURIComponent(siteId)}/lists/${encodeURIComponent(listId)}/items`)
          .expand("fields")
          .get() as Promise<{ value: ListItem[] }>,
    );
    if (!res.ok) return { success: false, items: [], error: res.error };
    const items = res.data.value.map((i) => ({
      id: i.id ?? "",
      fieldsJson: JSON.stringify(i.fields ?? {}),
    }));
    return { success: true, items, error: "" };
  }

  private async createListItem(siteId: string, listId: string, fieldsJson: string): Promise<GraphDriveItemResult> {
    const res = await this.call(
      () =>
        this.client.api(`/sites/${encodeURIComponent(siteId)}/lists/${encodeURIComponent(listId)}/items`).post({
          fields: JSON.parse(fieldsJson || "{}"),
        }) as Promise<ListItem>,
    );
    if (!res.ok) return { success: false, id: "", error: res.error };
    return { success: true, id: res.data.id ?? "", error: "" };
  }

  private async createFolder(userId: string, parentPath: string, name: string): Promise<GraphDriveItemResult> {
    const res = await this.call(
      () =>
        this.client.api(`/users/${encodeURIComponent(userId)}/drive${this.driveItemPath(parentPath)}/children`).post({
          name,
          folder: {},
          "@microsoft.graph.conflictBehavior": "rename",
        }) as Promise<DriveItem>,
    );
    if (!res.ok) return { success: false, id: "", error: res.error };
    return { success: true, id: res.data.id ?? "", error: "" };
  }

  private async moveDriveItem(userId: string, path: string, destinationFolderPath: string): Promise<GraphOpResult> {
    const res = await this.call(() =>
      this.client.api(`/users/${encodeURIComponent(userId)}/drive${this.driveItemPath(path)}`).patch({
        parentReference: {
          path: `/drive${this.driveItemPath(destinationFolderPath)}`,
        },
      }),
    );
    return res.ok ? { success: true, error: "" } : { success: false, error: res.error };
  }

  private async copyDriveItem(userId: string, path: string, destinationFolderPath: string, newName: string): Promise<GraphOpResult> {
    const res = await this.call(() =>
      this.client.api(`/users/${encodeURIComponent(userId)}/drive${this.driveItemPath(path)}/copy`).post({
        parentReference: {
          path: `/drive${this.driveItemPath(destinationFolderPath)}`,
        },
        ...(newName ? { name: newName } : {}),
      }),
    );
    return res.ok ? { success: true, error: "" } : { success: false, error: res.error };
  }

  private async createSharingLink(userId: string, path: string, type: string, scope: string): Promise<GraphSharingLinkResult> {
    const res = await this.call(
      () =>
        this.client.api(`/users/${encodeURIComponent(userId)}/drive${this.driveItemPath(path)}/createLink`).post({
          type: type || "view",
          scope: scope || "organization",
        }) as Promise<{ link?: { webUrl?: string } }>,
    );
    if (!res.ok) return { success: false, link: "", error: res.error };
    return { success: true, link: res.data.link?.webUrl ?? "", error: "" };
  }

  private async searchDriveItems(userId: string, query: string): Promise<GraphListDriveItemsResult> {
    const res = await this.call(() => this.client.api(`/users/${encodeURIComponent(userId)}/drive/root/search(q='${encodeURIComponent(query)}')`).get() as Promise<{ value: DriveItem[] }>);
    if (!res.ok) return { success: false, items: [], error: res.error };
    const items = res.data.value.map((i) => ({
      id: i.id ?? "",
      name: i.name ?? "",
      isFolder: i.folder !== undefined,
      size: i.size ?? 0,
    }));
    return { success: true, items, error: "" };
  }

  /** Graph addresses Excel worksheets/ranges through the workbook API, rooted at the file's drive
   * item — every call below hangs off that same driveItemPath helper used for plain file ops. */
  private async listWorksheets(userId: string, path: string): Promise<GraphListWorksheetsResult> {
    const res = await this.call(() => this.client.api(`/users/${encodeURIComponent(userId)}/drive${this.driveItemPath(path)}/workbook/worksheets`).get() as Promise<{ value: WorkbookWorksheet[] }>);
    if (!res.ok) return { success: false, worksheets: [], error: res.error };
    const worksheets = res.data.value.map((w) => ({
      id: w.id ?? "",
      name: w.name ?? "",
    }));
    return { success: true, worksheets, error: "" };
  }

  private async getWorksheetRange(userId: string, path: string, worksheetName: string, address: string): Promise<GraphRangeResult> {
    const res = await this.call(() => this.client.api(`/users/${encodeURIComponent(userId)}/drive${this.driveItemPath(path)}/workbook/worksheets/${encodeURIComponent(worksheetName)}/range(address='${encodeURIComponent(address)}')`).get() as Promise<WorkbookRange>);
    if (!res.ok) return { success: false, valuesJson: "", error: res.error };
    return {
      success: true,
      valuesJson: JSON.stringify(res.data.values ?? []),
      error: "",
    };
  }

  private async setWorksheetRange(userId: string, path: string, worksheetName: string, address: string, valuesJson: string): Promise<GraphOpResult> {
    const res = await this.call(() =>
      this.client.api(`/users/${encodeURIComponent(userId)}/drive${this.driveItemPath(path)}/workbook/worksheets/${encodeURIComponent(worksheetName)}/range(address='${encodeURIComponent(address)}')`).patch({
        values: JSON.parse(valuesJson || "[]"),
      }),
    );
    return res.ok ? { success: true, error: "" } : { success: false, error: res.error };
  }

  private async listTables(userId: string, path: string): Promise<GraphListTablesResult> {
    const res = await this.call(() => this.client.api(`/users/${encodeURIComponent(userId)}/drive${this.driveItemPath(path)}/workbook/tables`).get() as Promise<{ value: WorkbookTable[] }>);
    if (!res.ok) return { success: false, tables: [], error: res.error };
    const tables = res.data.value.map((t) => ({
      id: t.id ?? "",
      name: t.name ?? "",
    }));
    return { success: true, tables, error: "" };
  }

  private async addTableRow(userId: string, path: string, tableName: string, valuesJson: string): Promise<GraphOpResult> {
    const res = await this.call(() =>
      this.client.api(`/users/${encodeURIComponent(userId)}/drive${this.driveItemPath(path)}/workbook/tables/${encodeURIComponent(tableName)}/rows`).post({
        values: [JSON.parse(valuesJson || "[]")],
      }),
    );
    return res.ok ? { success: true, error: "" } : { success: false, error: res.error };
  }

  private async listPlannerPlans(groupId: string): Promise<GraphListPlannerPlansResult> {
    const res = await this.call(() => this.client.api(`/groups/${encodeURIComponent(groupId)}/planner/plans`).get() as Promise<{ value: PlannerPlan[] }>);
    if (!res.ok) return { success: false, plans: [], error: res.error };
    const plans = res.data.value.map((p) => ({
      id: p.id ?? "",
      title: p.title ?? "",
    }));
    return { success: true, plans, error: "" };
  }

  private async createPlannerTask(planId: string, bucketId: string, title: string): Promise<GraphDriveItemResult> {
    const res = await this.call(
      () =>
        this.client.api("/planner/tasks").post({
          planId,
          ...(bucketId ? { bucketId } : {}),
          title,
        }) as Promise<PlannerTask>,
    );
    if (!res.ok) return { success: false, id: "", error: res.error };
    return { success: true, id: res.data.id ?? "", error: "" };
  }

  private async listPlannerTasks(planId: string): Promise<GraphListPlannerTasksResult> {
    const res = await this.call(() => this.client.api(`/planner/plans/${encodeURIComponent(planId)}/tasks`).get() as Promise<{ value: PlannerTask[] }>);
    if (!res.ok) return { success: false, tasks: [], error: res.error };
    const tasks = res.data.value.map((t) => ({
      id: t.id ?? "",
      title: t.title ?? "",
      percentComplete: t.percentComplete ?? 0,
    }));
    return { success: true, tasks, error: "" };
  }

  private async listTodoLists(userId: string): Promise<GraphListTodoListsResult> {
    const res = await this.call(() => this.client.api(`/users/${encodeURIComponent(userId)}/todo/lists`).get() as Promise<{ value: TodoTaskList[] }>);
    if (!res.ok) return { success: false, lists: [], error: res.error };
    const lists = res.data.value.map((l) => ({
      id: l.id ?? "",
      displayName: l.displayName ?? "",
    }));
    return { success: true, lists, error: "" };
  }

  private async createTodoTask(userId: string, listId: string, title: string): Promise<GraphDriveItemResult> {
    const res = await this.call(() => this.client.api(`/users/${encodeURIComponent(userId)}/todo/lists/${encodeURIComponent(listId)}/tasks`).post({ title }) as Promise<TodoTask>);
    if (!res.ok) return { success: false, id: "", error: res.error };
    return { success: true, id: res.data.id ?? "", error: "" };
  }

  private async listTodoTasks(userId: string, listId: string): Promise<GraphListTodoTasksResult> {
    const res = await this.call(() => this.client.api(`/users/${encodeURIComponent(userId)}/todo/lists/${encodeURIComponent(listId)}/tasks`).get() as Promise<{ value: TodoTask[] }>);
    if (!res.ok) return { success: false, tasks: [], error: res.error };
    const tasks = res.data.value.map((t) => ({
      id: t.id ?? "",
      title: t.title ?? "",
      status: t.status ?? "",
    }));
    return { success: true, tasks, error: "" };
  }

  private async listContacts(userId: string): Promise<GraphListContactsResult> {
    const res = await this.call(() => this.client.api(`/users/${encodeURIComponent(userId)}/contacts`).get() as Promise<{ value: Contact[] }>);
    if (!res.ok) return { success: false, contacts: [], error: res.error };
    const contacts = res.data.value.map((c) => ({
      id: c.id ?? "",
      displayName: c.displayName ?? "",
      email: c.emailAddresses?.[0]?.address ?? "",
    }));
    return { success: true, contacts, error: "" };
  }

  private async createContact(userId: string, displayName: string, email: string): Promise<GraphDriveItemResult> {
    const res = await this.call(
      () =>
        this.client.api(`/users/${encodeURIComponent(userId)}/contacts`).post({
          displayName,
          emailAddresses: email ? [{ address: email, name: displayName }] : [],
        }) as Promise<Contact>,
    );
    if (!res.ok) return { success: false, id: "", error: res.error };
    return { success: true, id: res.data.id ?? "", error: "" };
  }

  private async deleteContact(userId: string, contactId: string): Promise<GraphOpResult> {
    const res = await this.call(() => this.client.api(`/users/${encodeURIComponent(userId)}/contacts/${encodeURIComponent(contactId)}`).delete());
    return res.ok ? { success: true, error: "" } : { success: false, error: res.error };
  }

  private async listApplications(filter: string): Promise<GraphListApplicationsResult> {
    const res = await this.call(() => {
      let req = this.client.api("/applications");
      if (filter) req = req.filter(filter);
      return req.get() as Promise<{ value: Application[] }>;
    });
    if (!res.ok) return { success: false, applications: [], error: res.error };
    const applications = res.data.value.map((a) => ({
      id: a.id ?? "",
      displayName: a.displayName ?? "",
      appId: a.appId ?? "",
    }));
    return { success: true, applications, error: "" };
  }

  private async listDirectoryRoles(): Promise<GraphListDirectoryRolesResult> {
    const res = await this.call(
      () =>
        this.client.api("/directoryRoles").get() as Promise<{
          value: DirectoryRole[];
        }>,
    );
    if (!res.ok) return { success: false, roles: [], error: res.error };
    const roles = res.data.value.map((r) => ({
      id: r.id ?? "",
      displayName: r.displayName ?? "",
    }));
    return { success: true, roles, error: "" };
  }

  private async listUserLicenses(userId: string): Promise<GraphListLicensesResult> {
    const res = await this.call(
      () =>
        this.client
          .api(`/users/${encodeURIComponent(userId)}`)
          .select("assignedLicenses")
          .get() as Promise<User>,
    );
    if (!res.ok) return { success: false, skuIds: [], error: res.error };
    const skuIds = (res.data.assignedLicenses ?? []).map((l) => l.skuId ?? "").filter(Boolean);
    return { success: true, skuIds, error: "" };
  }

  private async createSubscription(resource: string, changeType: string, notificationUrl: string, expirationDateTime: string): Promise<GraphDriveItemResult> {
    const res = await this.call(
      () =>
        this.client.api("/subscriptions").post({
          changeType,
          notificationUrl,
          resource,
          expirationDateTime,
        }) as Promise<Subscription>,
    );
    if (!res.ok) return { success: false, id: "", error: res.error };
    return { success: true, id: res.data.id ?? "", error: "" };
  }

  private async deleteSubscription(subscriptionId: string): Promise<GraphOpResult> {
    const res = await this.call(() => this.client.api(`/subscriptions/${encodeURIComponent(subscriptionId)}`).delete());
    return res.ok ? { success: true, error: "" } : { success: false, error: res.error };
  }

  private async listTrendingDocuments(userId: string): Promise<GraphListTrendingDocumentsResult> {
    const res = await this.call(
      () =>
        this.client.api(`/users/${encodeURIComponent(userId)}/insights/trending`).get() as Promise<{
          value: {
            resourceVisualization?: { title?: string };
            resourceReference?: { webUrl?: string };
            id?: string;
          }[];
        }>,
    );
    if (!res.ok) return { success: false, documents: [], error: res.error };
    const documents = res.data.value.map((d) => ({
      id: d.id ?? "",
      name: d.resourceVisualization?.title ?? "",
      webUrl: d.resourceReference?.webUrl ?? "",
    }));
    return { success: true, documents, error: "" };
  }

  /** Escape hatch for any Graph endpoint not wrapped above — thin pass-through with the same
   * auth/error handling as every typed method here, mirroring GithubManager.request. */
  private async rawRequest(method: string, path: string, bodyJson: string): Promise<GraphRequestResult> {
    const body = bodyJson.trim() ? JSON.parse(bodyJson) : undefined;
    const res = await this.call(() => {
      const req = this.client.api(path);
      switch (method.toUpperCase()) {
        case "GET":
          return req.get();
        case "POST":
          return req.post(body);
        case "PUT":
          return req.put(body);
        case "PATCH":
          return req.patch(body);
        case "DELETE":
          return req.delete();
        default:
          throw new Error(`Unsupported method: ${method}`);
      }
    });
    if (!res.ok) return { success: false, status: 0, data: undefined, error: res.error };
    return { success: true, status: 200, data: res.data, error: "" };
  }
}
