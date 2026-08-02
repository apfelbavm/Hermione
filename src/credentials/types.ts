/** Shared, client-safe types for the Credential Vault — no Node/DB dependency, so both the server
 * (src/server/credentials.ts) and browser (the Credential Vault page, the oauth2Saml node's
 * interpreter path) can import this freely, unlike src/server/* itself. */

export type CredentialTypeId = "usernamePassword" | "oauth2SamlBearer" | "dropboxOAuth2" | "githubToken" | "githubApp" | "microsoftGraphClientCredentials" | "azureStorageConnectionString" | "facebookGraphAPI" | "jiraCloudApiToken" | "jiraServerPersonalAccessToken" | "jiraServerBasicAuth";

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

/** A Facebook App's id/secret plus a long-lived (User, Page, or System User) access token — the
 * flow the Graph API centers on, since (unlike Dropbox) there's no refresh token: a long-lived
 * token just has to be re-obtained via facebook.authorize (or replaced with a never-expiring System
 * User token) once it nears its ~60 day expiry. `redirectUri`/`authCode` are only a staging area
 * for that one-time exchange (see nodes/facebook.ts's facebook.authorize), irrelevant to every other
 * Facebook node's normal per-run flow. */
export interface FacebookCredentialData {
  appId: string;
  appSecret: string;
  redirectUri: string;
  authCode: string;
  accessToken: string;
}

/** A Jira Cloud site's base URL plus an Atlassian account email/API token pair (Basic auth) — see
 * lib/jiraManager.ts, which routes this into a jira.js Version3Client (the Cloud-only REST API v3,
 * which uses Atlassian Document Format for rich text fields like description/comment body). */
export interface JiraCloudApiTokenCredentialData {
  url: string;
  email: string;
  apiToken: string;
}

/** A Jira Server/Data Center base URL plus a Personal Access Token (Bearer auth, added in Jira
 * 8.14+) — the auth method Atlassian recommends over Basic auth for self-hosted instances. See
 * lib/jiraManager.ts, which routes this into a jira.js Version2Client (REST API v2, which — unlike
 * Cloud — still takes plain strings/wiki markup for description/comment body). */
export interface JiraServerPersonalAccessTokenCredentialData {
  url: string;
  personalAccessToken: string;
}

/** A Jira Server/Data Center base URL plus a username/password — for older self-hosted instances
 * predating Personal Access Token support (pre-8.14). See lib/jiraManager.ts. */
export interface JiraServerBasicAuthCredentialData {
  url: string;
  username: string;
  password: string;
}

export type CredentialData =
  | UsernamePasswordCredentialData
  | Oauth2SamlBearerCredentialData
  | DropboxOAuth2CredentialData
  | GithubTokenCredentialData
  | GithubAppCredentialData
  | MicrosoftGraphClientCredentialsData
  | AzureStorageConnectionStringCredentialData
  | FacebookCredentialData
  | JiraCloudApiTokenCredentialData
  | JiraServerPersonalAccessTokenCredentialData
  | JiraServerBasicAuthCredentialData;

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
