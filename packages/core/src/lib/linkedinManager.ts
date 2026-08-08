import { RestliClient, AuthClient } from "linkedin-api-client";
import type { AxiosError } from "axios";
import { getDatabaseManager } from "../server/DatabaseManager.ts";
import { resolveAllCredentials } from "../server/vaultCredentials.ts";
import type { LinkedInOAuth2CredentialData } from "@hermione/shared/types";

/** Parses a pin's raw string value as JSON when possible, falling back to the raw string itself —
 * lets a single `id` pin accept a plain URN string (e.g. "urn:li:organization:123") without
 * requiring the user to type quotes, while still supporting numeric or complex-key ids via JSON
 * syntax (Rest.li's `RestliEntityId` can be a string, number, or object). Returns undefined for an
 * empty pin, meaning "not provided". */
function parseFlexibleId(value: string): string | number | Record<string, unknown> | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/** Strict JSON.parse for pins whose value is always meant to be an object/array (pathKeys,
 * queryParams, entities, patch objects) — throws on malformed input, unlike parseFlexibleId, since
 * there's no sensible plain-string fallback for these. */
function parseJsonObject(value: string, fallback: string): Record<string, unknown> {
  const parsed = JSON.parse(value || fallback);
  return parsed as Record<string, unknown>;
}

function emptyToUndefined<T extends Record<string, unknown>>(obj: T): T | undefined {
  return Object.keys(obj).length > 0 ? obj : undefined;
}

export interface LinkedInOpResult {
  success: boolean;
  error: string;
}

export interface LinkedInUrlResult extends LinkedInOpResult {
  url: string;
}

export interface LinkedInTokenResult extends LinkedInOpResult {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshTokenExpiresIn: number;
  scope: string;
}

export interface LinkedInIntrospectResult extends LinkedInOpResult {
  active: boolean;
  authType: string;
  clientId: string;
  createdAt: number;
  expiresAt: number;
  scope: string;
  status: string;
}

export interface LinkedInJsonResult extends LinkedInOpResult {
  json: string;
}

export interface LinkedInCreateResult extends LinkedInOpResult {
  createdEntityId: string;
}

function emptyToken(error: string): LinkedInTokenResult {
  return { success: false, accessToken: "", expiresIn: 0, refreshToken: "", refreshTokenExpiresIn: 0, scope: "", error };
}

function emptyIntrospect(error: string): LinkedInIntrospectResult {
  return { success: false, active: false, authType: "", clientId: "", createdAt: 0, expiresAt: 0, scope: "", status: "", error };
}

function emptyJson(error: string): LinkedInJsonResult {
  return { success: false, json: "", error };
}

function emptyOp(error: string): LinkedInOpResult {
  return { success: false, error };
}

/** The RestliClient is stateless (every call takes its own accessToken), so one module-level
 * instance is reused across every credential and every node call — nothing to cache per-credential
 * the way DropboxManager/FacebookManager do. */
const restliClient = new RestliClient();

const managerCache = new Map<string, LinkedInManager>();

export class LinkedInManager {
  static getInstance(auth: LinkedInOAuth2CredentialData): LinkedInManager {
    const key = `${auth.clientId}:${auth.clientSecret}:${auth.accessToken}:${auth.refreshToken}`;
    let manager = managerCache.get(key);
    if (!manager) {
      manager = new LinkedInManager(auth);
      managerCache.set(key, manager);
    }
    return manager;
  }

  private constructor(private readonly auth: LinkedInOAuth2CredentialData) {}

  static errorMessage(err: unknown): string {
    const axiosErr = err as AxiosError<{ message?: string; error_description?: string; error?: string }>;
    if (axiosErr?.isAxiosError) {
      const data = axiosErr.response?.data;
      return data?.message ?? data?.error_description ?? data?.error ?? axiosErr.message;
    }
    return err instanceof Error ? err.message : String(err);
  }

  private static async findCredential(credentialName: string): Promise<{ ok: true; auth: LinkedInOAuth2CredentialData } | { ok: false; error: string }> {
    const credRecord = (await resolveAllCredentials(getDatabaseManager())).get(credentialName);
    if (!credRecord) return { ok: false, error: `Credential "${credentialName}" not found in the vault` };
    if (credRecord.type !== "linkedInOAuth2") return { ok: false, error: `Credential "${credentialName}" is not a LinkedIn OAuth2 credential` };
    return { ok: true, auth: credRecord.data as LinkedInOAuth2CredentialData };
  }

