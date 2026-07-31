import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { registerBuiltins } from "../../src/nodes/index";
import { createExecutionContext, runExecFrom } from "../../src/engine/executor";
import { getNodeDef } from "../../src/engine/registry";
import { Graph } from "../../src/engine/graph";
import { NodeInstance } from "../../src/engine/nodeInstance";
import type {
  CredentialRecord,
  DropboxOAuth2CredentialData,
} from "../../src/credentials/types";

beforeAll(() => {
  registerBuiltins();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function buildGraph(
  type: string,
  id: string,
  pinValues: Record<string, unknown> = {},
) {
  const graph: Graph = new Graph("g", "test");
  const def = getNodeDef(type);
  const node = NodeInstance.createNodeInstance(
    type,
    { x: 0, y: 0 },
    def.pins,
    id,
  );
  for (const [pinId, value] of Object.entries(pinValues)) {
    node.pins[pinId].value = value;
  }
  graph.nodes.push(node);
  return { graph, node };
}

const CREDENTIAL_DATA: DropboxOAuth2CredentialData = {
  appKey: "app-key-1",
  appSecret: "app-secret-1",
  authCode: "one-time-code",
  refreshToken: "refresh-1",
};

const TEST_CREDENTIAL: CredentialRecord = {
  id: "cred-1",
  name: "My Dropbox Credential",
  type: "dropboxOAuth2",
  data: CREDENTIAL_DATA,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};

function getCredentialStub(name: string): CredentialRecord | undefined {
  return name === TEST_CREDENTIAL.name ? TEST_CREDENTIAL : undefined;
}

/** Every operation node now resolves DropboxManager.forCredential(appKey, appSecret, refreshToken),
 * which is cached by that triple — so each test uses its own unique refresh token to guarantee a
 * fresh (uncached) manager, keeping tests independent of run order and of each other's state. */
let credentialCounter = 0;
function freshCredential(): {
  name: string;
  getCredential: (name: string) => CredentialRecord | undefined;
} {
  credentialCounter += 1;
  const credential: CredentialRecord = {
    id: `cred-op-${credentialCounter}`,
    name: `Op Credential ${credentialCounter}`,
    type: "dropboxOAuth2",
    data: {
      appKey: "app-key-1",
      appSecret: "app-secret-1",
      authCode: "",
      refreshToken: `refresh-op-${credentialCounter}`,
    },
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  };
  return {
    name: credential.name,
    getCredential: (name) =>
      name === credential.name ? credential : undefined,
  };
}

/** Every real Dropbox request first goes through DropboxAuth.checkAndRefreshAccessToken, which
 * (since these tests never pre-seed an access token) always fetches one from /oauth2/token before
 * the actual API call — this stubs that first hop so callers only need to mock the real operation. */
function withTokenRefresh(
  handleOp: (url: string, init?: RequestInit) => Response | Promise<Response>,
) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes("/oauth2/token")) {
      return new Response(
        JSON.stringify({ access_token: "tok-live", expires_in: 14400 }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    return handleOp(url, init);
  });
}

describe("dropbox.authorize", () => {
  it("exchanges the vault credential's authorization code for a refresh token and access token", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(String(url)).toContain("/oauth2/token");
      expect(String(url)).toContain("grant_type=authorization_code");
      expect(String(url)).toContain(`code=${CREDENTIAL_DATA.authCode}`);
      return new Response(
        JSON.stringify({
          access_token: "tok-1",
          expires_in: 14400,
          refresh_token: "refresh-fresh",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const { graph } = buildGraph("dropbox.authorize", "az", {
      credentialName: TEST_CREDENTIAL.name,
    });
    const ctx = createExecutionContext(graph, {
      log: () => {},
      getCredential: getCredentialStub,
    });
    await runExecFrom("az", "exec-in", ctx);

    expect(ctx.execOutputs.get("az:success")).toBe(true);
    expect(ctx.execOutputs.get("az:accessToken")).toBe("tok-1");
    expect(ctx.execOutputs.get("az:refreshToken")).toBe("refresh-fresh");
    expect(ctx.execOutputs.get("az:expiresIn")).toBe(14400);
    expect(ctx.execOutputs.get("az:error")).toBe("");
  });

  it("surfaces a malformed/expired authorization code as an error instead of throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: "invalid_grant",
              error_description: "code has expired",
            }),
            { status: 400 },
          ),
      ),
    );

    const { graph } = buildGraph("dropbox.authorize", "az", {
      credentialName: TEST_CREDENTIAL.name,
    });
    const ctx = createExecutionContext(graph, {
      log: () => {},
      getCredential: getCredentialStub,
    });
    await runExecFrom("az", "exec-in", ctx);

    expect(ctx.execOutputs.get("az:success")).toBe(false);
    expect(ctx.execOutputs.get("az:refreshToken")).toBe("");
    expect(ctx.execOutputs.get("az:error")).toBe(
      "invalid_grant: code has expired",
    );
  });

  it("reports an error and never calls fetch when the named credential doesn't exist", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { graph } = buildGraph("dropbox.authorize", "az", {
      credentialName: "Nonexistent",
    });
    const ctx = createExecutionContext(graph, {
      log: () => {},
      getCredential: getCredentialStub,
    });
    await runExecFrom("az", "exec-in", ctx);

    expect(ctx.execOutputs.get("az:success")).toBe(false);
    expect(ctx.execOutputs.get("az:error")).toContain("not found");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("dropbox.upload", () => {
  it("uploads content to the given path and reports success", async () => {
    const { name, getCredential } = freshCredential();
    const fetchMock = withTokenRefresh(async (url, init) => {
      expect(String(url)).toContain("/files/upload");
      expect(
        (init?.headers as Record<string, string>)["Dropbox-API-Arg"],
      ).toContain('"path":"/report.csv"');
      return new Response(JSON.stringify({ name: "report.csv" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { graph } = buildGraph("dropbox.upload", "up", {
      credentialName: name,
      path: "/report.csv",
      content: "a,b\n1,2",
    });
    const ctx = createExecutionContext(graph, { log: () => {}, getCredential });
    await runExecFrom("up", "exec-in", ctx);

    expect(ctx.execOutputs.get("up:success")).toBe(true);
    expect(ctx.execOutputs.get("up:error")).toBe("");
  });

  it("reports a Dropbox API error (e.g. path conflict) via the error output instead of throwing", async () => {
    const { name, getCredential } = freshCredential();
    vi.stubGlobal(
      "fetch",
      withTokenRefresh(
        async () =>
          new Response(
            JSON.stringify({ error_summary: "path/conflict/file/..." }),
            { status: 409 },
          ),
      ),
    );

    const { graph } = buildGraph("dropbox.upload", "up", {
      credentialName: name,
      path: "/report.csv",
      content: "x",
    });
    const ctx = createExecutionContext(graph, { log: () => {}, getCredential });
    await runExecFrom("up", "exec-in", ctx);

    expect(ctx.execOutputs.get("up:success")).toBe(false);
    expect(ctx.execOutputs.get("up:error")).toBe("path/conflict/file/...");
  });

  it("reports an error and never calls fetch when the named credential doesn't exist", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { graph } = buildGraph("dropbox.upload", "up", {
      credentialName: "Nonexistent",
      path: "/report.csv",
      content: "x",
    });
    const ctx = createExecutionContext(graph, {
      log: () => {},
      getCredential: getCredentialStub,
    });
    await runExecFrom("up", "exec-in", ctx);

    expect(ctx.execOutputs.get("up:success")).toBe(false);
    expect(ctx.execOutputs.get("up:error")).toContain("not found");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("dropbox.download", () => {
  it("downloads a file's content and decodes it per the Encoding pin", async () => {
    const { name, getCredential } = freshCredential();
    vi.stubGlobal(
      "fetch",
      withTokenRefresh(async (url) => {
        expect(String(url)).toContain("/files/download");
        return new Response(Buffer.from("hello world"), {
          status: 200,
          headers: {
            "dropbox-api-result": JSON.stringify({ name: "report.csv" }),
          },
        });
      }),
    );

    const { graph } = buildGraph("dropbox.download", "dl", {
      credentialName: name,
      path: "/report.csv",
      encoding: "utf8",
    });
    const ctx = createExecutionContext(graph, { log: () => {}, getCredential });
    await runExecFrom("dl", "exec-in", ctx);

    expect(ctx.execOutputs.get("dl:success")).toBe(true);
    expect(ctx.execOutputs.get("dl:content")).toBe("hello world");
    expect(ctx.execOutputs.get("dl:error")).toBe("");
  });

  it("reports a not-found error instead of throwing", async () => {
    const { name, getCredential } = freshCredential();
    vi.stubGlobal(
      "fetch",
      withTokenRefresh(
        async () =>
          new Response(JSON.stringify({ error_summary: "path/not_found/.." }), {
            status: 409,
          }),
      ),
    );

    const { graph } = buildGraph("dropbox.download", "dl", {
      credentialName: name,
      path: "/missing.csv",
    });
    const ctx = createExecutionContext(graph, { log: () => {}, getCredential });
    await runExecFrom("dl", "exec-in", ctx);

    expect(ctx.execOutputs.get("dl:success")).toBe(false);
    expect(ctx.execOutputs.get("dl:content")).toBe("");
    expect(ctx.execOutputs.get("dl:error")).toBe("path/not_found/..");
  });
});

describe("dropbox.listFolders", () => {
  it("returns only folder entries, ignoring files, and passes the Recursive pin through", async () => {
    const { name, getCredential } = freshCredential();
    vi.stubGlobal(
      "fetch",
      withTokenRefresh(async (url, init) => {
        expect(String(url)).toContain("/files/list_folder");
        const body = JSON.parse(String(init?.body));
        expect(body.path).toBe("/root");
        expect(body.recursive).toBe(true);
        return new Response(
          JSON.stringify({
            entries: [
              { ".tag": "folder", path_display: "/root/Sub A", name: "Sub A" },
              {
                ".tag": "file",
                path_display: "/root/notes.txt",
                name: "notes.txt",
              },
              { ".tag": "folder", path_display: "/root/Sub B", name: "Sub B" },
            ],
            cursor: "cursor-1",
            has_more: false,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    const { graph } = buildGraph("dropbox.listFolders", "lf", {
      credentialName: name,
      path: "/root",
      recursive: true,
    });
    const ctx = createExecutionContext(graph, { log: () => {}, getCredential });
    await runExecFrom("lf", "exec-in", ctx);

    expect(ctx.execOutputs.get("lf:success")).toBe(true);
    expect(ctx.execOutputs.get("lf:folders")).toEqual([
      "/root/Sub A",
      "/root/Sub B",
    ]);
    expect(ctx.execOutputs.get("lf:error")).toBe("");
  });

  it("paginates through list_folder/continue until has_more is false", async () => {
    const { name, getCredential } = freshCredential();
    vi.stubGlobal(
      "fetch",
      withTokenRefresh(async (url) => {
        if (String(url).includes("/files/list_folder/continue")) {
          return new Response(
            JSON.stringify({
              entries: [{ ".tag": "folder", path_display: "/root/Sub B" }],
              cursor: "cursor-2",
              has_more: false,
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        return new Response(
          JSON.stringify({
            entries: [{ ".tag": "folder", path_display: "/root/Sub A" }],
            cursor: "cursor-1",
            has_more: true,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }),
    );

    const { graph } = buildGraph("dropbox.listFolders", "lf", {
      credentialName: name,
      path: "/root",
    });
    const ctx = createExecutionContext(graph, { log: () => {}, getCredential });
    await runExecFrom("lf", "exec-in", ctx);

    expect(ctx.execOutputs.get("lf:success")).toBe(true);
    expect(ctx.execOutputs.get("lf:folders")).toEqual([
      "/root/Sub A",
      "/root/Sub B",
    ]);
  });

  it("reports a Dropbox API error via the error output instead of throwing", async () => {
    const { name, getCredential } = freshCredential();
    vi.stubGlobal(
      "fetch",
      withTokenRefresh(
        async () =>
          new Response(JSON.stringify({ error_summary: "path/not_found/.." }), {
            status: 409,
          }),
      ),
    );

    const { graph } = buildGraph("dropbox.listFolders", "lf", {
      credentialName: name,
      path: "/missing",
    });
    const ctx = createExecutionContext(graph, { log: () => {}, getCredential });
    await runExecFrom("lf", "exec-in", ctx);

    expect(ctx.execOutputs.get("lf:success")).toBe(false);
    expect(ctx.execOutputs.get("lf:folders")).toEqual([]);
    expect(ctx.execOutputs.get("lf:error")).toBe("path/not_found/..");
  });
});

describe.each(["move", "copy", "rename"])("dropbox.%s", (op) => {
  const type = `dropbox.${op}`;

  it("sends from_path/to_path and reports success", async () => {
    const { name, getCredential } = freshCredential();
    const fetchMock = withTokenRefresh(async (url, init) => {
      expect(String(url)).toContain(
        op === "copy" ? "/files/copy_v2" : "/files/move_v2",
      );
      const body = JSON.parse(String(init?.body));
      expect(body.from_path).toBe("/a.txt");
      expect(body.to_path).toBe("/b.txt");
      return new Response(JSON.stringify({ metadata: { name: "b.txt" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { graph } = buildGraph(type, "op", {
      credentialName: name,
      fromPath: "/a.txt",
      toPath: "/b.txt",
    });
    const ctx = createExecutionContext(graph, { log: () => {}, getCredential });
    await runExecFrom("op", "exec-in", ctx);

    expect(ctx.execOutputs.get("op:success")).toBe(true);
    expect(ctx.execOutputs.get("op:error")).toBe("");
  });
});

describe("dropbox.delete", () => {
  it("deletes the given path and reports success", async () => {
    const { name, getCredential } = freshCredential();
    const fetchMock = withTokenRefresh(async (url) => {
      expect(String(url)).toContain("/files/delete_v2");
      return new Response(JSON.stringify({ metadata: { name: "a.txt" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { graph } = buildGraph("dropbox.delete", "del", {
      credentialName: name,
      path: "/a.txt",
    });
    const ctx = createExecutionContext(graph, { log: () => {}, getCredential });
    await runExecFrom("del", "exec-in", ctx);

    expect(ctx.execOutputs.get("del:success")).toBe(true);
    expect(ctx.execOutputs.get("del:error")).toBe("");
  });
});
