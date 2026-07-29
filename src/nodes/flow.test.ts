import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltins } from "./index";
import { createExecutionContext, runExecFrom } from "../engine/executor";
import { connectPins,  removeInstancePin } from "../engine/graphMutations";
import { getNodeDef } from "../engine/registry";
import { Graph } from "../engine/graph";
import { NodeInstance } from "../engine/nodeInstance";


beforeAll(() => {
  registerBuiltins();
});

function addBuiltinNode(graph: Graph, type: string, id: string, position = { x: 0, y: 0 }) {
  const def = getNodeDef(type);
  const node = NodeInstance.createNodeInstance(type, position, def.pins, id);
  graph.nodes.push(node);
  return node;
}

/** Wires a For Loop with a body that logs each index (via string.fromNumber -> debug.print) and a
 * "Done" print after it completes. Returns the graph and the loop node. */
function buildLoopGraph(start: number, end: number) {
  const graph = new Graph("g", "test");
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
  it("runs the loop-body chain once per index from start up to and including end, then fires completed", async () => {
    const { graph } = buildLoopGraph(0, 3);
    const logs: string[] = [];
    const ctx = createExecutionContext(graph, { log: (m) => logs.push(m) });

    await runExecFrom("loop", "exec-in", ctx);

    expect(logs).toEqual(["0", "1", "2", "3", "Done"]);
  });

  it("runs exactly one iteration when start equals end, then fires completed", async () => {
    const { graph } = buildLoopGraph(5, 5);
    const logs: string[] = [];
    const ctx = createExecutionContext(graph, { log: (m) => logs.push(m) });

    await runExecFrom("loop", "exec-in", ctx);

    expect(logs).toEqual(["5", "Done"]);
  });

  it("runs zero iterations when start is greater than end", async () => {
    const { graph } = buildLoopGraph(5, 2);
    const logs: string[] = [];
    const ctx = createExecutionContext(graph, { log: (m) => logs.push(m) });

    await runExecFrom("loop", "exec-in", ctx);

    expect(logs).toEqual(["Done"]);
  });

  it("rounds a non-integer start/end to the nearest whole number", async () => {
    const { graph } = buildLoopGraph(0.9, 3.2);
    const logs: string[] = [];
    const ctx = createExecutionContext(graph, { log: (m) => logs.push(m) });

    await runExecFrom("loop", "exec-in", ctx);

    expect(logs).toEqual(["1", "2", "3", "Done"]); // start rounds to 1, end to 3
  });

  it("throws instead of hanging when the range would exceed the iteration cap", async () => {
    const { graph } = buildLoopGraph(0, 1_000_000);
    const ctx = createExecutionContext(graph, { log: () => {} });

    await expect(runExecFrom("loop", "exec-in", ctx)).rejects.toThrow(/iterations/);
  });

  it("when disabled, never runs the loop body (not even once) and fires only completed", async () => {
    const { graph, loop } = buildLoopGraph(0, 3);
    loop.disabled = true;
    const logs: string[] = [];
    const ctx = createExecutionContext(graph, { log: (m) => logs.push(m) });

    await runExecFrom("loop", "exec-in", ctx);

    expect(logs).toEqual(["Done"]);
  });
});

describe("flow.isValid", () => {
  function buildIsValidGraph(objectValue: unknown) {
    const graph = new Graph("g", "test");
    const isValid = addBuiltinNode(graph, "flow.isValid", "check");
    isValid.pins.object.value = objectValue;
    const printValid = addBuiltinNode(graph, "debug.print", "printValid");
    printValid.pins.message.value = "valid";
    const printInvalid = addBuiltinNode(graph, "debug.print", "printInvalid");
    printInvalid.pins.message.value = "invalid";
    connectPins(graph, graph.variables, graph.functions, { fromNode: "check", fromPin: "valid", toNode: "printValid", toPin: "exec-in" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: "check", fromPin: "invalid", toNode: "printInvalid", toPin: "exec-in" });
    return { graph, isValid };
  }

  it("routes to Is Valid for a non-null/undefined object", async () => {
    const { graph } = buildIsValidGraph({ a: 1 });
    const logs: string[] = [];
    const ctx = createExecutionContext(graph, { log: (m) => logs.push(m) });

    await runExecFrom("check", "exec-in", ctx);

    expect(logs).toEqual(["valid"]);
  });

  it("routes to Is Not Valid for null", async () => {
    const { graph } = buildIsValidGraph(null);
    const logs: string[] = [];
    const ctx = createExecutionContext(graph, { log: (m) => logs.push(m) });

    await runExecFrom("check", "exec-in", ctx);

    expect(logs).toEqual(["invalid"]);
  });

  it("routes to Is Not Valid for undefined (e.g. an unconnected pin)", async () => {
    const { graph } = buildIsValidGraph(undefined);
    const logs: string[] = [];
    const ctx = createExecutionContext(graph, { log: (m) => logs.push(m) });

    await runExecFrom("check", "exec-in", ctx);

    expect(logs).toEqual(["invalid"]);
  });

  it("compileExecute guards on strict !== undefined && !== null", () => {
    const def = getNodeDef("flow.isValid");
    const statements = def.compileExecute!({
      node: {} as NodeInstance,
      inputs: { object: "obj" },
      graph: {} as never,
      compileFrom: (pin) => [`/* ${pin} */`],
    });
    expect(statements).toEqual([
      "if (obj !== undefined && obj !== null) {",
      "  /* valid */",
      "} else {",
      "  /* invalid */",
      "}",
    ]);
  });
});