  static generateAuthorizationUrl(clientId: string, redirectUrl: string, scopes: string[], state: string): LinkedInUrlResult {
    try {
      const authClient = new AuthClient({ clientId, clientSecret: "", redirectUrl });
      return { success: true, url: authClient.generateMemberAuthorizationUrl(scopes, state || undefined), error: "" };
    } catch (err) {
      return { success: false, url: "", error: LinkedInManager.errorMessage(err) };
    }
  }

  static async exchangeAuthCode(credentialName: string): Promise<LinkedInTokenResult> {
    const cred = await LinkedInManager.findCredential(credentialName);
    if (!cred.ok) return emptyToken(cred.error);
    return LinkedInManager.getInstance(cred.auth).exchangeAuthCode();
  }

  static async exchangeRefreshToken(credentialName: string): Promise<LinkedInTokenResult> {
    const cred = await LinkedInManager.findCredential(credentialName);
    if (!cred.ok) return emptyToken(cred.error);
    return LinkedInManager.getInstance(cred.auth).exchangeRefreshToken();
  }

  static async getTwoLeggedAccessToken(credentialName: string): Promise<LinkedInTokenResult> {
    const cred = await LinkedInManager.findCredential(credentialName);
    if (!cred.ok) return emptyToken(cred.error);
    return LinkedInManager.getInstance(cred.auth).getTwoLeggedAccessToken();
  }

  static async introspectAccessToken(credentialName: string, accessToken: string): Promise<LinkedInIntrospectResult> {
    const cred = await LinkedInManager.findCredential(credentialName);
    if (!cred.ok) return emptyIntrospect(cred.error);
    return LinkedInManager.getInstance(cred.auth).introspectAccessToken(accessToken || cred.auth.accessToken);
  }

  static async get(credentialName: string, resourcePath: string, idJson: string, pathKeysJson: string, queryParamsJson: string, versionString: string): Promise<LinkedInJsonResult> {
    const cred = await LinkedInManager.findCredential(credentialName);
    if (!cred.ok) return emptyJson(cred.error);
    return LinkedInManager.getInstance(cred.auth).get(resourcePath, idJson, pathKeysJson, queryParamsJson, versionString);
  }

  static async batchGet(credentialName: string, resourcePath: string, idsJson: string, pathKeysJson: string, queryParamsJson: string, versionString: string): Promise<LinkedInJsonResult> {
    const cred = await LinkedInManager.findCredential(credentialName);
    if (!cred.ok) return emptyJson(cred.error);
    return LinkedInManager.getInstance(cred.auth).batchGet(resourcePath, idsJson, pathKeysJson, queryParamsJson, versionString);
  }

  static async getAll(credentialName: string, resourcePath: string, pathKeysJson: string, queryParamsJson: string, versionString: string): Promise<LinkedInJsonResult> {
    const cred = await LinkedInManager.findCredential(credentialName);
    if (!cred.ok) return emptyJson(cred.error);
    return LinkedInManager.getInstance(cred.auth).getAll(resourcePath, pathKeysJson, queryParamsJson, versionString);
  }

  static async finder(credentialName: string, resourcePath: string, finderName: string, pathKeysJson: string, queryParamsJson: string, versionString: string): Promise<LinkedInJsonResult> {
    const cred = await LinkedInManager.findCredential(credentialName);
    if (!cred.ok) return emptyJson(cred.error);
    return LinkedInManager.getInstance(cred.auth).finder(resourcePath, finderName, pathKeysJson, queryParamsJson, versionString);
  }

  static async batchFinder(credentialName: string, resourcePath: string, finderName: string, finderCriteriaName: string, finderCriteriaValuesJson: string, pathKeysJson: string, queryParamsJson: string, versionString: string): Promise<LinkedInJsonResult> {
    const cred = await LinkedInManager.findCredential(credentialName);
    if (!cred.ok) return emptyJson(cred.error);
    return LinkedInManager.getInstance(cred.auth).batchFinder(resourcePath, finderName, finderCriteriaName, finderCriteriaValuesJson, pathKeysJson, queryParamsJson, versionString);
  }

