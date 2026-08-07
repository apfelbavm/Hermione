import { GetSecretValueCommand, ListSecretsCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import type { VaultProvider } from "./types";

function client(config: Record<string, string>): SecretsManagerClient {
  return new SecretsManagerClient({
    region: config.region ?? "",
    credentials: {
      accessKeyId: config.accessKeyId ?? "",
      secretAccessKey: config.secretAccessKey ?? "",
      sessionToken: config.sessionToken?.trim() || undefined,
    },
  });
}

export const awsSecretsManagerProvider: VaultProvider = {
  async listSecrets(config) {
    const secretsManager = client(config);
    const secrets: { id: string; name: string }[] = [];
    let nextToken: string | undefined;
    do {
      const res = await secretsManager.send(new ListSecretsCommand({ NextToken: nextToken }));
      for (const entry of res.SecretList ?? []) {
        if (entry.Name) secrets.push({ id: entry.Name, name: entry.Name });
      }
      nextToken = res.NextToken;
    } while (nextToken);
    return secrets;
  },

  async getSecret(config, secretId) {
    const res = await client(config).send(new GetSecretValueCommand({ SecretId: secretId }));
    if (res.SecretString === undefined) return {};
    // A Secrets Manager value is commonly a JSON object of fields (the console's own "key/value"
    // editing mode) but can just as easily be a plain string — surface whichever shape it actually is.
    try {
      const parsed: unknown = JSON.parse(res.SecretString);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [key, String(value)]));
      }
    } catch {
      // Not JSON — fall through to the plain-string shape below.
    }
    return { value: res.SecretString };
  },
};
