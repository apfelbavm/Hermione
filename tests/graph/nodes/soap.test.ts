import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { registerBuiltins } from "../../../src/graph/nodes/index";
import { createExecutionContext, runExecFrom } from "@hermione/graph/engine/executor";
import { getNodeDef } from "@hermione/graph/engine/registry";
import { Graph } from "@hermione/graph/engine/graph";
import { NodeInstance } from "@hermione/graph/engine/nodeInstance";
import type { CredentialRecord, SoapBasicAuthCredentialData } from "@hermione/shared/types";

/** SoapManager (like TwilioManager/DropboxManager) resolves its named credential straight from the
 * database via resolveAllCredentials(getDatabaseManager()) instead of ctx.getCredential — mock that
 * resolution layer directly rather than standing up a real DatabaseManager. */
let credentials: Map<string, CredentialRecord> = new Map();
vi.mock("@hermione/core/server/DatabaseManager", () => ({
  getDatabaseManager: () => ({}),
}));
vi.mock("@hermione/core/server/vaultCredentials", () => ({
  resolveAllCredentials: async () => credentials,
}));

/** SoapManager delegates the actual WSDL fetch/parse and SOAP call to the "soap" (node-soap) SDK —
 * mock the SDK itself rather than the network, since node-soap's own client does far more than a
 * plain HTTP round-trip (WSDL parsing, envelope construction). */
class FakeBasicAuthSecurity {
  constructor(
    public username: string,
    public password: string,
  ) {}
}
class FakeWSSecurity {
  constructor(
    public username: string,
    public password: string,
    public options: unknown,
  ) {}
}
let fakeClient: Record<string, unknown>;
let createClientAsyncMock: (...args: unknown[]) => Promise<Record<string, unknown>>;
vi.mock("soap", () => ({
  createClientAsync: (...args: unknown[]) => createClientAsyncMock(...args),
  BasicAuthSecurity: FakeBasicAuthSecurity,
  WSSecurity: FakeWSSecurity,
}));

beforeAll(() => {
  registerBuiltins();
});

beforeEach(() => {
  fakeClient = {
    setSecurity: vi.fn(),
    addSoapHeader: vi.fn(),
    lastRequest: "<xml>request</xml>",
    lastResponse: "<xml>response</xml>",
    describe: vi.fn(() => ({ MyService: { MyPort: { GetStatus: {} } } })),
  };
  createClientAsyncMock = vi.fn(async () => fakeClient);
});

afterEach(() => {
  vi.clearAllMocks();
  credentials = new Map();
});

function buildGraph(type: string, pinValues: Record<string, unknown> = {}) {
  const graph: Graph = new Graph("g", "test");
  const def = getNodeDef(type);
  const node = NodeInstance.createNodeInstance(type, { x: 0, y: 0 }, def.pins, "req");
  for (const [id, value] of Object.entries(pinValues)) {
    node.pins[id].value = value;
  }
  graph.nodes.push(node);
  return { graph, node };
}

const CREDENTIAL_DATA: SoapBasicAuthCredentialData = {
  security: "Basic",
  username: "svc-user",
  password: "svc-pass",
  wsSecurityPasswordType: "PasswordText",
};

const TEST_CREDENTIAL: CredentialRecord = {
  id: "cred-1",
  name: "My SOAP Credential",
  type: "soapBasicAuth",
  data: CREDENTIAL_DATA,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};

