import { registerNode } from "../engine/registry";

// SAML 2.0 Bearer Assertion exchange (RFC 7522 grant type) — but the assertion itself is NOT built
// or signed locally. This matches systems (e.g. SAP SuccessFactors-style integrations) where
// generating the signed assertion is itself a server-side call: POST client_id/user_id/token_url/
// private_key to a dedicated "IdP" endpoint and get back a ready-to-use assertion as plain text.
// Only the second leg — exchanging that assertion for an access token — is a standard OAuth2 token
// request (grant_type=urn:ietf:params:oauth:grant-type:saml2-bearer). No local XML signing, no
// crypto library: both legs are plain form-urlencoded POSTs, same as http.request would send by hand.

registerNode({
  type: "auth.oauth2Saml",
  label: "OAuth2 SAML Bearer",
  group: "Auth",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    { id: "idpUrl", label: "Assertion Endpoint URL", type: "string", direction: "input", defaultValue: "" },
    { id: "tokenServiceUrl", label: "Token Service URL", type: "string", direction: "input", defaultValue: "" },
    { id: "clientId", label: "Client ID", type: "string", direction: "input", defaultValue: "" },
    { id: "userId", label: "User ID", type: "string", direction: "input", defaultValue: "" },
    { id: "companyId", label: "Company ID", type: "string", direction: "input", defaultValue: "" },
    { id: "privateKey", label: "Private Key", type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: "Completed", type: "exec", direction: "output" },
    { id: "success", label: "Success", type: "boolean", direction: "output" },
    // Same { header, value } shape auth.basic/auth.oauth2ClientCredentials produce, so it plugs
    // into http.request's Auth pin identically.
    { id: "auth", label: "Auth", type: "object", direction: "output" },
    { id: "accessToken", label: "Access Token", type: "string", direction: "output" },
    { id: "expiresIn", label: "Expires In (s)", type: "number", direction: "output" },
    // The token exchange leg's HTTP status. 0 means a request never got a response at all
    // (network failure on either leg) — same convention http.request itself uses.
    { id: "status", label: "Status", type: "number", direction: "output" },
    { id: "error", label: "Error", type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const idpUrl = String(inputs.idpUrl ?? "");
    const tokenServiceUrl = String(inputs.tokenServiceUrl ?? "");
    const clientId = String(inputs.clientId ?? "");
    const userId = String(inputs.userId ?? "");
    const companyId = String(inputs.companyId ?? "");
    const privateKey = String(inputs.privateKey ?? "");
    const formHeaders = { "Content-Type": "application/x-www-form-urlencoded", Accept: "*/*" };
    const fail = (status: number, error: string) => ({
      nextExec: "exec-out" as const,
      outputs: { success: false, auth: null, accessToken: "", expiresIn: 0, status, error },
    });

    try {
      const assertionRes = await fetch(idpUrl, {
        method: "POST",
        headers: formHeaders,
        body: new URLSearchParams({
          client_id: clientId,
          user_id: userId,
          token_url: tokenServiceUrl,
          private_key: privateKey,
        }).toString(),
      });
      const assertion = (await assertionRes.text()).trim();
      if (!assertionRes.ok || !assertion) {
        return fail(assertionRes.status, assertion || `Assertion endpoint returned ${assertionRes.status}`);
      }

      const tokenRes = await fetch(tokenServiceUrl, {
        method: "POST",
        headers: formHeaders,
        body: new URLSearchParams({
          client_id: clientId,
          user_id: userId,
          company_id: companyId,
          grant_type: "urn:ietf:params:oauth:grant-type:saml2-bearer",
          assertion,
        }).toString(),
      });
      const responseText = await tokenRes.text();
      if (!tokenRes.ok) {
        return fail(tokenRes.status, responseText || `Token endpoint returned ${tokenRes.status}`);
      }

      const parsed = JSON.parse(responseText) as { access_token?: unknown; expires_in?: unknown };
      const accessToken = String(parsed.access_token ?? "");
      if (!accessToken) {
        return fail(tokenRes.status, "Token endpoint response had no access_token");
      }

      return {
        nextExec: "exec-out",
        outputs: {
          success: true,
          auth: { header: "Authorization", value: `Bearer ${accessToken}` },
          accessToken,
          expiresIn: Number(parsed.expires_in ?? 0),
          status: tokenRes.status,
          error: "",
        },
      };
    } catch (err) {
      return fail(0, err instanceof Error ? err.message : String(err));
    }
  },
  // Compiler support (compileExecute) is intentionally out of scope for now, same call as
  // http.request and auth.oauth2ClientCredentials — this node has data outputs beyond a single
  // result, which no exec node compiles yet.
});
