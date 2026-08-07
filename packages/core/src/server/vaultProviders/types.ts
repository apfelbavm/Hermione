/** One provider implementation's contract (see hashicorpVault.ts/azureKeyVault.ts/
 * awsSecretsManager.ts/genericHttp.ts) — `config` is a VaultConnectionRecord's own `config` map,
 * whose keys match that provider's VaultProviderDef field ids (see credentials/vaultProviders.ts). */
export interface VaultSecretSummary {
  id: string;
  name: string;
}

export interface VaultProvider {
  listSecrets(config: Record<string, string>): Promise<VaultSecretSummary[]>;
  getSecret(config: Record<string, string>, secretId: string): Promise<Record<string, string>>;
}
