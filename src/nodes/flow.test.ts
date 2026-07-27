import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltins } from "./index";
import { createExecutionContext, runExecFrom } from "../engine/executor";
import { connectPins, createNodeInstance } from "../engine/graphMutations";
import { getNodeDef } from "../engine/registry";
import { createEmptyGraph, type Graph } from "../engine/types";

beforeAll(() => {
  registerBuiltins();
});

function addBuiltinNode(graph: Graph, type: string, id: string, position = { x: 0, y: 0 }) {
  const def = getNodeDef(type);
  const node = createNodeInstance(type, position, def.pins, id);
  graph.nodes.push(node);
  return node;
}

/** Wires a For Loop with a body that logs each index (via string.fromNumber -> debug.print) and a
 * "Done" print after it completes. Returns the graph and the loop node. */
function buildLoopGraph(start: number, end: number) {
  const graph = createEmptyGraph("g", "test");
  const loop = addBuiltinNode(graph, "flow.forLoop", "loop");
  loop.pins.start.value = start;
  loop.pins.end.value = end;

  addBuiltinNode(graph, "string.fromNumber", "toStr");
  addBuiltinNode(graph, "debug.print", "printIndex");
  const printDone = addBuiltinNode(graph, "debug.print", "printDone");
  printDone.pins.message.value = "Done";

  connectPins(graph, graph.variables, graph.functions, { fromNode: "loop", fromPin: "index", toNode: "toStr", toPin: "value" });
  connectPins(graph, graph.variables, graph.functions, { fromNode: "toStr", fromPin: "result", toNode: "printIndex", toPin: "message" });
  connectPins(graph, graph.variables, graph.functions, { fromNode: "loop", fromPin: "loop-body", toNode: "printIndex", toPin: "exec-in" });
  connectPins(graph, graph.variables, graph.functions, { fromNode: "loop", fromPin: "completed", toNode: "printDone", toPin: "exec-in" });

  return { graph, loop };
}

describe("flow.forLoop", () => {
  it("runs the loop-body chain once per index from start up to (exclusive of) end, then fires completed", async () => {
    const { graph } = buildLoopGraph(0, 3);
    const logs: string[] = [];
    const ctx = createExecutionContext(graph, { log: (m) => logs.push(m) });

    await runExecFrom("loop", "exec-in", ctx);

    expect(logs).toEqual(["0", "1", "2", "Done"]);
  });

  it("runs zero iterations when start equals end, but still fires completed", async () => {
    const { graph } = buildLoopGraph(5, 5);
    const logs: string[] = [];
    const ctx = createExecutionContext(graph, { log: (m) => logs.push(m) });

    await runExecFrom("loop", "exec-in", ctx);

    expect(logs).toEqual(["Done"]);
  });

  it("runs zero iterations when start is greater than end", async () => {
    const { graph } = buildLoopGraph(5, 2);
    const logs: string[] = [];
    const ctx = createExecutionContext(graph, { log: (m) => logs.push(m) });

    await runExecFrom("loop", "exec-in", ctx);

    expect(logs).toEqual(["Done"]);
  });

  it("truncates non-integer start/end toward zero", async () => {
    const { graph } = buildLoopGraph(0.9, 3.2);
    const logs: string[] = [];
    const ctx = createExecutionContext(graph, { log: (m) => logs.push(m) });

    await runExecFrom("loop", "exec-in", ctx);

    expect(logs).toEqual(["0", "1", "2", "Done"]); // start truncates to 0, end to 3
  });

  it("throws instead of hanging when the range would exceed the iteration cap", async () => {
    const { graph } = buildLoopGraph(0, 1_000_000);
    const ctx = createExecutionContext(graph, { log: () => {} });

    await expect(runExecFrom("loop", "exec-in", ctx)).rejects.toThrow(/iterations/);
  });
});
