export interface Oauth2SamlExchangeInputs {
  idpUrl: string;
  tokenServiceUrl: string;
  clientId: string;
  userId: string;
  companyId: string;
  privateKey: string;
}

export interface Oauth2SamlExchangeOutputs {
  success: boolean;
  auth: { header: string; value: string } | null;
  accessToken: string;
  expiresIn: number;
  status: number;
  error: string;
  [key: string]: unknown;
}

export interface CredentialFromEnv {
  idpUrl: string;
  tokenServiceUrl: string;
  clientId: string;
  userId: string;
  companyId: string;
  privateKey: string;
}

/** Called directly both by the interpreter (see graph/nodes/oauth2Saml.ts's execute) and, via a real
 * ESM import, by a deployed/compiled flow script (see OAUTH2SAML_MANAGER_IMPORT). Runs under plain
 * Node with no build/transpile step, given NODE_OPTIONS=--experimental-strip-types. Credential
 * SOURCING (Credential Vault vs. environment variables) deliberately stays outside this class — see
 * graph/nodes/oauth2Saml.ts's execute (vault lookup) and this file's own credentialFromEnv — since
 * interpreter and compiled paths genuinely differ there, not just duplicated. */
export class Oauth2SamlManager {
  private static fail(status: number, error: string): Oauth2SamlExchangeOutputs {
    return { success: false, auth: null, accessToken: "", expiresIn: 0, status, error };
  }

  private static errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  /** SAML 2.0 Bearer Assertion exchange (RFC 7522 grant type) — the assertion itself is NOT built or
   * signed locally; matches systems (e.g. SAP SuccessFactors-style integrations) where generating the
   * signed assertion is itself a server-side call: POST client_id/user_id/token_url/private_key to a
   * dedicated "IdP" endpoint and get back a ready-to-use assertion as plain text. Only the second leg
   * — exchanging that assertion for an access token — happens here, a standard OAuth2 token request
   * (grant_type=urn:ietf:params:oauth:grant-type:saml2-bearer). */
  static async exchange(inputs: Oauth2SamlExchangeInputs): Promise<Oauth2SamlExchangeOutputs> {
    const formHeaders = { "Content-Type": "application/x-www-form-urlencoded", Accept: "*/*" };

    try {
      const assertionRes = await fetch(inputs.idpUrl, {
        method: "POST",
        headers: formHeaders,
        body: new URLSearchParams({
          client_id: inputs.clientId,
          user_id: inputs.userId,
          token_url: inputs.tokenServiceUrl,
          private_key: inputs.privateKey,
        }).toString(),
      });
      const assertion = (await assertionRes.text()).trim();
      if (!assertionRes.ok || !assertion) {
        return Oauth2SamlManager.fail(assertionRes.status, assertion || `Assertion endpoint returned ${assertionRes.status}`);
      }

      const tokenRes = await fetch(inputs.tokenServiceUrl, {
        method: "POST",
        headers: formHeaders,
        body: new URLSearchParams({
          client_id: inputs.clientId,
          user_id: inputs.userId,
          company_id: inputs.companyId,
          grant_type: "urn:ietf:params:oauth:grant-type:saml2-bearer",
          assertion,
        }).toString(),
      });
      const responseText = await tokenRes.text();
      if (!tokenRes.ok) {
        return Oauth2SamlManager.fail(tokenRes.status, responseText || `Token endpoint returned ${tokenRes.status}`);
      }

      const parsed = JSON.parse(responseText);
      const accessToken = String(parsed.access_token ?? "");
      if (!accessToken) {
        return Oauth2SamlManager.fail(tokenRes.status, "Token endpoint response had no access_token");
      }

      return {
        success: true,
        auth: { header: "Authorization", value: `Bearer ${accessToken}` },
        accessToken,
        expiresIn: Number(parsed.expires_in ?? 0),
        status: tokenRes.status,
        error: "",
      };
    } catch (err) {
      return Oauth2SamlManager.fail(0, Oauth2SamlManager.errorMessage(err));
    }
  }

  /** Compile-time-only counterpart of oauth2Saml.ts's execute() vault lookup (ctx.getCredential) — the
   * compiled/deployed script has no access to the Credential Vault database, only the interpreter does
   * (see ExecutionContext.getCredential), so it reads the same credential's fields from environment
   * variables instead, named by sanitizing the credential's own name into an env-var-safe prefix: e.g.
   * "SuccessFactors Prod" -> HERMIONE_CRED_SUCCESSFACTORS_PROD_IDP_URL, _TOKEN_SERVICE_URL, etc. Never
   * called by the interpreter — genuinely different credential-sourcing behavior, not duplicated logic. */
  static credentialFromEnv(name: string): CredentialFromEnv {
    const prefix = `HERMIONE_CRED_${String(name)
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")}`;
    return {
      idpUrl: process.env[`${prefix}_IDP_URL`] || "",
      tokenServiceUrl: process.env[`${prefix}_TOKEN_SERVICE_URL`] || "",
      clientId: process.env[`${prefix}_CLIENT_ID`] || "",
      userId: process.env[`${prefix}_USER_ID`] || "",
      companyId: process.env[`${prefix}_COMPANY_ID`] || "",
      privateKey: process.env[`${prefix}_PRIVATE_KEY`] || "",
    };
  }
}
