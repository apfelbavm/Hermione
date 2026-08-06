import { ClientSecretCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import type { VaultProvider } from "./types";

function client(config: Record<string, string>): SecretClient {
  const credential = new ClientSecretCredential(config.tenantId ?? "", config.clientId ?? "", config.clientSecret ?? "");
  return new SecretClient(config.vaultUrl ?? "", credential);
}

export const azureKeyVaultProvider: VaultProvider = {
  async listSecrets(config) {
    const secretClient = client(config);
    const secrets: { id: string; name: string }[] = [];
    for await (const props of secretClient.listPropertiesOfSecrets()) {
      if (props.enabled === false) continue;
      secrets.push({ id: props.name, name: props.name });
    }
    return secrets;
  },

  async getSecret(config, secretId) {
    const secret = await client(config).getSecret(secretId);
    // Key Vault secrets are a single opaque string, unlike the key/value map every other provider
    // (and the built-in vault's own typed credentials) returns — wrap it under one field so it's
    // still usable generically (e.g. HERMIONE_CRED_<NAME>_VALUE for a compiled/deployed script).
    return { value: secret.value ?? "" };
  },
};
