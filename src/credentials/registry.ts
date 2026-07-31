import type { CredentialTypeId } from "./types";

export interface CredentialFieldDef {
  id: string;
  label: string;
  /** Rendered as a password input (masked, not shown back in plain text once saved) — set for
   * anything genuinely secret (passwords, private keys), not for identifiers like a client id. */
  secret?: boolean;
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
