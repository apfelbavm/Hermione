import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { registerBuiltins } from "../../../src/graph/nodes/index";
import { createExecutionContext, runExecFrom } from "../../../src/graph/engine/executor";
import { getNodeDef } from "../../../src/graph/engine/registry";
import { Graph } from "../../../src/graph/engine/graph";
import { NodeInstance } from "../../../src/graph/engine/nodeInstance";
import type { CredentialRecord, MicrosoftGraphClientCredentialsData } from "../../../src/credentials/types";
import { ClientSecretCredential } from "@azure/identity";

/** GraphManager authenticates via @azure/identity's ClientSecretCredential, which acquires tokens
 * through MSAL's own network layer rather than global fetch — mocked here so tests never hit the
 * real token endpoint and only need to stub the actual Graph API calls made through the SDK client
 * (which does use global fetch, see HTTPMessageHandler). */
vi.mock("@azure/identity", () => ({
  ClientSecretCredential: vi.fn().mockImplementation(() => ({
    getToken: vi.fn().mockResolvedValue({
      token: "tok-live",
      expiresOnTimestamp: Date.now() + 3600_000,
    }),
  })),
}));

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

/** Graph client SDK calls go through global fetch (see HTTPMessageHandler); token acquisition is
 * mocked separately via the @azure/identity mock above, so this just wraps the Graph API handler
 * as a vi.fn spy. */
function mockGraphFetch(handleOp: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  return vi.fn(handleOp);
}

