import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { registerBuiltins } from "../../../src/graph/nodes/index";
import { createExecutionContext, runExecFrom } from "@hermione/graph/engine/executor";
import { getNodeDef } from "@hermione/graph/engine/registry";
import { Graph } from "@hermione/graph/engine/graph";
import { NodeInstance } from "@hermione/graph/engine/nodeInstance";
import type { CredentialRecord, FacebookCredentialData } from "@hermione/shared/types";

/** FacebookAdsApi.call() goes through axios internally (see facebook-nodejs-business-sdk's
 * http.js), unlike Dropbox's SDK which uses global fetch — mocking the whole SDK module at this
 * boundary tests FacebookManager/the nodes' wiring without depending on that internal transport. */
let mockCall: (...args: any[]) => any;
vi.mock("facebook-nodejs-business-sdk", () => ({
  FacebookAdsApi: class {
    accessToken: string;
    constructor(accessToken: string) {
      this.accessToken = accessToken;
    }
    call(...args: unknown[]) {
      return mockCall(...args);
    }
  },
}));

/** FacebookManager (like TwilioManager) resolves its named credential straight from the database
 * via resolveAllCredentials(getDatabaseManager()) instead of ctx.getCredential — mock that
 * resolution layer directly rather than standing up a real DatabaseManager. */
let credentials: Map<string, CredentialRecord> = new Map();
vi.mock("@hermione/core/server/DatabaseManager", () => ({
  getDatabaseManager: () => ({}),
}));
vi.mock("@hermione/core/server/vaultCredentials", () => ({
  resolveAllCredentials: async () => credentials,
}));

beforeAll(() => {
  registerBuiltins();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  credentials = new Map();
});

function buildGraph(type: string, id: string, pinValues: Record<string, unknown> = {}) {
  const graph: Graph = new Graph("g", "test");
  const def = getNodeDef(type);
  const node = NodeInstance.createNodeInstance(type, { x: 0, y: 0 }, def.pins, id);
  for (const [pinId, value] of Object.entries(pinValues)) {
    node.pins[pinId].value = value;
  }
  graph.nodes.push(node);
  return { graph, node };
}

let credentialCounter = 0;
function freshCredential(overrides: Partial<FacebookCredentialData> = {}): { name: string } {
  credentialCounter += 1;
  const credential: CredentialRecord = {
    id: `cred-${credentialCounter}`,
    name: `Facebook Credential ${credentialCounter}`,
    type: "facebookGraphAPI",
    data: {
      appId: "app-1",
      appSecret: "secret-1",
      redirectUri: "https://example.com/callback",
      authCode: "",
      accessToken: `token-${credentialCounter}`,
      ...overrides,
    },
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  };
  credentials.set(credential.name, credential);
  return { name: credential.name };
}

