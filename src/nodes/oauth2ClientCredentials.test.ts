import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { registerBuiltins } from "./index";
import { createExecutionContext, runExecFrom } from "../engine/executor";
import { createNodeInstance } from "../engine/graphMutations";
import { getNodeDef } from "../engine/registry";
import { createEmptyGraph, type Graph } from "../engine/types";

beforeAll(() => {
  registerBuiltins();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function buildGraph(pinValues: Record<string, unknown>) {
  const graph: Graph = createEmptyGraph("g", "test");
  const def = getNodeDef("auth.oauth2ClientCredentials");
  const node = createNodeInstance("auth.oauth2ClientCredentials", { x: 0, y: 0 }, def.pins, "oauth");
  for (const [id, value] of Object.entries(pinValues)) {
    node.pins[id].value = value;
  }
  graph.nodes.push(node);
  return { graph, node };
}

describe("auth.oauth2ClientCredentials", () => {
  it("requests a token from tokenServiceUrl directly when provider is generic, sending client_id/secret in the body", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      status: 200,
      ok: true,
      text: async () => JSON.stringify({ access_token: "tok-1", expires_in: 3600 }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { graph } = buildGraph({
      tokenServiceUrl: "https://idp.example.com/oauth/token",
      clientId: "client-1",
      clientSecret: "secret-1",
    });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("oauth", "exec-in", ctx);

    expect(ctx.execOutputs.get("oauth:success")).toBe(true);
    expect(ctx.execOutputs.get("oauth:accessToken")).toBe("tok-1");
    expect(ctx.execOutputs.get("oauth:auth")).toEqual({ header: "Authorization", value: "Bearer tok-1" });
    expect(ctx.execOutputs.get("oauth:expiresIn")).toBe(3600);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://idp.example.com/oauth/token");
    const body = new URLSearchParams(init!.body as string);
    expect(body.get("grant_type")).toBe("client_credentials");
    expect(body.get("client_id")).toBe("client-1");
    expect(body.get("client_secret")).toBe("secret-1");
  });

  it("derives the Entra ID token endpoint from tenantId instead of using tokenServiceUrl", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      status: 200,
      ok: true,
      text: async () => JSON.stringify({ access_token: "tok", expires_in: 60 }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { graph } = buildGraph({
      provider: "microsoftEntraId",
      tenantId: "my-tenant-id",
      tokenServiceUrl: "https://should-be-ignored.example.com/token",
      clientId: "client-1",
      clientSecret: "secret-1",
      scope: "https://graph.microsoft.com/.default",
    });
    await runExecFrom("oauth", "exec-in", createExecutionContext(graph, { log: () => {} }));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://login.microsoftonline.com/my-tenant-id/oauth2/v2.0/token");
    const body = new URLSearchParams(init!.body as string);
    expect(body.get("scope")).toBe("https://graph.microsoft.com/.default");
  });

  it("falls back to tokenServiceUrl for microsoftEntraId when tenantId is left blank", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ status: 200, ok: true, text: async () => JSON.stringify({ access_token: "t", expires_in: 60 }) })),
    );

    const { graph } = buildGraph({
      provider: "microsoftEntraId",
      tokenServiceUrl: "https://fallback.example.com/token",
      clientId: "c",
      clientSecret: "s",
    });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("oauth", "exec-in", ctx);

    expect(ctx.execOutputs.get("oauth:success")).toBe(true);
  });

  it("sends client credentials as a Basic Auth header instead when Send As is basicAuthHeader", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      status: 200,
      ok: true,
      text: async () => JSON.stringify({ access_token: "tok", expires_in: 60 }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { graph } = buildGraph({
      tokenServiceUrl: "https://idp.example.com/oauth/token",
      clientId: "client-1",
      clientSecret: "secret-1",
      sendAs: "basicAuthHeader",
    });
    await runExecFrom("oauth", "exec-in", createExecutionContext(graph, { log: () => {} }));

    const [, init] = fetchMock.mock.calls[0];
    expect(init!.headers).toEqual({
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa("client-1:secret-1")}`,
    });
    const body = new URLSearchParams(init!.body as string);
    expect(body.get("client_id")).toBe(null);
    expect(body.get("client_secret")).toBe(null);
  });

  it("reports a non-2xx token endpoint response as an error instead of throwing, with the raw response body as the error and the real status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 401, ok: false, text: async () => '{"error":"invalid_client"}' })));

    const { graph } = buildGraph({
      tokenServiceUrl: "https://idp.example.com/oauth/token",
      clientId: "c",
      clientSecret: "wrong",
    });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("oauth", "exec-in", ctx);

    expect(ctx.execOutputs.get("oauth:success")).toBe(false);
    expect(ctx.execOutputs.get("oauth:auth")).toBe(null);
    expect(ctx.execOutputs.get("oauth:status")).toBe(401);
    expect(ctx.execOutputs.get("oauth:error")).toBe('{"error":"invalid_client"}');
  });

  it("falls back to statusText when the response body is empty", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 404, ok: false, statusText: "Not Found", text: async () => "" })));

    const { graph } = buildGraph({
      tokenServiceUrl: "https://idp.example.com/oauth/token",
      clientId: "c",
      clientSecret: "s",
    });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("oauth", "exec-in", ctx);

    expect(ctx.execOutputs.get("oauth:status")).toBe(404);
    expect(ctx.execOutputs.get("oauth:error")).toBe("Not Found");
  });

  it("is an empty error string when BOTH the body and statusText are empty (HTTP/2 has no reason phrase) — the status pin is still the real code", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 404, ok: false, statusText: "", text: async () => "" })));

    const { graph } = buildGraph({
      tokenServiceUrl: "https://idp.example.com/oauth/token",
      clientId: "c",
      clientSecret: "s",
    });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("oauth", "exec-in", ctx);

    expect(ctx.execOutputs.get("oauth:status")).toBe(404);
    expect(ctx.execOutputs.get("oauth:error")).toBe("");
  });

  it("reports a response with no access_token as an error instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 200, ok: true, text: async () => "{}" })));

    const { graph } = buildGraph({
      tokenServiceUrl: "https://idp.example.com/oauth/token",
      clientId: "c",
      clientSecret: "s",
    });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("oauth", "exec-in", ctx);

    expect(ctx.execOutputs.get("oauth:success")).toBe(false);
    expect(ctx.execOutputs.get("oauth:status")).toBe(200);
    expect(String(ctx.execOutputs.get("oauth:error"))).toContain("access_token");
  });

  it("reports status 0 on a network failure (no response received at all)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    const { graph } = buildGraph({
      tokenServiceUrl: "https://idp.example.com/oauth/token",
      clientId: "c",
      clientSecret: "s",
    });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("oauth", "exec-in", ctx);

    expect(ctx.execOutputs.get("oauth:success")).toBe(false);
    expect(ctx.execOutputs.get("oauth:status")).toBe(0);
    expect(ctx.execOutputs.get("oauth:error")).toBe("network down");
  });

  it("returns the real status alongside a successful token exchange", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ status: 200, ok: true, text: async () => JSON.stringify({ access_token: "tok", expires_in: 60 }) })),
    );

    const { graph } = buildGraph({
      tokenServiceUrl: "https://idp.example.com/oauth/token",
      clientId: "c",
      clientSecret: "s",
    });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("oauth", "exec-in", ctx);

    expect(ctx.execOutputs.get("oauth:success")).toBe(true);
    expect(ctx.execOutputs.get("oauth:status")).toBe(200);
  });
});