  static async create(credentialName: string, resourcePath: string, entityJson: string, pathKeysJson: string, versionString: string): Promise<LinkedInCreateResult> {
    const cred = await LinkedInManager.findCredential(credentialName);
    if (!cred.ok) return { success: false, createdEntityId: "", error: cred.error };
    return LinkedInManager.getInstance(cred.auth).create(resourcePath, entityJson, pathKeysJson, versionString);
  }

  static async batchCreate(credentialName: string, resourcePath: string, entitiesJson: string, pathKeysJson: string, versionString: string): Promise<LinkedInJsonResult> {
    const cred = await LinkedInManager.findCredential(credentialName);
    if (!cred.ok) return emptyJson(cred.error);
    return LinkedInManager.getInstance(cred.auth).batchCreate(resourcePath, entitiesJson, pathKeysJson, versionString);
  }

  static async update(credentialName: string, resourcePath: string, idJson: string, entityJson: string, pathKeysJson: string, versionString: string): Promise<LinkedInOpResult> {
    const cred = await LinkedInManager.findCredential(credentialName);
    if (!cred.ok) return emptyOp(cred.error);
    return LinkedInManager.getInstance(cred.auth).update(resourcePath, idJson, entityJson, pathKeysJson, versionString);
  }

  static async batchUpdate(credentialName: string, resourcePath: string, idsJson: string, entitiesJson: string, pathKeysJson: string, versionString: string): Promise<LinkedInJsonResult> {
    const cred = await LinkedInManager.findCredential(credentialName);
    if (!cred.ok) return emptyJson(cred.error);
    return LinkedInManager.getInstance(cred.auth).batchUpdate(resourcePath, idsJson, entitiesJson, pathKeysJson, versionString);
  }

  static async partialUpdate(credentialName: string, resourcePath: string, idJson: string, patchSetObjectJson: string, pathKeysJson: string, versionString: string): Promise<LinkedInOpResult> {
    const cred = await LinkedInManager.findCredential(credentialName);
    if (!cred.ok) return emptyOp(cred.error);
    return LinkedInManager.getInstance(cred.auth).partialUpdate(resourcePath, idJson, patchSetObjectJson, pathKeysJson, versionString);
  }

  static async batchPartialUpdate(credentialName: string, resourcePath: string, idsJson: string, patchSetObjectsJson: string, pathKeysJson: string, versionString: string): Promise<LinkedInJsonResult> {
    const cred = await LinkedInManager.findCredential(credentialName);
    if (!cred.ok) return emptyJson(cred.error);
    return LinkedInManager.getInstance(cred.auth).batchPartialUpdate(resourcePath, idsJson, patchSetObjectsJson, pathKeysJson, versionString);
  }

  static async delete(credentialName: string, resourcePath: string, idJson: string, pathKeysJson: string, versionString: string): Promise<LinkedInOpResult> {
    const cred = await LinkedInManager.findCredential(credentialName);
    if (!cred.ok) return emptyOp(cred.error);
    return LinkedInManager.getInstance(cred.auth).delete(resourcePath, idJson, pathKeysJson, versionString);
  }

  static async batchDelete(credentialName: string, resourcePath: string, idsJson: string, pathKeysJson: string, versionString: string): Promise<LinkedInJsonResult> {
    const cred = await LinkedInManager.findCredential(credentialName);
    if (!cred.ok) return emptyJson(cred.error);
    return LinkedInManager.getInstance(cred.auth).batchDelete(resourcePath, idsJson, pathKeysJson, versionString);
  }

  static async action(credentialName: string, resourcePath: string, actionName: string, dataJson: string, pathKeysJson: string, versionString: string): Promise<LinkedInJsonResult> {
    const cred = await LinkedInManager.findCredential(credentialName);
    if (!cred.ok) return emptyJson(cred.error);
    return LinkedInManager.getInstance(cred.auth).action(resourcePath, actionName, dataJson, pathKeysJson, versionString);
  }

