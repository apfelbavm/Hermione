import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { registerBuiltins } from "../../src/nodes/index";
import { createExecutionContext, runExecFrom } from "../../src/engine/executor";
import { getNodeDef } from "../../src/engine/registry";
import { Graph } from "../../src/engine/graph";
import { NodeInstance } from "../../src/engine/nodeInstance";
import type { CredentialRecord, MicrosoftGraphClientCredentialsData } from "../../src/credentials/types";

beforeAll(() => {
  registerBuiltins();
});

afterEach(() => {
  vi.unstubAllGlobals();
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

/** Every operation node resolves GraphManager.forCredential(tenantId, clientId, clientSecret), which
 * is cached by that triple — so each test uses its own unique client secret to guarantee a fresh
 * (uncached) manager, keeping tests independent of run order and of each other's state. */
let credentialCounter = 0;
function freshCredential(): {
  name: string;
  getCredential: (name: string) => CredentialRecord | undefined;
} {
  credentialCounter += 1;
  const data: MicrosoftGraphClientCredentialsData = {
    tenantId: "tenant-1",
    clientId: "client-1",
    clientSecret: `secret-op-${credentialCounter}`,
  };
  const credential: CredentialRecord = {
    id: `cred-op-${credentialCounter}`,
    name: `Op Credential ${credentialCounter}`,
    type: "microsoftGraphClientCredentials",
    data,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  };
  return {
    name: credential.name,
    getCredential: (name) => (name === credential.name ? credential : undefined),
  };
}

/** Every real Graph request first mints an app-only access token via the client credentials grant
 * against Azure AD's token endpoint — this stubs that first hop so callers only need to mock the
 * actual Graph API call. */
function withTokenRefresh(handleOp: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes("/oauth2/v2.0/token")) {
      return new Response(
        JSON.stringify({
          access_token: "tok-live",
          token_type: "Bearer",
          expires_in: 3600,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    return handleOp(url, init);
  });
}

describe("microsoft365.listUsers", () => {
  it("lists users and reports success", async () => {
    const { name, getCredential } = freshCredential();
    const fetchMock = withTokenRefresh(async (url) => {
      expect(String(url)).toContain("/users?");
      return new Response(
        JSON.stringify({
          value: [
            {
              id: "u1",
              displayName: "Ada Lovelace",
              userPrincipalName: "ada@contoso.com",
              mail: "ada@contoso.com",
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const { graph } = buildGraph("microsoft365.listUsers", "lu", {
      credentialName: name,
    });
    const ctx = createExecutionContext(graph, { log: () => {}, getCredential });
    await runExecFrom("lu", "exec-in", ctx);

    expect(ctx.execOutputs.get("lu:success")).toBe(true);
    expect(ctx.execOutputs.get("lu:users")).toEqual([
      {
        id: "u1",
        displayName: "Ada Lovelace",
        userPrincipalName: "ada@contoso.com",
        mail: "ada@contoso.com",
      },
    ]);
    expect(ctx.execOutputs.get("lu:error")).toBe("");
  });

  it("reports an error and never calls fetch when the named credential doesn't exist", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { graph } = buildGraph("microsoft365.listUsers", "lu", {
      credentialName: "Nonexistent",
    });
    const ctx = createExecutionContext(graph, {
      log: () => {},
      getCredential: () => undefined,
    });
    await runExecFrom("lu", "exec-in", ctx);

    expect(ctx.execOutputs.get("lu:success")).toBe(false);
    expect(ctx.execOutputs.get("lu:error")).toContain("not found");
    expect(ctx.execOutputs.get("lu:users")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces a Graph API error via the error output instead of throwing", async () => {
    const { name, getCredential } = freshCredential();
    vi.stubGlobal(
      "fetch",
      withTokenRefresh(
        async () =>
          new Response(
            JSON.stringify({
              error: { code: "Forbidden", message: "Insufficient privileges" },
            }),
            { status: 403, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );

    const { graph } = buildGraph("microsoft365.listUsers", "lu", {
      credentialName: name,
    });
    const ctx = createExecutionContext(graph, { log: () => {}, getCredential });
    await runExecFrom("lu", "exec-in", ctx);

    expect(ctx.execOutputs.get("lu:success")).toBe(false);
    expect(ctx.execOutputs.get("lu:error")).toBe("Forbidden: Insufficient privileges");
  });
});

describe("microsoft365.getUser", () => {
  it("fetches a single user's profile", async () => {
    const { name, getCredential } = freshCredential();
    vi.stubGlobal(
      "fetch",
      withTokenRefresh(async (url) => {
        expect(String(url)).toContain("/users/ada%40contoso.com");
        return new Response(
          JSON.stringify({
            id: "u1",
            displayName: "Ada Lovelace",
            userPrincipalName: "ada@contoso.com",
            mail: "ada@contoso.com",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }),
    );

    const { graph } = buildGraph("microsoft365.getUser", "gu", {
      credentialName: name,
      userId: "ada@contoso.com",
    });
    const ctx = createExecutionContext(graph, { log: () => {}, getCredential });
    await runExecFrom("gu", "exec-in", ctx);

    expect(ctx.execOutputs.get("gu:success")).toBe(true);
    expect(ctx.execOutputs.get("gu:displayName")).toBe("Ada Lovelace");
    expect(ctx.execOutputs.get("gu:mail")).toBe("ada@contoso.com");
  });
});

describe("microsoft365.sendMail", () => {
  it("posts a sendMail request with the given recipients and reports success", async () => {
    const { name, getCredential } = freshCredential();
    vi.stubGlobal(
      "fetch",
      withTokenRefresh(async (url, init) => {
        expect(String(url)).toContain("/users/ada%40contoso.com/sendMail");
        const body = JSON.parse(String(init?.body));
        expect(body.message.toRecipients).toEqual([{ emailAddress: { address: "bob@contoso.com" } }]);
        return new Response(null, { status: 202 });
      }),
    );

    const { graph } = buildGraph("microsoft365.sendMail", "sm", {
      credentialName: name,
      userId: "ada@contoso.com",
      to: ["bob@contoso.com"],
      subject: "Hi",
      body: "Hello there",
    });
    const ctx = createExecutionContext(graph, { log: () => {}, getCredential });
    await runExecFrom("sm", "exec-in", ctx);

    expect(ctx.execOutputs.get("sm:success")).toBe(true);
    expect(ctx.execOutputs.get("sm:error")).toBe("");
  });
});

describe("microsoft365.uploadFile / downloadFile", () => {
  it("uploads content to a OneDrive path", async () => {
    const { name, getCredential } = freshCredential();
    vi.stubGlobal(
      "fetch",
      withTokenRefresh(async (url) => {
        expect(String(url)).toContain("/drive/root:/reports/report.csv:/content");
        return new Response(JSON.stringify({ id: "item-1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    const { graph } = buildGraph("microsoft365.uploadFile", "up", {
      credentialName: name,
      userId: "ada@contoso.com",
      filePath: "reports/report.csv",
      content: "a,b\n1,2",
    });
    const ctx = createExecutionContext(graph, { log: () => {}, getCredential });
    await runExecFrom("up", "exec-in", ctx);

    expect(ctx.execOutputs.get("up:success")).toBe(true);
  });

  it("downloads and decodes the content of a OneDrive file", async () => {
    const { name, getCredential } = freshCredential();
    vi.stubGlobal(
      "fetch",
      withTokenRefresh(
        async () =>
          new Response(new TextEncoder().encode("hello"), {
            status: 200,
            headers: { "Content-Type": "application/octet-stream" },
          }),
      ),
    );

    const { graph } = buildGraph("microsoft365.downloadFile", "dl", {
      credentialName: name,
      userId: "ada@contoso.com",
      filePath: "reports/report.csv",
    });
    const ctx = createExecutionContext(graph, { log: () => {}, getCredential });
    await runExecFrom("dl", "exec-in", ctx);

    expect(ctx.execOutputs.get("dl:success")).toBe(true);
    expect(ctx.execOutputs.get("dl:content")).toBe("hello");
  });
});

describe("microsoft365.request", () => {
  it("sends a raw request to an arbitrary Graph route", async () => {
    const { name, getCredential } = freshCredential();
    vi.stubGlobal(
      "fetch",
      withTokenRefresh(async (url) => {
        expect(String(url)).toContain("/me/drive");
        return new Response(JSON.stringify({ id: "drive-1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    const { graph } = buildGraph("microsoft365.request", "rq", {
      credentialName: name,
      method: "GET",
      path: "/me/drive",
    });
    const ctx = createExecutionContext(graph, { log: () => {}, getCredential });
    await runExecFrom("rq", "exec-in", ctx);

    expect(ctx.execOutputs.get("rq:success")).toBe(true);
    expect(ctx.execOutputs.get("rq:data")).toEqual({ id: "drive-1" });
  });
});

describe("microsoft365 token reuse", () => {
  it("only requests a token once across multiple calls sharing the same credential", async () => {
    const { name, getCredential } = freshCredential();
    let tokenRequests = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/oauth2/v2.0/token")) {
        tokenRequests += 1;
        return new Response(
          JSON.stringify({
            access_token: "tok-live",
            token_type: "Bearer",
            expires_in: 3600,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      return new Response(JSON.stringify({ value: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { graph: g1 } = buildGraph("microsoft365.listUsers", "lu1", {
      credentialName: name,
    });
    const ctx1 = createExecutionContext(g1, { log: () => {}, getCredential });
    await runExecFrom("lu1", "exec-in", ctx1);

    const { graph: g2 } = buildGraph("microsoft365.listUsers", "lu2", {
      credentialName: name,
    });
    const ctx2 = createExecutionContext(g2, { log: () => {}, getCredential });
    await runExecFrom("lu2", "exec-in", ctx2);

    expect(ctx1.execOutputs.get("lu1:success")).toBe(true);
    expect(ctx2.execOutputs.get("lu2:success")).toBe(true);
    expect(tokenRequests).toBe(1);
  });
});
