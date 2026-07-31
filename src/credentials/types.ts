/** Shared, client-safe types for the Credential Vault — no Node/DB dependency, so both the server
 * (src/server/credentials.ts) and browser (the Credential Vault page, the oauth2Saml node's
 * interpreter path) can import this freely, unlike src/server/* itself. */

export type CredentialTypeId = "usernamePassword" | "oauth2SamlBearer";

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

export type CredentialData = UsernamePasswordCredentialData | Oauth2SamlBearerCredentialData;

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