describe("microsoft365.listUsers", () => {
  it("lists users and reports success", async () => {
    const { name, getCredential } = freshCredential();
    const fetchMock = mockGraphFetch(async (url) => {
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
      mockGraphFetch(
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
      mockGraphFetch(async (url) => {
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
    expect(ctx.execOutputs.get("gu:user")).toEqual({
      id: "u1",
      displayName: "Ada Lovelace",
      userPrincipalName: "ada@contoso.com",
      mail: "ada@contoso.com",
    });
  });
});

describe("microsoft365.sendMail", () => {
  it("posts a sendMail request with the given recipients and reports success", async () => {
    const { name, getCredential } = freshCredential();
    vi.stubGlobal(
      "fetch",
      mockGraphFetch(async (url, init) => {
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
      mockGraphFetch(async (url) => {
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
      mockGraphFetch(
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
      mockGraphFetch(async (url) => {
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
  it("only builds one credential/client across multiple calls sharing the same credential", async () => {
    const { name, getCredential } = freshCredential();
    vi.mocked(ClientSecretCredential).mockClear();
    vi.stubGlobal(
      "fetch",
      mockGraphFetch(
        async () =>
          new Response(JSON.stringify({ value: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );

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
    expect(vi.mocked(ClientSecretCredential)).toHaveBeenCalledTimes(1);
  });
});

describe("microsoft365.listChannels", () => {
  it("lists the channels in a team", async () => {
    const { name, getCredential } = freshCredential();
    vi.stubGlobal(
      "fetch",
      mockGraphFetch(async (url) => {
        expect(String(url)).toContain("/teams/team-1/channels");
        return new Response(
          JSON.stringify({
            value: [{ id: "c1", displayName: "General", description: "" }],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }),
    );

    const { graph } = buildGraph("microsoft365.listChannels", "lc", {
      credentialName: name,
      teamId: "team-1",
    });
    const ctx = createExecutionContext(graph, { log: () => {}, getCredential });
    await runExecFrom("lc", "exec-in", ctx);

    expect(ctx.execOutputs.get("lc:success")).toBe(true);
    expect(ctx.execOutputs.get("lc:channels")).toEqual([{ id: "c1", displayName: "General", description: "" }]);
  });
});

describe("microsoft365.listSites", () => {
  it("searches SharePoint sites", async () => {
    const { name, getCredential } = freshCredential();
    vi.stubGlobal(
      "fetch",
      mockGraphFetch(async (url) => {
        expect(String(url)).toContain("/sites?search=");
        return new Response(
          JSON.stringify({
            value: [
              {
                id: "s1",
                name: "Team Site",
                webUrl: "https://contoso.sharepoint.com/sites/team",
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }),
    );

    const { graph } = buildGraph("microsoft365.listSites", "ls", {
      credentialName: name,
      search: "team",
    });
    const ctx = createExecutionContext(graph, { log: () => {}, getCredential });
    await runExecFrom("ls", "exec-in", ctx);

    expect(ctx.execOutputs.get("ls:success")).toBe(true);
    expect(ctx.execOutputs.get("ls:sites")).toEqual([
      {
        id: "s1",
        name: "Team Site",
        webUrl: "https://contoso.sharepoint.com/sites/team",
      },
    ]);
  });
});

describe("microsoft365.createFolder", () => {
  it("creates a folder in a user's OneDrive", async () => {
    const { name, getCredential } = freshCredential();
    vi.stubGlobal(
      "fetch",
      mockGraphFetch(async (url, init) => {
        expect(String(url)).toContain("/drive/root:/reports:/children");
        const body = JSON.parse(String(init?.body));
        expect(body.name).toBe("archive");
        return new Response(JSON.stringify({ id: "folder-1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    const { graph } = buildGraph("microsoft365.createFolder", "cf", {
      credentialName: name,
      userId: "ada@contoso.com",
      parentPath: "reports",
      name: "archive",
    });
    const ctx = createExecutionContext(graph, { log: () => {}, getCredential });
    await runExecFrom("cf", "exec-in", ctx);

    expect(ctx.execOutputs.get("cf:success")).toBe(true);
    expect(ctx.execOutputs.get("cf:id")).toBe("folder-1");
  });
});

describe("microsoft365.getWorksheetRange / setWorksheetRange", () => {
  it("reads a range as JSON", async () => {
    const { name, getCredential } = freshCredential();
    vi.stubGlobal(
      "fetch",
      mockGraphFetch(async (url) => {
        expect(String(url)).toContain("/workbook/worksheets/Sheet1/range(address='A1%3AB2')");
        return new Response(JSON.stringify({ values: [[1, 2]] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    const { graph } = buildGraph("microsoft365.getWorksheetRange", "gr", {
      credentialName: name,
      userId: "ada@contoso.com",
      path: "book.xlsx",
      worksheetName: "Sheet1",
      address: "A1:B2",
    });
    const ctx = createExecutionContext(graph, { log: () => {}, getCredential });
    await runExecFrom("gr", "exec-in", ctx);

    expect(ctx.execOutputs.get("gr:success")).toBe(true);
    expect(ctx.execOutputs.get("gr:valuesJson")).toBe(JSON.stringify([[1, 2]]));
  });

  it("writes a range from JSON", async () => {
    const { name, getCredential } = freshCredential();
    vi.stubGlobal(
      "fetch",
      mockGraphFetch(async (url, init) => {
        expect(String(url)).toContain("/workbook/worksheets/Sheet1/range(address='A1%3AB2')");
        const body = JSON.parse(String(init?.body));
        expect(body.values).toEqual([[1, 2]]);
        return new Response(null, { status: 200 });
      }),
    );

    const { graph } = buildGraph("microsoft365.setWorksheetRange", "sr", {
      credentialName: name,
      userId: "ada@contoso.com",
      path: "book.xlsx",
      worksheetName: "Sheet1",
      address: "A1:B2",
      valuesJson: "[[1,2]]",
    });
    const ctx = createExecutionContext(graph, { log: () => {}, getCredential });
    await runExecFrom("sr", "exec-in", ctx);

    expect(ctx.execOutputs.get("sr:success")).toBe(true);
  });
});

describe("microsoft365.listPlannerTasks", () => {
  it("lists tasks in a Planner plan", async () => {
    const { name, getCredential } = freshCredential();
    vi.stubGlobal(
      "fetch",
      mockGraphFetch(async (url) => {
        expect(String(url)).toContain("/planner/plans/plan-1/tasks");
        return new Response(
          JSON.stringify({
            value: [{ id: "t1", title: "Write spec", percentComplete: 50 }],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }),
    );

    const { graph } = buildGraph("microsoft365.listPlannerTasks", "lp", {
      credentialName: name,
      planId: "plan-1",
    });
    const ctx = createExecutionContext(graph, { log: () => {}, getCredential });
    await runExecFrom("lp", "exec-in", ctx);

    expect(ctx.execOutputs.get("lp:success")).toBe(true);
    expect(ctx.execOutputs.get("lp:tasks")).toEqual([{ id: "t1", title: "Write spec", percentComplete: 50 }]);
  });
});

describe("microsoft365.listContacts", () => {
  it("lists a user's Outlook contacts", async () => {
    const { name, getCredential } = freshCredential();
    vi.stubGlobal(
      "fetch",
      mockGraphFetch(async (url) => {
        expect(String(url)).toContain("/users/ada%40contoso.com/contacts");
        return new Response(
          JSON.stringify({
            value: [
              {
                id: "ct1",
                displayName: "Bob",
                emailAddresses: [{ address: "bob@contoso.com" }],
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }),
    );

    const { graph } = buildGraph("microsoft365.listContacts", "lct", {
      credentialName: name,
      userId: "ada@contoso.com",
    });
    const ctx = createExecutionContext(graph, { log: () => {}, getCredential });
    await runExecFrom("lct", "exec-in", ctx);

    expect(ctx.execOutputs.get("lct:success")).toBe(true);
    expect(ctx.execOutputs.get("lct:contacts")).toEqual([{ id: "ct1", displayName: "Bob", email: "bob@contoso.com" }]);
  });
});

describe("microsoft365.listApplications", () => {
  it("lists app registrations in the tenant", async () => {
    const { name, getCredential } = freshCredential();
    vi.stubGlobal(
      "fetch",
      mockGraphFetch(async (url) => {
        expect(String(url)).toContain("/applications");
        return new Response(
          JSON.stringify({
            value: [{ id: "a1", displayName: "My App", appId: "app-guid" }],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }),
    );

    const { graph } = buildGraph("microsoft365.listApplications", "la", {
      credentialName: name,
    });
    const ctx = createExecutionContext(graph, { log: () => {}, getCredential });
    await runExecFrom("la", "exec-in", ctx);

    expect(ctx.execOutputs.get("la:success")).toBe(true);
    expect(ctx.execOutputs.get("la:applications")).toEqual([{ id: "a1", displayName: "My App", appId: "app-guid" }]);
  });
});

describe("microsoft365.createSubscription", () => {
  it("creates a change notification subscription", async () => {
    const { name, getCredential } = freshCredential();
    vi.stubGlobal(
      "fetch",
      mockGraphFetch(async (url, init) => {
        expect(String(url)).toContain("/subscriptions");
        const body = JSON.parse(String(init?.body));
        expect(body.resource).toBe("/me/mailFolders('Inbox')/messages");
        return new Response(JSON.stringify({ id: "sub-1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    const { graph } = buildGraph("microsoft365.createSubscription", "cs", {
      credentialName: name,
      resource: "/me/mailFolders('Inbox')/messages",
      changeType: "updated",
      notificationUrl: "https://example.com/notify",
      expirationDateTime: "2026-08-02T00:00:00Z",
    });
    const ctx = createExecutionContext(graph, { log: () => {}, getCredential });
    await runExecFrom("cs", "exec-in", ctx);

    expect(ctx.execOutputs.get("cs:success")).toBe(true);
    expect(ctx.execOutputs.get("cs:id")).toBe("sub-1");
  });
});
