import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { registerBuiltins } from "./index";
import { createExecutionContext, runExecFrom } from "../engine/executor";
import { createNodeInstance } from "../engine/graphMutations";
import { getNodeDef } from "../engine/registry";
import { Graph } from "../engine/graph";

beforeAll(() => {
  registerBuiltins();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function buildGraph(pinValues: Record<string, unknown> = {}) {
  const graph: Graph = new Graph("g", "test");
  const def = getNodeDef("http.request");
  const node = createNodeInstance("http.request", { x: 0, y: 0 }, def.pins, "req");
  for (const [id, value] of Object.entries(pinValues)) {
    node.pins[id].value = value;
  }
  graph.nodes.push(node);
  return { graph, node };
}

describe("http.request", () => {
  it("exposes Method as a string pin restricted to a fixed dropdown of HTTP verbs", () => {
    const def = getNodeDef("http.request");
    const method = def.pins.find((p) => p.id === "method")!;
    expect(method.type).toBe("string");
    expect(method.options).toEqual(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
  });

  it("performs a GET request and reports status/success/body/headers, without sending a body", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      status: 200,
      ok: true,
      text: async () => "hello",
      headers: { forEach: (cb: (v: string, k: string) => void) => cb("application/json", "content-type") },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { graph } = buildGraph({ url: "https://example.com/thing", method: "GET" });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("req", "exec-in", ctx);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe("https://example.com/thing");
    expect(calledInit?.method).toBe("GET");
    expect(calledInit?.body).toBeUndefined();

    expect(ctx.execOutputs.get("req:status")).toBe(200);
    expect(ctx.execOutputs.get("req:success")).toBe(true);
    expect(ctx.execOutputs.get("req:responseBody")).toBe("hello");
    expect(ctx.execOutputs.get("req:responseHeaders")).toBe(JSON.stringify({ "content-type": "application/json" }));
    expect(ctx.execOutputs.get("req:error")).toBe("");
  });

  it("sends a JSON body and parsed headers for a POST request", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      status: 201,
      ok: true,
      text: async () => "{}",
      headers: { forEach: () => {} },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { graph } = buildGraph({
      url: "https://example.com/create",
      method: "POST",
      headers: '{"Authorization":"Bearer xyz"}',
      body: '{"name":"Score"}',
    });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("req", "exec-in", ctx);

    const [, calledInit] = fetchMock.mock.calls[0];
    expect(calledInit?.method).toBe("POST");
    expect(calledInit?.body).toBe('{"name":"Score"}');
    expect(calledInit?.headers).toEqual({ Authorization: "Bearer xyz" });
    expect(ctx.execOutputs.get("req:status")).toBe(201);
  });

  it("reports a network failure via the error output instead of throwing, and still fires exec-out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    const { graph } = buildGraph({ url: "https://example.com/thing" });
    const logs: string[] = [];
    const ctx = createExecutionContext(graph, { log: (m) => logs.push(m) });
    await runExecFrom("req", "exec-in", ctx);

    expect(ctx.execOutputs.get("req:success")).toBe(false);
    expect(ctx.execOutputs.get("req:status")).toBe(0);
    expect(ctx.execOutputs.get("req:error")).toBe("network down");
  });

  it("reports a malformed Headers JSON as an error rather than crashing the run", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      status: 200,
      ok: true,
      text: async () => "",
      headers: { forEach: () => {} },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { graph } = buildGraph({ url: "https://example.com/thing", headers: "{not json" });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("req", "exec-in", ctx);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(ctx.execOutputs.get("req:success")).toBe(false);
    expect(String(ctx.execOutputs.get("req:error"))).not.toBe("");
  });

  it("merges a wired Auth object's header into the request (see auth.ts)", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      status: 200,
      ok: true,
      text: async () => "",
      headers: { forEach: () => {} },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { graph } = buildGraph({
      url: "https://example.com/thing",
      headers: '{"X-Custom":"1"}',
      auth: { header: "Authorization", value: "Basic dXNlcjpwYXNz" },
    });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("req", "exec-in", ctx);

    const [, calledInit] = fetchMock.mock.calls[0];
    expect(calledInit?.headers).toEqual({ "X-Custom": "1", Authorization: "Basic dXNlcjpwYXNz" });
  });

  it("an Auth object's header wins over a same-named entry in Headers (JSON)", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      status: 200,
      ok: true,
      text: async () => "",
      headers: { forEach: () => {} },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { graph } = buildGraph({
      url: "https://example.com/thing",
      headers: '{"Authorization":"Bearer stale"}',
      auth: { header: "Authorization", value: "Basic dXNlcjpwYXNz" },
    });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("req", "exec-in", ctx);

    const [, calledInit] = fetchMock.mock.calls[0];
    expect(calledInit?.headers).toEqual({ Authorization: "Basic dXNlcjpwYXNz" });
  });

  it("leaves headers untouched when Auth is left unwired (default null)", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      status: 200,
      ok: true,
      text: async () => "",
      headers: { forEach: () => {} },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { graph } = buildGraph({ url: "https://example.com/thing", headers: '{"X-Custom":"1"}' });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("req", "exec-in", ctx);

    const [, calledInit] = fetchMock.mock.calls[0];
    expect(calledInit?.headers).toEqual({ "X-Custom": "1" });
  });
});
