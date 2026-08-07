import { RestliClient, AuthClient } from "linkedin-api-client";
import type { AxiosError } from "axios";

/** Every LinkedIn node needs the same boilerplate: turn either a resolved response or a thrown
 * Axios error into a plain {success, error} shape. Centralized here once instead of repeated per
 * node (see nodes/linkedin.ts, which only wires pins to these methods) — mirrors FacebookManager's
 * fbErrorMessage. */
function linkedinErrorMessage(err: unknown): string {
  const axiosErr = err as AxiosError<{ message?: string; error_description?: string; error?: string }>;
  if (axiosErr?.isAxiosError) {
    const data = axiosErr.response?.data;
    return data?.message ?? data?.error_description ?? data?.error ?? axiosErr.message;
  }
  return err instanceof Error ? err.message : String(err);
}

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

/** The RestliClient is stateless (every call takes its own accessToken), so one module-level
 * instance is reused across every credential and every node call — nothing to cache per-credential
 * the way DropboxManager/FacebookManager do. */
const restliClient = new RestliClient();

export class LinkedInManager {
  static generateAuthorizationUrl(clientId: string, redirectUrl: string, scopes: string[], state: string): LinkedInUrlResult {
    try {
      const authClient = new AuthClient({ clientId, clientSecret: "", redirectUrl });
      return { success: true, url: authClient.generateMemberAuthorizationUrl(scopes, state || undefined), error: "" };
    } catch (err) {
      return { success: false, url: "", error: linkedinErrorMessage(err) };
    }
  }

  /** One-time setup step: exchanges a single-use authorization code (obtained by a human visiting
   * LinkedIn's member authorization URL) for a 3-legged access token (and refresh token, if the app
   * has refresh tokens enabled) — the values that go into the Credential Vault for every other
   * LinkedIn node's calls to use, mirroring FacebookManager.exchangeAuthCode. */
  static async exchangeAuthCode(clientId: string, clientSecret: string, redirectUrl: string, authCode: string): Promise<LinkedInTokenResult> {
    try {
      const authClient = new AuthClient({ clientId, clientSecret, redirectUrl });
      const token = await authClient.exchangeAuthCodeForAccessToken(authCode);
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
      return { success: false, accessToken: "", expiresIn: 0, refreshToken: "", refreshTokenExpiresIn: 0, scope: "", error: linkedinErrorMessage(err) };
    }
  }

  static async exchangeRefreshToken(clientId: string, clientSecret: string, refreshToken: string): Promise<LinkedInTokenResult> {
    try {
      const authClient = new AuthClient({ clientId, clientSecret });
      const token = await authClient.exchangeRefreshTokenForAccessToken(refreshToken);
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
      return { success: false, accessToken: "", expiresIn: 0, refreshToken: "", refreshTokenExpiresIn: 0, scope: "", error: linkedinErrorMessage(err) };
    }
  }

  static async getTwoLeggedAccessToken(clientId: string, clientSecret: string): Promise<LinkedInTokenResult> {
    try {
      const authClient = new AuthClient({ clientId, clientSecret });
      const token = await authClient.getTwoLeggedAccessToken();
      return { success: true, accessToken: token.access_token ?? "", expiresIn: token.expires_in ?? 0, refreshToken: "", refreshTokenExpiresIn: 0, scope: "", error: "" };
    } catch (err) {
      return { success: false, accessToken: "", expiresIn: 0, refreshToken: "", refreshTokenExpiresIn: 0, scope: "", error: linkedinErrorMessage(err) };
    }
  }

  static async introspectAccessToken(clientId: string, clientSecret: string, accessToken: string): Promise<LinkedInIntrospectResult> {
    try {
      const authClient = new AuthClient({ clientId, clientSecret });
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
      return { success: false, active: false, authType: "", clientId: "", createdAt: 0, expiresAt: 0, scope: "", status: "", error: linkedinErrorMessage(err) };
    }
  }

  static async get(accessToken: string, resourcePath: string, idJson: string, pathKeysJson: string, queryParamsJson: string, versionString: string): Promise<LinkedInJsonResult> {
    try {
      const res = await restliClient.get({
        resourcePath,
        accessToken,
        id: parseFlexibleId(idJson),
        pathKeys: emptyToUndefined(parseJsonObject(pathKeysJson, "{}")),
        queryParams: emptyToUndefined(parseJsonObject(queryParamsJson, "{}")),
        versionString: versionString || undefined,
      });
      return { success: true, json: JSON.stringify(res.data), error: "" };
    } catch (err) {
      return { success: false, json: "", error: linkedinErrorMessage(err) };
    }
  }

