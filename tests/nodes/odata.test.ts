import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { registerBuiltins } from "../../src/nodes/index";
import { createExecutionContext, runExecFrom } from "../../src/engine/executor";
import { getNodeDef } from "../../src/engine/registry";
import { Graph } from "../../src/engine/graph";
import { NodeInstance } from "../../src/engine/nodeInstance";

beforeAll(() => {
  registerBuiltins();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function buildGraph(pinValues: Record<string, unknown> = {}) {
  const graph: Graph = new Graph("g", "test");
  const def = getNodeDef("odata.v2Request");
  const node = NodeInstance.createNodeInstance("odata.v2Request", { x: 0, y: 0 }, def.pins, "req");
  for (const [id, value] of Object.entries(pinValues)) {
    node.pins[id].value = value;
  }
  graph.nodes.push(node);
  return { graph, node };
}

function jsonResponse(body: unknown, status = 200) {
  return { status, ok: status >= 200 && status < 300, text: async () => JSON.stringify(body) };
}

describe("odata.v2Request", () => {
  it("exposes Pagination Type as a string pin matching the Integration Suite's own paging modes", () => {
    const def = getNodeDef("odata.v2Request");
    const pin = def.pins.find((p) => p.id === "paginationType")!;
    expect(pin.type).toBe("string");
    expect(pin.options).toEqual(["Client", "Server"]);
  });

  it("exposes Rows as an Array<Object> output pin", () => {
    const def = getNodeDef("odata.v2Request");
    const pin = def.pins.find((p) => p.id === "rows")!;
    expect(pin.type).toBe("object");
    expect(pin.container).toBe("array");
  });

  it("client paging: keeps requesting $top/$skip pages until one comes back short, appending to any existing query", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const u = new URL(url);
      const skip = Number(u.searchParams.get("$skip"));
      expect(u.searchParams.get("$filter")).toBe("Active eq true"); // preserved from the base URL
      if (skip === 0) return jsonResponse({ d: { results: [{ id: 1 }, { id: 2 }] } });
      if (skip === 2) return jsonResponse({ d: { results: [{ id: 3 }] } }); // short page — last one
      throw new Error(`unexpected $skip=${skip}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { graph } = buildGraph({
      url: "https://example.com/odata/v2/EmpJob?$filter=Active eq true",
      pageSize: 2,
      paginationType: "Client",
    });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("req", "exec-in", ctx);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(ctx.execOutputs.get("req:success")).toBe(true);
    expect(ctx.execOutputs.get("req:pageCount")).toBe(2);
    expect(ctx.execOutputs.get("req:rows")).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(ctx.execOutputs.get("req:error")).toBe("");
  });

  it("Server paging: follows d.__next verbatim until it's absent", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "https://example.com/odata/v2/EmpJob?$top=50") {
        return jsonResponse({ d: { results: [{ id: 1 }], __next: "https://example.com/next?skiptoken=abc" } });
      }
      if (url === "https://example.com/next?skiptoken=abc") {
        return jsonResponse({ d: { results: [{ id: 2 }] } }); // no __next — last page
      }
      throw new Error(`unexpected url ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { graph } = buildGraph({
      url: "https://example.com/odata/v2/EmpJob",
      pageSize: 50,
      paginationType: "Server",
    });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("req", "exec-in", ctx);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(ctx.execOutputs.get("req:rows")).toEqual([{ id: 1 }, { id: 2 }]);
    expect(ctx.execOutputs.get("req:pageCount")).toBe(2);
  });

  it("stops at Max Pages even if the server keeps returning full pages / a next link", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ d: { results: [{ id: 1 }, { id: 2 }] } }));
    vi.stubGlobal("fetch", fetchMock);

    const { graph } = buildGraph({
      url: "https://example.com/odata/v2/EmpJob",
      pageSize: 2,
      maxPages: 3,
      paginationType: "Client",
    });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("req", "exec-in", ctx);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(ctx.execOutputs.get("req:pageCount")).toBe(3);
    expect(ctx.execOutputs.get("req:success")).toBe(true);
    expect((ctx.execOutputs.get("req:rows") as unknown[]).length).toBe(6);
  });

  it("reports a failed page via success/error/status instead of throwing, keeping rows gathered so far", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const skip = Number(new URL(url).searchParams.get("$skip"));
      if (skip === 0) return jsonResponse({ d: { results: [{ id: 1 }, { id: 2 }] } });
      return { status: 500, ok: false, text: async () => "" };
    });
    vi.stubGlobal("fetch", fetchMock);

    const { graph } = buildGraph({
      url: "https://example.com/odata/v2/EmpJob",
      pageSize: 2,
      paginationType: "Client",
    });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("req", "exec-in", ctx);

    expect(ctx.execOutputs.get("req:success")).toBe(false);
    expect(ctx.execOutputs.get("req:status")).toBe(500);
    expect(ctx.execOutputs.get("req:rows")).toEqual([{ id: 1 }, { id: 2 }]);
    expect(String(ctx.execOutputs.get("req:error"))).toBe("HTTP 500");
  });

  it("merges a wired Auth object's header into every page request", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({ d: { results: [] } }));
    vi.stubGlobal("fetch", fetchMock);

    const { graph } = buildGraph({
      url: "https://example.com/odata/v2/EmpJob",
      auth: { header: "Authorization", value: "Basic dXNlcjpwYXNz" },
    });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("req", "exec-in", ctx);

    const [, calledInit] = fetchMock.mock.calls[0];
    expect((calledInit as RequestInit).headers).toEqual({ Authorization: "Basic dXNlcjpwYXNz" });
  });
});