describe("flow.sequence", () => {
  it("starts with exactly two removable 'Then' pins", () => {
    const def = getNodeDef("flow.sequence");
    const node = NodeInstance.createNodeInstance("flow.sequence", { x: 0, y: 0 }, def.pins, "seq");
    const pins = def.deriveInstancePins!(node);
    expect(pins.map((p) => p.id)).toEqual(["exec-in", "then-0", "then-1"]);
    expect(pins.find((p) => p.id === "then-0")?.removable).toBe(true);
    expect(pins.find((p) => p.id === "then-1")?.removable).toBe(true);
  });

  it("adds a third 'Then 2' pin via addInstancePinEntry", () => {
    const def = getNodeDef("flow.sequence");
    const node = NodeInstance.createNodeInstance("flow.sequence", { x: 0, y: 0 }, def.pins, "seq");
    def.addInstancePinEntry!(node);
    const pins = def.deriveInstancePins!(node);
    expect(pins.map((p) => p.id)).toEqual(["exec-in", "then-0", "then-1", "then-2"]);
    expect(pins.find((p) => p.id === "then-2")?.label).toBe("Then 2");
  });

  it("renumbers labels contiguously after removing a middle entry, keeping the underlying pin ids", () => {
    const graph = new Graph("g", "root");
    const def = getNodeDef("flow.sequence");
    const node = NodeInstance.createNodeInstance("flow.sequence", { x: 0, y: 0 }, def.pins, "seq");
    graph.nodes.push(node);
    def.addInstancePinEntry!(node); // now then-0, then-1, then-2

    removeInstancePin(graph, "seq", "then-1");

    const pins = def.deriveInstancePins!(node);
    expect(pins.map((p) => p.id)).toEqual(["exec-in", "then-0", "then-2"]);
    expect(pins.map((p) => p.label)).toEqual(["", "Then 0", "Then 1"]);
  });

  it("runs each Then branch's ENTIRE chain to completion, in order, before starting the next — not interleaved", async () => {
    const graph = new Graph("g", "test");
    addBuiltinNode(graph, "flow.sequence", "seq");
    const delay = addBuiltinNode(graph, "flow.delay", "delay");
    delay.pins.duration.value = 5;
    const printA = addBuiltinNode(graph, "debug.print", "printA");
    printA.pins.message.value = "A";
    const printB = addBuiltinNode(graph, "debug.print", "printB");
    printB.pins.message.value = "B";

    // Then 0's chain: Delay -> "A". Then 1: immediately "B". If Then 1 ran interleaved with Then
    // 0's async delay instead of strictly after it finished, "B" would log BEFORE "A".
    connectPins(graph, graph.variables, graph.functions, { fromNode: "seq", fromPin: "then-0", toNode: "delay", toPin: "exec-in" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: "delay", fromPin: "exec-out", toNode: "printA", toPin: "exec-in" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: "seq", fromPin: "then-1", toNode: "printB", toPin: "exec-in" });

    const logs: string[] = [];
    const ctx = createExecutionContext(graph, { log: (m) => logs.push(m) });
    await runExecFrom("seq", "exec-in", ctx);

    expect(logs).toEqual(["A", "B"]);
  });

  it("when disabled, runs NONE of the Then branches", async () => {
    const graph = new Graph("g", "test");
    const seq = addBuiltinNode(graph, "flow.sequence", "seq");
    seq.disabled = true;
    const printA = addBuiltinNode(graph, "debug.print", "printA");
    printA.pins.message.value = "A";
    const printB = addBuiltinNode(graph, "debug.print", "printB");
    printB.pins.message.value = "B";

    connectPins(graph, graph.variables, graph.functions, { fromNode: "seq", fromPin: "then-0", toNode: "printA", toPin: "exec-in" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: "seq", fromPin: "then-1", toNode: "printB", toPin: "exec-in" });

    const logs: string[] = [];
    const ctx = createExecutionContext(graph, { log: (m) => logs.push(m) });
    await runExecFrom("seq", "exec-in", ctx);

    expect(logs).toEqual([]);
  });
});