  static async batchGet(accessToken: string, resourcePath: string, idsJson: string, pathKeysJson: string, queryParamsJson: string, versionString: string): Promise<LinkedInJsonResult> {
    try {
      const ids = JSON.parse(idsJson || "[]") as (string | number | Record<string, unknown>)[];
      const res = await restliClient.batchGet({
        resourcePath,
        accessToken,
        ids,
        pathKeys: emptyToUndefined(parseJsonObject(pathKeysJson, "{}")),
        queryParams: emptyToUndefined(parseJsonObject(queryParamsJson, "{}")),
        versionString: versionString || undefined,
      });
      return { success: true, json: JSON.stringify(res.data), error: "" };
    } catch (err) {
      return { success: false, json: "", error: linkedinErrorMessage(err) };
    }
  }

  static async getAll(accessToken: string, resourcePath: string, pathKeysJson: string, queryParamsJson: string, versionString: string): Promise<LinkedInJsonResult> {
    try {
      const res = await restliClient.getAll({
        resourcePath,
        accessToken,
        pathKeys: emptyToUndefined(parseJsonObject(pathKeysJson, "{}")),
        queryParams: emptyToUndefined(parseJsonObject(queryParamsJson, "{}")),
        versionString: versionString || undefined,
      });
      return { success: true, json: JSON.stringify(res.data), error: "" };
    } catch (err) {
      return { success: false, json: "", error: linkedinErrorMessage(err) };
    }
  }

  static async finder(accessToken: string, resourcePath: string, finderName: string, pathKeysJson: string, queryParamsJson: string, versionString: string): Promise<LinkedInJsonResult> {
    try {
      const res = await restliClient.finder({
        resourcePath,
        accessToken,
        finderName,
        pathKeys: emptyToUndefined(parseJsonObject(pathKeysJson, "{}")),
        queryParams: emptyToUndefined(parseJsonObject(queryParamsJson, "{}")),
        versionString: versionString || undefined,
      });
      return { success: true, json: JSON.stringify(res.data), error: "" };
    } catch (err) {
      return { success: false, json: "", error: linkedinErrorMessage(err) };
    }
  }

  static async batchFinder(accessToken: string, resourcePath: string, finderName: string, finderCriteriaName: string, finderCriteriaValuesJson: string, pathKeysJson: string, queryParamsJson: string, versionString: string): Promise<LinkedInJsonResult> {
    try {
      const value = JSON.parse(finderCriteriaValuesJson || "[]") as Record<string, unknown>[];
      const res = await restliClient.batchFinder({
        resourcePath,
        accessToken,
        finderName,
        finderCriteria: { name: finderCriteriaName, value },
        pathKeys: emptyToUndefined(parseJsonObject(pathKeysJson, "{}")),
        queryParams: emptyToUndefined(parseJsonObject(queryParamsJson, "{}")),
        versionString: versionString || undefined,
      });
      return { success: true, json: JSON.stringify(res.data), error: "" };
    } catch (err) {
      return { success: false, json: "", error: linkedinErrorMessage(err) };
    }
  }

  static async create(accessToken: string, resourcePath: string, entityJson: string, pathKeysJson: string, versionString: string): Promise<LinkedInCreateResult> {
    try {
      const entity = parseJsonObject(entityJson, "{}");
      const res = await restliClient.create({
        resourcePath,
        accessToken,
        entity,
        pathKeys: emptyToUndefined(parseJsonObject(pathKeysJson, "{}")),
        versionString: versionString || undefined,
      });
      const id = res.createdEntityId;
      return { success: true, createdEntityId: typeof id === "string" ? id : JSON.stringify(id), error: "" };
    } catch (err) {
      return { success: false, createdEntityId: "", error: linkedinErrorMessage(err) };
    }
  }

  static async batchCreate(accessToken: string, resourcePath: string, entitiesJson: string, pathKeysJson: string, versionString: string): Promise<LinkedInJsonResult> {
    try {
      const entities = JSON.parse(entitiesJson || "[]") as Record<string, unknown>[];
      const res = await restliClient.batchCreate({
        resourcePath,
        accessToken,
        entities,
        pathKeys: emptyToUndefined(parseJsonObject(pathKeysJson, "{}")),
        versionString: versionString || undefined,
      });
      return { success: true, json: JSON.stringify(res.data), error: "" };
    } catch (err) {
      return { success: false, json: "", error: linkedinErrorMessage(err) };
    }
  }

