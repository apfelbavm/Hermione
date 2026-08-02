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
