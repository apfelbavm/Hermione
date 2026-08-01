import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltins } from "../../src/nodes/index";
import { createExecutionContext, runExecFrom } from "../../src/engine/executor";
import { connectPins } from "../../src/engine/graphMutations";
import { getNodeDef } from "../../src/engine/registry";
import { Graph } from "../../src/engine/graph";
import { NodeInstance } from "../../src/engine/nodeInstance";


beforeAll(() => {
  registerBuiltins();
});

function addBuiltinNode(graph: Graph, type: string, id: string, position = { x: 0, y: 0 }) {
  const def = getNodeDef(type);
  const node = NodeInstance.createNodeInstance(type, position, def.pins, id);
  graph.nodes.push(node);
  return node;
}

describe("core.reroute (data)", () => {
  it("is a compact node with no configurableElementType (its type is frozen at splice time, not user-chosen)", () => {
    const def = getNodeDef("core.reroute");
    expect(def.compact).toBe(true);
    expect(def.configurableElementType).toBeUndefined();
  });

  it("deriveInstancePins reflects the instance's own elementType/container/mapKeyType", () => {
    const def = getNodeDef("core.reroute");
    const node = NodeInstance.createNodeInstance("core.reroute", { x: 0, y: 0 }, def.pins, "r1");
    node.elementType = "string";
    node.container = "array";
    const pins = def.deriveInstancePins!(node);
    expect(pins.map((p) => p.id)).toEqual(["in", "out"]);
    for (const pin of pins) {
      expect(pin.type).toBe("string");
      expect(pin.container).toBe("array");
      expect(pin.label).toBe("");
    }
  });

  it("evaluate/compileEvaluate pass the input straight through unchanged", () => {
    const def = getNodeDef("core.reroute");
    expect(def.evaluate!({ node: {} as any, inputs: { in: 42 }, ctx: {} as any })).toEqual({ out: 42 });
    expect(def.compileEvaluate!({ node: {} as any, inputs: { in: "x" }, graph: {} as any })).toEqual({ out: "x" });
  });

  it("passes a real value through end to end via math.add -> string.fromNumber -> reroute -> debug.print", async () => {
    const graph = new Graph("g", "test");
    addBuiltinNode(graph, "event.start", "start");
    const add = addBuiltinNode(graph, "math.add", "add");
    add.pins.a.value = 2;
    add.pins.b.value = 3;
    addBuiltinNode(graph, "string.fromNumber", "toStr");
    const reroute = addBuiltinNode(graph, "core.reroute", "reroute");
    reroute.elementType = "string";
    addBuiltinNode(graph, "debug.print", "print");

    connectPins(graph, graph.variables, graph.functions, { fromNode: "start", fromPin: "exec-out", toNode: "print", toPin: "exec-in" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: "add", fromPin: "result", toNode: "toStr", toPin: "value" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: "toStr", fromPin: "result", toNode: "reroute", toPin: "in" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: "reroute", fromPin: "out", toNode: "print", toPin: "message" });

    const logs: string[] = [];
    const ctx = createExecutionContext(graph, { log: (m) => logs.push(m) });
    await runExecFrom("start", "exec-out", ctx);

    expect(logs).toEqual(["5"]);
  });
});

describe("core.rerouteExec", () => {
  it("is a compact passthrough node with fixed exec-in/exec-out pins", () => {
    const def = getNodeDef("core.rerouteExec");
    expect(def.compact).toBe(true);
    expect(def.pins.map((p) => p.id)).toEqual(["exec-in", "exec-out"]);
  });

  it("execute() always continues to exec-out", () => {
    const def = getNodeDef("core.rerouteExec");
    expect(def.execute!({ node: {} as any, inputs: {}, ctx: {} as any })).toEqual({ nextExec: "exec-out" });
  });

  it("runs a real exec chain through unchanged: On Run -> reroute -> Print", async () => {
    const graph = new Graph("g", "test");
    addBuiltinNode(graph, "event.start", "start");
    addBuiltinNode(graph, "core.rerouteExec", "reroute");
    const print = addBuiltinNode(graph, "debug.print", "print");
    print.pins.message.value = "through";

    connectPins(graph, graph.variables, graph.functions, { fromNode: "start", fromPin: "exec-out", toNode: "reroute", toPin: "exec-in" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: "reroute", fromPin: "exec-out", toNode: "print", toPin: "exec-in" });

    const logs: string[] = [];
    const ctx = createExecutionContext(graph, { log: (m) => logs.push(m) });
    await runExecFrom("start", "exec-out", ctx);

    expect(logs).toEqual(["through"]);
  });
});
