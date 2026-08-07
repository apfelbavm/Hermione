import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { registerBuiltins } from "../../../src/graph/nodes/index";
import { createExecutionContext, runExecFrom } from "@hermione/graph/engine/executor";
import { getNodeDef } from "@hermione/graph/engine/registry";
import { Graph } from "@hermione/graph/engine/graph";
import { NodeInstance } from "@hermione/graph/engine/nodeInstance";
import type { CredentialRecord, GithubTokenCredentialData } from "@hermione/shared/types";

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

const CREDENTIAL_DATA: GithubTokenCredentialData = { token: "ghp_test-token" };

const TEST_CREDENTIAL: CredentialRecord = {
  id: "cred-1",
  name: "My GitHub Credential",
  type: "githubToken",
  data: CREDENTIAL_DATA,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};

function getCredentialStub(name: string): CredentialRecord | undefined {
  return name === TEST_CREDENTIAL.name ? TEST_CREDENTIAL : undefined;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("github.listIssues", () => {
  it("lists issues, filtering out pull requests", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(String(url)).toContain("/repos/acme/widgets/issues");
        return jsonResponse([
          {
            number: 1,
            title: "Bug",
            state: "open",
            html_url: "https://github.com/acme/widgets/issues/1",
          },
          {
            number: 2,
            title: "PR",
            state: "open",
            html_url: "https://github.com/acme/widgets/pull/2",
            pull_request: {},
          },
        ]);
      }),
    );

    const { graph } = buildGraph("github.listIssues", "li", {
      credentialName: TEST_CREDENTIAL.name,
      owner: "acme",
      repo: "widgets",
    });
    const ctx = createExecutionContext(graph, {
      log: () => {},
      getCredential: getCredentialStub,
    });
    await runExecFrom("li", "exec-in", ctx);

    expect(ctx.execOutputs.get("li:success")).toBe(true);
    expect(ctx.execOutputs.get("li:issues")).toEqual([
      {
        number: 1,
        title: "Bug",
        state: "open",
        url: "https://github.com/acme/widgets/issues/1",
      },
    ]);
    expect(ctx.execOutputs.get("li:error")).toBe("");
  });

  it("reports an error and never calls fetch when the named credential doesn't exist", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { graph } = buildGraph("github.listIssues", "li", {
      credentialName: "Nonexistent",
      owner: "acme",
      repo: "widgets",
    });
    const ctx = createExecutionContext(graph, {
      log: () => {},
      getCredential: getCredentialStub,
    });
    await runExecFrom("li", "exec-in", ctx);

    expect(ctx.execOutputs.get("li:success")).toBe(false);
    expect(ctx.execOutputs.get("li:error")).toContain("not found");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("github.createIssue", () => {
  it("creates an issue and returns its number and URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ number: 42, html_url: "https://github.com/acme/widgets/issues/42" }, 201)),
    );

    const { graph } = buildGraph("github.createIssue", "ci", {
      credentialName: TEST_CREDENTIAL.name,
      owner: "acme",
      repo: "widgets",
      title: "New bug",
      body: "Details",
    });
    const ctx = createExecutionContext(graph, {
      log: () => {},
      getCredential: getCredentialStub,
    });
    await runExecFrom("ci", "exec-in", ctx);

    expect(ctx.execOutputs.get("ci:success")).toBe(true);
    expect(ctx.execOutputs.get("ci:result")).toEqual({
      number: 42,
      url: "https://github.com/acme/widgets/issues/42",
    });
  });

  it("surfaces a GitHub API error via the error output instead of throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ message: "Validation Failed" }, 422)),
    );

    const { graph } = buildGraph("github.createIssue", "ci", {
      credentialName: TEST_CREDENTIAL.name,
      owner: "acme",
      repo: "widgets",
      title: "",
      body: "",
    });
    const ctx = createExecutionContext(graph, {
      log: () => {},
      getCredential: getCredentialStub,
    });
    await runExecFrom("ci", "exec-in", ctx);

    expect(ctx.execOutputs.get("ci:success")).toBe(false);
    expect(ctx.execOutputs.get("ci:error")).toBe("Validation Failed (status 422)");
  });
});

describe("github.mergePullRequest", () => {
  it("merges a pull request using the given merge method", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(String(url)).toContain("/pulls/7/merge");
        return jsonResponse({ merged: true, sha: "abc123" });
      }),
    );

    const { graph } = buildGraph("github.mergePullRequest", "mp", {
      credentialName: TEST_CREDENTIAL.name,
      owner: "acme",
      repo: "widgets",
      pullNumber: 7,
      mergeMethod: "squash",
    });
    const ctx = createExecutionContext(graph, {
      log: () => {},
      getCredential: getCredentialStub,
    });
    await runExecFrom("mp", "exec-in", ctx);

    expect(ctx.execOutputs.get("mp:success")).toBe(true);
    expect(ctx.execOutputs.get("mp:result")).toEqual({
      merged: true,
      sha: "abc123",
    });
  });
});

describe("github.getFileContent", () => {
  it("decodes base64 file content and returns its SHA", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          type: "file",
          content: Buffer.from("hello world").toString("base64"),
          sha: "file-sha-1",
        }),
      ),
    );

    const { graph } = buildGraph("github.getFileContent", "gf", {
      credentialName: TEST_CREDENTIAL.name,
      owner: "acme",
      repo: "widgets",
      path: "README.md",
    });
    const ctx = createExecutionContext(graph, {
      log: () => {},
      getCredential: getCredentialStub,
    });
    await runExecFrom("gf", "exec-in", ctx);

    expect(ctx.execOutputs.get("gf:success")).toBe(true);
    expect(ctx.execOutputs.get("gf:result")).toEqual({
      content: "hello world",
      sha: "file-sha-1",
    });
  });
});

describe("github.request", () => {
  it("passes the route through to octokit.request and returns its data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(String(url)).toContain("/repos/acme/widgets");
        return jsonResponse({ full_name: "acme/widgets" });
      }),
    );

    const { graph } = buildGraph("github.request", "rq", {
      credentialName: TEST_CREDENTIAL.name,
      route: "GET /repos/{owner}/{repo}",
      paramsJson: '{"owner":"acme","repo":"widgets"}',
    });
    const ctx = createExecutionContext(graph, {
      log: () => {},
      getCredential: getCredentialStub,
    });
    await runExecFrom("rq", "exec-in", ctx);

    expect(ctx.execOutputs.get("rq:success")).toBe(true);
    expect(ctx.execOutputs.get("rq:data")).toEqual({
      full_name: "acme/widgets",
    });
  });

  it("reports invalid JSON params as an error instead of throwing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { graph } = buildGraph("github.request", "rq", {
      credentialName: TEST_CREDENTIAL.name,
      route: "GET /repos/{owner}/{repo}",
      paramsJson: "{not json",
    });
    const ctx = createExecutionContext(graph, {
      log: () => {},
      getCredential: getCredentialStub,
    });
    await runExecFrom("rq", "exec-in", ctx);

    expect(ctx.execOutputs.get("rq:success")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
