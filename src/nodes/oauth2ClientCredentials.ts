import { registerNode } from "../engine/registry";
import { basicAuthHeaderValue } from "./auth";

// OAuth2 Client Credentials (RFC 6749 §4.4) — the standard app-only / service-to-service grant:
// no user, no browser redirect, no refresh token at all. Whenever a fresh access token is needed,
// the client just POSTs its own client_id/client_secret straight to the token endpoint again — far
// simpler than the Authorization Code node's refresh-token dance, since there's no interactive
// login step to bootstrap in the first place.
//
// "Provider" mirrors the same dropdown the other two Auth nodes use for provider-specific
// quirks — "microsoftEntraId" is the one concretely wired up here: instead of requiring the full
// token endpoint URL, it's derived from a plain Tenant ID
// (https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token), matching how Entra ID's own
// per-tenant endpoints are normally referenced. "generic" (the default) just uses tokenServiceUrl
// as given, for any other OAuth2 server implementing this same grant type (Auth0, Okta, etc.).

const PROVIDERS = ["generic", "microsoftEntraId"];
const SEND_AS_OPTIONS = ["body", "basicAuthHeader"];

function resolveTokenUrl(provider: string, tenantId: string, tokenServiceUrl: string): string {
  if (provider === "microsoftEntraId" && tenantId) {
    return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  }
  return tokenServiceUrl;
}

registerNode({
  type: "auth.oauth2ClientCredentials",
  label: "OAuth2 Client Credentials",
  group: "Auth",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    { id: "provider", label: "Provider", type: "string", direction: "input", defaultValue: PROVIDERS[0], options: PROVIDERS },
    { id: "tokenServiceUrl", label: "Token Service URL", type: "string", direction: "input", defaultValue: "" },
    // Microsoft Entra ID-only (see PROVIDERS) — ignored for "generic", where tokenServiceUrl is
    // used directly instead.
    { id: "tenantId", label: "Tenant ID", type: "string", direction: "input", defaultValue: "" },
    { id: "clientId", label: "Client ID", type: "string", direction: "input", defaultValue: "" },
    { id: "clientSecret", label: "Client Secret", type: "string", direction: "input", defaultValue: "" },
    { id: "scope", label: "Scope", type: "string", direction: "input", defaultValue: "" },
    {
      id: "sendAs",
      label: "Send As",
      type: "string",
      direction: "input",
      defaultValue: SEND_AS_OPTIONS[0],
      options: SEND_AS_OPTIONS,
    },
    { id: "exec-out", label: "Completed", type: "exec", direction: "output" },
    { id: "success", label: "Success", type: "boolean", direction: "output" },
    { id: "auth", label: "Auth", type: "object", direction: "output" },
    { id: "accessToken", label: "Access Token", type: "string", direction: "output" },
    { id: "expiresIn", label: "Expires In (s)", type: "number", direction: "output" },
    // 0 means no response was ever received at all (network failure) — same convention http.request
    // itself uses, rather than overloading 0 with any real HTTP status meaning.
    { id: "status", label: "Status", type: "number", direction: "output" },
    { id: "error", label: "Error", type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const provider = String(inputs.provider ?? PROVIDERS[0]);
    const tokenUrl = resolveTokenUrl(provider, String(inputs.tenantId ?? "").trim(), String(inputs.tokenServiceUrl ?? ""));
    const clientId = String(inputs.clientId ?? "");
    const clientSecret = String(inputs.clientSecret ?? "");
    const scope = String(inputs.scope ?? "").trim();
    const sendAs = String(inputs.sendAs ?? SEND_AS_OPTIONS[0]);

    try {
      const body = new URLSearchParams({ grant_type: "client_credentials" });
      if (scope) body.set("scope", scope);

      const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
      if (sendAs === "basicAuthHeader") {
        headers.Authorization = basicAuthHeaderValue(clientId, clientSecret);
      } else {
        body.set("client_id", clientId);
        body.set("client_secret", clientSecret);
      }

      const res = await fetch(tokenUrl, { method: "POST", headers, body: body.toString() });
      const responseText = await res.text();

      if (!res.ok) {
        // Prefer the response body (Microsoft's real AADSTS-style error detail lives there when
        // the request actually reached their auth logic), then the standard HTTP reason phrase —
        // but res.statusText is frequently EMPTY too for HTTP/2 responses (no textual reason
        // phrase exists at the wire level in HTTP/2, which is what these servers use), so fall all
        // the way back to the bare status code rather than ever surfacing an empty error string.
        const errorMessage = responseText.trim() || res.statusText || "";
        return {
          nextExec: "exec-out",
          outputs: { success: false, auth: null, accessToken: "", expiresIn: 0, status: res.status, error: errorMessage },
        };
      }

      const parsed = JSON.parse(responseText) as { access_token?: unknown; expires_in?: unknown };
      const accessToken = String(parsed.access_token ?? "");
      if (!accessToken) {
        return {
          nextExec: "exec-out",
          outputs: {
            success: false,
            auth: null,
            accessToken: "",
            expiresIn: 0,
            status: res.status,
            error: "Token endpoint response had no access_token",
          },
        };
      }

      return {
        nextExec: "exec-out",
        outputs: {
          success: true,
          auth: { header: "Authorization", value: `Bearer ${accessToken}` },
          accessToken,
          expiresIn: Number(parsed.expires_in ?? 0),
          status: res.status,
          error: "",
        },
      };
    } catch (err) {
      return {
        nextExec: "exec-out",
        outputs: {
          success: false,
          auth: null,
          accessToken: "",
          expiresIn: 0,
          status: 0,
          error: err instanceof Error ? err.message : String(err),
        },
      };
    }
  },
  // Compiler support (compileExecute) is intentionally out of scope for now, same call as the
  // other two OAuth2 nodes and http.request — this node has data outputs beyond a single result,
  // which no exec node compiles yet.
});
