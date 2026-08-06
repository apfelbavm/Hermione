import forge from "node-forge";
import * as openpgp from "openpgp";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import XMLBuilder from "fast-xml-builder";
import * as Papa from "papaparse";
import { XML_PARSE_OPTIONS, XML_PRETTY_BUILD_OPTIONS } from "../graph/nodes/dataFormatHelpers.ts";

/** The single home for every node type's actual runtime logic — the ONE place it's written, called
 * directly both by the interpreter (see graph/nodes/crypto.ts's execute) and, via a real ESM import,
 * by a deployed/compiled flow script (see graph/engine/compileUtils.ts's FUNCTION_LIBRARY_IMPORT).
 * Deliberately has zero editor-only dependencies (no i18n, no registerNode, no NodeInstance) so a
 * compiled script's import of this file pulls in only real runtime logic, nothing else. Runs under
 * plain Node with no build/transpile step, given NODE_OPTIONS=--experimental-strip-types (see
 * package.json's dev/start scripts) — Node 22.6+ executes this .ts file's syntax directly. */

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export interface PgpEncryptInputs {
  plaintext: string;
  publicKeyArmored: string;
  autoDetectSettings: boolean;
  symmetricAlgorithm: string;
  compressionAlgorithm: string;
  aeadProtect: boolean;
  aeadAlgorithm: string;
  showVersion: boolean;
  versionString: string;
  showComment: boolean;
  commentString: string;
}

export interface PgpEncryptOutputs {
  encryptedArmored: string;
  success: boolean;
  error: string;
  [key: string]: unknown;
}

export async function pgpEncrypt(inputs: PgpEncryptInputs): Promise<PgpEncryptOutputs> {
  try {
    const publicKey = await openpgp.readKey({ armoredKey: String(inputs.publicKeyArmored ?? "") });
    const message = await openpgp.createMessage({ text: String(inputs.plaintext ?? "") });
    const config = inputs.autoDetectSettings
      ? undefined
      : {
          preferredSymmetricAlgorithm: openpgp.enums.symmetric[String(inputs.symmetricAlgorithm) as keyof typeof openpgp.enums.symmetric],
          preferredCompressionAlgorithm: openpgp.enums.compression[String(inputs.compressionAlgorithm) as keyof typeof openpgp.enums.compression],
          aeadProtect: Boolean(inputs.aeadProtect),
          preferredAEADAlgorithm: openpgp.enums.aead[String(inputs.aeadAlgorithm) as keyof typeof openpgp.enums.aead],
          showVersion: Boolean(inputs.showVersion),
          versionString: String(inputs.versionString ?? ""),
          showComment: Boolean(inputs.showComment),
          commentString: String(inputs.commentString ?? ""),
        };
    const encryptedArmored = await openpgp.encrypt({ message, encryptionKeys: publicKey, config });
    return { encryptedArmored, success: true, error: "" };
  } catch (err) {
    return { encryptedArmored: "", success: false, error: errorMessage(err) };
  }
}

export interface PgpDecryptInputs {
  encryptedArmored: string;
  privateKeyArmored: string;
  passphrase: string;
  autoDetectSettings: boolean;
  allowUnauthenticatedMessages: boolean;
  minRSABits: number;
}

export interface PgpDecryptOutputs {
  plaintext: string;
  success: boolean;
  error: string;
  [key: string]: unknown;
}

export async function pgpDecrypt(inputs: PgpDecryptInputs): Promise<PgpDecryptOutputs> {
  try {
    let privateKey = await openpgp.readPrivateKey({ armoredKey: String(inputs.privateKeyArmored ?? "") });
    const passphrase = String(inputs.passphrase ?? "");
    if (passphrase) privateKey = await openpgp.decryptKey({ privateKey, passphrase });
    const message = await openpgp.readMessage({ armoredMessage: String(inputs.encryptedArmored ?? "") });
    const config = inputs.autoDetectSettings
      ? undefined
      : {
          allowUnauthenticatedMessages: Boolean(inputs.allowUnauthenticatedMessages),
          minRSABits: Number(inputs.minRSABits),
        };
    const { data: plaintext } = await openpgp.decrypt({ message, decryptionKeys: privateKey, config });
    return { plaintext: String(plaintext), success: true, error: "" };
  } catch (err) {
    return { plaintext: "", success: false, error: errorMessage(err) };
  }
}

