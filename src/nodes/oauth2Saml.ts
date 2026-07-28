import * as xmldsigjs from "xmldsigjs";
import { registerNode } from "../engine/registry";

// RFC 7522 (SAML 2.0 Bearer Assertion for OAuth 2.0): build a signed SAML assertion and exchange
// it with a token endpoint for a bearer access token. Unlike auth.basic (a pure, synchronous
// node), this is genuinely LATENT — building the assertion means real RSA-SHA256 signing over the
// canonicalized XML (Web Crypto), and the exchange itself is a real network round trip, exactly
// like http.request. Its output is the SAME { header, value } shape auth.basic produces, so it
// plugs into HTTP Request's Auth pin (or a future connection node's) identically, and — per the
// same reasoning documented in auth.ts — every credential here (privateKeyPem, clientId/Secret) is
// an ordinary wireable string pin, so a future "Key Vault" lookup-by-name node can feed them in
// place of a literal just as well.
//
// xmldsigjs auto-detects its environment (see its own Application/xml-core internals): in a real
// browser it uses native DOMParser/XMLSerializer/WebCrypto automatically, no setup needed here —
// this file deliberately imports NOTHING Node-specific (no @xmldom/xmldom, no xpath) so the
// browser bundle stays exactly as lean as if this node only depended on xmldsigjs itself. The
// Node-only wiring those two packages provide (needed to run this same code under vitest) lives
// entirely in oauth2Saml.test.ts's own setup, never here.

// "System Type" mirrors the same dropdown SAP BTP destinations / CPI's OAuth2SAMLBearerAssertion
// credential artifact use — each target shapes the assertion/token request slightly differently.
// "generic" (the default — the plain RFC 7522 shape this node originally only supported) and
// SuccessFactors are the two concretely implemented below; SuccessFactors needs a "companyId" SAML
// Attribute the generic shape has no room for, plus company_id/client_id as explicit token-request
// form fields. "btp-neo"/"btp-cf" are accepted but currently behave exactly like "generic" — their
// specific quirks aren't confirmed yet, so treat them as unimplemented rather than assume they're
// correct until someone's actually verified the wire format against BTP.
const SYSTEM_TYPES = ["generic", "successfactors", "btp-neo", "btp-cf"];

