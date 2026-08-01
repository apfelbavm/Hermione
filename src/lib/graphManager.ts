import * as oauth from "oauth4webapi";

/** Every Microsoft 365 node (users, mail, calendar, files, groups, Teams) needs the same
 * boilerplate: obtain an app-only access token for Microsoft Graph, call one REST route, and turn
 * either a JSON result or an error response into a plain {success, error} shape. Centralized here
 * once instead of repeated per node (see nodes/microsoft365.ts, which only wires pins to these
 * methods) — mirrors dropboxManager.ts/githubManager.ts.
 *
 * Auth uses the OAuth2 client credentials grant (RFC 6749 §4.4) against Azure AD's v2 token
 * endpoint, scoped to "https://graph.microsoft.com/.default" (the app's statically-configured
 * Graph permissions). Unlike Dropbox's SDK-managed refresh, there's no refresh token here — a
 * fresh token is just a token request away — so this class caches the current token and its
 * expiry itself and requests a new one whenever a call finds it missing or about to expire,
 * the same "reauthenticate on demand" behavior DropboxAuth provides for dropbox.ts. */

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";
// Refresh a little before actual expiry so an in-flight request never races a token that expires
// mid-call.
const TOKEN_EXPIRY_SAFETY_MARGIN_MS = 60_000;

