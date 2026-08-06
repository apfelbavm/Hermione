/** Shared, client-safe types for connecting an EXTERNAL credential vault (in addition to this
 * app's own built-in one) — no Node/DB dependency, mirrors credentials/registry.ts's own pattern
 * but for a vault CONNECTION's own auth/config fields rather than a single credential's fields.
 * The actual provider implementations (talking to each vault's real API) live server-side only,
 * under server/vaultProviders/ — this file only drives the "Connect Vault" dialog's form. */

export type VaultProviderId = "hashicorpVault" | "azureKeyVault" | "awsSecretsManager" | "genericHttp";

export interface VaultProviderFieldDef {
  id: string;
  label: string;
  /** Rendered as a password input (masked) — set for anything genuinely secret (tokens, keys). */
  secret?: boolean;
  help?: string;
}

export interface VaultProviderDef {
  id: VaultProviderId;
  label: string;
  fields: VaultProviderFieldDef[];
}

const registry = new Map<VaultProviderId, VaultProviderDef>();

function registerVaultProvider(def: VaultProviderDef): void {
  if (registry.has(def.id)) {
    throw new Error(`Vault provider "${def.id}" is already registered`);
  }
  registry.set(def.id, def);
}

export function getVaultProviderDef(id: VaultProviderId): VaultProviderDef {
  const def = registry.get(id);
  if (!def) throw new Error(`Unknown vault provider "${id}"`);
  return def;
}

export function allVaultProviderDefs(): VaultProviderDef[] {
  return [...registry.values()];
}

registerVaultProvider({
  id: "hashicorpVault",
  label: "HashiCorp Vault (KV v2)",
  fields: [
    { id: "serverUrl", label: "Server URL", help: "e.g. https://vault.example.com:8200" },
    { id: "token", label: "Token", secret: true },
    { id: "mountPath", label: "KV Mount Path", help: 'Defaults to "secret" if left blank.' },
  ],
});

registerVaultProvider({
  id: "azureKeyVault",
  label: "Azure Key Vault",
  fields: [
    { id: "vaultUrl", label: "Vault URL", help: "e.g. https://your-vault-name.vault.azure.net" },
    { id: "tenantId", label: "Tenant ID" },
    { id: "clientId", label: "Client ID" },
    { id: "clientSecret", label: "Client Secret", secret: true },
  ],
});

registerVaultProvider({
  id: "awsSecretsManager",
  label: "AWS Secrets Manager",
  fields: [
    { id: "region", label: "Region", help: "e.g. us-east-1" },
    { id: "accessKeyId", label: "Access Key ID" },
    { id: "secretAccessKey", label: "Secret Access Key", secret: true },
    { id: "sessionToken", label: "Session Token", secret: true, help: "Only needed for temporary (STS-issued) credentials." },
  ],
});

registerVaultProvider({
  id: "genericHttp",
  label: "Generic HTTP Vault",
  fields: [
    { id: "listUrl", label: "List Secrets URL", help: "GET endpoint returning a JSON array of secret names, or of {id, name} objects." },
    { id: "getUrlTemplate", label: "Get Secret URL Template", help: "GET endpoint returning a flat JSON object of that secret's fields. Use {id} as a placeholder for the secret's id, e.g. https://vault.example.com/secrets/{id}." },
    { id: "authHeaderName", label: "Auth Header Name", help: 'Defaults to "Authorization" if left blank.' },
    { id: "authHeaderValue", label: "Auth Header Value", secret: true, help: 'e.g. "Bearer <token>".' },
  ],
});