  static async update(accessToken: string, resourcePath: string, idJson: string, entityJson: string, pathKeysJson: string, versionString: string): Promise<LinkedInOpResult> {
    try {
      const entity = parseJsonObject(entityJson, "{}");
      await restliClient.update({
        resourcePath,
        accessToken,
        id: parseFlexibleId(idJson),
        entity,
        pathKeys: emptyToUndefined(parseJsonObject(pathKeysJson, "{}")),
        versionString: versionString || undefined,
      });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: linkedinErrorMessage(err) };
    }
  }

  static async batchUpdate(accessToken: string, resourcePath: string, idsJson: string, entitiesJson: string, pathKeysJson: string, versionString: string): Promise<LinkedInJsonResult> {
    try {
      const ids = JSON.parse(idsJson || "[]") as (string | number | Record<string, unknown>)[];
      const entities = JSON.parse(entitiesJson || "[]") as Record<string, unknown>[];
      const res = await restliClient.batchUpdate({
        resourcePath,
        accessToken,
        ids,
        entities,
        pathKeys: emptyToUndefined(parseJsonObject(pathKeysJson, "{}")),
        versionString: versionString || undefined,
      });
      return { success: true, json: JSON.stringify(res.data), error: "" };
    } catch (err) {
      return { success: false, json: "", error: linkedinErrorMessage(err) };
    }
  }

  static async partialUpdate(accessToken: string, resourcePath: string, idJson: string, patchSetObjectJson: string, pathKeysJson: string, versionString: string): Promise<LinkedInOpResult> {
    try {
      const patchSetObject = parseJsonObject(patchSetObjectJson, "{}");
      await restliClient.partialUpdate({
        resourcePath,
        accessToken,
        id: parseFlexibleId(idJson),
        patchSetObject,
        pathKeys: emptyToUndefined(parseJsonObject(pathKeysJson, "{}")),
        versionString: versionString || undefined,
      });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: linkedinErrorMessage(err) };
    }
  }

  static async batchPartialUpdate(accessToken: string, resourcePath: string, idsJson: string, patchSetObjectsJson: string, pathKeysJson: string, versionString: string): Promise<LinkedInJsonResult> {
    try {
      const ids = JSON.parse(idsJson || "[]") as (string | number | Record<string, unknown>)[];
      const patchSetObjects = JSON.parse(patchSetObjectsJson || "[]") as Record<string, unknown>[];
      const res = await restliClient.batchPartialUpdate({
        resourcePath,
        accessToken,
        ids,
        patchSetObjects,
        pathKeys: emptyToUndefined(parseJsonObject(pathKeysJson, "{}")),
        versionString: versionString || undefined,
      });
      return { success: true, json: JSON.stringify(res.data), error: "" };
    } catch (err) {
      return { success: false, json: "", error: linkedinErrorMessage(err) };
    }
  }

  static async delete(accessToken: string, resourcePath: string, idJson: string, pathKeysJson: string, versionString: string): Promise<LinkedInOpResult> {
    try {
      await restliClient.delete({
        resourcePath,
        accessToken,
        id: parseFlexibleId(idJson),
        pathKeys: emptyToUndefined(parseJsonObject(pathKeysJson, "{}")),
        versionString: versionString || undefined,
      });
      return { success: true, error: "" };
    } catch (err) {
      return { success: false, error: linkedinErrorMessage(err) };
    }
  }

  static async batchDelete(accessToken: string, resourcePath: string, idsJson: string, pathKeysJson: string, versionString: string): Promise<LinkedInJsonResult> {
    try {
      const ids = JSON.parse(idsJson || "[]") as (string | number | Record<string, unknown>)[];
      const res = await restliClient.batchDelete({
        resourcePath,
        accessToken,
        ids,
        pathKeys: emptyToUndefined(parseJsonObject(pathKeysJson, "{}")),
        versionString: versionString || undefined,
      });
      return { success: true, json: JSON.stringify(res.data), error: "" };
    } catch (err) {
      return { success: false, json: "", error: linkedinErrorMessage(err) };
    }
  }

  static async action(accessToken: string, resourcePath: string, actionName: string, dataJson: string, pathKeysJson: string, versionString: string): Promise<LinkedInJsonResult> {
    try {
      const data = dataJson ? parseJsonObject(dataJson, "{}") : undefined;
      const res = await restliClient.action({
        resourcePath,
        accessToken,
        actionName,
        data,
        pathKeys: emptyToUndefined(parseJsonObject(pathKeysJson, "{}")),
        versionString: versionString || undefined,
      });
      return { success: true, json: JSON.stringify(res.data?.value ?? null), error: "" };
    } catch (err) {
      return { success: false, json: "", error: linkedinErrorMessage(err) };
    }
  }
}