  /** One-time setup step: exchanges a single-use authorization code (obtained by a human visiting
   * LinkedIn's member authorization URL) for a 3-legged access token (and refresh token, if the app
   * has refresh tokens enabled) — the values that go into the Credential Vault for every other
   * LinkedIn node's calls to use, mirroring FacebookManager.exchangeAuthCode. */
  private async exchangeAuthCode(): Promise<LinkedInTokenResult> {
    try {
      const authClient = new AuthClient({ clientId: this.auth.clientId, clientSecret: this.auth.clientSecret, redirectUrl: this.auth.redirectUri });
      const token = await authClient.exchangeAuthCodeForAccessToken(this.auth.authCode);
      return {
        success: true,
        accessToken: token.access_token ?? "",
        expiresIn: token.expires_in ?? 0,
        refreshToken: token.refresh_token ?? "",
        refreshTokenExpiresIn: token.refresh_token_expires_in ?? 0,
        scope: token.scope ?? "",
        error: "",
      };
    } catch (err) {
      return emptyToken(LinkedInManager.errorMessage(err));
    }
  }

  private async exchangeRefreshToken(): Promise<LinkedInTokenResult> {
    try {
      const authClient = new AuthClient({ clientId: this.auth.clientId, clientSecret: this.auth.clientSecret });
      const token = await authClient.exchangeRefreshTokenForAccessToken(this.auth.refreshToken);
      return {
        success: true,
        accessToken: token.access_token ?? "",
        expiresIn: token.expires_in ?? 0,
        refreshToken: token.refresh_token ?? "",
        refreshTokenExpiresIn: token.refresh_token_expires_in ?? 0,
        scope: "",
        error: "",
      };
    } catch (err) {
      return emptyToken(LinkedInManager.errorMessage(err));
    }
  }

  private async getTwoLeggedAccessToken(): Promise<LinkedInTokenResult> {
    try {
      const authClient = new AuthClient({ clientId: this.auth.clientId, clientSecret: this.auth.clientSecret });
      const token = await authClient.getTwoLeggedAccessToken();
      return { success: true, accessToken: token.access_token ?? "", expiresIn: token.expires_in ?? 0, refreshToken: "", refreshTokenExpiresIn: 0, scope: "", error: "" };
    } catch (err) {
      return emptyToken(LinkedInManager.errorMessage(err));
    }
  }

  private async introspectAccessToken(accessToken: string): Promise<LinkedInIntrospectResult> {
    try {
      const authClient = new AuthClient({ clientId: this.auth.clientId, clientSecret: this.auth.clientSecret });
      const info = await authClient.introspectAccessToken(accessToken);
      return {
        success: true,
        active: Boolean(info.active),
        authType: String(info.auth_type ?? ""),
        clientId: String(info.client_id ?? ""),
        createdAt: Number(info.created_at ?? 0),
        expiresAt: Number(info.expires_at ?? 0),
        scope: info.scope ?? "",
        status: String(info.status ?? ""),
        error: "",
      };
    } catch (err) {
      return emptyIntrospect(LinkedInManager.errorMessage(err));
    }
  }

  private async get(resourcePath: string, idJson: string, pathKeysJson: string, queryParamsJson: string, versionString: string): Promise<LinkedInJsonResult> {
    try {
      const res = await restliClient.get({
        resourcePath,
        accessToken: this.auth.accessToken,
        id: parseFlexibleId(idJson),
        pathKeys: emptyToUndefined(parseJsonObject(pathKeysJson, "{}")),
        queryParams: emptyToUndefined(parseJsonObject(queryParamsJson, "{}")),
        versionString: versionString || undefined,
      });
      return { success: true, json: JSON.stringify(res.data), error: "" };
    } catch (err) {
      return emptyJson(LinkedInManager.errorMessage(err));
    }
  }

  private async batchGet(resourcePath: string, idsJson: string, pathKeysJson: string, queryParamsJson: string, versionString: string): Promise<LinkedInJsonResult> {
    try {
      const ids = JSON.parse(idsJson || "[]") as (string | number | Record<string, unknown>)[];
      const res = await restliClient.batchGet({
        resourcePath,
        accessToken: this.auth.accessToken,
        ids,
        pathKeys: emptyToUndefined(parseJsonObject(pathKeysJson, "{}")),
        queryParams: emptyToUndefined(parseJsonObject(queryParamsJson, "{}")),
        versionString: versionString || undefined,
      });
      return { success: true, json: JSON.stringify(res.data), error: "" };
    } catch (err) {
      return emptyJson(LinkedInManager.errorMessage(err));
    }
  }