describe("facebook.authorize", () => {
  it("exchanges the vault credential's authorization code for a long-lived access token", async () => {
    const { name } = freshCredential({ authCode: "one-time-code" });
    const fetchMock = vi.fn(async (url: string) => {
      const isExchange = url.includes("fb_exchange_token");
      return new Response(JSON.stringify(isExchange ? { access_token: "long-lived-token", expires_in: 5184000 } : { access_token: "short-lived-token", expires_in: 3600 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { graph } = buildGraph("facebook.authorize", "az", { credentialName: name });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("az", "exec-in", ctx);

    expect(ctx.execOutputs.get("az:success")).toBe(true);
    expect(ctx.execOutputs.get("az:tokens")).toEqual({ accessToken: "long-lived-token", expiresIn: 5184000 });
    expect(ctx.execOutputs.get("az:error")).toBe("");
  });

  it("surfaces an OAuth error via the error output instead of throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: { message: "Invalid verification code format." } }), { status: 400 })),
    );
    const { name } = freshCredential({ authCode: "bad-code" });

    const { graph } = buildGraph("facebook.authorize", "az", { credentialName: name });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("az", "exec-in", ctx);

    expect(ctx.execOutputs.get("az:success")).toBe(false);
    expect(ctx.execOutputs.get("az:tokens")).toEqual({ accessToken: "", expiresIn: 0 });
    expect(ctx.execOutputs.get("az:error")).toBe("Invalid verification code format.");
  });

  it("reports an error and never calls fetch when the named credential doesn't exist", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { graph } = buildGraph("facebook.authorize", "az", { credentialName: "Nonexistent" });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("az", "exec-in", ctx);

    expect(ctx.execOutputs.get("az:success")).toBe(false);
    expect(ctx.execOutputs.get("az:error")).toContain("not found");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("facebook.getPageInfo", () => {
  it("fetches a page's id/name/category/fanCount/link", async () => {
    mockCall = vi.fn(async (method: string, path: string[]) => {
      expect(method).toBe("GET");
      expect(path).toEqual(["123"]);
      return { id: "123", name: "My Page", category: "Business", fan_count: 42, link: "https://facebook.com/mypage" };
    });
    const { name } = freshCredential();

    const { graph } = buildGraph("facebook.getPageInfo", "gp", { credentialName: name, pageId: "123" });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("gp", "exec-in", ctx);

    expect(ctx.execOutputs.get("gp:success")).toBe(true);
    expect(ctx.execOutputs.get("gp:page")).toEqual({ id: "123", name: "My Page", category: "Business", fanCount: 42, link: "https://facebook.com/mypage" });
    expect(ctx.execOutputs.get("gp:error")).toBe("");
  });

  it("reports a Graph API error via the error output instead of throwing", async () => {
    mockCall = vi.fn(async () => {
      throw new Error("Invalid OAuth access token.");
    });
    const { name } = freshCredential();

    const { graph } = buildGraph("facebook.getPageInfo", "gp", { credentialName: name, pageId: "123" });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("gp", "exec-in", ctx);

    expect(ctx.execOutputs.get("gp:success")).toBe(false);
    expect(ctx.execOutputs.get("gp:error")).toBe("Invalid OAuth access token.");
  });
});

describe("facebook.createPost", () => {
  it("publishes a message/link post to the page's feed", async () => {
    mockCall = vi.fn(async (method: string, path: string[], params: Record<string, unknown>) => {
      expect(method).toBe("POST");
      expect(path).toEqual(["123", "feed"]);
      expect(params.message).toBe("Hello world");
      return { id: "123_456" };
    });
    const { name } = freshCredential();

    const { graph } = buildGraph("facebook.createPost", "cp", {
      credentialName: name,
      pageId: "123",
      message: "Hello world",
      link: "",
    });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("cp", "exec-in", ctx);

    expect(ctx.execOutputs.get("cp:success")).toBe(true);
    expect(ctx.execOutputs.get("cp:postId")).toBe("123_456");
    expect(ctx.execOutputs.get("cp:error")).toBe("");
  });

  it("reports an error and never calls the API when the named credential doesn't exist", async () => {
    mockCall = vi.fn();
    const { graph } = buildGraph("facebook.createPost", "cp", {
      credentialName: "Nonexistent",
      pageId: "123",
      message: "x",
    });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("cp", "exec-in", ctx);

    expect(ctx.execOutputs.get("cp:success")).toBe(false);
    expect(ctx.execOutputs.get("cp:error")).toContain("not found");
    expect(mockCall).not.toHaveBeenCalled();
  });
});

describe("facebook.getPosts", () => {
  it("maps the feed's data array into Posts struct entries", async () => {
    mockCall = vi.fn(async () => ({
      data: [
        { id: "1", message: "First", created_time: "2024-01-01T00:00:00+0000" },
        { id: "2", message: "Second", created_time: "2024-01-02T00:00:00+0000" },
      ],
    }));
    const { name } = freshCredential();

    const { graph } = buildGraph("facebook.getPosts", "gp", { credentialName: name, pageId: "123", limit: 25 });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("gp", "exec-in", ctx);

    expect(ctx.execOutputs.get("gp:success")).toBe(true);
    expect(ctx.execOutputs.get("gp:posts")).toEqual([
      { id: "1", message: "First", createdTime: "2024-01-01T00:00:00+0000" },
      { id: "2", message: "Second", createdTime: "2024-01-02T00:00:00+0000" },
    ]);
  });
});

describe("facebook.apiCall", () => {
  it("passes method/path/parsed params through and returns the raw response as JSON", async () => {
    mockCall = vi.fn(async (method: string, path: string[], params: Record<string, unknown>) => {
      expect(method).toBe("GET");
      expect(path).toEqual(["me", "accounts"]);
      expect(params).toEqual({ fields: "name" });
      return { data: [{ id: "1", name: "A Page" }] };
    });
    const { name } = freshCredential();

    const { graph } = buildGraph("facebook.apiCall", "ac", {
      credentialName: name,
      method: "GET",
      path: "me/accounts",
      paramsJson: JSON.stringify({ fields: "name" }),
    });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("ac", "exec-in", ctx);

    expect(ctx.execOutputs.get("ac:success")).toBe(true);
    expect(JSON.parse(String(ctx.execOutputs.get("ac:json")))).toEqual({ data: [{ id: "1", name: "A Page" }] });
    expect(ctx.execOutputs.get("ac:error")).toBe("");
  });
});
