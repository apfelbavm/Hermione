import { NodeColorCategory } from "../engine/types";
import { registerNode } from "../engine/registry";
import { compileResultVar } from "../engine/compileUtils";
import type { Oauth2SamlBearerCredentialData } from "../credentials/types";
import { i18n } from "@i18n";

// SAML 2.0 Bearer Assertion exchange (RFC 7522 grant type) — but the assertion itself is NOT built
// or signed locally. This matches systems (e.g. SAP SuccessFactors-style integrations) where
// generating the signed assertion is itself a server-side call: POST client_id/user_id/token_url/
// private_key to a dedicated "IdP" endpoint and get back a ready-to-use assertion as plain text.
// Only the second leg — exchanging that assertion for an access token — is a standard OAuth2 token
// request (grant_type=urn:ietf:params:oauth:grant-type:saml2-bearer). No local XML signing, no
// crypto library: both legs are plain form-urlencoded POSTs, same as http.request would send by hand.
//
// Written ONCE as a plain-JS source string, derived via `new Function` for the interpreter's own use
// and embedded verbatim as this node's compileHelpers entry for the compiled path — same reasoning
// as debug.ts's formatForLog — so there's exactly one implementation, not two hand-kept copies that
// could drift. Needs no compileImports: fetch/URLSearchParams/JSON are globals in both the browser
// and plain Node, not something a compiled file needs to `npm install` alongside it.
//
// This is also the node's actual reason for having compileExecute/compileExecuteOutputs at all where
// its sibling auth.oauth2ClientCredentials and http.request still don't: an in-editor Run executes
// fetch() from the browser page itself, so a target server that doesn't send CORS headers back (true
// of most server-to-server OAuth endpoints, including SuccessFactors' — they're built for Postman/
// backend callers, not page JS) blocks the response outright with a NetworkError, independent of
// anything this file does. Compiling the graph and running the output under plain Node sidesteps
// that entirely, since CORS is purely a browser-enforced restriction.
const OAUTH2_SAML_EXCHANGE_SOURCE = `
async function oauth2SamlExchange(idpUrl, tokenServiceUrl, clientId, userId, companyId, privateKey) {
  const formHeaders = { "Content-Type": "application/x-www-form-urlencoded", Accept: "*/*" };
  const fail = (status, error) => ({ success: false, auth: null, accessToken: "", expiresIn: 0, status, error });

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
      return fail(assertionRes.status, assertion || "Assertion endpoint returned " + assertionRes.status);
    }

    const tokenRes = await fetch(tokenServiceUrl, {
      method: "POST",
      headers: formHeaders,
      body: new URLSearchParams({
        client_id: clientId,
        user_id: userId,
        company_id: companyId,
        grant_type: "urn:ietf:params:oauth:grant-type:saml2-bearer",
        assertion: assertion,
      }).toString(),
    });
    const responseText = await tokenRes.text();
    if (!tokenRes.ok) {
      return fail(tokenRes.status, responseText || "Token endpoint returned " + tokenRes.status);
    }

    const parsed = JSON.parse(responseText);
    const accessToken = String(parsed.access_token ?? "");
    if (!accessToken) {
      return fail(tokenRes.status, "Token endpoint response had no access_token");
    }

    return {
      success: true,
      auth: { header: "Authorization", value: "Bearer " + accessToken },
      accessToken: accessToken,
      expiresIn: Number(parsed.expires_in ?? 0),
      status: tokenRes.status,
      error: "",
    };
  } catch (err) {
    return fail(0, err instanceof Error ? err.message : String(err));
  }
}
`;

