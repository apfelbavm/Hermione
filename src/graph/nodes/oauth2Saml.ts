import { NodeColorCategory } from "../engine/types";
import { registerNode } from "../engine/registry";
import { compileResultVar, FUNCTION_LIBRARY_IMPORT } from "../engine/compileUtils";
import type { Oauth2SamlBearerCredentialData } from "../../credentials/types";
import { oauth2SamlExchange, type Oauth2SamlExchangeOutputs } from "../../server/functionLibrary";
import { i18n } from "@i18n";

function failResult(error: string): Oauth2SamlExchangeOutputs {
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
    { id: "credentialName", label: i18n.nodes.auth.oauth2Saml.pin_credential_name, type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: i18n.nodes.__shared.pin_completed, type: "exec", direction: "output" },
    { id: "success", label: i18n.nodes.__shared.pin_success, type: "boolean", direction: "output" },
    { id: "auth", label: i18n.nodes.__shared.pin_auth, type: "object", direction: "output" },
    { id: "accessToken", label: i18n.nodes.auth.oauth2Saml.pin_access_token, type: "string", direction: "output" },
    { id: "expiresIn", label: i18n.nodes.auth.oauth2Saml.pin_expires_in, type: "number", direction: "output" },
    { id: "status", label: i18n.nodes.__shared.pin_status, type: "number", direction: "output" },
    { id: "error", label: i18n.nodes.__shared.pin_error, type: "string", direction: "output" },
  ],
  latent: true,
  // The in-editor Run executes fetch() from the browser page itself, so a target server that
  // doesn't send CORS headers back (true of most server-to-server OAuth endpoints, including
  // SuccessFactors' — they're built for Postman/backend callers, not page JS) blocks the response
  // outright with a NetworkError, independent of anything this file does. Compiling the graph and
  // running the output under plain Node sidesteps that entirely, since CORS is purely a
  // browser-enforced restriction — which is this node's actual reason for having
  // compileExecute/compileExecuteOutputs at all, where its sibling auth.oauth2ClientCredentials and
  // http.request still don't.
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
    const result = await oauth2SamlExchange({
      idpUrl: data.idpUrl,
      tokenServiceUrl: data.tokenServiceUrl,
      clientId: data.clientId,
      userId: data.userId,
      companyId: data.companyId,
      privateKey: data.privateKey,
    });
    return { nextExec: "exec-out", outputs: result };
  },
  // The compiled (standalone .mjs) path has no access to the Credential Vault database — only the
  // interpreter, running inside /api/simulate/route.ts, can reach that (see execute above) — so it
  // reads the same credential's fields from environment variables instead via
  // functionLibrary.credentialFromEnv, a genuinely different credential-sourcing behavior, not
  // duplicated logic (see that function's own doc comment).
  compileExecute: ({ node, inputs, compileFrom }) => [
    `const ${compileResultVar(node.id)}_cred = functionLibrary.credentialFromEnv(${inputs.credentialName});`,
    `const ${compileResultVar(node.id)} = await functionLibrary.oauth2SamlExchange(${compileResultVar(node.id)}_cred);`,
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
  compileImports: [FUNCTION_LIBRARY_IMPORT],
});
