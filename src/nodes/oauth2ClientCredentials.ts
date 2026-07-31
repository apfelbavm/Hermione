import * as oauth from "oauth4webapi";
import { NodeColorCategory } from "../engine/types";
import { registerNode } from "../engine/registry";
import { i18n } from "@i18n";

// OAuth2 Client Credentials (RFC 6749 §4.4) — the standard app-only / service-to-service grant:
// no user, no browser redirect, no refresh token at all. Whenever a fresh access token is needed,
// the client just POSTs its own client_id/client_secret straight to the token endpoint again.
//
// The actual request/response handling is delegated to oauth4webapi rather than hand-rolled, so
// this node only supports what that library supports: a plain token endpoint URL (no
// provider-specific endpoint derivation) and either of the two client-secret-based authentication
// methods it exposes a ready-made helper for, ClientSecretBasic and ClientSecretPost.

const SEND_AS_OPTIONS = ["body", "basicAuthHeader"];

registerNode({
  type: "auth.oauth2ClientCredentials",
  label: i18n.nodes.auth.oauth2ClientCredentials.label,
  description: i18n.nodes.auth.oauth2ClientCredentials.description,
  group: "Request.Auth",
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    {
      id: "tokenServiceUrl",
      label: i18n.nodes.auth.oauth2ClientCredentials.pin_token_service_url,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "clientId",
      label: i18n.nodes.auth.oauth2ClientCredentials.pin_client_id,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "clientSecret",
      label: i18n.nodes.auth.oauth2ClientCredentials.pin_client_secret,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "scope",
      label: i18n.nodes.auth.oauth2ClientCredentials.pin_scope,
      type: "string",
      direction: "input",
      defaultValue: "",
    },
    {
      id: "sendAs",
      label: i18n.nodes.auth.oauth2ClientCredentials.pin_send_as,
      type: "string",
      direction: "input",
      defaultValue: SEND_AS_OPTIONS[0],
      options: SEND_AS_OPTIONS,
    },
    {
      id: "exec-out",
      label: i18n.nodes.__shared.pin_completed,
      type: "exec",
      direction: "output",
    },
    {
      id: "success",
      label: i18n.nodes.__shared.pin_success,
      type: "boolean",
      direction: "output",
    },
    {
      id: "auth",
      label: i18n.nodes.__shared.pin_auth,
      type: "object",
      direction: "output",
    },
    {
      id: "accessToken",
      label: i18n.nodes.auth.oauth2ClientCredentials.pin_access_token,
      type: "string",
      direction: "output",
    },
    {
      id: "expiresIn",
      label: i18n.nodes.auth.oauth2ClientCredentials.pin_expires_in,
      type: "number",
      direction: "output",
    },
    {
      id: "status",
      label: i18n.nodes.__shared.pin_status,
      type: "number",
      direction: "output",
    },
    {
      id: "error",
      label: i18n.nodes.__shared.pin_error,
      type: "string",
      direction: "output",
    },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const tokenUrl = String(inputs.tokenServiceUrl ?? "");
    const clientId = String(inputs.clientId ?? "");
    const clientSecret = String(inputs.clientSecret ?? "");
    const scope = String(inputs.scope ?? "").trim();
    const sendAs = String(inputs.sendAs ?? SEND_AS_OPTIONS[0]);

    // issuer/token_endpoint both point at the same URL: this node talks straight to a known token
    // endpoint rather than performing full OIDC discovery, so there's no separate issuer identity
    // to distinguish from it.
    const as: oauth.AuthorizationServer = {
      issuer: tokenUrl,
      token_endpoint: tokenUrl,
    };
    const client: oauth.Client = { client_id: clientId };
    const clientAuth = sendAs === "basicAuthHeader" ? oauth.ClientSecretBasic(clientSecret) : oauth.ClientSecretPost(clientSecret);

    let status = 0;
    try {
      const response = await oauth.clientCredentialsGrantRequest(as, client, clientAuth, new URLSearchParams(scope ? { scope } : {}));
      status = response.status;

      const result = await oauth.processClientCredentialsResponse(as, client, response);
      return {
        nextExec: "exec-out",
        outputs: {
          success: true,
          auth: {
            header: "Authorization",
            value: `Bearer ${result.access_token}`,
          },
          accessToken: result.access_token,
          expiresIn: Number(result.expires_in ?? 0),
          status,
          error: "",
        },
      };
    } catch (err) {
      if (err instanceof oauth.ResponseBodyError || err instanceof oauth.WWWAuthenticateChallengeError) {
        status = err.status;
      }
      const message = err instanceof oauth.ResponseBodyError ? err.error_description || err.error : err instanceof Error ? err.message : String(err);
      return {
        nextExec: "exec-out",
        outputs: {
          success: false,
          auth: null,
          accessToken: "",
          expiresIn: 0,
          status,
          error: message,
        },
      };
    }
  },
  // Compiler support (compileExecute) is intentionally out of scope for now — this node has data
  // outputs beyond a single result, which needs the compiler's compileExecuteOutputs hook (see
  // auth.oauth2Saml/http.request for the pattern, once something actually needs this compiled).
});
