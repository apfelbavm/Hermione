import type { VaultProvider } from "./types";

/** A user-defined REST endpoint pair, for any vault with no dedicated provider above — `listUrl`
 * must return a JSON array (of plain name strings, or of {id, name} objects), and
 * `getUrlTemplate` (with an `{id}` placeholder) must return a flat JSON object of that secret's
 * own fields. */

function authHeaders(config: Record<string, string>): Record<string, string> {
  if (!config.authHeaderValue) return {};
  return { [config.authHeaderName?.trim() || "Authorization"]: config.authHeaderValue };
}

export const genericHttpProvider: VaultProvider = {
  async listSecrets(config) {
    const res = await fetch(config.listUrl ?? "", { headers: authHeaders(config) });
    if (!res.ok) throw new Error(`Generic vault list request failed: ${res.status} ${res.statusText}`);
    const body: unknown = await res.json();
    if (!Array.isArray(body)) return [];
    return body.map((item) => {
      if (typeof item === "string") return { id: item, name: item };
      const record = item as { id?: unknown; name?: unknown };
      const id = String(record.id ?? record.name ?? "");
      const name = String(record.name ?? record.id ?? "");
      return { id, name };
    });
  },

  async getSecret(config, secretId) {
    const url = (config.getUrlTemplate ?? "").replace("{id}", encodeURIComponent(secretId));
    const res = await fetch(url, { headers: authHeaders(config) });
    if (!res.ok) throw new Error(`Generic vault get request failed: ${res.status} ${res.statusText}`);
    const body: unknown = await res.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return {};
    return Object.fromEntries(Object.entries(body as Record<string, unknown>).map(([key, value]) => [key, String(value)]));
  },
};
