/** Shared, client-safe types for the Credential Vault — no Node/DB dependency, so both the server
 * (src/server/credentials.ts) and browser (the Credential Vault page, the oauth2Saml node's
 * interpreter path) can import this freely, unlike src/server/* itself. */

export type CredentialTypeId =
  | "usernamePassword"
  | "oauth2SamlBearer"
  | "dropboxOAuth2"
  | "githubToken"
  | "githubApp"
  | "microsoftGraphClientCredentials"
  | "azureStorageConnectionString"
  | "facebookGraphAPI"
  | "jiraCloudApiToken"
  | "jiraServerPersonalAccessToken"
  | "jiraServerBasicAuth"
  | "googleServiceAccount"
  | "googleOAuth2"
  | "awsAccessKey"
  | "mongoConnectionString"
  | "slackBotToken"
  | "stripeApiKey"
  | "salesforceOAuth2PasswordFlow"
  | "workdayBasicAuth"
  | "twilioApiKey"
  | "smtpCredential"
  | "sapBasicAuth"
  | "linkedInOAuth2"
  | "sendGridApiKey";

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

/** A Google Cloud service account's JSON key, used for server-to-server access with no signed-in
 * user — the flow Google recommends for Admin SDK and for Workspace APIs (Gmail/Calendar/Drive)
 * acting on behalf of a user via domain-wide delegation. See lib/googleAuthManager.ts, which
 * derives a scoped google-auth-library JWT client from this (subject = impersonateUser). */
export interface GoogleServiceAccountCredentialData {
  serviceAccountKeyJson: string;
  impersonateUser: string;
}

/** An OAuth2 client id/secret plus a long-lived refresh token — the flow Google recommends for
 * anything acting on behalf of a user who consented interactively, mirroring
 * DropboxOAuth2CredentialData. `redirectUri`/`authCode` are only a staging area for the one-time
 * exchange (see nodes/google.ts's google.authorize, which reads them to mint refreshToken),
 * irrelevant to every other Google node's normal per-run flow. */
export interface GoogleOAuth2CredentialData {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authCode: string;
  refreshToken: string;
}

/** An IAM user/role's long-term access key pair plus the region to talk to — used as-is with any
 * AWS SDK client's `credentials`/`region` config (see lib/dynamoDbManager.ts, lib/kinesisManager.ts).
 * `sessionToken` is only needed for temporary (STS-issued) credentials; `endpoint` only for
 * pointing at a local/compatible endpoint (e.g. DynamoDB Local) instead of AWS itself. */
export interface AwsAccessKeyCredentialData {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  sessionToken: string;
  endpoint: string;
}

/** A MongoDB connection URI (e.g. `mongodb://user:pass@host:27017` or a `mongodb+srv://...` Atlas
 * SRV string), used as-is with the official driver's `MongoClient` — see lib/mongoManager.ts.
 * The default database to operate on when a node's own `database` pin is left blank. */
export interface MongoConnectionStringCredentialData {
  connectionString: string;
  defaultDatabase: string;
}

/** A Slack app's Bot User OAuth Token (`xoxb-...`), used as a plain Bearer token against Slack's Web
 * API — see lib/slackManager.ts. Slack has no refresh flow for bot tokens; re-issue from the app's
 * OAuth & Permissions page if it's ever revoked. */
export interface SlackBotTokenCredentialData {
  botToken: string;
}

/** A Stripe account's secret API key (`sk_live_...`/`sk_test_...`), used as HTTP Basic auth's
 * username with an empty password against the Stripe REST API — see lib/stripeManager.ts. */
export interface StripeApiKeyCredentialData {
  secretKey: string;
}

/** A Salesforce Connected App's consumer key/secret plus a running user's username/password+security
 * token, used with the OAuth2 Resource Owner Password Credentials grant — the flow Salesforce
 * documents for server-to-server integration users with no interactive login. See
 * lib/salesforceManager.ts, which exchanges these for an access token + the org's own instance URL. */
export interface SalesforceOAuth2PasswordFlowCredentialData {
  loginUrl: string;
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  securityToken: string;
}

/** A Workday tenant's REST API base URL (e.g. `https://wdN-services1.workday.com/ccx/api/v1/<tenant>`)
 * plus an Integration System User's username/password (Basic auth) — see lib/workdayManager.ts. */
export interface WorkdayBasicAuthCredentialData {
  tenantUrl: string;
  username: string;
  password: string;
}

/** A Twilio account's SID (as the Basic auth username) and Auth Token (as the password) — see
 * lib/twilioManager.ts, which calls the Twilio REST API directly. */
export interface TwilioApiKeyCredentialData {
  accountSid: string;
  authToken: string;
}

/** SMTP server connection details for outbound mail — see lib/smtpManager.ts (nodemailer). `port`/
 * `secure` are stored as strings like every other credential field and parsed by the manager. */
export interface SmtpCredentialData {
  host: string;
  port: string;
  secure: string;
  username: string;
  password: string;
}

/** An SAP system's OData/Gateway base URL (e.g. an S/4HANA or SAP Gateway host serving
 * `/sap/opu/odata/...` services), its client number (`sap-client` header, e.g. "100"), and a
 * dedicated user's Basic auth credentials — see lib/sapManager.ts. Only SAP's OData/Gateway
 * surface is reachable this way; IDoc/BAPI/RFC calls require SAP's proprietary NetWeaver RFC SDK
 * (not available via npm) and are out of scope, though RFC-enabled function modules exposed as a
 * SOAP web service can still be reached via the existing generic soap.call node. */
export interface SapBasicAuthCredentialData {
  baseUrl: string;
  client: string;
  username: string;
  password: string;
}

/** A LinkedIn developer app's client id/secret plus (optionally) a member's 3-legged access/refresh
 * token pair, used with the official `linkedin-api-client` package (RestliClient/AuthClient) — see
 * lib/linkedinManager.ts. `redirectUri`/`authCode` are only a staging area for the one-time
 * authorization code exchange (see nodes/linkedin.ts's linkedin.authorize), irrelevant to every
 * other LinkedIn node's normal per-run flow. `refreshToken` is only present if the app has refresh
 * tokens enabled; `accessToken` is what every Rest.li call node actually sends. */
export interface LinkedInOAuth2CredentialData {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authCode: string;
  accessToken: string;
  refreshToken: string;
}

/** A SendGrid API key ("SG...."), used as a Bearer token against both the official `@sendgrid/mail`
 * (Mail Send) and `@sendgrid/client` (the rest of the v3 Web API — API Keys, Marketing contacts/
 * lists, suppressions, stats, sender verification) packages — see lib/sendGridManager.ts. */
export interface SendGridApiKeyCredentialData {
  apiKey: string;
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
  | JiraServerBasicAuthCredentialData
  | GoogleServiceAccountCredentialData
  | GoogleOAuth2CredentialData
  | AwsAccessKeyCredentialData
  | MongoConnectionStringCredentialData
  | SlackBotTokenCredentialData
  | StripeApiKeyCredentialData
  | SalesforceOAuth2PasswordFlowCredentialData
  | WorkdayBasicAuthCredentialData
  | TwilioApiKeyCredentialData
  | SmtpCredentialData
  | SapBasicAuthCredentialData
  | LinkedInOAuth2CredentialData
  | SendGridApiKeyCredentialData;

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
