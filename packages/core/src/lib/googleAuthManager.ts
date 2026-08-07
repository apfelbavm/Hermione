import { google, type Auth } from "googleapis";
import type { GoogleServiceAccountCredentialData, GoogleOAuth2CredentialData } from "@hermione/shared/types";

/** Every Google node (Drive, Sheets, Docs, Gmail, Calendar, Admin SDK) needs the same boilerplate:
 * build an authenticated client for whichever auth flow the credential targets, then hand it to
 * the official googleapis SDK's per-service client factory (google.drive/google.sheets/...) — see
 * the per-service *Manager.ts files, which only do that wiring. Centralized here once instead of
 * repeated per manager, mirrors graphManager.ts's ClientSecretCredential/jiraManager.ts's dual
 * Cloud/Server client construction. */

export function googleErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "response" in err) {
    const response = (err as { response?: { data?: unknown; status?: number } }).response;
    const data = response?.data as { error?: { message?: string } | string; error_description?: string } | undefined;
    if (data && typeof data === "object" && data.error) {
      if (typeof data.error === "string") return data.error_description ? `${data.error}: ${data.error_description}` : data.error;
      if (data.error.message) return data.error.message;
    }
    if (response?.status) return `Google API error (status ${response.status})`;
  }
  return err instanceof Error ? err.message : String(err);
}

export type GoogleAuthClient = Auth.JWT | Auth.OAuth2Client;

export interface GoogleTokenResult {
  success: boolean;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  error: string;
  [key: string]: unknown;
}

const jwtCache = new Map<string, Auth.JWT>();

/** Builds (and caches) a service-account client scoped to whichever API surface the calling
 * manager needs — google-auth-library's JWT class mints/refreshes the bearer token on demand, the
 * same way ClientSecretCredential does for Microsoft Graph (see graphManager.ts). Keyed by
 * service-account email + impersonated user + scope set, so a request needing a different scope
 * (e.g. Gmail vs Drive) gets its own token instead of reusing one that lacks that scope. */
export function serviceAccountClient(data: GoogleServiceAccountCredentialData, scopes: string[]): Auth.JWT {
  const key = JSON.parse(data.serviceAccountKeyJson) as { client_email: string; private_key: string };
  const cacheKey = `${key.client_email}:${data.impersonateUser}:${scopes.join(",")}`;
  let client = jwtCache.get(cacheKey);
  if (!client) {
    client = new google.auth.JWT({
      email: key.client_email,
      key: key.private_key,
      scopes,
      subject: data.impersonateUser || undefined,
    });
    jwtCache.set(cacheKey, client);
  }
  return client;
}

const oauth2Cache = new Map<string, Auth.OAuth2Client>();

/** Builds (and caches) an OAuth2 client from a long-lived refresh token — the flow Google
 * recommends for anything acting on behalf of a signed-in user rather than a service account (see
 * exchangeAuthCode for the one-time setup step that obtains it). Mirrors dropboxManager.ts's
 * DropboxAuth: refresh_token is set once and the client library mints/refreshes the actual access
 * token on demand before every request, so nothing here has to track expiry itself. */
export function oauth2Client(data: GoogleOAuth2CredentialData): Auth.OAuth2Client {
  const cacheKey = `${data.clientId}:${data.refreshToken}`;
  let client = oauth2Cache.get(cacheKey);
  if (!client) {
    client = new google.auth.OAuth2(data.clientId, data.clientSecret);
    client.setCredentials({ refresh_token: data.refreshToken });
    oauth2Cache.set(cacheKey, client);
  }
  return client;
}

/** One-time setup step: exchanges a single-use authorization code (obtained by a human visiting
 * Google's OAuth2 consent screen with access_type=offline&prompt=consent) for a long-lived refresh
 * token — the value that then goes into the Credential Vault for every other node's oauth2Client()
 * to use. Mirrors dropboxManager.ts's exchangeAuthCode/facebookManager.ts's authorize flow. */
export async function exchangeAuthCode(authCode: string, clientId: string, clientSecret: string, redirectUri: string): Promise<GoogleTokenResult> {
  try {
    const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const { tokens } = await client.getToken(authCode);
    return {
      success: true,
      accessToken: tokens.access_token ?? "",
      refreshToken: tokens.refresh_token ?? "",
      expiresIn: tokens.expiry_date ? Math.max(0, Math.round((tokens.expiry_date - Date.now()) / 1000)) : 0,
      error: "",
    };
  } catch (err) {
    return { success: false, accessToken: "", refreshToken: "", expiresIn: 0, error: googleErrorMessage(err) };
  }
}
