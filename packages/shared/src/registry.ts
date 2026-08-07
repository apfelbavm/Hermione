import type { CredentialTypeId } from "./types";

export interface CredentialFieldDef {
  id: string;
  label: string;
  /** Rendered as a password input (masked, not shown back in plain text once saved) — set for
   * anything genuinely secret (passwords, private keys), not for identifiers like a client id. */
  secret?: boolean;
  /** Shown as a hover tooltip over a small "?" icon next to the field's label (see the Credential
   * Vault dialog) — for a field whose purpose/lifetime isn't obvious from the label alone, e.g.
   * Dropbox's one-time Authorization Code field. Omit for a field that's self-explanatory. */
  help?: string;
}

export interface CredentialTypeDef {
  id: CredentialTypeId;
  label: string;
  fields: CredentialFieldDef[];
  /** False for a type that's only ever populated automatically (currently just
   * "externalVaultSecret" — see server/vaultCredentials.ts) — hidden from the Credential Vault's
   * own Add/Edit type dropdown (see selectableCredentialTypeDefs), which only offers types a user
   * can meaningfully fill in by hand. Omitted (undefined) means selectable, same as `true`. */
  selectable?: boolean;
}

const registry = new Map<CredentialTypeId, CredentialTypeDef>();

export function registerCredentialType(def: CredentialTypeDef): void {
  if (registry.has(def.id)) {
    throw new Error(`Credential type "${def.id}" is already registered`);
  }
  registry.set(def.id, def);
}

export function getCredentialTypeDef(id: CredentialTypeId): CredentialTypeDef {
  const def = registry.get(id);
  if (!def) throw new Error(`Unknown credential type "${id}"`);
  return def;
}

export function allCredentialTypeDefs(): CredentialTypeDef[] {
  return [...registry.values()];
}

/** Every type a user can pick from the Credential Vault's own Add/Edit dialog — excludes types
 * only ever populated automatically (see CredentialTypeDef.selectable's own doc comment). */
export function selectableCredentialTypeDefs(): CredentialTypeDef[] {
  return allCredentialTypeDefs().filter((def) => def.selectable !== false);
}

registerCredentialType({
  id: "usernamePassword",
  label: "Username / Password",
  fields: [
    { id: "username", label: "Username" },
    { id: "password", label: "Password", secret: true },
  ],
});

registerCredentialType({
  id: "dropboxOAuth2",
  label: "Dropbox OAuth2",
  fields: [
    { id: "appKey", label: "App Key" },
    { id: "appSecret", label: "App Secret", secret: true },
    {
      id: "authCode",
      label: "Authorization Code",
      help: "Single-use code from Dropbox's OAuth2 consent page (visit https://www.dropbox.com/oauth2/authorize?client_id=YOUR_APP_KEY&response_type=code&token_access_type=offline). Only needed once, to run the Dropbox Authorize node and obtain a Refresh Token below — it stops working after that first use, so it's safe to leave here or clear it afterward.",
    },
    { id: "refreshToken", label: "Refresh Token", secret: true },
  ],
});

registerCredentialType({
  id: "oauth2SamlBearer",
  label: "OAuth2 SAML Bearer",
  fields: [
    { id: "idpUrl", label: "Assertion Endpoint URL" },
    { id: "tokenServiceUrl", label: "Token Service URL" },
    { id: "clientId", label: "Client ID" },
    { id: "userId", label: "User ID" },
    { id: "companyId", label: "Company ID" },
    { id: "privateKey", label: "Private Key", secret: true },
  ],
});

registerCredentialType({
  id: "githubToken",
  label: "GitHub Token",
  fields: [{ id: "token", label: "Personal Access Token", secret: true }],
});

registerCredentialType({
  id: "githubApp",
  label: "GitHub App",
  fields: [
    { id: "appId", label: "App ID" },
    { id: "privateKey", label: "Private Key", secret: true },
    { id: "installationId", label: "Installation ID" },
  ],
});

registerCredentialType({
  id: "azureStorageConnectionString",
  label: "Azure Storage (Connection String)",
  fields: [
    {
      id: "connectionString",
      label: "Connection String",
      secret: true,
      help: "From Azure Portal > Storage Account > Access keys > Connection string.",
    },
  ],
});

