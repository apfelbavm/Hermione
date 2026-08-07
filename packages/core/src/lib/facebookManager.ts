import { FacebookAdsApi } from "facebook-nodejs-business-sdk";
import { getDatabaseManager } from "../server/DatabaseManager.ts";
import { resolveAllCredentials } from "../server/vaultCredentials.ts";
import type { FacebookCredentialData } from "@hermione/shared/types";

/** Every Facebook node (auth, page/post/comment/like, user, ads) needs the same boilerplate: call
 * one Graph API edge through FacebookAdsApi.call() and turn either a result or a thrown
 * FacebookRequestError into a plain {success, error} shape. Centralized here once instead of
 * repeated per node (see nodes/facebook.ts, which only wires pins to these methods).
 *
 * Mirrors TwilioManager (packages/core/src/lib/twilioManager.ts): this manager resolves its own
 * named credential straight from the database (see findCredential below), so unlike most other
 * providers there is no separate functionLibraryFacebook.ts env-var-reading layer — both the
 * interpreter and the compiled/deployed path call the exact same static methods directly. */

const GRAPH_VERSION = "v24.0";

export interface FacebookAuth {
  appId: string;
  appSecret: string;
  redirectUri: string;
  authCode: string;
  accessToken: string;
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

  static getInstance(auth: FacebookAuth): FacebookManager {
    let manager = managerCache.get(auth.accessToken);
    if (!manager) {
      manager = new FacebookManager(auth.accessToken);
      managerCache.set(auth.accessToken, manager);
    }
    return manager;
  }

  /** Disables the SDK's own crash reporter (an opt-out telemetry ping to Meta on uncaught
   * exceptions) — irrelevant noise for a node execution and not something this server should be
   * phoning home about. */
  private constructor(accessToken: string) {
    this.api = new FacebookAdsApi(accessToken, "en_US", false);
  }

  static errorMessage(err: unknown): string {
    // The SDK already normalizes both network failures and Graph API error bodies into a plain
    // Error whose .message is the Graph API's own error.message (see FacebookRequestError in the
    // SDK's exceptions.js, which the package doesn't export by name).
    return err instanceof Error ? err.message : String(err);
  }

  private static async findCredential(credentialName: string): Promise<{ ok: true; auth: FacebookAuth } | { ok: false; error: string }> {
    const credRecord = (await resolveAllCredentials(getDatabaseManager())).get(credentialName);
    if (!credRecord) return { ok: false, error: `Credential "${credentialName}" not found in the vault` };
    if (credRecord.type !== "facebookGraphAPI") return { ok: false, error: `Credential "${credentialName}" is not a Facebook Graph API credential` };
    const data = credRecord.data as FacebookCredentialData;
    return { ok: true, auth: { appId: data.appId, appSecret: data.appSecret, redirectUri: data.redirectUri, authCode: data.authCode, accessToken: data.accessToken } };
  }

  /** One-time setup step: exchanges the vault credential's single-use authorization code (obtained
   * by a human visiting Facebook's /dialog/oauth consent page) for a short-lived user access token,
   * then immediately exchanges that for a long-lived (~60 day) token — the value that goes back into
   * the Credential Vault for every other Facebook node's static method to resolve via
   * findCredential(). Unlike Dropbox's refresh token, a long-lived Facebook user token doesn't renew
   * itself; re-running this node is how it gets refreshed once it nears expiry. */
  static async authorize(credentialName: string): Promise<FacebookTokenResult> {
    const cred = await FacebookManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, accessToken: "", expiresIn: 0, error: cred.error };
    try {
      const shortLived = await FacebookManager.oauthTokenRequest({
        client_id: cred.auth.appId,
        client_secret: cred.auth.appSecret,
        redirect_uri: cred.auth.redirectUri,
        code: cred.auth.authCode,
      });
      const longLived = await FacebookManager.oauthTokenRequest({
        grant_type: "fb_exchange_token",
        client_id: cred.auth.appId,
        client_secret: cred.auth.appSecret,
        fb_exchange_token: String(shortLived.access_token),
      });
      return { success: true, accessToken: String(longLived.access_token ?? ""), expiresIn: Number(longLived.expires_in ?? 0), error: "" };
    } catch (err) {
      return { success: false, accessToken: "", expiresIn: 0, error: FacebookManager.errorMessage(err) };
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
   * vault credential's own app id/secret as the inspecting "app access token" — doesn't need a
   * FacebookManager instance since it isn't scoped to a particular user/page token. */
  static async debugToken(credentialName: string, inputToken: string): Promise<FacebookDebugTokenResult> {
    const cred = await FacebookManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, appId: "", isValid: false, expiresAt: 0, scopes: [], error: cred.error };
    try {
      const api = new FacebookAdsApi(`${cred.auth.appId}|${cred.auth.appSecret}`, "en_US", false);
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
      return { success: false, appId: "", isValid: false, expiresAt: 0, scopes: [], error: FacebookManager.errorMessage(err) };
    }
  }

