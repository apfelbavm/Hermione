import type { VaultConnectionRecord } from "../models";
import type { VaultProviderId } from "../../credentials/vaultProviders";
import { awsSecretsManagerProvider } from "./awsSecretsManager";
import { azureKeyVaultProvider } from "./azureKeyVault";
import { genericHttpProvider } from "./genericHttp";
import { hashicorpVaultProvider } from "./hashicorpVault";
import type { VaultProvider, VaultSecretSummary } from "./types";

export type { VaultSecretSummary } from "./types";

const providers: Record<VaultProviderId, VaultProvider> = {
  hashicorpVault: hashicorpVaultProvider,
  azureKeyVault: azureKeyVaultProvider,
  awsSecretsManager: awsSecretsManagerProvider,
  genericHttp: genericHttpProvider,
};

export function listVaultSecrets(connection: VaultConnectionRecord): Promise<VaultSecretSummary[]> {
  return providers[connection.provider].listSecrets(connection.config);
}

export function getVaultSecret(connection: VaultConnectionRecord, secretId: string): Promise<Record<string, string>> {
  return providers[connection.provider].getSecret(connection.config, secretId);
}