describe("soap.call", () => {
  it("exposes a Credential Name pin instead of raw security/username/password pins", () => {
    const def = getNodeDef("soap.call");
    expect(def.pins.find((p) => p.id === "credentialName")).toBeTruthy();
    expect(def.pins.find((p) => p.id === "security")).toBeUndefined();
    expect(def.pins.find((p) => p.id === "username")).toBeUndefined();
    expect(def.pins.find((p) => p.id === "password")).toBeUndefined();
  });

  it("execute() reports failure when the named credential is not found in the vault", async () => {
    const { graph } = buildGraph("soap.call", { credentialName: "missing", wsdlUrl: "https://example.com/service?wsdl", operation: "GetStatus" });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("req", "exec-in", ctx);

    expect(ctx.execOutputs.get("req:success")).toBe(false);
    expect(String(ctx.execOutputs.get("req:error"))).toMatch(/not found in the vault/i);
    expect(createClientAsyncMock).not.toHaveBeenCalled();
  });

  it("execute() reports failure when the named credential is not a SOAP credential", async () => {
    credentials.set("wrong-type", { ...TEST_CREDENTIAL, name: "wrong-type", type: "usernamePassword", data: { username: "a", password: "b" } });
    const { graph } = buildGraph("soap.call", { credentialName: "wrong-type", wsdlUrl: "https://example.com/service?wsdl", operation: "GetStatus" });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("req", "exec-in", ctx);

    expect(ctx.execOutputs.get("req:success")).toBe(false);
    expect(String(ctx.execOutputs.get("req:error"))).toMatch(/not a SOAP/i);
  });

  it("execute() calls the WSDL operation via the soap SDK, applying Basic auth from the resolved credential", async () => {
    credentials.set(TEST_CREDENTIAL.name, TEST_CREDENTIAL);
    fakeClient.GetStatusAsync = vi.fn(async () => [{ status: "OK" }]);

    const { graph } = buildGraph("soap.call", {
      credentialName: TEST_CREDENTIAL.name,
      wsdlUrl: "https://example.com/service?wsdl",
      operation: "GetStatus",
      args: '{"id":1}',
      timeoutMs: 0,
    });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("req", "exec-in", ctx);

    expect(createClientAsyncMock).toHaveBeenCalledWith("https://example.com/service?wsdl", { endpoint: undefined });
    expect(fakeClient.setSecurity).toHaveBeenCalledWith(expect.any(FakeBasicAuthSecurity));
    expect(fakeClient.GetStatusAsync).toHaveBeenCalledWith({ id: 1 });
    expect(ctx.execOutputs.get("req:success")).toBe(true);
    expect(ctx.execOutputs.get("req:result")).toBe(JSON.stringify({ status: "OK" }));
    expect(ctx.execOutputs.get("req:rawRequest")).toBe("<xml>request</xml>");
    expect(ctx.execOutputs.get("req:rawResponse")).toBe("<xml>response</xml>");
  });

  it("execute() reports failure when the operation is not found on the WSDL", async () => {
    credentials.set(TEST_CREDENTIAL.name, TEST_CREDENTIAL);
    const { graph } = buildGraph("soap.call", { credentialName: TEST_CREDENTIAL.name, wsdlUrl: "https://example.com/service?wsdl", operation: "NoSuchOp" });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("req", "exec-in", ctx);

    expect(ctx.execOutputs.get("req:success")).toBe(false);
    expect(String(ctx.execOutputs.get("req:error"))).toMatch(/was not found on this WSDL/i);
  });

  it("compileExecute calls SoapManager.call with every pin named in an inputs object", () => {
    const def = getNodeDef("soap.call");
    const node = buildGraph("soap.call").node;
    const statements = def.compileExecute!({
      node,
      inputs: { credentialName: "c", wsdlUrl: "w", operation: "o", args: "a", endpointOverride: "e", headers: "h", timeoutMs: "t" },
      graph: {} as never,
      compileFrom: () => ["/* continuation */"],
    });
    expect(statements[0]).toBe("const __result_req = await SoapManager.call(c, w, o, a, e, h, t);");
    expect(statements[1]).toBe("/* continuation */");
  });

  it("compileImports declares the SoapManager module the compiled output needs", () => {
    const def = getNodeDef("soap.call");
    expect(def.compileImports).toEqual(['import { SoapManager } from "../../packages/core/src/lib/soapManager.ts";']);
  });
});

describe("soap.describe", () => {
  it("takes no credential — describing a WSDL never needs the security handshake its operations do", () => {
    const def = getNodeDef("soap.describe");
    expect(def.pins.find((p) => p.id === "credentialName")).toBeUndefined();
  });

  it("execute() fetches the WSDL via the soap SDK and returns its description as JSON", async () => {
    const { graph } = buildGraph("soap.describe", { wsdlUrl: "https://example.com/service?wsdl" });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("req", "exec-in", ctx);

    expect(createClientAsyncMock).toHaveBeenCalledWith("https://example.com/service?wsdl");
    expect(ctx.execOutputs.get("req:success")).toBe(true);
    expect(ctx.execOutputs.get("req:description")).toBe(JSON.stringify({ MyService: { MyPort: { GetStatus: {} } } }));
  });

  it("compileExecute calls SoapManager.describe and maps its descriptionJson to the Description pin", () => {
    const def = getNodeDef("soap.describe");
    const node = buildGraph("soap.describe").node;
    const statements = def.compileExecute!({
      node,
      inputs: { wsdlUrl: "w", timeoutMs: "t" },
      graph: {} as never,
      compileFrom: () => ["/* continuation */"],
    });
    expect(statements[0]).toBe("const __result_req = await SoapManager.describe(w, t);");

    const outputs = def.compileExecuteOutputs!({ node } as never);
    expect(outputs.description).toBe("__result_req.descriptionJson");
  });
});