registerCredentialType({
  id: "facebookGraphAPI",
  label: "Facebook Graph API",
  fields: [
    { id: "appId", label: "App ID" },
    { id: "appSecret", label: "App Secret", secret: true },
    {
      id: "redirectUri",
      label: "Redirect URI",
      help: "Must exactly match a Valid OAuth Redirect URI configured on the Facebook App (Settings > Basic, or the Facebook Login product).",
    },
    {
      id: "authCode",
      label: "Authorization Code",
      help: "Single-use code from Facebook's OAuth dialog (https://www.facebook.com/v24.0/dialog/oauth?client_id=YOUR_APP_ID&redirect_uri=YOUR_REDIRECT_URI&scope=...). Only needed once, to run the Facebook Authorize node and obtain a long-lived Access Token below — it stops working after that first use, so it's safe to leave here or clear it afterward.",
    },
    {
      id: "accessToken",
      label: "Access Token",
      secret: true,
      help: "A long-lived User, Page, or System User access token. Filled in automatically by the Facebook Authorize node, or paste one directly (e.g. a never-expiring System User token from Business Settings).",
    },
  ],
});

registerCredentialType({
  id: "microsoftGraphClientCredentials",
  label: "Microsoft Graph (App-only)",
  fields: [
    { id: "tenantId", label: "Tenant ID" },
    { id: "clientId", label: "Client ID" },
    {
      id: "clientSecret",
      label: "Client Secret",
      secret: true,
      help: "From an Azure AD app registration granted application (not delegated) Microsoft Graph permissions, e.g. User.Read.All, Mail.Send, Calendars.ReadWrite, Files.ReadWrite.All, Group.ReadWrite.All, with admin consent.",
    },
  ],
});

registerCredentialType({
  id: "jiraCloudApiToken",
  label: "Jira Cloud (Email + API Token)",
  fields: [
    { id: "url", label: "Site URL", help: "Your Jira Cloud site, e.g. https://your-domain.atlassian.net" },
    { id: "email", label: "Email" },
    {
      id: "apiToken",
      label: "API Token",
      secret: true,
      help: "Create one at https://id.atlassian.com/manage-profile/security/api-tokens",
    },
  ],
});

registerCredentialType({
  id: "jiraServerPersonalAccessToken",
  label: "Jira Server/Data Center (Personal Access Token)",
  fields: [
    { id: "url", label: "Base URL", help: "Your Jira Server/Data Center base URL, e.g. https://jira.your-company.com" },
    {
      id: "personalAccessToken",
      label: "Personal Access Token",
      secret: true,
      help: "Create one from your Jira profile > Personal Access Tokens (Jira Server/Data Center 8.14+).",
    },
  ],
});

registerCredentialType({
  id: "jiraServerBasicAuth",
  label: "Jira Server/Data Center (Username + Password)",
  fields: [
    { id: "url", label: "Base URL", help: "Your Jira Server/Data Center base URL, e.g. https://jira.your-company.com" },
    { id: "username", label: "Username" },
    { id: "password", label: "Password", secret: true },
  ],
});

registerCredentialType({
  id: "googleServiceAccount",
  label: "Google Service Account",
  fields: [
    {
      id: "serviceAccountKeyJson",
      label: "Service Account Key (JSON)",
      secret: true,
      help: "Paste the full contents of the service account's JSON key file (Google Cloud Console > IAM & Admin > Service Accounts > Keys).",
    },
    {
      id: "impersonateUser",
      label: "Impersonate User (optional)",
      help: "A Workspace user's email to impersonate via domain-wide delegation, needed for Gmail/Calendar/Drive/Admin SDK acting on behalf of that user. Leave blank for APIs that don't need it.",
    },
  ],
});

registerCredentialType({
  id: "googleOAuth2",
  label: "Google OAuth2",
  fields: [
    { id: "clientId", label: "Client ID" },
    { id: "clientSecret", label: "Client Secret", secret: true },
    { id: "redirectUri", label: "Redirect URI", help: "Must exactly match an Authorized redirect URI configured on the OAuth client (Google Cloud Console > APIs & Services > Credentials)." },
    {
      id: "authCode",
      label: "Authorization Code",
      help: "Single-use code from Google's OAuth2 consent screen (access_type=offline&prompt=consent). Only needed once, to run the Google Authorize node and obtain a Refresh Token below — it stops working after that first use, so it's safe to leave here or clear it afterward.",
    },
    { id: "refreshToken", label: "Refresh Token", secret: true },
  ],
});

registerCredentialType({
  id: "awsAccessKey",
  label: "AWS Access Key",
  fields: [
    { id: "accessKeyId", label: "Access Key ID" },
    { id: "secretAccessKey", label: "Secret Access Key", secret: true },
    { id: "region", label: "Region", help: "AWS region to send requests to, e.g. us-east-1." },
    { id: "sessionToken", label: "Session Token (optional)", secret: true, help: "Only needed for temporary credentials issued via AWS STS." },
    { id: "endpoint", label: "Endpoint Override (optional)", help: "Custom service endpoint, e.g. http://localhost:8000 for DynamoDB Local. Leave blank to use AWS's regional endpoint." },
  ],
});

