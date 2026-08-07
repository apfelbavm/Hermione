import { FacebookAdsApi } from "facebook-nodejs-business-sdk";

/** Every Facebook node (auth, page/post/comment/like, user, ads) needs the same boilerplate: call
 * one Graph API edge through FacebookAdsApi.call() and turn either a result or a thrown
 * FacebookRequestError into a plain {success, error} shape. Centralized here once instead of
 * repeated per node (see nodes/facebook.ts, which only wires pins to these methods). */

const GRAPH_VERSION = "v24.0";

function fbErrorMessage(err: unknown): string {
  // The SDK already normalizes both network failures and Graph API error bodies into a plain
  // Error whose .message is the Graph API's own error.message (see FacebookRequestError in the
  // SDK's exceptions.js, which the package doesn't export by name).
  return err instanceof Error ? err.message : String(err);
}

export interface FacebookOpResult {
  success: boolean;
  error: string;
  [key: string]: unknown;
}

export interface FacebookTokenResult extends FacebookOpResult {
  accessToken: string;
  expiresIn: number;
}

export interface FacebookDebugTokenResult extends FacebookOpResult {
  appId: string;
  isValid: boolean;
  expiresAt: number;
  scopes: string[];
}

export interface FacebookIdResult extends FacebookOpResult {
  id: string;
}

export interface FacebookPageResult extends FacebookOpResult {
  id: string;
  name: string;
  category: string;
  fanCount: number;
  link: string;
}

export interface FacebookPost {
  id: string;
  message: string;
  createdTime: string;
  [key: string]: unknown;
}

export interface FacebookPostsResult extends FacebookOpResult {
  posts: FacebookPost[];
}

export interface FacebookComment {
  id: string;
  message: string;
  fromName: string;
  createdTime: string;
  [key: string]: unknown;
}

export interface FacebookCommentsResult extends FacebookOpResult {
  comments: FacebookComment[];
}

export interface FacebookLikesCountResult extends FacebookOpResult {
  count: number;
}

export interface FacebookUserResult extends FacebookOpResult {
  id: string;
  name: string;
  email: string;
}

export interface FacebookAdAccount {
  id: string;
  name: string;
  accountStatus: number;
  [key: string]: unknown;
}

export interface FacebookAdAccountsResult extends FacebookOpResult {
  accounts: FacebookAdAccount[];
}

export interface FacebookCampaign {
  id: string;
  name: string;
  status: string;
  objective: string;
  [key: string]: unknown;
}

export interface FacebookCampaignsResult extends FacebookOpResult {
  campaigns: FacebookCampaign[];
}

export interface FacebookJsonResult extends FacebookOpResult {
  json: string;
}

const managerCache = new Map<string, FacebookManager>();

export class FacebookManager {
  private readonly api: FacebookAdsApi;

  /** Disables the SDK's own crash reporter (an opt-out telemetry ping to Meta on uncaught
   * exceptions) — irrelevant noise for a node execution and not something this server should be
   * phoning home about. */
  constructor(accessToken: string) {
    this.api = new FacebookAdsApi(accessToken, "en_US", false);
  }

  /** Reuses one FacebookManager per distinct access token instead of building a fresh one per node
   * execution, mirroring DropboxManager.forCredential. */
  static forCredential(accessToken: string): FacebookManager {
    let manager = managerCache.get(accessToken);
    if (!manager) {
      manager = new FacebookManager(accessToken);
      managerCache.set(accessToken, manager);
    }
    return manager;
  }

  /** One-time setup step: exchanges a single-use authorization code (obtained by a human visiting
   * Facebook's /dialog/oauth consent page) for a short-lived user access token, then immediately
   * exchanges that for a long-lived (~60 day) token — the value that goes into the Credential Vault
   * for every other Facebook node's forCredential() to use. Unlike Dropbox's refresh token, a
   * long-lived Facebook user token doesn't renew itself; re-running this node is how it gets
   * refreshed once it nears expiry. */
  static async exchangeAuthCode(authCode: string, appId: string, appSecret: string, redirectUri: string): Promise<FacebookTokenResult> {
    try {
      const shortLived = await FacebookManager.oauthTokenRequest({
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: redirectUri,
        code: authCode,
      });
      const longLived = await FacebookManager.oauthTokenRequest({
        grant_type: "fb_exchange_token",
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: String(shortLived.access_token),
      });
      return {
        success: true,
        accessToken: String(longLived.access_token ?? ""),
        expiresIn: Number(longLived.expires_in ?? 0),
        error: "",
      };
    } catch (err) {
      return { success: false, accessToken: "", expiresIn: 0, error: fbErrorMessage(err) };
    }
  }