  private async getAll(resourcePath: string, pathKeysJson: string, queryParamsJson: string, versionString: string): Promise<LinkedInJsonResult> {
    try {
      const res = await restliClient.getAll({
        resourcePath,
        accessToken: this.auth.accessToken,
        pathKeys: emptyToUndefined(parseJsonObject(pathKeysJson, "{}")),
        queryParams: emptyToUndefined(parseJsonObject(queryParamsJson, "{}")),
        versionString: versionString || undefined,
      });
      return { success: true, json: JSON.stringify(res.data), error: "" };
    } catch (err) {
      return emptyJson(LinkedInManager.errorMessage(err));
    }
  }

  private async finder(resourcePath: string, finderName: string, pathKeysJson: string, queryParamsJson: string, versionString: string): Promise<LinkedInJsonResult> {
    try {
      const res = await restliClient.finder({
        resourcePath,
        accessToken: this.auth.accessToken,
        finderName,
        pathKeys: emptyToUndefined(parseJsonObject(pathKeysJson, "{}")),
        queryParams: emptyToUndefined(parseJsonObject(queryParamsJson, "{}")),
        versionString: versionString || undefined,
      });
      return { success: true, json: JSON.stringify(res.data), error: "" };
    } catch (err) {
      return emptyJson(LinkedInManager.errorMessage(err));
    }
  }

  private async batchFinder(resourcePath: string, finderName: string, finderCriteriaName: string, finderCriteriaValuesJson: string, pathKeysJson: string, queryParamsJson: string, versionString: string): Promise<LinkedInJsonResult> {
    try {
      const value = JSON.parse(finderCriteriaValuesJson || "[]") as Record<string, unknown>[];
      const res = await restliClient.batchFinder({
        resourcePath,
        accessToken: this.auth.accessToken,
        finderName,
        finderCriteria: { name: finderCriteriaName, value },
        pathKeys: emptyToUndefined(parseJsonObject(pathKeysJson, "{}")),
        queryParams: emptyToUndefined(parseJsonObject(queryParamsJson, "{}")),
        versionString: versionString || undefined,
      });
      return { success: true, json: JSON.stringify(res.data), error: "" };
    } catch (err) {
      return emptyJson(LinkedInManager.errorMessage(err));
    }
  }

  private async create(resourcePath: string, entityJson: string, pathKeysJson: string, versionString: string): Promise<LinkedInCreateResult> {
    try {
      const entity = parseJsonObject(entityJson, "{}");
      const res = await restliClient.create({
        resourcePath,
        accessToken: this.auth.accessToken,
        entity,
        pathKeys: emptyToUndefined(parseJsonObject(pathKeysJson, "{}")),
        versionString: versionString || undefined,
      });
      const id = res.createdEntityId;
      return { success: true, createdEntityId: typeof id === "string" ? id : JSON.stringify(id), error: "" };
    } catch (err) {
      return { success: false, createdEntityId: "", error: LinkedInManager.errorMessage(err) };
    }
  }

  private async batchCreate(resourcePath: string, entitiesJson: string, pathKeysJson: string, versionString: string): Promise<LinkedInJsonResult> {
    try {
      const entities = JSON.parse(entitiesJson || "[]") as Record<string, unknown>[];
      const res = await restliClient.batchCreate({
        resourcePath,
        accessToken: this.auth.accessToken,
        entities,
        pathKeys: emptyToUndefined(parseJsonObject(pathKeysJson, "{}")),
        versionString: versionString || undefined,
      });
      return { success: true, json: JSON.stringify(res.data), error: "" };
    } catch (err) {
      return emptyJson(LinkedInManager.errorMessage(err));
    }
  }

  private async update(resourcePath: string, idJson: string, entityJson: string, pathKeysJson: string, versionString: string): Promise<LinkedInOpResult> {
    try {
      const entity = parseJsonObject(entityJson, "{}");
      await restliClient.update({
        resourcePath,
        accessToken: this.auth.accessToken,
        id: parseFlexibleId(idJson),
        entity,
        pathKeys: emptyToUndefined(parseJsonObject(pathKeysJson, "{}")),
        versionString: versionString || undefined,
      });
      return { success: true, error: "" };
    } catch (err) {
      return emptyOp(LinkedInManager.errorMessage(err));
    }
  }