// The compiled (standalone .mjs) path has no access to the Credential Vault database — only the
// interpreter, running inside /api/simulate/route.ts, can reach that (see ExecutionContext.
// getCredential). A compiled export instead expects the credential's fields as environment
// variables, named by sanitizing the credential's own name into an env-var-safe prefix: e.g.
// "SuccessFactors Prod" -> HERMIONE_CRED_SUCCESSFACTORS_PROD_IDP_URL, _TOKEN_SERVICE_URL, etc. This
// sanitization has to happen at RUNTIME, not compile time — `credentialName` is a compiled
// expression like every other input this node compiles, not necessarily a literal, so the prefix
// can't be baked in ahead of time.
const CREDENTIAL_FROM_ENV_SOURCE = `
function credentialEnvPrefix(name) {
  return "HERMIONE_CRED_" + String(name).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function credentialFromEnv(name) {
  const prefix = credentialEnvPrefix(name);
  return {
    idpUrl: process.env[prefix + "_IDP_URL"] || "",
    tokenServiceUrl: process.env[prefix + "_TOKEN_SERVICE_URL"] || "",
    clientId: process.env[prefix + "_CLIENT_ID"] || "",
    userId: process.env[prefix + "_USER_ID"] || "",
    companyId: process.env[prefix + "_COMPANY_ID"] || "",
    privateKey: process.env[prefix + "_PRIVATE_KEY"] || "",
  };
}
`;

interface Oauth2SamlResult {
  success: boolean;
  auth: { header: string; value: string } | null;
  accessToken: string;
  expiresIn: number;
  status: number;
  error: string;
  [key: string]: unknown;
}

const oauth2SamlExchange: (idpUrl: string, tokenServiceUrl: string, clientId: string, userId: string, companyId: string, privateKey: string) => Promise<Oauth2SamlResult> = new Function(`${OAUTH2_SAML_EXCHANGE_SOURCE}\nreturn oauth2SamlExchange;`)();

function failResult(error: string): Oauth2SamlResult {
  return {
    success: false,
    auth: null,
    accessToken: "",
    expiresIn: 0,
    status: 0,
    error,
  };
}

registerNode({
  type: "auth.oauth2Saml",
  label: i18n.nodes.auth.oauth2Saml.label,
  description: i18n.nodes.auth.oauth2Saml.description,
  group: "Request.Auth",
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    {
      id: "credentialName",
      label: i18n.nodes.auth.oauth2Saml.pin_credential_name,
      type: "string",
      direction: "input",
      defaultValue: "",
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
      label: i18n.nodes.auth.oauth2Saml.pin_access_token,
      type: "string",
      direction: "output",
    },
    {
      id: "expiresIn",
      label: i18n.nodes.auth.oauth2Saml.pin_expires_in,
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
  execute: async ({ inputs, ctx }) => {
    const credentialName = String(inputs.credentialName ?? "");
    const credential = ctx.getCredential?.(credentialName);
    if (!credential) {
      return {
        nextExec: "exec-out",
        outputs: failResult(`Credential "${credentialName}" not found in the vault`),
      };
    }
    if (credential.type !== "oauth2SamlBearer") {
      return {
        nextExec: "exec-out",
        outputs: failResult(`Credential "${credentialName}" is not an OAuth2 SAML Bearer credential`),
      };
    }

    const data = credential.data as Oauth2SamlBearerCredentialData;
    const result = await oauth2SamlExchange(data.idpUrl, data.tokenServiceUrl, data.clientId, data.userId, data.companyId, data.privateKey);
    return { nextExec: "exec-out", outputs: result };
  },
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)}_cred = credentialFromEnv(${inputs.credentialName});`,
    `const ${compileResultVar(node.id)} = await oauth2SamlExchange(${compileResultVar(node.id)}_cred.idpUrl, ${compileResultVar(node.id)}_cred.tokenServiceUrl, ${compileResultVar(node.id)}_cred.clientId, ${compileResultVar(node.id)}_cred.userId, ${compileResultVar(node.id)}_cred.companyId, ${compileResultVar(node.id)}_cred.privateKey);`,
    ...compileFrom("exec-out"),
  ],
  compileExecuteOutputs: ({ node }) => {
    const v = compileResultVar(node.id);
    return {
      success: `${v}.success`,
      auth: `${v}.auth`,
      accessToken: `${v}.accessToken`,
      expiresIn: `${v}.expiresIn`,
      status: `${v}.status`,
      error: `${v}.error`,
    };
  },
  compileHelpers: {
    oauth2SamlExchange: OAUTH2_SAML_EXCHANGE_SOURCE,
    credentialFromEnv: CREDENTIAL_FROM_ENV_SOURCE,
  },
});
