import type { VaultConnectionRecord } from "../models";
import type { VaultProviderId } from "@hermione/shared/vaultProviders";
import { awsSecretsManagerProvider } from "./awsSecretsManager.ts";
import { azureKeyVaultProvider } from "./azureKeyVault.ts";
import { genericHttpProvider } from "./genericHttp.ts";
import { hashicorpVaultProvider } from "./hashicorpVault.ts";
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