registerCredentialType({
  id: "mongoConnectionString",
  label: "MongoDB Connection String",
  fields: [
    { id: "connectionString", label: "Connection String", secret: true, help: "e.g. mongodb://user:pass@host:27017 or a mongodb+srv://... Atlas URI." },
    { id: "defaultDatabase", label: "Default Database (optional)", help: "Used when a node's own Database pin is left blank." },
  ],
});

registerCredentialType({
  id: "slackBotToken",
  label: "Slack Bot Token",
  fields: [{ id: "botToken", label: "Bot User OAuth Token", secret: true, help: "Starts with xoxb-. From your Slack app's OAuth & Permissions page." }],
});

registerCredentialType({
  id: "stripeApiKey",
  label: "Stripe API Key",
  fields: [{ id: "secretKey", label: "Secret Key", secret: true, help: "sk_live_... or sk_test_..., from the Stripe Dashboard's API keys page." }],
});

registerCredentialType({
  id: "salesforceOAuth2PasswordFlow",
  label: "Salesforce OAuth2 (Password Flow)",
  fields: [
    { id: "loginUrl", label: "Login URL", help: "e.g. https://login.salesforce.com or https://test.salesforce.com for a sandbox." },
    { id: "clientId", label: "Consumer Key" },
    { id: "clientSecret", label: "Consumer Secret", secret: true },
    { id: "username", label: "Username" },
    { id: "password", label: "Password", secret: true },
    { id: "securityToken", label: "Security Token", secret: true, help: "Appended to the password unless the org's login IP ranges already allowlist Hermione's server." },
  ],
});

registerCredentialType({
  id: "workdayBasicAuth",
  label: "Workday Basic Auth",
  fields: [
    { id: "tenantUrl", label: "Tenant REST API Base URL", help: "e.g. https://wdN-services1.myworkday.com/ccx/api/v1/yourtenant" },
    { id: "username", label: "Integration System User" },
    { id: "password", label: "Password", secret: true },
  ],
});

registerCredentialType({
  id: "twilioApiKey",
  label: "Twilio",
  fields: [
    { id: "accountSid", label: "Account SID" },
    { id: "authToken", label: "Auth Token", secret: true },
  ],
});

registerCredentialType({
  id: "sendGridApiKey",
  label: "SendGrid",
  fields: [{ id: "apiKey", label: "API Key", secret: true, help: "A SendGrid API key with the scopes needed by the nodes you use (Mail Send, Marketing, etc.)." }],
});

registerCredentialType({
  id: "smtpCredential",
  label: "SMTP",
  fields: [
    { id: "host", label: "Host" },
    { id: "port", label: "Port", help: "Usually 587 (STARTTLS) or 465 (implicit TLS)." },
    { id: "secure", label: "Secure (true/false)", help: "true for implicit TLS (port 465), false to use STARTTLS on the given port." },
    { id: "username", label: "Username" },
    { id: "password", label: "Password", secret: true },
  ],
});

registerCredentialType({
  id: "sapBasicAuth",
  label: "SAP Basic Auth",
  fields: [
    { id: "baseUrl", label: "Base URL", help: "e.g. https://your-sap-host:8443 — the host serving /sap/opu/odata/... services." },
    { id: "client", label: "Client", help: "The SAP client number, e.g. 100. Sent as the sap-client query parameter." },
    { id: "username", label: "Username" },
    { id: "password", label: "Password", secret: true },
  ],
});

registerCredentialType({
  id: "linkedInOAuth2",
  label: "LinkedIn OAuth2",
  fields: [
    { id: "clientId", label: "Client ID" },
    { id: "clientSecret", label: "Client Secret", secret: true },
    { id: "redirectUri", label: "Redirect URI", help: "Must match one of the redirect URLs configured on the app's Auth settings page in the LinkedIn Developer Portal." },
    {
      id: "authCode",
      label: "Authorization Code",
      help: "Single-use code from LinkedIn's OAuth2 consent page (use the LinkedIn Generate Authorization URL node to build the link). Only needed once, to run the LinkedIn Authorize node and obtain an Access Token (and Refresh Token, if enabled) below — it stops working after that first use.",
    },
    { id: "accessToken", label: "Access Token", secret: true },
    { id: "refreshToken", label: "Refresh Token", secret: true, help: "Only present if the app has refresh tokens enabled for the requested scopes." },
  ],
});

/** Never shown in the Add/Edit dialog (see `selectable: false`) — a record of this type is always
 * synthesized live from an external vault connection's own secret data (see
 * server/vaultCredentials.ts), never created/edited by hand through this registry's usual dialog. */
registerCredentialType({
  id: "externalVaultSecret",
  label: "External Vault Secret",
  fields: [],
  selectable: false,
});
