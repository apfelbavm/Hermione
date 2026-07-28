import { registerNode } from "../engine/registry";
import { basicAuthHeaderValue } from "./auth";

// OAuth2 Authorization Code — modeled on the same property set SAP Integration Suite's own
// OAuth2 Authorization Code credential artifact exposes (Provider, Auth URL, Token Service URL,
// Refresh Token Expiry, Redirect URL, Client ID/Secret, "send as" body-vs-Basic-Auth toggle,
// Username, Scope).
//
// The Authorization Code grant's first leg is fundamentally interactive: a real user visits Auth
// URL in a browser, logs in, and the identity provider redirects them to Redirect URL with a
// one-time `code` — which is exactly why this node CANNOT run that leg itself. Whoever owns
// Redirect URL is who receives that code (SAP Integration Suite's own OAuthTokenFromCode endpoint,
// in the case that prompted this node), not Hermione, so there is no way for a graph node to
// intercept it. What this node DOES do, and the only leg that's a plain non-interactive HTTP call,
// is the one a running graph actually needs: exchange an already-obtained `refreshToken` (captured
// once, out-of-band, via whatever owns Redirect URL) for a fresh access token — the same
// grant_type=refresh_token request any OAuth2 client makes to stay authenticated long after the
// original interactive login. authUrl/redirectUrl/scope are still used here, but only to build the
// `authorizationUrl` OUTPUT — a ready-to-open link for that one-time interactive bootstrap step,
// not something this node ever fetches itself. username/refreshTokenExpiry are accepted as pins
// purely for configuration parity with the source tool; neither is used by the refresh exchange
// itself (username only matters during the interactive login; refreshTokenExpiry is metadata about
// how long the whole authorization stays valid, a concern for whatever owns re-running the
// interactive step, not for a single refresh call).
//
// Output shape is the same { header, value } auth.basic/auth.oauth2Saml produce, and refreshToken
// rotation (many providers return a NEW refresh_token on every use) is surfaced via
// `newRefreshToken` — the graph is expected to write it back into whatever Variable it read the
// old one from, exactly like it would cache any other auth object (see auth.ts's own header
// comment on the object-Variable reuse pattern) — this node stays stateless like every other one.

const PROVIDERS = ["generic", "microsoft365"];
const SEND_AS_OPTIONS = ["body", "basicAuthHeader"];

function buildAuthorizationUrl(authUrl: string, clientId: string, redirectUrl: string, scope: string): string {
  if (!authUrl) return "";
  const params = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: redirectUrl });
  if (scope) params.set("scope", scope);
  const separator = authUrl.includes("?") ? "&" : "?";
  return `${authUrl}${separator}${params.toString()}`;
}

registerNode({
  type: "auth.oauth2AuthCode",
  label: "OAuth2 Authorization Code",
  group: "Auth",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    { id: "provider", label: "Provider", type: "string", direction: "input", defaultValue: PROVIDERS[0], options: PROVIDERS },
    { id: "authUrl", label: "Auth URL", type: "string", direction: "input", defaultValue: "" },
    { id: "tokenServiceUrl", label: "Token Service URL", type: "string", direction: "input", defaultValue: "" },
    { id: "redirectUrl", label: "Redirect URL", type: "string", direction: "input", defaultValue: "" },
    { id: "clientId", label: "Client ID", type: "string", direction: "input", defaultValue: "" },
    { id: "clientSecret", label: "Client Secret", type: "string", direction: "input", defaultValue: "" },
    {
      id: "sendAs",
      label: "Send As",
      type: "string",
      direction: "input",
      defaultValue: SEND_AS_OPTIONS[0],
      options: SEND_AS_OPTIONS,
    },
    { id: "username", label: "Username", type: "string", direction: "input", defaultValue: "" },
    { id: "scope", label: "Scope", type: "string", direction: "input", defaultValue: "" },
    { id: "refreshTokenExpiry", label: "Refresh Token Expiry (s)", type: "number", direction: "input", defaultValue: 0, integer: true },
    // Not one of the source tool's listed properties — SAP's own credential UI hides the actual
    // token value entirely (it manages the interactive flow and storage itself). A Hermione graph
    // has nowhere else for this to live, so it's an explicit pin: whatever refresh_token was
    // captured during the one-time interactive bootstrap, wired in from wherever the graph stores
    // it (a Variable, same reuse pattern as every other auth node here).
    { id: "refreshToken", label: "Refresh Token", type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: "Completed", type: "exec", direction: "output" },
    { id: "success", label: "Success", type: "boolean", direction: "output" },
    { id: "auth", label: "Auth", type: "object", direction: "output" },
    { id: "accessToken", label: "Access Token", type: "string", direction: "output" },
    // Rotates on every refresh for many providers — falls back to the input refreshToken when the
    // response doesn't include a new one, so downstream wiring never has to special-case "did it rotate?".
    { id: "newRefreshToken", label: "New Refresh Token", type: "string", direction: "output" },
    { id: "expiresIn", label: "Expires In (s)", type: "number", direction: "output" },
    // The one-time interactive-bootstrap link — open this in a browser once to obtain the very
    // first refresh token; never fetched by this node itself.
    { id: "authorizationUrl", label: "Authorization URL", type: "string", direction: "output" },
    { id: "error", label: "Error", type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const tokenServiceUrl = String(inputs.tokenServiceUrl ?? "");
    const clientId = String(inputs.clientId ?? "");
    const clientSecret = String(inputs.clientSecret ?? "");
    const refreshToken = String(inputs.refreshToken ?? "");
    const scope = String(inputs.scope ?? "").trim();
    const sendAs = String(inputs.sendAs ?? SEND_AS_OPTIONS[0]);

    const authorizationUrl = buildAuthorizationUrl(
      String(inputs.authUrl ?? ""),
      clientId,
      String(inputs.redirectUrl ?? ""),
      scope,
    );

    try {
      const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken });
      if (scope) body.set("scope", scope);

      const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
      if (sendAs === "basicAuthHeader") {
        headers.Authorization = basicAuthHeaderValue(clientId, clientSecret);
      } else {
        body.set("client_id", clientId);
        body.set("client_secret", clientSecret);
      }

      const res = await fetch(tokenServiceUrl, { method: "POST", headers, body: body.toString() });
      const responseText = await res.text();

      if (!res.ok) {
        return {
          nextExec: "exec-out",
          outputs: {
            success: false,
            auth: null,
            accessToken: "",
            newRefreshToken: refreshToken,
            expiresIn: 0,
            authorizationUrl,
            error: `Token endpoint returned ${res.status}: ${responseText}`,
          },
        };
      }

      const parsed = JSON.parse(responseText) as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown };
      const accessToken = String(parsed.access_token ?? "");
      if (!accessToken) {
        return {
          nextExec: "exec-out",
          outputs: {
            success: false,
            auth: null,
            accessToken: "",
            newRefreshToken: refreshToken,
            expiresIn: 0,
            authorizationUrl,
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
          newRefreshToken: typeof parsed.refresh_token === "string" && parsed.refresh_token ? parsed.refresh_token : refreshToken,
          expiresIn: Number(parsed.expires_in ?? 0),
          authorizationUrl,
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
          newRefreshToken: refreshToken,
          expiresIn: 0,
          authorizationUrl,
          error: err instanceof Error ? err.message : String(err),
        },
      };
    }
  },
  // Compiler support (compileExecute) is intentionally out of scope for now, same call as
  // http.request/auth.oauth2Saml — this node has data outputs beyond a single result, which no
  // exec node compiles yet.
});
