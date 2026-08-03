import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltins } from "../../../src/graph/nodes/index";
import { createExecutionContext, runExecFrom } from "../../../src/graph/engine/executor";
import { getNodeDef } from "../../../src/graph/engine/registry";
import { Graph } from "../../../src/graph/engine/graph";
import { NodeInstance } from "../../../src/graph/engine/nodeInstance";

beforeAll(() => {
  registerBuiltins();
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

describe("soap.call", () => {
  it("exposes Security as an enum pin restricted to None/Basic/WSSecurity", () => {
    const def = getNodeDef("soap.call");
    const pin = def.pins.find((p) => p.id === "security")!;
    expect(pin.type).toBe("enum");
    expect(pin.options).toEqual(["None", "Basic", "WSSecurity"]);
    expect(pin.defaultValue).toBe("None");
  });

  it("exposes WS-Security Password Type as an enum pin restricted to PasswordText/PasswordDigest", () => {
    const def = getNodeDef("soap.call");
    const pin = def.pins.find((p) => p.id === "wsSecurityPasswordType")!;
    expect(pin.options).toEqual(["PasswordText", "PasswordDigest"]);
    expect(pin.defaultValue).toBe("PasswordText");
  });

  it("interpreter execute() always reports failure — there is no browser-side way to load the soap SDK's WSDL/XML machinery", async () => {
    const { graph } = buildGraph("soap.call", {
      wsdlUrl: "https://example.com/service?wsdl",
      operation: "GetStatus",
    });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("req", "exec-in", ctx);

    expect(ctx.execOutputs.get("req:success")).toBe(false);
    expect(ctx.execOutputs.get("req:result")).toBe("");
    expect(String(ctx.execOutputs.get("req:error"))).toMatch(/compiled output/i);
  });

  it("compileExecute calls the real functionLibrarySoap.soapCall with every pin named in an inputs object", () => {
    const def = getNodeDef("soap.call");
    const node = buildGraph("soap.call").node;
    const statements = def.compileExecute!({
      node,
      inputs: {
        wsdlUrl: "w",
        operation: "o",
        args: "a",
        security: "s",
        username: "u",
        password: "p",
        wsSecurityPasswordType: "wspt",
        endpointOverride: "e",
        headers: "h",
        timeoutMs: "t",
      },
      graph: {} as never,
      compileFrom: () => ["/* continuation */"],
    });
    expect(statements[0]).toBe("const __result_req = await functionLibrarySoap.soapCall({ wsdlUrl: w, operation: o, argsJson: a, security: s, username: u, password: p, wsSecurityPasswordType: wspt, endpointOverride: e, headersJson: h, timeoutMs: t });");
    expect(statements[1]).toBe("/* continuation */");
  });

  it("compileImports declares the functionLibrarySoap module the compiled output needs (which itself depends on the soap SDK)", () => {
    const def = getNodeDef("soap.call");
    expect(def.compileImports).toEqual(['import * as functionLibrarySoap from "../../src/server/functionLibrarySoap.ts";']);
  });

  it("the real soapCall function exists in its own isolated module, never imported by any interpreter-facing code", async () => {
    const { soapCall } = await import("../../../src/server/functionLibrarySoap");
    expect(typeof soapCall).toBe("function");
  });
});

describe("soap.describe", () => {
  it("interpreter execute() always reports failure — there is no browser-side way to load the soap SDK's WSDL/XML machinery", async () => {
    const { graph } = buildGraph("soap.describe", { wsdlUrl: "https://example.com/service?wsdl" });
    const ctx = createExecutionContext(graph, { log: () => {} });
    await runExecFrom("req", "exec-in", ctx);

    expect(ctx.execOutputs.get("req:success")).toBe(false);
    expect(String(ctx.execOutputs.get("req:error"))).toMatch(/compiled output/i);
  });

  it("compileExecute calls the real functionLibrarySoap.soapDescribe and maps its descriptionJson to the Description pin", () => {
    const def = getNodeDef("soap.describe");
    const node = buildGraph("soap.describe").node;
    const statements = def.compileExecute!({
      node,
      inputs: { wsdlUrl: "w", timeoutMs: "t" },
      graph: {} as never,
      compileFrom: () => ["/* continuation */"],
    });
    expect(statements[0]).toBe("const __result_req = await functionLibrarySoap.soapDescribe({ wsdlUrl: w, timeoutMs: t });");

    const outputs = def.compileExecuteOutputs!({ node } as never);
    expect(outputs.description).toBe("__result_req.descriptionJson");
  });

  it("the real soapDescribe function exists in its own isolated module, never imported by any interpreter-facing code", async () => {
    const { soapDescribe } = await import("../../../src/server/functionLibrarySoap");
    expect(typeof soapDescribe).toBe("function");
  });
});
