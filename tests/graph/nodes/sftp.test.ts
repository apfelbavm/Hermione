import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { registerBuiltins } from "../../../src/graph/nodes/index";
import { createExecutionContext, runExecFrom } from "@hermione/graph/engine/executor";
import { getNodeDef } from "@hermione/graph/engine/registry";
import { Graph } from "@hermione/graph/engine/graph";
import { NodeInstance } from "@hermione/graph/engine/nodeInstance";
import type { CredentialRecord, SftpCredentialData } from "@hermione/shared/types";

/** SftpManager (like TwilioManager/DropboxManager) resolves its named credential straight from the
 * database via resolveAllCredentials(getDatabaseManager()) instead of ctx.getCredential — mock that
 * resolution layer directly rather than standing up a real DatabaseManager. */
let credentials: Map<string, CredentialRecord> = new Map();
vi.mock("@hermione/core/server/DatabaseManager", () => ({
  getDatabaseManager: () => ({}),
}));
vi.mock("@hermione/core/server/vaultCredentials", () => ({
  resolveAllCredentials: async () => credentials,
}));

/** SftpManager delegates the actual SSH/SFTP connection to "ssh2-sftp-client" — mock the SDK itself
 * rather than a real socket. */
let fakeSftp: Record<string, unknown>;
vi.mock("ssh2-sftp-client", () => ({
  default: vi.fn(function FakeSftpClient() {
    return fakeSftp;
  }),
}));

beforeAll(() => {
  registerBuiltins();
});

beforeEach(() => {
  fakeSftp = {
    connect: vi.fn(async () => {}),
    mkdir: vi.fn(async () => {}),
    exists: vi.fn(async () => false),
    put: vi.fn(async () => {}),
    append: vi.fn(async () => {}),
    end: vi.fn(async () => {}),
  };
});

afterEach(() => {
  vi.clearAllMocks();
  credentials = new Map();
});

function buildGraph(pinValues: Record<string, unknown> = {}) {
  const graph: Graph = new Graph("g", "test");
  const def = getNodeDef("sftp.upload");
  const node = NodeInstance.createNodeInstance("sftp.upload", { x: 0, y: 0 }, def.pins, "req");
  for (const [id, value] of Object.entries(pinValues)) {
    node.pins[id].value = value;
  }
  graph.nodes.push(node);
  return { graph, node };
}

const CREDENTIAL_DATA: SftpCredentialData = {
  host: "example.com",
  port: "22",
  username: "svc-user",
  password: "svc-pass",
  privateKey: "",
  passphrase: "",
};

const TEST_CREDENTIAL: CredentialRecord = {
  id: "cred-1",
  name: "My SFTP Credential",
  type: "sftpCredential",
  data: CREDENTIAL_DATA,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};

