import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { registerBuiltins } from "../../../src/graph/nodes/index";
import { createExecutionContext, runExecFrom } from "../../../src/graph/engine/executor";
import { getNodeDef } from "../../../src/graph/engine/registry";
import { Graph } from "../../../src/graph/engine/graph";
import { NodeInstance } from "../../../src/graph/engine/nodeInstance";

beforeAll(() => {
  registerBuiltins();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function buildGraph(pinValues: Record<string, unknown>) {
  const graph: Graph = new Graph("g", "test");
  const def = getNodeDef("auth.oauth2ClientCredentials");
  const node = NodeInstance.createNodeInstance("auth.oauth2ClientCredentials", { x: 0, y: 0 }, def.pins, "oauth");
  for (const [id, value] of Object.entries(pinValues)) {
    node.pins[id].value = value;
  }
  graph.nodes.push(node);
  return { graph, node };
}

// oauth4webapi enforces HTTPS by default (real OAuth2 should always use it) — these tests stub
// `fetch` directly rather than spinning up a real HTTPS server, so the https:// URLs below never
// actually hit the network.

describe("auth.oauth2ClientCredentials", () => {
  it("requests a token from tokenServiceUrl, sending client_id/secret in the body by default", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            access_token: "tok-1",
            token_type: "bearer",
            expires_in: 3600,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
    );
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
    expect(ctx.execOutputs.get("oauth:auth")).toEqual({
      header: "Authorization",
      value: "Bearer tok-1",
    });
    expect(ctx.execOutputs.get("oauth:expiresIn")).toBe(3600);
    expect(ctx.execOutputs.get("oauth:status")).toBe(200);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://idp.example.com/oauth/token");
    const body = new URLSearchParams(init!.body as string);
    expect(body.get("grant_type")).toBe("client_credentials");
    expect(body.get("client_id")).toBe("client-1");
    expect(body.get("client_secret")).toBe("secret-1");
    expect(init!.headers).not.toHaveProperty("authorization");
  });

  it("includes scope in the request body when given", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            access_token: "tok",
            token_type: "bearer",
            expires_in: 60,
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { graph } = buildGraph({
      tokenServiceUrl: "https://idp.example.com/oauth/token",
      clientId: "client-1",
      clientSecret: "secret-1",
      scope: "read write",
    });
    await runExecFrom("oauth", "exec-in", createExecutionContext(graph, { log: () => {} }));

    const [, init] = fetchMock.mock.calls[0];
    const body = new URLSearchParams(init!.body as string);
    expect(body.get("scope")).toBe("read write");
  });

  it("sends client credentials as a Basic Auth header instead when Send As is basicAuthHeader", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            access_token: "tok",
            token_type: "bearer",
            expires_in: 60,
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { graph } = buildGraph({
      tokenServiceUrl: "https://idp.example.com/oauth/token",
      clientId: "client-1",
      clientSecret: "secret-1",
      sendAs: "basicAuthHeader",
    });
    await runExecFrom("oauth", "exec-in", createExecutionContext(graph, { log: () => {} }));

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init!.headers);
    // oauth4webapi percent-encodes client_id/client_secret before Basic-encoding them (RFC 6749
    // Appendix B), unlike a naive `btoa(id + ":" + secret)` — notably more correct, since it means a
    // colon inside either value can't be confused with the id:secret separator.
    expect(headers.get("authorization")).toBe(`Basic ${btoa("client%2D1:secret%2D1")}`);
    const body = new URLSearchParams(init!.body as string);
    expect(body.get("client_id")).toBe(null);
    expect(body.get("client_secret")).toBe(null);
  });

  it("reports a non-2xx token endpoint response as an error instead of throwing, with the real status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (_url: string, _init?: RequestInit) =>
          new Response(
            JSON.stringify({
              error: "invalid_client",
              error_description: "bad secret",
            }),
            {
              status: 401,
              headers: { "Content-Type": "application/json" },
            },
          ),
      ),
    );

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
    expect(ctx.execOutputs.get("oauth:error")).toBe("bad secret");
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
});
