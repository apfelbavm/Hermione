import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as xmldom from "@xmldom/xmldom";
import * as xmldsigjs from "xmldsigjs";
import xpath from "xpath";
import { setNodeDependencies } from "xml-core";
import { registerBuiltins } from "./index";
import { createExecutionContext, runExecFrom } from "../engine/executor";
import { createNodeInstance } from "../engine/graphMutations";
import { getNodeDef } from "../engine/registry";
import { createEmptyGraph, type Graph } from "../engine/types";

// xmldsigjs auto-detects a real browser (native DOMParser/XMLSerializer/WebCrypto) at import time
// — this Node-only wiring is exactly what a browser never needs, which is why oauth2Saml.ts itself
// never imports @xmldom/xmldom/xpath (see its own header comment). Vitest runs under plain Node,
// so this test file supplies it once, here.
setNodeDependencies({
  XMLSerializer: xmldom.XMLSerializer,
  DOMParser: xmldom.DOMParser,
  DOMImplementation: xmldom.DOMImplementation,
  xpath,
});
xmldsigjs.Application.setEngine("NodeJS", globalThis.crypto as unknown as Crypto);

beforeAll(() => {
  registerBuiltins();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function generateTestKeyPair() {
  const keys = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", keys.privateKey);
  const base64 = Buffer.from(pkcs8).toString("base64");
  const lines = base64.match(/.{1,64}/g)!.join("\n");
  const pem = `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----`;
  return { publicKey: keys.publicKey, privateKeyPem: pem };
}

function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

/** Verifies a signed SAML assertion XML string against a public key, treating a thrown digest/
 * signature error (xmldsigjs's own failure mode) the same as a returned `false`. */
async function verifyAssertion(assertionXml: string, publicKey: CryptoKey): Promise<boolean> {
  try {
    const doc = xmldsigjs.Parse(assertionXml);
    const sigs = doc.getElementsByTagNameNS("http://www.w3.org/2000/09/xmldsig#", "Signature");
    if (sigs.length === 0) return false;
    const verifier = new xmldsigjs.SignedXml(doc);
    verifier.LoadXml(sigs[0]);
    return await verifier.Verify(publicKey);
  } catch {
    return false;
  }
}

function buildGraph(pinValues: Record<string, unknown>) {
  const graph: Graph = createEmptyGraph("g", "test");
  const def = getNodeDef("auth.oauth2Saml");
  const node = createNodeInstance("auth.oauth2Saml", { x: 0, y: 0 }, def.pins, "oauth");
  for (const [id, value] of Object.entries(pinValues)) {
    node.pins[id].value = value;
  }
  graph.nodes.push(node);
  return { graph, node };
}

describe("auth.oauth2Saml", () => {
  it("signs a genuinely valid SAML assertion and exchanges it for a bearer token", async () => {
    const { publicKey, privateKeyPem } = await generateTestKeyPair();

    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      status: 200,
      ok: true,
      text: async () => JSON.stringify({ access_token: "abc123", expires_in: 3600, token_type: "Bearer" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { graph } = buildGraph({
      tokenEndpoint: "https://idp.example.com/oauth2/token",
      issuer: "my-client-app",
      subject: "alice@example.com",
      privateKeyPem,
    });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("oauth", "exec-in", ctx);

    expect(ctx.execOutputs.get("oauth:success")).toBe(true);
    expect(ctx.execOutputs.get("oauth:accessToken")).toBe("abc123");
    expect(ctx.execOutputs.get("oauth:expiresIn")).toBe(3600);
    expect(ctx.execOutputs.get("oauth:auth")).toEqual({ header: "Authorization", value: "Bearer abc123" });

    // Pull the assertion actually sent to the token endpoint back out and verify it for real —
    // proves the node's own signing path (not just the prototype) produces a genuine, correctly
    // canonicalized-and-signed XML-DSig signature, not merely "no exception was thrown".
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const body = new URLSearchParams(init!.body as string);
    expect(body.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:saml2-bearer");
    const assertionXml = decodeBase64Url(body.get("assertion")!);
    expect(assertionXml).toContain("alice@example.com");

    await expect(verifyAssertion(assertionXml, publicKey)).resolves.toBe(true);

    // Tampering with the exchanged assertion must break verification — otherwise the "signature"
    // wouldn't actually be protecting anything.
    const tampered = assertionXml.replace("alice@example.com", "mallory@example.com");
    await expect(verifyAssertion(tampered, publicKey)).resolves.toBe(false);
  });

  it("defaults Audience to the token endpoint when left blank", async () => {
    const { privateKeyPem } = await generateTestKeyPair();
    let capturedAssertion = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = new URLSearchParams(init!.body as string);
        capturedAssertion = decodeBase64Url(body.get("assertion")!);
        return { status: 200, ok: true, text: async () => JSON.stringify({ access_token: "t", expires_in: 60 }) };
      }),
    );

    const { graph } = buildGraph({
      tokenEndpoint: "https://idp.example.com/token",
      issuer: "app",
      subject: "bob",
      privateKeyPem,
    });
    await runExecFrom("oauth", "exec-in", createExecutionContext(graph, { log: () => {} }));

    expect(capturedAssertion).toContain("<saml2:Audience>https://idp.example.com/token</saml2:Audience>");
  });

  it("includes client_id/client_secret/scope in the token request only when provided", async () => {
    const { privateKeyPem } = await generateTestKeyPair();
    let capturedBody = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        capturedBody = init!.body as string;
        return { status: 200, ok: true, text: async () => JSON.stringify({ access_token: "t", expires_in: 60 }) };
      }),
    );

    const { graph } = buildGraph({
      tokenEndpoint: "https://idp.example.com/token",
      issuer: "app",
      subject: "bob",
      privateKeyPem,
      clientId: "client-1",
      clientSecret: "shh",
      scope: "read write",
    });
    await runExecFrom("oauth", "exec-in", createExecutionContext(graph, { log: () => {} }));

    const params = new URLSearchParams(capturedBody);
    expect(params.get("client_id")).toBe("client-1");
    expect(params.get("client_secret")).toBe("shh");
    expect(params.get("scope")).toBe("read write");
  });

  describe("System Type: successfactors", () => {
    it("embeds companyId as a SAML Attribute and sends company_id/client_id (defaulted from issuer) in the token request", async () => {
      const { privateKeyPem } = await generateTestKeyPair();
      let capturedAssertion = "";
      let capturedBody = "";
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string, init?: RequestInit) => {
          capturedBody = init!.body as string;
          const body = new URLSearchParams(capturedBody);
          capturedAssertion = decodeBase64Url(body.get("assertion")!);
          return { status: 200, ok: true, text: async () => JSON.stringify({ access_token: "t", expires_in: 60 }) };
        }),
      );

      const { graph } = buildGraph({
        systemType: "successfactors",
        tokenEndpoint: "https://api.successfactors.com/oauth/token",
        issuer: "sf-api-key",
        subject: "jsmith",
        audience: "www.successfactors.com",
        privateKeyPem,
        companyId: "SFCOMPANY1",
      });
      await runExecFrom("oauth", "exec-in", createExecutionContext(graph, { log: () => {} }));

      expect(capturedAssertion).toContain('<saml2:Attribute Name="companyId">');
      expect(capturedAssertion).toContain("<saml2:AttributeValue>SFCOMPANY1</saml2:AttributeValue>");

      const params = new URLSearchParams(capturedBody);
      expect(params.get("company_id")).toBe("SFCOMPANY1");
      // client_id wasn't wired explicitly, so it falls back to Issuer (SF's Issuer IS the API key).
      expect(params.get("client_id")).toBe("sf-api-key");
    });

    it("an explicitly wired Client ID still wins over the Issuer fallback", async () => {
      const { privateKeyPem } = await generateTestKeyPair();
      let capturedBody = "";
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string, init?: RequestInit) => {
          capturedBody = init!.body as string;
          return { status: 200, ok: true, text: async () => JSON.stringify({ access_token: "t", expires_in: 60 }) };
        }),
      );

      const { graph } = buildGraph({
        systemType: "successfactors",
        tokenEndpoint: "https://api.successfactors.com/oauth/token",
        issuer: "sf-api-key",
        subject: "jsmith",
        privateKeyPem,
        companyId: "SFCOMPANY1",
        clientId: "explicit-client",
      });
      await runExecFrom("oauth", "exec-in", createExecutionContext(graph, { log: () => {} }));

      expect(new URLSearchParams(capturedBody).get("client_id")).toBe("explicit-client");
    });

    it("does not add companyId/company_id when left blank, even for successfactors", async () => {
      const { privateKeyPem } = await generateTestKeyPair();
      let capturedAssertion = "";
      let capturedBody = "";
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string, init?: RequestInit) => {
          capturedBody = init!.body as string;
          const body = new URLSearchParams(capturedBody);
          capturedAssertion = decodeBase64Url(body.get("assertion")!);
          return { status: 200, ok: true, text: async () => JSON.stringify({ access_token: "t", expires_in: 60 }) };
        }),
      );

      const { graph } = buildGraph({
        systemType: "successfactors",
        tokenEndpoint: "https://api.successfactors.com/oauth/token",
        issuer: "sf-api-key",
        subject: "jsmith",
        privateKeyPem,
      });
      await runExecFrom("oauth", "exec-in", createExecutionContext(graph, { log: () => {} }));

      expect(capturedAssertion).not.toContain("companyId");
      expect(new URLSearchParams(capturedBody).get("company_id")).toBe(null);
    });
  });

  it("reports a non-2xx token endpoint response as an error instead of throwing", async () => {
    const { privateKeyPem } = await generateTestKeyPair();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ status: 400, ok: false, text: async () => '{"error":"invalid_grant"}' })),
    );

    const { graph } = buildGraph({
      tokenEndpoint: "https://idp.example.com/token",
      issuer: "app",
      subject: "bob",
      privateKeyPem,
    });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("oauth", "exec-in", ctx);

    expect(ctx.execOutputs.get("oauth:success")).toBe(false);
    expect(ctx.execOutputs.get("oauth:auth")).toBe(null);
    expect(String(ctx.execOutputs.get("oauth:error"))).toContain("400");
  });

  it("reports a malformed private key as an error instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 200, ok: true, text: async () => "{}" })));

    const { graph } = buildGraph({
      tokenEndpoint: "https://idp.example.com/token",
      issuer: "app",
      subject: "bob",
      privateKeyPem: "not a real key",
    });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("oauth", "exec-in", ctx);

    expect(ctx.execOutputs.get("oauth:success")).toBe(false);
    expect(String(ctx.execOutputs.get("oauth:error"))).not.toBe("");
  });

  it("reports a response with no access_token as an error", async () => {
    const { privateKeyPem } = await generateTestKeyPair();
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 200, ok: true, text: async () => "{}" })));

    const { graph } = buildGraph({
      tokenEndpoint: "https://idp.example.com/token",
      issuer: "app",
      subject: "bob",
      privateKeyPem,
    });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("oauth", "exec-in", ctx);

    expect(ctx.execOutputs.get("oauth:success")).toBe(false);
    expect(String(ctx.execOutputs.get("oauth:error"))).toContain("access_token");
  });
});