describe("flow.parallel", () => {
  it("starts with exactly two removable 'Branch' pins plus a fixed 'Completed' pin", () => {
    const def = getNodeDef("flow.parallel");
    const node = NodeInstance.createNodeInstance("flow.parallel", { x: 0, y: 0 }, def.pins, "par");
    const pins = def.deriveInstancePins!(node);
    expect(pins.map((p) => p.id)).toEqual(["exec-in", "branch-0", "branch-1", "completed"]);
    expect(pins.find((p) => p.id === "branch-0")?.removable).toBe(true);
    expect(pins.find((p) => p.id === "branch-1")?.removable).toBe(true);
    expect(pins.find((p) => p.id === "completed")?.removable).toBeUndefined();
  });

  it("adds a third 'Branch 2' pin via addInstancePinEntry", () => {
    const def = getNodeDef("flow.parallel");
    const node = NodeInstance.createNodeInstance("flow.parallel", { x: 0, y: 0 }, def.pins, "par");
    def.addInstancePinEntry!(node);
    const pins = def.deriveInstancePins!(node);
    expect(pins.map((p) => p.id)).toEqual(["exec-in", "branch-0", "branch-1", "branch-2", "completed"]);
    expect(pins.find((p) => p.id === "branch-2")?.label).toBe("Branch 2");
  });

  it("renumbers labels contiguously after removing a middle entry, keeping the underlying pin ids", () => {
    const graph = new Graph("g", "root");
    const def = getNodeDef("flow.parallel");
    const node = NodeInstance.createNodeInstance("flow.parallel", { x: 0, y: 0 }, def.pins, "par");
    graph.nodes.push(node);
    def.addInstancePinEntry!(node); // now branch-0, branch-1, branch-2

    removeInstancePin(graph, "par", "branch-1");

    const pins = def.deriveInstancePins!(node);
    expect(pins.map((p) => p.id)).toEqual(["exec-in", "branch-0", "branch-2", "completed"]);
    expect(pins.map((p) => p.label)).toEqual(["", "Branch 0", "Branch 1", "Completed"]);
  });

  it("runs branches concurrently — a faster branch logs before a slower one regardless of pin order — then fires completed only once both finish", async () => {
    const graph = new Graph("g", "test");
    addBuiltinNode(graph, "flow.parallel", "par");
    const slowDelay = addBuiltinNode(graph, "flow.delay", "slowDelay");
    slowDelay.pins.duration.value = 20;
    const fastDelay = addBuiltinNode(graph, "flow.delay", "fastDelay");
    fastDelay.pins.duration.value = 5;
    const printSlow = addBuiltinNode(graph, "debug.print", "printSlow");
    printSlow.pins.message.value = "slow";
    const printFast = addBuiltinNode(graph, "debug.print", "printFast");
    printFast.pins.message.value = "fast";
    const printDone = addBuiltinNode(graph, "debug.print", "printDone");
    printDone.pins.message.value = "Done";

    // Branch 0 is wired to the SLOWER delay and Branch 1 to the FASTER one — if the node ran
    // branches one-at-a-time in pin order (like Sequence) instead of truly concurrently, "slow"
    // would always log before "fast". Only genuine concurrency lets "fast" log first.
    connectPins(graph, graph.variables, graph.functions, { fromNode: "par", fromPin: "branch-0", toNode: "slowDelay", toPin: "exec-in" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: "slowDelay", fromPin: "exec-out", toNode: "printSlow", toPin: "exec-in" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: "par", fromPin: "branch-1", toNode: "fastDelay", toPin: "exec-in" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: "fastDelay", fromPin: "exec-out", toNode: "printFast", toPin: "exec-in" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: "par", fromPin: "completed", toNode: "printDone", toPin: "exec-in" });

    const logs: string[] = [];
    const ctx = createExecutionContext(graph, { log: (m) => logs.push(m) });
    await runExecFrom("par", "exec-in", ctx);

    expect(logs).toEqual(["fast", "slow", "Done"]);
  });

  it("when disabled, runs NONE of the branches but still fires completed", async () => {
    const graph = new Graph("g", "test");
    const par = addBuiltinNode(graph, "flow.parallel", "par");
    par.disabled = true;
    const printA = addBuiltinNode(graph, "debug.print", "printA");
    printA.pins.message.value = "A";
    const printB = addBuiltinNode(graph, "debug.print", "printB");
    printB.pins.message.value = "B";
    const printDone = addBuiltinNode(graph, "debug.print", "printDone");
    printDone.pins.message.value = "Done";

    connectPins(graph, graph.variables, graph.functions, { fromNode: "par", fromPin: "branch-0", toNode: "printA", toPin: "exec-in" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: "par", fromPin: "branch-1", toNode: "printB", toPin: "exec-in" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: "par", fromPin: "completed", toNode: "printDone", toPin: "exec-in" });

    const logs: string[] = [];
    const ctx = createExecutionContext(graph, { log: (m) => logs.push(m) });
    await runExecFrom("par", "exec-in", ctx);

    expect(logs).toEqual(["Done"]);
  });
});
