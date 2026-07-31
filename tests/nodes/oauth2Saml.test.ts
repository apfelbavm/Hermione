import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { registerBuiltins } from "../../src/nodes/index";
import { createExecutionContext, runExecFrom } from "../../src/engine/executor";
import { getNodeDef } from "../../src/engine/registry";
import { Graph } from "../../src/engine/graph";
import { NodeInstance } from "../../src/engine/nodeInstance";
import type { CredentialRecord, Oauth2SamlBearerCredentialData } from "../../src/credentials/types";

beforeAll(() => {
  registerBuiltins();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function buildGraph(credentialName: string) {
  const graph: Graph = new Graph("g", "test");
  const def = getNodeDef("auth.oauth2Saml");
  const node = NodeInstance.createNodeInstance("auth.oauth2Saml", { x: 0, y: 0 }, def.pins, "saml");
  node.pins.credentialName.value = credentialName;
  graph.nodes.push(node);
  return { graph, node };
}

const CREDENTIAL_DATA: Oauth2SamlBearerCredentialData = {
  idpUrl: "https://idp.example.com/oauth/idp",
  tokenServiceUrl: "https://idp.example.com/oauth/token",
  clientId: "client-1",
  userId: "user-1",
  companyId: "company-1",
  privateKey: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
};

const TEST_CREDENTIAL: CredentialRecord = {
  id: "cred-1",
  name: "My SAML Credential",
  type: "oauth2SamlBearer",
  data: CREDENTIAL_DATA,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};

function getCredentialStub(name: string): CredentialRecord | undefined {
  return name === TEST_CREDENTIAL.name ? TEST_CREDENTIAL : undefined;
}

describe("auth.oauth2Saml", () => {
  it("posts client_id/user_id/token_url/private_key to the assertion endpoint, then exchanges the returned assertion at the token endpoint", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url === CREDENTIAL_DATA.idpUrl) {
        return new Response("signed-assertion-text", { status: 200 });
      }
      return new Response(JSON.stringify({ access_token: "tok-1", expires_in: 3600 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { graph } = buildGraph(TEST_CREDENTIAL.name);
    const ctx = createExecutionContext(graph, { log: () => {}, getCredential: getCredentialStub });
    await runExecFrom("saml", "exec-in", ctx);

    expect(ctx.execOutputs.get("saml:success")).toBe(true);
    expect(ctx.execOutputs.get("saml:accessToken")).toBe("tok-1");
    expect(ctx.execOutputs.get("saml:auth")).toEqual({ header: "Authorization", value: "Bearer tok-1" });
    expect(ctx.execOutputs.get("saml:expiresIn")).toBe(3600);
    expect(ctx.execOutputs.get("saml:status")).toBe(200);

    expect(fetchMock.mock.calls).toHaveLength(2);
    const [idpUrl, idpInit] = fetchMock.mock.calls[0];
    expect(idpUrl).toBe(CREDENTIAL_DATA.idpUrl);
    const idpBody = new URLSearchParams(idpInit!.body as string);
    expect(idpBody.get("client_id")).toBe("client-1");
    expect(idpBody.get("user_id")).toBe("user-1");
    expect(idpBody.get("token_url")).toBe(CREDENTIAL_DATA.tokenServiceUrl);
    expect(idpBody.get("private_key")).toBe(CREDENTIAL_DATA.privateKey);

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[1];
    expect(tokenUrl).toBe(CREDENTIAL_DATA.tokenServiceUrl);
    const tokenBody = new URLSearchParams(tokenInit!.body as string);
    expect(tokenBody.get("client_id")).toBe("client-1");
    expect(tokenBody.get("user_id")).toBe("user-1");
    expect(tokenBody.get("company_id")).toBe("company-1");
    expect(tokenBody.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:saml2-bearer");
    expect(tokenBody.get("assertion")).toBe("signed-assertion-text");
  });

  it("reports a failed assertion request as an error and never calls the token endpoint", async () => {
    const fetchMock = vi.fn(async () => new Response("invalid private key", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    const { graph } = buildGraph(TEST_CREDENTIAL.name);
    const ctx = createExecutionContext(graph, { log: () => {}, getCredential: getCredentialStub });
    await runExecFrom("saml", "exec-in", ctx);

    expect(ctx.execOutputs.get("saml:success")).toBe(false);
    expect(ctx.execOutputs.get("saml:status")).toBe(400);
    expect(ctx.execOutputs.get("saml:error")).toBe("invalid private key");
    expect(fetchMock.mock.calls).toHaveLength(1);
  });

  it("reports a failed token exchange as an error, with the real status and response body", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url === CREDENTIAL_DATA.idpUrl) return new Response("signed-assertion-text", { status: 200 });
      return new Response('{"error":"invalid_grant"}', { status: 401 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { graph } = buildGraph(TEST_CREDENTIAL.name);
    const ctx = createExecutionContext(graph, { log: () => {}, getCredential: getCredentialStub });
    await runExecFrom("saml", "exec-in", ctx);

    expect(ctx.execOutputs.get("saml:success")).toBe(false);
    expect(ctx.execOutputs.get("saml:status")).toBe(401);
    expect(ctx.execOutputs.get("saml:error")).toBe('{"error":"invalid_grant"}');
  });

  it("reports status 0 on a network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    const { graph } = buildGraph(TEST_CREDENTIAL.name);
    const ctx = createExecutionContext(graph, { log: () => {}, getCredential: getCredentialStub });
    await runExecFrom("saml", "exec-in", ctx);

    expect(ctx.execOutputs.get("saml:success")).toBe(false);
    expect(ctx.execOutputs.get("saml:status")).toBe(0);
    expect(ctx.execOutputs.get("saml:error")).toBe("network down");
  });

  it("reports an error and never calls fetch when the named credential doesn't exist", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { graph } = buildGraph("Nonexistent Credential");
    const ctx = createExecutionContext(graph, { log: () => {}, getCredential: getCredentialStub });
    await runExecFrom("saml", "exec-in", ctx);

    expect(ctx.execOutputs.get("saml:success")).toBe(false);
    expect(ctx.execOutputs.get("saml:status")).toBe(0);
    expect(ctx.execOutputs.get("saml:error")).toContain("not found");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports an error and never calls fetch when the named credential is the wrong type", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const wrongType: CredentialRecord = { ...TEST_CREDENTIAL, name: "Wrong Type", type: "usernamePassword", data: { username: "u", password: "p" } };
    const { graph } = buildGraph(wrongType.name);
    const ctx = createExecutionContext(graph, { log: () => {}, getCredential: (name) => (name === wrongType.name ? wrongType : undefined) });
    await runExecFrom("saml", "exec-in", ctx);

    expect(ctx.execOutputs.get("saml:success")).toBe(false);
    expect(ctx.execOutputs.get("saml:status")).toBe(0);
    expect(ctx.execOutputs.get("saml:error")).toContain("not an OAuth2 SAML Bearer credential");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