  private async batchUpdate(resourcePath: string, idsJson: string, entitiesJson: string, pathKeysJson: string, versionString: string): Promise<LinkedInJsonResult> {
    try {
      const ids = JSON.parse(idsJson || "[]") as (string | number | Record<string, unknown>)[];
      const entities = JSON.parse(entitiesJson || "[]") as Record<string, unknown>[];
      const res = await restliClient.batchUpdate({
        resourcePath,
        accessToken: this.auth.accessToken,
        ids,
        entities,
        pathKeys: emptyToUndefined(parseJsonObject(pathKeysJson, "{}")),
        versionString: versionString || undefined,
      });
      return { success: true, json: JSON.stringify(res.data), error: "" };
    } catch (err) {
      return emptyJson(LinkedInManager.errorMessage(err));
    }
  }

  private async partialUpdate(resourcePath: string, idJson: string, patchSetObjectJson: string, pathKeysJson: string, versionString: string): Promise<LinkedInOpResult> {
    try {
      const patchSetObject = parseJsonObject(patchSetObjectJson, "{}");
      await restliClient.partialUpdate({
        resourcePath,
        accessToken: this.auth.accessToken,
        id: parseFlexibleId(idJson),
        patchSetObject,
        pathKeys: emptyToUndefined(parseJsonObject(pathKeysJson, "{}")),
        versionString: versionString || undefined,
      });
      return { success: true, error: "" };
    } catch (err) {
      return emptyOp(LinkedInManager.errorMessage(err));
    }
  }

  private async batchPartialUpdate(resourcePath: string, idsJson: string, patchSetObjectsJson: string, pathKeysJson: string, versionString: string): Promise<LinkedInJsonResult> {
    try {
      const ids = JSON.parse(idsJson || "[]") as (string | number | Record<string, unknown>)[];
      const patchSetObjects = JSON.parse(patchSetObjectsJson || "[]") as Record<string, unknown>[];
      const res = await restliClient.batchPartialUpdate({
        resourcePath,
        accessToken: this.auth.accessToken,
        ids,
        patchSetObjects,
        pathKeys: emptyToUndefined(parseJsonObject(pathKeysJson, "{}")),
        versionString: versionString || undefined,
      });
      return { success: true, json: JSON.stringify(res.data), error: "" };
    } catch (err) {
      return emptyJson(LinkedInManager.errorMessage(err));
    }
  }

  private async delete(resourcePath: string, idJson: string, pathKeysJson: string, versionString: string): Promise<LinkedInOpResult> {
    try {
      await restliClient.delete({
        resourcePath,
        accessToken: this.auth.accessToken,
        id: parseFlexibleId(idJson),
        pathKeys: emptyToUndefined(parseJsonObject(pathKeysJson, "{}")),
        versionString: versionString || undefined,
      });
      return { success: true, error: "" };
    } catch (err) {
      return emptyOp(LinkedInManager.errorMessage(err));
    }
  }

  private async batchDelete(resourcePath: string, idsJson: string, pathKeysJson: string, versionString: string): Promise<LinkedInJsonResult> {
    try {
      const ids = JSON.parse(idsJson || "[]") as (string | number | Record<string, unknown>)[];
      const res = await restliClient.batchDelete({
        resourcePath,
        accessToken: this.auth.accessToken,
        ids,
        pathKeys: emptyToUndefined(parseJsonObject(pathKeysJson, "{}")),
        versionString: versionString || undefined,
      });
      return { success: true, json: JSON.stringify(res.data), error: "" };
    } catch (err) {
      return emptyJson(LinkedInManager.errorMessage(err));
    }
  }

  private async action(resourcePath: string, actionName: string, dataJson: string, pathKeysJson: string, versionString: string): Promise<LinkedInJsonResult> {
    try {
      const data = dataJson ? parseJsonObject(dataJson, "{}") : undefined;
      const res = await restliClient.action({
        resourcePath,
        accessToken: this.auth.accessToken,
        actionName,
        data,
        pathKeys: emptyToUndefined(parseJsonObject(pathKeysJson, "{}")),
        versionString: versionString || undefined,
      });
      return { success: true, json: JSON.stringify(res.data?.value ?? null), error: "" };
    } catch (err) {
      return emptyJson(LinkedInManager.errorMessage(err));
    }
  }
}
