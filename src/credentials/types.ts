/** Shared, client-safe types for the Credential Vault — no Node/DB dependency, so both the server
 * (src/server/credentials.ts) and browser (the Credential Vault page, the oauth2Saml node's
 * interpreter path) can import this freely, unlike src/server/* itself. */

export type CredentialTypeId = "usernamePassword" | "oauth2SamlBearer" | "dropboxOAuth2" | "githubToken" | "githubApp" | "microsoftGraphClientCredentials" | "azureStorageConnectionString";

export interface UsernamePasswordCredentialData {
  username: string;
  password: string;
}

/** Same 6 fields the OAuth2 SAML Bearer node's pins used to carry directly (see nodes/oauth2Saml.ts) —
 * now typed in one place instead of once per raw pin. */
export interface Oauth2SamlBearerCredentialData {
  idpUrl: string;
  tokenServiceUrl: string;
  clientId: string;
  userId: string;
  companyId: string;
  privateKey: string;
}

/** A Dropbox app's key/secret plus a long-lived refresh token — the flow Dropbox recommends over
 * its deprecated non-expiring access tokens (see nodes/dropbox.ts's dropbox.auth, which exchanges
 * this for a fresh short-lived access token via DropboxManager.refreshAccessToken). `authCode` is
 * only a staging area for the one-time setup step (see dropbox.authorize, which reads appKey/
 * appSecret/authCode from here to mint refreshToken) — irrelevant to dropbox.auth's normal
 * per-run flow, and safe to leave blank once refreshToken has been obtained. */
export interface DropboxOAuth2CredentialData {
  appKey: string;
  appSecret: string;
  authCode: string;
  refreshToken: string;
}

/** A GitHub personal access token — the simplest of GitHub's two auth flows (see nodes/github.ts,
 * which resolves either this or GithubAppCredentialData into a GithubManager). */
export interface GithubTokenCredentialData {
  token: string;
}

/** A GitHub App installation's credentials — the flow GitHub recommends for anything acting on
 * behalf of an org/repo rather than a single user (see nodes/github.ts). */
export interface GithubAppCredentialData {
  appId: string;
  privateKey: string;
  installationId: string;
}

/** An Azure AD app registration's tenant + client id/secret, used with the OAuth2 client credentials
 * grant to act as itself (app-only, no signed-in user) against Microsoft Graph — see
 * nodes/microsoft365.ts, which resolves this into a GraphManager that mints/refreshes the access
 * token on demand, the same way DropboxOAuth2CredentialData feeds DropboxManager. */
export interface MicrosoftGraphClientCredentialsData {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

/** An Azure Storage account's connection string (from Azure Portal > Storage Account > Access keys),
 * used as-is with BlobServiceClient.fromConnectionString — see lib/azureStorageManager.ts, which
 * derives every container/blob client from this one string instead of separate account name/key
 * fields. */
export interface AzureStorageConnectionStringCredentialData {
  connectionString: string;
}

export type CredentialData =
  | UsernamePasswordCredentialData
  | Oauth2SamlBearerCredentialData
  | DropboxOAuth2CredentialData
  | GithubTokenCredentialData
  | GithubAppCredentialData
  | MicrosoftGraphClientCredentialsData
  | AzureStorageConnectionStringCredentialData;

/** A summary never carries `data` — the Credential Vault's own list view (and anything else that
 * doesn't need the actual secret) should only ever see this. */
export interface CredentialSummary {
  id: string;
  name: string;
  type: CredentialTypeId;
  createdAt: string;
  updatedAt: string;
}

/** The full record, secret `data` included — only ever returned by a lookup that specifically needs
 * it (editing a credential in the vault dialog, or the oauth2Saml node resolving one by name). */
export interface CredentialRecord extends CredentialSummary {
  data: CredentialData;
}