  private static async oauthTokenRequest(params: Record<string, string>): Promise<{ access_token?: string; expires_in?: number }> {
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token?${new URLSearchParams(params).toString()}`;
    const res = await fetch(url);
    const body = (await res.json()) as { access_token?: string; expires_in?: number; error?: { message?: string } };
    if (!res.ok || body.error) throw new Error(body.error?.message ?? `Facebook OAuth error (status ${res.status})`);
    return body;
  }

  /** Inspects an access token (app id it belongs to, validity, expiry, granted scopes) using the
   * calling app's own id/secret as the inspecting "app access token" — doesn't require a
   * FacebookManager instance since it isn't scoped to a particular user/page token. */
  static async debugToken(inputToken: string, appId: string, appSecret: string): Promise<FacebookDebugTokenResult> {
    try {
      const api = new FacebookAdsApi(`${appId}|${appSecret}`, "en_US", false);
      const res = (await api.call("GET", ["debug_token"], { input_token: inputToken })) as {
        data?: {
          app_id?: string;
          is_valid?: boolean;
          expires_at?: number;
          scopes?: string[];
        };
      };
      const data = res.data ?? {};
      return {
        success: true,
        appId: String(data.app_id ?? ""),
        isValid: Boolean(data.is_valid),
        expiresAt: Number(data.expires_at ?? 0),
        scopes: data.scopes ?? [],
        error: "",
      };
    } catch (err) {
      return { success: false, appId: "", isValid: false, expiresAt: 0, scopes: [], error: fbErrorMessage(err) };
    }
  }

  async getPageInfo(pageId: string): Promise<FacebookPageResult> {
    try {
      const res = (await this.api.call("GET", [pageId], { fields: "id,name,category,fan_count,link" })) as {
        id?: string;
        name?: string;
        category?: string;
        fan_count?: number;
        link?: string;
      };
      return {
        success: true,
        id: String(res.id ?? ""),
        name: res.name ?? "",
        category: res.category ?? "",
        fanCount: Number(res.fan_count ?? 0),
        link: res.link ?? "",
        error: "",
      };
    } catch (err) {
      return { success: false, id: "", name: "", category: "", fanCount: 0, link: "", error: fbErrorMessage(err) };
    }
  }

  async createPost(pageId: string, message: string, link: string): Promise<FacebookIdResult> {
    try {
      const res = (await this.api.call("POST", [pageId, "feed"], { message, link: link || undefined })) as { id?: string };
      return { success: true, id: String(res.id ?? ""), error: "" };
    } catch (err) {
      return { success: false, id: "", error: fbErrorMessage(err) };
    }
  }

  async createPhotoPost(pageId: string, url: string, caption: string): Promise<FacebookIdResult> {
    try {
      const res = (await this.api.call("POST", [pageId, "photos"], { url, caption })) as { id?: string; post_id?: string };
      return { success: true, id: String(res.post_id ?? res.id ?? ""), error: "" };
    } catch (err) {
      return { success: false, id: "", error: fbErrorMessage(err) };
    }
  }

  async createVideoPost(pageId: string, videoUrl: string, description: string): Promise<FacebookIdResult> {
    try {
      const res = (await this.api.call("POST", [pageId, "videos"], { file_url: videoUrl, description })) as { id?: string };
      return { success: true, id: String(res.id ?? ""), error: "" };
    } catch (err) {
      return { success: false, id: "", error: fbErrorMessage(err) };
    }
  }

  async deletePost(postId: string): Promise<FacebookOpResult> {
    try {
      await this.api.call("DELETE", [postId]);
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: fbErrorMessage(err) };
    }
  }

  async getPosts(pageId: string, limit: number): Promise<FacebookPostsResult> {
    try {
      const res = (await this.api.call("GET", [pageId, "posts"], { fields: "id,message,created_time", limit })) as {
        data?: { id?: string; message?: string; created_time?: string }[];
      };
      const posts = (res.data ?? []).map((p) => ({
        id: String(p.id ?? ""),
        message: p.message ?? "",
        createdTime: p.created_time ?? "",
      }));
      return { success: true, posts, error: "" };
    } catch (err) {
      return { success: false, posts: [], error: fbErrorMessage(err) };
    }
  }

  async getPageInsights(pageId: string, metrics: string[], period: string): Promise<FacebookJsonResult> {
    try {
      const res = await this.api.call("GET", [pageId, "insights"], { metric: metrics.join(","), period });
      return { success: true, json: JSON.stringify(res), error: "" };
    } catch (err) {
      return { success: false, json: "", error: fbErrorMessage(err) };
    }
  }

  async createComment(objectId: string, message: string): Promise<FacebookIdResult> {
    try {
      const res = (await this.api.call("POST", [objectId, "comments"], { message })) as { id?: string };
      return { success: true, id: String(res.id ?? ""), error: "" };
    } catch (err) {
      return { success: false, id: "", error: fbErrorMessage(err) };
    }
  }

  async getComments(objectId: string, limit: number): Promise<FacebookCommentsResult> {
    try {
      const res = (await this.api.call("GET", [objectId, "comments"], { fields: "id,message,from,created_time", limit })) as {
        data?: {
          id?: string;
          message?: string;
          from?: { name?: string };
          created_time?: string;
        }[];
      };
      const comments = (res.data ?? []).map((c) => ({
        id: String(c.id ?? ""),
        message: c.message ?? "",
        fromName: c.from?.name ?? "",
        createdTime: c.created_time ?? "",
      }));
      return { success: true, comments, error: "" };
    } catch (err) {
      return { success: false, comments: [], error: fbErrorMessage(err) };
    }
  }

  async deleteComment(commentId: string): Promise<FacebookOpResult> {
    try {
      await this.api.call("DELETE", [commentId]);
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: fbErrorMessage(err) };
    }
  }

  async likeObject(objectId: string): Promise<FacebookOpResult> {
    try {
      await this.api.call("POST", [objectId, "likes"]);
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: fbErrorMessage(err) };
    }
  }

  async unlikeObject(objectId: string): Promise<FacebookOpResult> {
    try {
      await this.api.call("DELETE", [objectId, "likes"]);
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: fbErrorMessage(err) };
    }
  }

  async getLikesCount(objectId: string): Promise<FacebookLikesCountResult> {
    try {
      const res = (await this.api.call("GET", [objectId], { fields: "likes.summary(true)" })) as {
        likes?: { summary?: { total_count?: number } };
      };
      return { success: true, count: Number(res.likes?.summary?.total_count ?? 0), error: "" };
    } catch (err) {
      return { success: false, count: 0, error: fbErrorMessage(err) };
    }
  }

  async getUserProfile(userId: string): Promise<FacebookUserResult> {
    try {
      const res = (await this.api.call("GET", [userId || "me"], { fields: "id,name,email" })) as {
        id?: string;
        name?: string;
        email?: string;
      };
      return { success: true, id: String(res.id ?? ""), name: res.name ?? "", email: res.email ?? "", error: "" };
    } catch (err) {
      return { success: false, id: "", name: "", email: "", error: fbErrorMessage(err) };
    }
  }

  async getAdAccounts(userId: string): Promise<FacebookAdAccountsResult> {
    try {
      const res = (await this.api.call("GET", [userId || "me", "adaccounts"], { fields: "account_id,name,account_status" })) as {
        data?: { id?: string; account_id?: string; name?: string; account_status?: number }[];
      };
      const accounts = (res.data ?? []).map((a) => ({
        id: String(a.account_id ?? a.id ?? ""),
        name: a.name ?? "",
        accountStatus: Number(a.account_status ?? 0),
      }));
      return { success: true, accounts, error: "" };
    } catch (err) {
      return { success: false, accounts: [], error: fbErrorMessage(err) };
    }
  }

  async createCampaign(adAccountId: string, name: string, objective: string, status: string): Promise<FacebookIdResult> {
    try {
      const res = (await this.api.call("POST", [`act_${adAccountId}`, "campaigns"], {
        name,
        objective,
        status,
        special_ad_categories: [],
      })) as { id?: string };
      return { success: true, id: String(res.id ?? ""), error: "" };
    } catch (err) {
      return { success: false, id: "", error: fbErrorMessage(err) };
    }
  }

  async getCampaigns(adAccountId: string, limit: number): Promise<FacebookCampaignsResult> {
    try {
      const res = (await this.api.call("GET", [`act_${adAccountId}`, "campaigns"], { fields: "id,name,status,objective", limit })) as {
        data?: { id?: string; name?: string; status?: string; objective?: string }[];
      };
      const campaigns = (res.data ?? []).map((c) => ({
        id: String(c.id ?? ""),
        name: c.name ?? "",
        status: c.status ?? "",
        objective: c.objective ?? "",
      }));
      return { success: true, campaigns, error: "" };
    } catch (err) {
      return { success: false, campaigns: [], error: fbErrorMessage(err) };
    }
  }

  async deleteCampaign(campaignId: string): Promise<FacebookOpResult> {
    try {
      await this.api.call("DELETE", [campaignId]);
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: fbErrorMessage(err) };
    }
  }

  async getInsights(objectId: string, fields: string[]): Promise<FacebookJsonResult> {
    try {
      const res = await this.api.call("GET", [objectId, "insights"], { fields: fields.join(",") });
      return { success: true, json: JSON.stringify(res), error: "" };
    } catch (err) {
      return { success: false, json: "", error: fbErrorMessage(err) };
    }
  }

  /** Generic escape hatch for any Graph API edge this manager doesn't have a dedicated method for —
   * same role as the OData/HTTP Request nodes play for arbitrary REST APIs, but authenticated via
   * the vault's Facebook credential. `paramsJson` is a JSON object string; `path` is slash-separated
   * (e.g. "me/accounts"). */
  async apiCall(method: string, path: string, paramsJson: string): Promise<FacebookJsonResult> {
    try {
      const params = paramsJson ? (JSON.parse(paramsJson) as Record<string, unknown>) : {};
      const segments = path.split("/").filter((s) => s !== "");
      const res = await this.api.call(method, segments, params);
      return { success: true, json: JSON.stringify(res), error: "" };
    } catch (err) {
      return { success: false, json: "", error: fbErrorMessage(err) };
    }
  }
}