interface AssertionParams {
  issuer: string;
  subject: string;
  audience: string;
  tokenEndpoint: string;
  validitySeconds: number;
  /** SuccessFactors-only: embedded as a SAML <Attribute Name="companyId"> — see SYSTEM_TYPES. */
  companyId?: string;
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function importSigningKey(privateKeyPem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function buildAssertionXml(id: string, params: AssertionParams): string {
  const now = new Date();
  const notBefore = now.toISOString();
  const notOnOrAfter = new Date(now.getTime() + params.validitySeconds * 1000).toISOString();

  const attributeStatement = params.companyId
    ? `<saml2:AttributeStatement><saml2:Attribute Name="companyId"><saml2:AttributeValue>${params.companyId}</saml2:AttributeValue></saml2:Attribute></saml2:AttributeStatement>`
    : "";

  return (
    `<saml2:Assertion xmlns:saml2="urn:oasis:names:tc:SAML:2.0:assertion" ID="${id}" IssueInstant="${notBefore}" Version="2.0">` +
    `<saml2:Issuer>${params.issuer}</saml2:Issuer>` +
    `<saml2:Subject>` +
    `<saml2:NameID>${params.subject}</saml2:NameID>` +
    `<saml2:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">` +
    `<saml2:SubjectConfirmationData NotOnOrAfter="${notOnOrAfter}" Recipient="${params.tokenEndpoint}"/>` +
    `</saml2:SubjectConfirmation>` +
    `</saml2:Subject>` +
    `<saml2:Conditions NotBefore="${notBefore}" NotOnOrAfter="${notOnOrAfter}">` +
    `<saml2:AudienceRestriction><saml2:Audience>${params.audience}</saml2:Audience></saml2:AudienceRestriction>` +
    `</saml2:Conditions>` +
    attributeStatement +
    `</saml2:Assertion>`
  );
}

/** Signs the assertion (enveloped RSA-SHA256 signature over the Exclusive-C14N-canonicalized
 * document — the shape real identity providers expect for a SAML bearer assertion) and returns
 * the final signed XML string, ready to base64url-encode. */
async function signAssertion(assertionXml: string, privateKey: CryptoKey): Promise<string> {
  const doc = xmldsigjs.Parse(assertionXml);
  const signedXml = new xmldsigjs.SignedXml();
  await signedXml.Sign({ name: "RSASSA-PKCS1-v1_5" }, privateKey, doc, {
    references: [{ hash: "SHA-256", transforms: ["enveloped", "exc-c14n"] }],
  });
  doc.documentElement!.appendChild(signedXml.XmlSignature.GetXml()!);
  return xmldsigjs.Stringify(doc);
}

function base64Url(input: string): string {
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

registerNode({
  type: "auth.oauth2Saml",
  label: "OAuth2 SAML Bearer",
  group: "Auth",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    {
      id: "systemType",
      label: "System Type",
      type: "string",
      direction: "input",
      defaultValue: SYSTEM_TYPES[0],
      options: SYSTEM_TYPES,
    },
    { id: "tokenEndpoint", label: "Token Endpoint", type: "string", direction: "input", defaultValue: "" },
    { id: "issuer", label: "Issuer", type: "string", direction: "input", defaultValue: "" },
    { id: "subject", label: "Subject", type: "string", direction: "input", defaultValue: "" },
    // Empty means "default to the token endpoint" — the common case per RFC 7522.
    { id: "audience", label: "Audience", type: "string", direction: "input", defaultValue: "" },
    { id: "privateKeyPem", label: "Private Key (PEM)", type: "string", direction: "input", defaultValue: "" },
    { id: "clientId", label: "Client ID", type: "string", direction: "input", defaultValue: "" },
    { id: "clientSecret", label: "Client Secret", type: "string", direction: "input", defaultValue: "" },
    { id: "scope", label: "Scope", type: "string", direction: "input", defaultValue: "" },
    // SuccessFactors-only (see SYSTEM_TYPES) — ignored for every other System Type.
    { id: "companyId", label: "Company ID", type: "string", direction: "input", defaultValue: "" },
    {
      id: "assertionValiditySeconds",
      label: "Assertion Validity (s)",
      type: "number",
      direction: "input",
      defaultValue: 300,
      integer: true,
    },
    { id: "exec-out", label: "Completed", type: "exec", direction: "output" },
    { id: "success", label: "Success", type: "boolean", direction: "output" },
    // Same { header, value } shape auth.basic produces — see this file's header comment.
    { id: "auth", label: "Auth", type: "object", direction: "output" },
    { id: "accessToken", label: "Access Token", type: "string", direction: "output" },
    { id: "expiresIn", label: "Expires In (s)", type: "number", direction: "output" },
    { id: "error", label: "Error", type: "string", direction: "output" },
  ],
  latent: true,
  execute: async ({ inputs }) => {
    const systemType = String(inputs.systemType ?? SYSTEM_TYPES[0]);
    const tokenEndpoint = String(inputs.tokenEndpoint ?? "");
    const audience = String(inputs.audience ?? "").trim() || tokenEndpoint;
    const validitySeconds = Math.max(1, Math.round(Number(inputs.assertionValiditySeconds ?? 300)));
    const issuer = String(inputs.issuer ?? "");
    const companyId = String(inputs.companyId ?? "").trim();
    const isSuccessFactors = systemType === "successfactors";

    try {
      const privateKey = await importSigningKey(String(inputs.privateKeyPem ?? ""));
      const assertionId = `_${crypto.randomUUID().replace(/-/g, "")}`;
      const assertionXml = buildAssertionXml(assertionId, {
        issuer,
        subject: String(inputs.subject ?? ""),
        audience,
        tokenEndpoint,
        validitySeconds,
        companyId: isSuccessFactors && companyId ? companyId : undefined,
      });
      const signedAssertion = await signAssertion(assertionXml, privateKey);

      const body = new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:saml2-bearer",
        assertion: base64Url(signedAssertion),
      });
      // SuccessFactors' token endpoint expects company_id/client_id as explicit form fields
      // alongside the assertion (the assertion's own Issuer/companyId Attribute aren't enough on
      // their own) — client_id defaults to Issuer since that's what SF's Issuer value actually is
      // (the OAuth client/API key), so the common case doesn't need wiring the same value twice.
      const clientId = String(inputs.clientId ?? "").trim() || (isSuccessFactors ? issuer : "");
      const clientSecret = String(inputs.clientSecret ?? "").trim();
      const scope = String(inputs.scope ?? "").trim();
      if (clientId) body.set("client_id", clientId);
      if (clientSecret) body.set("client_secret", clientSecret);
      if (scope) body.set("scope", scope);
      if (isSuccessFactors && companyId) body.set("company_id", companyId);

      const res = await fetch(tokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      const responseText = await res.text();

      if (!res.ok) {
        return {
          nextExec: "exec-out",
          outputs: { success: false, auth: null, accessToken: "", expiresIn: 0, error: `Token endpoint returned ${res.status}: ${responseText}` },
        };
      }

      const parsed = JSON.parse(responseText) as { access_token?: unknown; expires_in?: unknown };
      const accessToken = String(parsed.access_token ?? "");
      if (!accessToken) {
        return {
          nextExec: "exec-out",
          outputs: { success: false, auth: null, accessToken: "", expiresIn: 0, error: "Token endpoint response had no access_token" },
        };
      }
      const expiresIn = Number(parsed.expires_in ?? 0);

      return {
        nextExec: "exec-out",
        outputs: {
          success: true,
          auth: { header: "Authorization", value: `Bearer ${accessToken}` },
          accessToken,
          expiresIn,
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
          error: err instanceof Error ? err.message : String(err),
        },
      };
    }
  },
  // Compiler support (compileExecute) is intentionally out of scope for now, same call as
  // http.request — this node has data outputs beyond a single result, which no exec node
  // compiles yet. Compiling a graph containing one throws the existing "no compileExecute" error.
});