const PKCS7_CIPHER_OID_NAMES: Record<string, string> = {
  aes128: "aes128-CBC",
  aes192: "aes192-CBC",
  aes256: "aes256-CBC",
  "3des": "des-EDE3-CBC",
};

export interface Pkcs7EncryptInputs {
  plaintext: string;
  recipientCertPem: string;
  autoDetectSettings: boolean;
  cipherAlgorithm: string;
}

export interface Pkcs7EncryptOutputs {
  envelopedDataPem: string;
  success: boolean;
  error: string;
  [key: string]: unknown;
}

export function pkcs7Encrypt(inputs: Pkcs7EncryptInputs): Pkcs7EncryptOutputs {
  try {
    const cert = forge.pki.certificateFromPem(String(inputs.recipientCertPem ?? ""));
    const p7 = forge.pkcs7.createEnvelopedData();
    p7.addRecipient(cert);
    p7.content = forge.util.createBuffer(forge.util.encodeUtf8(String(inputs.plaintext ?? "")));
    if (inputs.autoDetectSettings) {
      p7.encrypt();
    } else {
      const oidName = PKCS7_CIPHER_OID_NAMES[String(inputs.cipherAlgorithm)];
      p7.encrypt(undefined, forge.pki.oids[oidName]);
    }
    // @types/node-forge types messageToPem as accepting only PkcsSignedData — it works identically
    // for PkcsEnvelopedData at runtime (both just serialize via .toAsn1()); the .d.ts is just narrow.
    const envelopedDataPem = forge.pkcs7.messageToPem(p7 as unknown as forge.pkcs7.PkcsSignedData);
    return { envelopedDataPem, success: true, error: "" };
  } catch (err) {
    return { envelopedDataPem: "", success: false, error: errorMessage(err) };
  }
}

export interface Pkcs7DecryptInputs {
  envelopedDataPem: string;
  privateKeyPem: string;
}

export interface Pkcs7DecryptOutputs {
  plaintext: string;
  success: boolean;
  error: string;
  [key: string]: unknown;
}

/** Decrypts against the envelope's first RecipientInfo — matches what pkcs7Encrypt itself always
 * produces (exactly one recipient); a multi-recipient envelope from elsewhere would need its own
 * matching-certificate input to pick the right one via forge's own p7.findRecipient(cert). */
export function pkcs7Decrypt(inputs: Pkcs7DecryptInputs): Pkcs7DecryptOutputs {
  try {
    const message = forge.pkcs7.messageFromPem(String(inputs.envelopedDataPem ?? "")) as forge.pkcs7.PkcsEnvelopedData;
    const privateKey = forge.pki.privateKeyFromPem(String(inputs.privateKeyPem ?? ""));
    const recipient = message.recipients[0];
    if (!recipient) throw new Error("Enveloped data has no recipients");
    message.decrypt(recipient, privateKey);
    const plaintext = forge.util.decodeUtf8((message.content as forge.util.ByteStringBuffer).getBytes());
    return { plaintext, success: true, error: "" };
  } catch (err) {
    return { plaintext: "", success: false, error: errorMessage(err) };
  }
}

export interface HttpRequestInputs {
  url: string;
  method: string;
  headersJson: string;
  auth: { header?: unknown; value?: unknown } | null | undefined;
  body: string;
  timeoutMs: number;
}

export interface HttpRequestOutputs {
  status: number;
  success: boolean;
  responseBody: string;
  responseHeaders: string;
  error: string;
  [key: string]: unknown;
}