describe("sftp.upload", () => {
  it("exposes a Credential Name pin instead of raw host/username/password pins", () => {
    const def = getNodeDef("sftp.upload");
    expect(def.pins.find((p) => p.id === "credentialName")).toBeTruthy();
    expect(def.pins.find((p) => p.id === "host")).toBeUndefined();
    expect(def.pins.find((p) => p.id === "username")).toBeUndefined();
    expect(def.pins.find((p) => p.id === "password")).toBeUndefined();
  });

  it("exposes Existing File as an enum pin restricted to the four conflict-resolution modes", () => {
    const def = getNodeDef("sftp.upload");
    const pin = def.pins.find((p) => p.id === "existingFileMode")!;
    expect(pin.type).toBe("enum");
    expect(pin.options).toEqual(["Overwrite", "Append", "Fail", "Ignore"]);
  });

  it("exposes Encoding as an enum pin restricted to utf8/base64", () => {
    const def = getNodeDef("sftp.upload");
    const pin = def.pins.find((p) => p.id === "encoding")!;
    expect(pin.options).toEqual(["utf8", "base64"]);
  });

  it("defaults Prevent Directory Traversal and Create Directory to on", () => {
    const def = getNodeDef("sftp.upload");
    expect(def.pins.find((p) => p.id === "preventDirectoryTraversal")!.defaultValue).toBe(true);
    expect(def.pins.find((p) => p.id === "createDirectory")!.defaultValue).toBe(true);
  });

  it("execute() reports failure when the named credential is not found in the vault", async () => {
    const { graph } = buildGraph({ credentialName: "missing", filePath: "/incoming/report.csv", content: "a,b\n1,2" });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("req", "exec-in", ctx);

    expect(ctx.execOutputs.get("req:success")).toBe(false);
    expect(ctx.execOutputs.get("req:skipped")).toBe(false);
    expect(ctx.execOutputs.get("req:attempts")).toBe(0);
    expect(String(ctx.execOutputs.get("req:error"))).toMatch(/not found in the vault/i);
  });

  it("execute() reports failure when the named credential is not an SFTP credential", async () => {
    credentials.set("wrong-type", { ...TEST_CREDENTIAL, name: "wrong-type", type: "usernamePassword", data: { username: "a", password: "b" } });
    const { graph } = buildGraph({ credentialName: "wrong-type", filePath: "/incoming/report.csv", content: "a,b\n1,2" });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("req", "exec-in", ctx);

    expect(ctx.execOutputs.get("req:success")).toBe(false);
    expect(String(ctx.execOutputs.get("req:error"))).toMatch(/not an SFTP/i);
  });

  it("execute() connects using the resolved credential and uploads the file", async () => {
    credentials.set(TEST_CREDENTIAL.name, TEST_CREDENTIAL);
    const { graph } = buildGraph({ credentialName: TEST_CREDENTIAL.name, filePath: "/incoming/report.csv", content: "a,b\n1,2" });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("req", "exec-in", ctx);

    expect(fakeSftp.connect).toHaveBeenCalledWith(expect.objectContaining({ host: "example.com", port: 22, username: "svc-user", password: "svc-pass" }));
    expect(fakeSftp.put).toHaveBeenCalledWith(Buffer.from("a,b\n1,2", "utf8"), "/incoming/report.csv");
    expect(ctx.execOutputs.get("req:success")).toBe(true);
    expect(ctx.execOutputs.get("req:skipped")).toBe(false);
    expect(ctx.execOutputs.get("req:attempts")).toBe(1);
  });

  it("execute() skips the upload when the file already exists and Existing File is Ignore", async () => {
    credentials.set(TEST_CREDENTIAL.name, TEST_CREDENTIAL);
    fakeSftp.exists = vi.fn(async () => true);
    const { graph } = buildGraph({ credentialName: TEST_CREDENTIAL.name, filePath: "/incoming/report.csv", content: "a,b\n1,2", existingFileMode: "Ignore" });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("req", "exec-in", ctx);

    expect(fakeSftp.put).not.toHaveBeenCalled();
    expect(ctx.execOutputs.get("req:success")).toBe(true);
    expect(ctx.execOutputs.get("req:skipped")).toBe(true);
  });

  it("compileExecute calls SftpManager.upload with every pin named in an inputs object", () => {
    const def = getNodeDef("sftp.upload");
    const node = buildGraph().node;
    const statements = def.compileExecute!({
      node,
      inputs: {
        credentialName: "c",
        filePath: "fp",
        content: "co",
        encoding: "e",
        createDirectory: "cd",
        existingFileMode: "efm",
        preventDirectoryTraversal: "pdt",
        maxReconnectAttempts: "mra",
        reconnectDelayMs: "rdm",
        timeoutMs: "t",
      },
      graph: {} as never,
      compileFrom: () => ["/* continuation */"],
    });
    expect(statements[0]).toBe("const __result_req = await SftpManager.upload(c, fp, co, e, cd, efm, pdt, mra, rdm, t);");
    expect(statements[1]).toBe("/* continuation */");
  });

  it("compileImports declares the SftpManager module the compiled output needs", () => {
    const def = getNodeDef("sftp.upload");
    expect(def.compileImports).toEqual(['import { SftpManager } from "../../packages/core/src/lib/sftpManager.ts";']);
  });
});