function graphErrorMessage(status: number, body: unknown): string {
  const error = (body as { error?: { message?: string; code?: string } } | undefined)?.error;
  if (error?.message) return error.code ? `${error.code}: ${error.message}` : error.message;
  return `Microsoft Graph error (status ${status})`;
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

const managerCache = new Map<string, GraphManager>();

export class GraphManager {
  private accessToken = "";
  private expiresAt = 0;

  constructor(
    private readonly tenantId: string,
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  /** Reuses one GraphManager per distinct app registration instead of building a fresh one per node
   * execution, so its cached access token is actually reused across calls instead of re-authenticating
   * every time — same rationale as DropboxManager.forCredential/GithubManager.forAuth. */
  static forCredential(tenantId: string, clientId: string, clientSecret: string): GraphManager {
    const key = `${tenantId}:${clientId}:${clientSecret}`;
    let manager = managerCache.get(key);
    if (!manager) {
      manager = new GraphManager(tenantId, clientId, clientSecret);
      managerCache.set(key, manager);
    }
    return manager;
  }

  /** Returns the cached access token, requesting (or renewing) one first if it's missing or close
   * to expiry — called before every Graph request so nodes never have to think about token
   * lifetime themselves. */
  private async ensureAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.expiresAt - TOKEN_EXPIRY_SAFETY_MARGIN_MS) {
      return this.accessToken;
    }
    const tokenUrl = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;
    const as: oauth.AuthorizationServer = {
      issuer: tokenUrl,
      token_endpoint: tokenUrl,
    };
    const client: oauth.Client = { client_id: this.clientId };
    const clientAuth = oauth.ClientSecretPost(this.clientSecret);
    const response = await oauth.clientCredentialsGrantRequest(as, client, clientAuth, new URLSearchParams({ scope: "https://graph.microsoft.com/.default" }));
    const result = await oauth.processClientCredentialsResponse(as, client, response);
    this.accessToken = result.access_token;
    this.expiresAt = Date.now() + Number(result.expires_in ?? 0) * 1000;
    return this.accessToken;
  }

  /** Thin fetch wrapper shared by every operation below: attaches the (possibly freshly-minted)
   * bearer token, retries once after forcing a fresh token on a 401 (the token could have been
   * revoked server-side before its recorded expiry), and normalizes both transport and Graph API
   * errors into one shape. `body` is JSON-serialized unless it's already a Buffer (raw file upload). */
  private async request<T>(method: string, path: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
    const doRequest = async (): Promise<Response> => {
      const token = await this.ensureAccessToken();
      const isBuffer = Buffer.isBuffer(body);
      return fetch(`${GRAPH_BASE_URL}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body === undefined
            ? {}
            : {
                "Content-Type": isBuffer ? "application/octet-stream" : "application/json",
              }),
        },
        body: body === undefined ? undefined : isBuffer ? (new Uint8Array(body as Buffer) as BodyInit) : JSON.stringify(body),
      });
    };
    try {
      let res = await doRequest();
      if (res.status === 401) {
        this.expiresAt = 0;
        res = await doRequest();
      }
      if (res.status === 204) return { ok: true, data: undefined as T };
      const contentType = res.headers.get("content-type") ?? "";
      const payload = contentType.includes("application/json") ? await res.json() : await res.arrayBuffer();
      if (!res.ok) return { ok: false, error: graphErrorMessage(res.status, payload) };
      return { ok: true, data: payload as T };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async listUsers(filter: string, top: number): Promise<GraphListUsersResult> {
    const query = new URLSearchParams({
      $top: String(top || 100),
      ...(filter ? { $filter: filter } : {}),
    });
    const res = await this.request<{ value: GraphUser[] }>("GET", `/users?${query}`);
    if (!res.ok) return { success: false, users: [], error: res.error };
    const users = res.data.value.map((u) => ({
      id: u.id,
      displayName: u.displayName ?? "",
      userPrincipalName: u.userPrincipalName ?? "",
      mail: u.mail ?? "",
    }));
    return { success: true, users, error: "" };
  }

  async getUser(userId: string): Promise<GraphUserResult> {
    const res = await this.request<GraphUser>("GET", `/users/${encodeURIComponent(userId)}`);
    if (!res.ok) return { success: false, error: res.error };
    return {
      success: true,
      id: res.data.id,
      displayName: res.data.displayName ?? "",
      userPrincipalName: res.data.userPrincipalName ?? "",
      mail: res.data.mail ?? "",
      error: "",
    };
  }

  async createUser(displayName: string, userPrincipalName: string, mailNickname: string, password: string, forceChangePasswordNextSignIn: boolean): Promise<GraphUserResult> {
    const res = await this.request<GraphUser>("POST", "/users", {
      accountEnabled: true,
      displayName,
      userPrincipalName,
      mailNickname,
      passwordProfile: { password, forceChangePasswordNextSignIn },
    });
    if (!res.ok) return { success: false, error: res.error };
    return {
      success: true,
      id: res.data.id,
      displayName: res.data.displayName ?? "",
      userPrincipalName: res.data.userPrincipalName ?? "",
      error: "",
    };
  }

  async updateUser(userId: string, propertiesJson: string): Promise<GraphOpResult> {
    const res = await this.request("PATCH", `/users/${encodeURIComponent(userId)}`, JSON.parse(propertiesJson || "{}"));
    if (!res.ok) return { success: false, error: res.error };
    return { success: true, error: "" };
  }

  async deleteUser(userId: string): Promise<GraphOpResult> {
    const res = await this.request("DELETE", `/users/${encodeURIComponent(userId)}`);
    return res.ok ? { success: true, error: "" } : { success: false, error: res.error };
  }

  async listGroups(filter: string, top: number): Promise<GraphListGroupsResult> {
    const query = new URLSearchParams({
      $top: String(top || 100),
      ...(filter ? { $filter: filter } : {}),
    });
    const res = await this.request<{ value: GraphGroup[] }>("GET", `/groups?${query}`);
    if (!res.ok) return { success: false, groups: [], error: res.error };
    const groups = res.data.value.map((g) => ({
      id: g.id,
      displayName: g.displayName ?? "",
      mailNickname: g.mailNickname ?? "",
    }));
    return { success: true, groups, error: "" };
  }

  async createGroup(displayName: string, mailNickname: string, description: string, securityEnabled: boolean, mailEnabled: boolean): Promise<GraphGroupResult> {
    const res = await this.request<GraphGroup>("POST", "/groups", {
      displayName,
      mailNickname,
      description,
      securityEnabled,
      mailEnabled,
      groupTypes: mailEnabled ? ["Unified"] : [],
    });
    if (!res.ok) return { success: false, id: "", error: res.error };
    return { success: true, id: res.data.id, error: "" };
  }

  async deleteGroup(groupId: string): Promise<GraphOpResult> {
    const res = await this.request("DELETE", `/groups/${encodeURIComponent(groupId)}`);
    return res.ok ? { success: true, error: "" } : { success: false, error: res.error };
  }

  async addGroupMember(groupId: string, userId: string): Promise<GraphOpResult> {
    const res = await this.request("POST", `/groups/${encodeURIComponent(groupId)}/members/$ref`, {
      "@odata.id": `https://graph.microsoft.com/v1.0/directoryObjects/${userId}`,
    });
    return res.ok ? { success: true, error: "" } : { success: false, error: res.error };
  }

  async sendMail(userId: string, to: string[], subject: string, body: string, bodyType: "text" | "html", saveToSentItems: boolean): Promise<GraphOpResult> {
    const res = await this.request("POST", `/users/${encodeURIComponent(userId)}/sendMail`, {
      message: {
        subject,
        body: { contentType: bodyType, content: body },
        toRecipients: to.map((address) => ({ emailAddress: { address } })),
      },
      saveToSentItems,
    });
    return res.ok ? { success: true, error: "" } : { success: false, error: res.error };
  }

  async listMessages(userId: string, top: number, filter: string): Promise<GraphListMessagesResult> {
    const query = new URLSearchParams({
      $top: String(top || 25),
      ...(filter ? { $filter: filter } : {}),
    });
    const res = await this.request<{
      value: {
        id: string;
        subject?: string;
        from?: { emailAddress?: { address?: string } };
        receivedDateTime?: string;
      }[];
    }>("GET", `/users/${encodeURIComponent(userId)}/messages?${query}`);
    if (!res.ok) return { success: false, messages: [], error: res.error };
    const messages = res.data.value.map((m) => ({
      id: m.id,
      subject: m.subject ?? "",
      from: m.from?.emailAddress?.address ?? "",
      receivedDateTime: m.receivedDateTime ?? "",
    }));
    return { success: true, messages, error: "" };
  }

  async getMessage(userId: string, messageId: string): Promise<GraphMessageResult> {
    const res = await this.request<{
      subject?: string;
      from?: { emailAddress?: { address?: string } };
      body?: { content?: string };
      receivedDateTime?: string;
    }>("GET", `/users/${encodeURIComponent(userId)}/messages/${encodeURIComponent(messageId)}`);
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

  async deleteMessage(userId: string, messageId: string): Promise<GraphOpResult> {
    const res = await this.request("DELETE", `/users/${encodeURIComponent(userId)}/messages/${encodeURIComponent(messageId)}`);
    return res.ok ? { success: true, error: "" } : { success: false, error: res.error };
  }

  async listEvents(userId: string, top: number): Promise<GraphListEventsResult> {
    const query = new URLSearchParams({ $top: String(top || 25) });
    const res = await this.request<{
      value: {
        id: string;
        subject?: string;
        start?: { dateTime?: string };
        end?: { dateTime?: string };
      }[];
    }>("GET", `/users/${encodeURIComponent(userId)}/events?${query}`);
    if (!res.ok) return { success: false, events: [], error: res.error };
    const events = res.data.value.map((e) => ({
      id: e.id,
      subject: e.subject ?? "",
      start: e.start?.dateTime ?? "",
      end: e.end?.dateTime ?? "",
    }));
    return { success: true, events, error: "" };
  }

  async createEvent(userId: string, subject: string, start: string, end: string, timeZone: string, bodyContent: string, attendees: string[]): Promise<GraphEventResult> {
    const res = await this.request<{ id: string }>("POST", `/users/${encodeURIComponent(userId)}/events`, {
      subject,
      start: { dateTime: start, timeZone },
      end: { dateTime: end, timeZone },
      body: { contentType: "html", content: bodyContent },
      attendees: attendees.map((address) => ({
        emailAddress: { address },
        type: "required",
      })),
    });
    if (!res.ok) return { success: false, id: "", error: res.error };
    return { success: true, id: res.data.id, error: "" };
  }

  async deleteEvent(userId: string, eventId: string): Promise<GraphOpResult> {
    const res = await this.request("DELETE", `/users/${encodeURIComponent(userId)}/events/${encodeURIComponent(eventId)}`);
    return res.ok ? { success: true, error: "" } : { success: false, error: res.error };
  }

  /** Graph addresses OneDrive paths as /drive/root:/{path}: (colon-quoted), or plain /drive/root
   * for the root folder itself — an empty path here means "list/act on the root". */
  private driveItemPath(path: string): string {
    return path ? `/root:/${path.split("/").map(encodeURIComponent).join("/")}:` : "/root";
  }

  async listDriveItems(userId: string, folderPath: string): Promise<GraphListDriveItemsResult> {
    const res = await this.request<{
      value: { id: string; name?: string; folder?: unknown; size?: number }[];
    }>("GET", `/users/${encodeURIComponent(userId)}/drive${this.driveItemPath(folderPath)}/children`);
    if (!res.ok) return { success: false, items: [], error: res.error };
    const items = res.data.value.map((i) => ({
      id: i.id,
      name: i.name ?? "",
      isFolder: i.folder !== undefined,
      size: i.size ?? 0,
    }));
    return { success: true, items, error: "" };
  }

  async downloadFile(userId: string, filePath: string, encoding: "utf8" | "base64"): Promise<GraphDownloadResult> {
    const res = await this.request<ArrayBuffer>("GET", `/users/${encodeURIComponent(userId)}/drive${this.driveItemPath(filePath)}/content`);
    if (!res.ok) return { success: false, content: "", error: res.error };
    return {
      success: true,
      content: Buffer.from(res.data).toString(encoding),
      error: "",
    };
  }

  async uploadFile(userId: string, filePath: string, content: string, encoding: "utf8" | "base64"): Promise<GraphOpResult> {
    const res = await this.request("PUT", `/users/${encodeURIComponent(userId)}/drive${this.driveItemPath(filePath)}/content`, Buffer.from(content, encoding));
    return res.ok ? { success: true, error: "" } : { success: false, error: res.error };
  }

  async deleteDriveItem(userId: string, path: string): Promise<GraphOpResult> {
    const res = await this.request("DELETE", `/users/${encodeURIComponent(userId)}/drive${this.driveItemPath(path)}`);
    return res.ok ? { success: true, error: "" } : { success: false, error: res.error };
  }

  async listJoinedTeams(userId: string): Promise<GraphListTeamsResult> {
    const res = await this.request<{
      value: { id: string; displayName?: string }[];
    }>("GET", `/users/${encodeURIComponent(userId)}/joinedTeams`);
    if (!res.ok) return { success: false, teams: [], error: res.error };
    const teams = res.data.value.map((t) => ({
      id: t.id,
      displayName: t.displayName ?? "",
    }));
    return { success: true, teams, error: "" };
  }

  async sendChannelMessage(teamId: string, channelId: string, message: string): Promise<GraphOpResult> {
    const res = await this.request("POST", `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages`, {
      body: { contentType: "html", content: message },
    });
    return res.ok ? { success: true, error: "" } : { success: false, error: res.error };
  }

  /** Escape hatch for any Graph endpoint not wrapped above — thin pass-through with the same
   * auth/error handling as every typed method here, mirroring GithubManager.request. */
  async rawRequest(method: string, path: string, bodyJson: string): Promise<GraphRequestResult> {
    const body = bodyJson.trim() ? JSON.parse(bodyJson) : undefined;
    const res = await this.request<unknown>(method, path, body);
    if (!res.ok) return { success: false, status: 0, data: undefined, error: res.error };
    return { success: true, status: 200, data: res.data, error: "" };
  }
}
