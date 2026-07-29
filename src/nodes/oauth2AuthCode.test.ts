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
  const def = getNodeDef("auth.oauth2AuthCode");
  const node = createNodeInstance("auth.oauth2AuthCode", { x: 0, y: 0 }, def.pins, "oauth");
  for (const [id, value] of Object.entries(pinValues)) {
    node.pins[id].value = value;
  }
  graph.nodes.push(node);
  return { graph, node };
}

describe("auth.oauth2AuthCode", () => {
  it("exchanges a refresh token for an access token, sending client_id/secret as body params by default", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      status: 200,
      ok: true,
      text: async () => JSON.stringify({ access_token: "new-access", expires_in: 1800 }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { graph } = buildGraph({
      tokenServiceUrl: "https://idp.example.com/oauth/token",
      clientId: "client-1",
      clientSecret: "secret-1",
      refreshToken: "stored-refresh-token",
    });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("oauth", "exec-in", ctx);

    expect(ctx.execOutputs.get("oauth:success")).toBe(true);
    expect(ctx.execOutputs.get("oauth:accessToken")).toBe("new-access");
    expect(ctx.execOutputs.get("oauth:auth")).toEqual({ header: "Authorization", value: "Bearer new-access" });
    expect(ctx.execOutputs.get("oauth:expiresIn")).toBe(1800);
    // No rotation in the response — falls back to the refresh token that was wired in.
    expect(ctx.execOutputs.get("oauth:newRefreshToken")).toBe("stored-refresh-token");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://idp.example.com/oauth/token");
    expect(init!.headers).not.toHaveProperty("Authorization");
    const body = new URLSearchParams(init!.body as string);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("stored-refresh-token");
    expect(body.get("client_id")).toBe("client-1");
    expect(body.get("client_secret")).toBe("secret-1");
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
      refreshToken: "rt",
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

  it("surfaces a rotated refresh_token from the response instead of the original", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 200,
        ok: true,
        text: async () => JSON.stringify({ access_token: "tok", refresh_token: "rotated-rt", expires_in: 60 }),
      })),
    );

    const { graph } = buildGraph({
      tokenServiceUrl: "https://idp.example.com/oauth/token",
      clientId: "c",
      clientSecret: "s",
      refreshToken: "old-rt",
    });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("oauth", "exec-in", ctx);

    expect(ctx.execOutputs.get("oauth:newRefreshToken")).toBe("rotated-rt");
  });

  it("includes scope in the refresh request only when provided", async () => {
    let capturedBody = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        capturedBody = init!.body as string;
        return { status: 200, ok: true, text: async () => JSON.stringify({ access_token: "t", expires_in: 60 }) };
      }),
    );

    const { graph } = buildGraph({
      tokenServiceUrl: "https://idp.example.com/oauth/token",
      clientId: "c",
      clientSecret: "s",
      refreshToken: "rt",
      scope: "read write",
    });
    await runExecFrom("oauth", "exec-in", createExecutionContext(graph, { log: () => {} }));

    expect(new URLSearchParams(capturedBody).get("scope")).toBe("read write");
  });

  it("builds an authorizationUrl output from authUrl/clientId/redirectUrl/scope without ever fetching it", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      status: 200,
      ok: true,
      text: async () => JSON.stringify({ access_token: "t", expires_in: 60 }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { graph } = buildGraph({
      authUrl: "https://idp.example.com/oauth/authorize",
      tokenServiceUrl: "https://idp.example.com/oauth/token",
      redirectUrl: "https://my-integration-suite.example.com/callback",
      clientId: "client-1",
      clientSecret: "s",
      refreshToken: "rt",
      scope: "read",
    });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("oauth", "exec-in", ctx);

    const authorizationUrl = String(ctx.execOutputs.get("oauth:authorizationUrl"));
    expect(authorizationUrl.startsWith("https://idp.example.com/oauth/authorize?")).toBe(true);
    const params = new URL(authorizationUrl).searchParams;
    expect(params.get("response_type")).toBe("code");
    expect(params.get("client_id")).toBe("client-1");
    expect(params.get("redirect_uri")).toBe("https://my-integration-suite.example.com/callback");
    expect(params.get("scope")).toBe("read");

    // Only the token service URL was ever actually fetched — the authorization URL is a pure
    // computed output, never something this node fetches itself.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://idp.example.com/oauth/token");
  });

  it("reports a non-2xx token endpoint response as an error, keeping the original refresh token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 401, ok: false, text: async () => '{"error":"invalid_grant"}' })));

    const { graph } = buildGraph({
      tokenServiceUrl: "https://idp.example.com/oauth/token",
      clientId: "c",
      clientSecret: "s",
      refreshToken: "rt",
    });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("oauth", "exec-in", ctx);

    expect(ctx.execOutputs.get("oauth:success")).toBe(false);
    expect(ctx.execOutputs.get("oauth:auth")).toBe(null);
    expect(ctx.execOutputs.get("oauth:newRefreshToken")).toBe("rt");
    expect(String(ctx.execOutputs.get("oauth:error"))).toContain("401");
  });

  it("reports a response with no access_token as an error instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 200, ok: true, text: async () => "{}" })));

    const { graph } = buildGraph({
      tokenServiceUrl: "https://idp.example.com/oauth/token",
      clientId: "c",
      clientSecret: "s",
      refreshToken: "rt",
    });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("oauth", "exec-in", ctx);

    expect(ctx.execOutputs.get("oauth:success")).toBe(false);
    expect(String(ctx.execOutputs.get("oauth:error"))).toContain("access_token");
  });
});