export async function httpRequest(inputs: HttpRequestInputs): Promise<HttpRequestOutputs> {
  const method = String(inputs.method ?? "GET").toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";
  const timeoutMs = Math.round(Number(inputs.timeoutMs ?? 0));

  const controller = new AbortController();
  const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : undefined;

  try {
    const rawHeaders = String(inputs.headersJson ?? "").trim();
    const headers = rawHeaders ? JSON.parse(rawHeaders) : undefined;

    // See graph/nodes/auth.ts — any wired auth node's { header, value } output wins over a
    // same-named entry typed directly into Headers (JSON), since it's the more explicit/intentional
    // of the two.
    const auth = inputs.auth;
    const mergedHeaders = auth && typeof auth.header === "string" && typeof auth.value === "string" ? { ...(headers ?? {}), [auth.header]: auth.value } : headers;

    const res = await fetch(inputs.url, {
      method,
      headers: mergedHeaders,
      body: hasBody ? String(inputs.body ?? "") : undefined,
      signal: controller.signal,
    });
    const responseBody = await res.text();
    const responseHeaders: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return {
      status: res.status,
      success: res.ok,
      responseBody,
      responseHeaders: JSON.stringify(responseHeaders),
      error: "",
    };
  } catch (err) {
    return {
      status: 0,
      success: false,
      responseBody: "",
      responseHeaders: "{}",
      error: errorMessage(err),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Uses the standard Web Crypto API (globalThis.crypto.subtle) rather than node:crypto's HMAC —
 * available in both Node (18+) and the browser, so this stays safe for the interpreter's own
 * client-side use of this file (see webhook.ts's execute), same reasoning as this file avoiding any
 * Node-only import elsewhere. */
async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export interface SendWebhookInputs {
  url: string;
  payloadJson: string;
  headersJson: string;
  secret: string;
  signatureHeader: string;
  retryCount: number;
  retryDelayMsBase: number;
  timeoutMs: number;
}

export interface SendWebhookOutputs {
  success: boolean;
  status: number;
  responseBody: string;
  attempts: number;
  error: string;
  [key: string]: unknown;
}

/** POSTs a JSON payload to an external URL with two things a plain http.request doesn't offer:
 * optional HMAC-SHA256 request signing (so the receiver can verify the call really came from this
 * Flow) and a bounded retry loop with linear backoff (attempt N waits retryDelayMsBase * N ms)
 * for transient failures. `attempts` in the output is always the number of requests actually sent
 * (1 when it succeeds on the first try), so a graph can tell a flaky success from a first-try one. */
export async function sendWebhook(inputs: SendWebhookInputs): Promise<SendWebhookOutputs> {
  const body = String(inputs.payloadJson ?? "");
  const timeoutMs = Math.round(Number(inputs.timeoutMs ?? 0));
  const retryCount = Math.max(0, Math.round(Number(inputs.retryCount ?? 0)));
  const retryDelayMsBase = Math.max(0, Math.round(Number(inputs.retryDelayMsBase ?? 0)));

  const rawHeaders = String(inputs.headersJson ?? "").trim();
  const headers: Record<string, string> = rawHeaders ? JSON.parse(rawHeaders) : {};
  if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";

  const secret = String(inputs.secret ?? "");
  if (secret) {
    headers[String(inputs.signatureHeader || "X-Hermione-Signature")] = await hmacSha256Hex(secret, body);
  }

  let lastError = "";
  const maxAttempts = retryCount + 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
    try {
      const res = await fetch(inputs.url, { method: "POST", headers, body, signal: controller.signal });
      const responseBody = await res.text();
      if (res.ok) return { success: true, status: res.status, responseBody, attempts: attempt, error: "" };
      lastError = `HTTP ${res.status}`;
      if (attempt === maxAttempts) return { success: false, status: res.status, responseBody, attempts: attempt, error: lastError };
    } catch (err) {
      lastError = errorMessage(err);
      if (attempt === maxAttempts) return { success: false, status: 0, responseBody: "", attempts: attempt, error: lastError };
    } finally {
      if (timer) clearTimeout(timer);
    }
    await delay(retryDelayMsBase * attempt);
  }
  return { success: false, status: 0, responseBody: "", attempts: maxAttempts, error: lastError };
}

function formatCsvTable(csv: string): string {
  const rows = (Papa.parse<string[]>(csv, { delimiter: "," }).data ?? []) as string[][];
  if (rows.length === 0) return csv;
  const colCount = Math.max(...rows.map((r) => r.length));
  const widths = Array.from({ length: colCount }, (_, i) => Math.max(...rows.map((r) => (r[i] ?? "").length)));
  return rows
    .map((row) =>
      Array.from({ length: colCount }, (_, i) => (row[i] ?? "").padEnd(widths[i]))
        .join("  ")
        .trimEnd(),
    )
    .join("\n");
}

/** Compile-time counterpart of debug.print's plain rt.log(message) — reformats the message per the
 * node's own Format pin (json/xml/csv/text) before logging, falling back to the raw message if it
 * doesn't actually parse as that format. */
export function formatForLog(message: string, format: string): string {
  try {
    if (format === "json") return JSON.stringify(JSON.parse(message), null, 2);
    if (format === "xml") {
      const validation = XMLValidator.validate(message);
      if (validation !== true) return message;
      return new XMLBuilder(XML_PRETTY_BUILD_OPTIONS).build(new XMLParser(XML_PARSE_OPTIONS).parse(message)).trimEnd();
    }
    if (format === "csv") return formatCsvTable(message);
    return message;
  } catch {
    return message;
  }
}

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

function oauth2SamlFail(status: number, error: string): Oauth2SamlExchangeOutputs {
  return { success: false, auth: null, accessToken: "", expiresIn: 0, status, error };
}

/** SAML 2.0 Bearer Assertion exchange (RFC 7522 grant type) — the assertion itself is NOT built or
 * signed locally; matches systems (e.g. SAP SuccessFactors-style integrations) where generating the
 * signed assertion is itself a server-side call: POST client_id/user_id/token_url/private_key to a
 * dedicated "IdP" endpoint and get back a ready-to-use assertion as plain text. Only the second leg
 * — exchanging that assertion for an access token — happens here, a standard OAuth2 token request
 * (grant_type=urn:ietf:params:oauth:grant-type:saml2-bearer). Credential SOURCING (Credential Vault
 * vs. environment variables) deliberately stays outside this function — see graph/nodes/oauth2Saml.ts's
 * execute (vault lookup) and compileExecute (credentialFromEnv below) — since interpreter and compiled
 * paths genuinely differ there, not just duplicated. */
export async function oauth2SamlExchange(inputs: Oauth2SamlExchangeInputs): Promise<Oauth2SamlExchangeOutputs> {
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
      return oauth2SamlFail(assertionRes.status, assertion || `Assertion endpoint returned ${assertionRes.status}`);
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
      return oauth2SamlFail(tokenRes.status, responseText || `Token endpoint returned ${tokenRes.status}`);
    }

    const parsed = JSON.parse(responseText);
    const accessToken = String(parsed.access_token ?? "");
    if (!accessToken) {
      return oauth2SamlFail(tokenRes.status, "Token endpoint response had no access_token");
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
    return oauth2SamlFail(0, errorMessage(err));
  }
}

export interface CredentialFromEnv {
  idpUrl: string;
  tokenServiceUrl: string;
  clientId: string;
  userId: string;
  companyId: string;
  privateKey: string;
}

/** Compile-time-only counterpart of oauth2Saml.ts's execute() vault lookup (ctx.getCredential) — the
 * compiled/deployed script has no access to the Credential Vault database, only the interpreter does
 * (see ExecutionContext.getCredential), so it reads the same credential's fields from environment
 * variables instead, named by sanitizing the credential's own name into an env-var-safe prefix: e.g.
 * "SuccessFactors Prod" -> HERMIONE_CRED_SUCCESSFACTORS_PROD_IDP_URL, _TOKEN_SERVICE_URL, etc. Never
 * called by the interpreter — genuinely different credential-sourcing behavior, not duplicated logic. */
export function credentialFromEnv(name: string): CredentialFromEnv {
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

export interface ODataV2RequestInputs {
  baseUrl: string;
  pageSize: number;
  paginationType: string;
  maxPages: number;
  headersJson: string;
  auth: { header?: unknown; value?: unknown } | null | undefined;
  timeoutMs: number;
}

export interface ODataV2RequestOutputs {
  success: boolean;
  status: number;
  rows: unknown[];
  pageCount: number;
  error: string;
  [key: string]: unknown;
}

/** Fetches EVERY page of an OData v2 GET request and returns the combined rows — unlike httpRequest
 * (one call, one response), pagination inherently needs a loop across several physical requests.
 * Paging conventions are chosen via `paginationType` (see enum/odata.ts's ODATA_PAGINATION_TYPE_ENUM_TYPE):
 *  - "Client": we drive the loop ourselves, appending "$top"/"$skip" to the given URL and stopping
 *    once a page comes back with fewer than pageSize rows.
 *  - "Server": the server drives it — each OData v2 JSON response carries its own "d.__next" (or
 *    "__next") URL for the next page; we just keep following it verbatim (it already encodes its
 *    own $skiptoken/paging state) until it's absent. */
export async function odataV2Request(inputs: ODataV2RequestInputs): Promise<ODataV2RequestOutputs> {
  const HARD_MAX_PAGES = 1000; // absolute ceiling regardless of maxPages, guards a misbehaving server
  // Falls back to 1000 — a generous default that matches the common OData v2 server-side default/
  // cap (e.g. SuccessFactors) — only when pageSize itself is unset/invalid; unrelated to
  // HARD_MAX_PAGES just above despite sharing the same number.
  const top = Math.max(1, Math.round(Number(inputs.pageSize)) || 1000);
  const userCap = Math.max(1, Math.round(Number(inputs.maxPages)) || 50);
  const cap = Math.min(userCap, HARD_MAX_PAGES);
  const serverDriven = inputs.paginationType !== "Client";
  const timeoutMs = Math.round(Number(inputs.timeoutMs) || 0);

  const rawHeaders = String(inputs.headersJson ?? "").trim();
  let mergedHeaders: Record<string, string> | undefined;
  try {
    const parsedHeaders = rawHeaders ? JSON.parse(rawHeaders) : undefined;
    const auth = inputs.auth;
    mergedHeaders = auth && typeof auth.header === "string" && typeof auth.value === "string" ? { ...parsedHeaders, [auth.header]: auth.value } : parsedHeaders;
  } catch (err) {
    return { success: false, status: 0, rows: [], pageCount: 0, error: `Headers (JSON) is not valid JSON: ${errorMessage(err)}` };
  }

  function withParam(url: string, key: string, value: unknown): string {
    const u = new URL(url);
    u.searchParams.set(key, String(value));
    // URLSearchParams percent-encodes "$" to "%24" — technically equivalent, but OData servers
    // conventionally expect "$top"/"$skip" sent unescaped, and not every server bothers to decode
    // its own query string before pattern-matching on it. Safe to undo globally: "%24" has no other
    // realistic source here (it's specific to the "$" this function itself just introduced).
    return u.toString().replace(/%24/g, "$");
  }

  function extractRows(parsed: any): unknown[] {
    const d = parsed && parsed.d;
    if (d && Array.isArray(d.results)) return d.results;
    if (Array.isArray(d)) return d;
    if (parsed && Array.isArray(parsed.value)) return parsed.value; // tolerate a v4-ish shape too
    return [];
  }

  function extractNextLink(parsed: any): string | null {
    const d = parsed && parsed.d;
    if (d && typeof d.__next === "string" && d.__next) return d.__next;
    if (parsed && typeof parsed.__next === "string" && parsed.__next) return parsed.__next;
    return null;
  }

  async function fetchOnePage(url: string): Promise<{ status: number; ok: boolean; bodyText: string; error?: string }> {
    const controller = new AbortController();
    const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
    try {
      const res = await fetch(url, { method: "GET", headers: mergedHeaders, signal: controller.signal });
      return { status: res.status, ok: res.ok, bodyText: await res.text() };
    } catch (err) {
      return { status: 0, ok: false, bodyText: "", error: errorMessage(err) };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  let rows: unknown[] = [];
  let page = 0;
  let status = 0;
  let nextUrl: string | null = serverDriven ? withParam(inputs.baseUrl, "$top", top) : withParam(withParam(inputs.baseUrl, "$top", top), "$skip", 0);

  while (nextUrl && page < cap) {
    const res = await fetchOnePage(nextUrl);
    status = res.status;
    if (!res.ok) {
      return { success: false, status, rows, pageCount: page, error: res.error || `HTTP ${res.status}` };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(res.bodyText);
    } catch {
      return { success: false, status, rows, pageCount: page, error: "OData response was not valid JSON" };
    }

    const pageRows = extractRows(parsed);
    rows = rows.concat(pageRows);
    page += 1;

    if (serverDriven) {
      nextUrl = extractNextLink(parsed);
    } else {
      nextUrl = pageRows.length < top ? null : withParam(withParam(inputs.baseUrl, "$top", top), "$skip", page * top);
    }
  }

  return { success: true, status, rows, pageCount: page, error: "" };
}
