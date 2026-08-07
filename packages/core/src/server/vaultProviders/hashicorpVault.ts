import type { VaultProvider } from "./types";

/** A self-hosted or Cloud HashiCorp Vault's KV v2 secrets engine, talked to directly over its REST
 * API (no official Node SDK is pulled in here — the API surface needed is tiny: list + read). */

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function mount(config: Record<string, string>): string {
  return config.mountPath?.trim() || "secret";
}

async function vaultFetch(config: Record<string, string>, path: string): Promise<unknown> {
  const url = `${trimTrailingSlash(config.serverUrl ?? "")}${path}`;
  const res = await fetch(url, { headers: { "X-Vault-Token": config.token ?? "" } });
  if (!res.ok) throw new Error(`HashiCorp Vault request failed: ${res.status} ${res.statusText}`);
  return res.json();
}

export const hashicorpVaultProvider: VaultProvider = {
  async listSecrets(config) {
    const body = (await vaultFetch(config, `/v1/${mount(config)}/metadata?list=true`)) as { data?: { keys?: string[] } };
    const keys = body.data?.keys ?? [];
    // KV v2's list endpoint also returns subdirectories suffixed with "/" — out of scope here,
    // this integration only browses flat secrets, not a nested folder tree.
    return keys.filter((key) => !key.endsWith("/")).map((key) => ({ id: key, name: key }));
  },

  async getSecret(config, secretId) {
    const body = (await vaultFetch(config, `/v1/${mount(config)}/data/${encodeURIComponent(secretId)}`)) as { data?: { data?: Record<string, string> } };
    return body.data?.data ?? {};
  },
};