  static async getPageInfo(credentialName: string, pageId: string): Promise<FacebookPageResult> {
    const cred = await FacebookManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, id: "", name: "", category: "", fanCount: 0, link: "", error: cred.error };
    return FacebookManager.getInstance(cred.auth).getPageInfo(pageId);
  }

  static async createPost(credentialName: string, pageId: string, message: string, link: string): Promise<FacebookIdResult> {
    const cred = await FacebookManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, id: "", error: cred.error };
    return FacebookManager.getInstance(cred.auth).createPost(pageId, message, link);
  }

  static async createPhotoPost(credentialName: string, pageId: string, url: string, caption: string): Promise<FacebookIdResult> {
    const cred = await FacebookManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, id: "", error: cred.error };
    return FacebookManager.getInstance(cred.auth).createPhotoPost(pageId, url, caption);
  }

  static async createVideoPost(credentialName: string, pageId: string, videoUrl: string, description: string): Promise<FacebookIdResult> {
    const cred = await FacebookManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, id: "", error: cred.error };
    return FacebookManager.getInstance(cred.auth).createVideoPost(pageId, videoUrl, description);
  }

  static async deletePost(credentialName: string, postId: string): Promise<FacebookOpResult> {
    const cred = await FacebookManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return FacebookManager.getInstance(cred.auth).deletePost(postId);
  }

  static async getPosts(credentialName: string, pageId: string, limit: number): Promise<FacebookPostsResult> {
    const cred = await FacebookManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, posts: [], error: cred.error };
    return FacebookManager.getInstance(cred.auth).getPosts(pageId, limit);
  }

  static async getPageInsights(credentialName: string, pageId: string, metrics: string[], period: string): Promise<FacebookJsonResult> {
    const cred = await FacebookManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, json: "", error: cred.error };
    return FacebookManager.getInstance(cred.auth).getPageInsights(pageId, metrics, period);
  }

  static async createComment(credentialName: string, objectId: string, message: string): Promise<FacebookIdResult> {
    const cred = await FacebookManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, id: "", error: cred.error };
    return FacebookManager.getInstance(cred.auth).createComment(objectId, message);
  }

  static async getComments(credentialName: string, objectId: string, limit: number): Promise<FacebookCommentsResult> {
    const cred = await FacebookManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, comments: [], error: cred.error };
    return FacebookManager.getInstance(cred.auth).getComments(objectId, limit);
  }

  static async deleteComment(credentialName: string, commentId: string): Promise<FacebookOpResult> {
    const cred = await FacebookManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return FacebookManager.getInstance(cred.auth).deleteComment(commentId);
  }

  static async likeObject(credentialName: string, objectId: string): Promise<FacebookOpResult> {
    const cred = await FacebookManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return FacebookManager.getInstance(cred.auth).likeObject(objectId);
  }

  static async unlikeObject(credentialName: string, objectId: string): Promise<FacebookOpResult> {
    const cred = await FacebookManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return FacebookManager.getInstance(cred.auth).unlikeObject(objectId);
  }

  static async getLikesCount(credentialName: string, objectId: string): Promise<FacebookLikesCountResult> {
    const cred = await FacebookManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, count: 0, error: cred.error };
    return FacebookManager.getInstance(cred.auth).getLikesCount(objectId);
  }

  static async getUserProfile(credentialName: string, userId: string): Promise<FacebookUserResult> {
    const cred = await FacebookManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, id: "", name: "", email: "", error: cred.error };
    return FacebookManager.getInstance(cred.auth).getUserProfile(userId);
  }

  static async getAdAccounts(credentialName: string, userId: string): Promise<FacebookAdAccountsResult> {
    const cred = await FacebookManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, accounts: [], error: cred.error };
    return FacebookManager.getInstance(cred.auth).getAdAccounts(userId);
  }

  static async createCampaign(credentialName: string, adAccountId: string, name: string, objective: string, status: string): Promise<FacebookIdResult> {
    const cred = await FacebookManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, id: "", error: cred.error };
    return FacebookManager.getInstance(cred.auth).createCampaign(adAccountId, name, objective, status);
  }

  static async getCampaigns(credentialName: string, adAccountId: string, limit: number): Promise<FacebookCampaignsResult> {
    const cred = await FacebookManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, campaigns: [], error: cred.error };
    return FacebookManager.getInstance(cred.auth).getCampaigns(adAccountId, limit);
  }

  static async deleteCampaign(credentialName: string, campaignId: string): Promise<FacebookOpResult> {
    const cred = await FacebookManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, error: cred.error };
    return FacebookManager.getInstance(cred.auth).deleteCampaign(campaignId);
  }

  static async getInsights(credentialName: string, objectId: string, fields: string[]): Promise<FacebookJsonResult> {
    const cred = await FacebookManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, json: "", error: cred.error };
    return FacebookManager.getInstance(cred.auth).getInsights(objectId, fields);
  }

  /** Generic escape hatch for any Graph API edge this manager doesn't have a dedicated method for —
   * same role as the OData/HTTP Request nodes play for arbitrary REST APIs, but authenticated via
   * the vault's Facebook credential. `paramsJson` is a JSON object string; `path` is slash-separated
   * (e.g. "me/accounts"). */
  static async apiCall(credentialName: string, method: string, path: string, paramsJson: string): Promise<FacebookJsonResult> {
    const cred = await FacebookManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, json: "", error: cred.error };
    return FacebookManager.getInstance(cred.auth).apiCall(method, path, paramsJson);
  }

  private async getPageInfo(pageId: string): Promise<FacebookPageResult> {
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
      return { success: false, id: "", name: "", category: "", fanCount: 0, link: "", error: FacebookManager.errorMessage(err) };
    }
  }

  private async createPost(pageId: string, message: string, link: string): Promise<FacebookIdResult> {
    try {
      const res = (await this.api.call("POST", [pageId, "feed"], { message, link: link || undefined })) as { id?: string };
      return { success: true, id: String(res.id ?? ""), error: "" };
    } catch (err) {
      return { success: false, id: "", error: FacebookManager.errorMessage(err) };
    }
  }

  private async createPhotoPost(pageId: string, url: string, caption: string): Promise<FacebookIdResult> {
    try {
      const res = (await this.api.call("POST", [pageId, "photos"], { url, caption })) as { id?: string; post_id?: string };
      return { success: true, id: String(res.post_id ?? res.id ?? ""), error: "" };
    } catch (err) {
      return { success: false, id: "", error: FacebookManager.errorMessage(err) };
    }
  }

  private async createVideoPost(pageId: string, videoUrl: string, description: string): Promise<FacebookIdResult> {
    try {
      const res = (await this.api.call("POST", [pageId, "videos"], { file_url: videoUrl, description })) as { id?: string };
      return { success: true, id: String(res.id ?? ""), error: "" };
    } catch (err) {
      return { success: false, id: "", error: FacebookManager.errorMessage(err) };
    }
  }

  private async deletePost(postId: string): Promise<FacebookOpResult> {
    try {
      await this.api.call("DELETE", [postId]);
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: FacebookManager.errorMessage(err) };
    }
  }

  private async getPosts(pageId: string, limit: number): Promise<FacebookPostsResult> {
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
      return { success: false, posts: [], error: FacebookManager.errorMessage(err) };
    }
  }

  private async getPageInsights(pageId: string, metrics: string[], period: string): Promise<FacebookJsonResult> {
    try {
      const res = await this.api.call("GET", [pageId, "insights"], { metric: metrics.join(","), period });
      return { success: true, json: JSON.stringify(res), error: "" };
    } catch (err) {
      return { success: false, json: "", error: FacebookManager.errorMessage(err) };
    }
  }

  private async createComment(objectId: string, message: string): Promise<FacebookIdResult> {
    try {
      const res = (await this.api.call("POST", [objectId, "comments"], { message })) as { id?: string };
      return { success: true, id: String(res.id ?? ""), error: "" };
    } catch (err) {
      return { success: false, id: "", error: FacebookManager.errorMessage(err) };
    }
  }

  private async getComments(objectId: string, limit: number): Promise<FacebookCommentsResult> {
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
      return { success: false, comments: [], error: FacebookManager.errorMessage(err) };
    }
  }

  private async deleteComment(commentId: string): Promise<FacebookOpResult> {
    try {
      await this.api.call("DELETE", [commentId]);
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: FacebookManager.errorMessage(err) };
    }
  }

  private async likeObject(objectId: string): Promise<FacebookOpResult> {
    try {
      await this.api.call("POST", [objectId, "likes"]);
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: FacebookManager.errorMessage(err) };
    }
  }

  private async unlikeObject(objectId: string): Promise<FacebookOpResult> {
    try {
      await this.api.call("DELETE", [objectId, "likes"]);
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: FacebookManager.errorMessage(err) };
    }
  }

  private async getLikesCount(objectId: string): Promise<FacebookLikesCountResult> {
    try {
      const res = (await this.api.call("GET", [objectId], { fields: "likes.summary(true)" })) as {
        likes?: { summary?: { total_count?: number } };
      };
      return { success: true, count: Number(res.likes?.summary?.total_count ?? 0), error: "" };
    } catch (err) {
      return { success: false, count: 0, error: FacebookManager.errorMessage(err) };
    }
  }

  private async getUserProfile(userId: string): Promise<FacebookUserResult> {
    try {
      const res = (await this.api.call("GET", [userId || "me"], { fields: "id,name,email" })) as {
        id?: string;
        name?: string;
        email?: string;
      };
      return { success: true, id: String(res.id ?? ""), name: res.name ?? "", email: res.email ?? "", error: "" };
    } catch (err) {
      return { success: false, id: "", name: "", email: "", error: FacebookManager.errorMessage(err) };
    }
  }

  private async getAdAccounts(userId: string): Promise<FacebookAdAccountsResult> {
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
      return { success: false, accounts: [], error: FacebookManager.errorMessage(err) };
    }
  }

  private async createCampaign(adAccountId: string, name: string, objective: string, status: string): Promise<FacebookIdResult> {
    try {
      const res = (await this.api.call("POST", [`act_${adAccountId}`, "campaigns"], {
        name,
        objective,
        status,
        special_ad_categories: [],
      })) as { id?: string };
      return { success: true, id: String(res.id ?? ""), error: "" };
    } catch (err) {
      return { success: false, id: "", error: FacebookManager.errorMessage(err) };
    }
  }

  private async getCampaigns(adAccountId: string, limit: number): Promise<FacebookCampaignsResult> {
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
      return { success: false, campaigns: [], error: FacebookManager.errorMessage(err) };
    }
  }

  private async deleteCampaign(campaignId: string): Promise<FacebookOpResult> {
    try {
      await this.api.call("DELETE", [campaignId]);
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: FacebookManager.errorMessage(err) };
    }
  }

  private async getInsights(objectId: string, fields: string[]): Promise<FacebookJsonResult> {
    try {
      const res = await this.api.call("GET", [objectId, "insights"], { fields: fields.join(",") });
      return { success: true, json: JSON.stringify(res), error: "" };
    } catch (err) {
      return { success: false, json: "", error: FacebookManager.errorMessage(err) };
    }
  }

  private async apiCall(method: string, path: string, paramsJson: string): Promise<FacebookJsonResult> {
    try {
      const params = paramsJson ? (JSON.parse(paramsJson) as Record<string, unknown>) : {};
      const segments = path.split("/").filter((s) => s !== "");
      const res = await this.api.call(method, segments, params);
      return { success: true, json: JSON.stringify(res), error: "" };
    } catch (err) {
      return { success: false, json: "", error: FacebookManager.errorMessage(err) };
    }
  }
}
