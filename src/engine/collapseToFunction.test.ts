import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltins } from "../nodes";
import { createExecutionContext, runExecFrom } from "./executor";
import {
  canCollapseSelectionToFunction,
  collapseSelectionToFunction,
} from "./collapseToFunction";
import { Graph } from "./graph";
import { addVariable, connectPins, createFunctionDef, nextId } from "./graphMutations";
import { NodeInstance } from "./nodeInstance";
import { getNodeDef } from "./registry";
import type { Variable } from "./types";

function addNode(
  graph: Graph,
  type: string,
  position = { x: 0, y: 0 },
  id?: string,
): NodeInstance {
  const def = getNodeDef(type);
  const node = NodeInstance.createNodeInstance(type, position, def.pins, id);
  graph.nodes.push(node);
  return node;
}

function addVariableNode(
  graph: Graph,
  type: "variable.get" | "variable.set",
  variable: Variable,
  id: string,
): NodeInstance {
  const def = getNodeDef(type);
  const node = NodeInstance.createNodeInstance(type, { x: 0, y: 0 }, def.derivePins!(variable), id, variable.id);
  graph.nodes.push(node);
  return node;
}

function connect(
  graph: Graph,
  root: Graph,
  fromNode: string,
  fromPin: string,
  toNode: string,
  toPin: string,
) {
  return connectPins(graph, root.getVisibleVariables(graph), root.functions, {
    fromNode,
    fromPin,
    toNode,
    toPin,
  });
}

beforeAll(() => {
  registerBuiltins();
});

describe("canCollapseSelectionToFunction", () => {
  it("is illegal for an empty selection", () => {
    const root = new Graph("root", "test");
    expect(canCollapseSelectionToFunction(root, root, new Set(), root.variables, root.functions)).toBe(false);
  });

  it("is legal for a connected chain with one exec wire in and one out", () => {
    const root = new Graph("root", "test");
    const start = addNode(root, "event.start", { x: 0, y: 0 }, "start");
    const a = addNode(root, "debug.print", { x: 0, y: 0 }, "a");
    const b = addNode(root, "debug.print", { x: 0, y: 0 }, "b");
    const after = addNode(root, "debug.print", { x: 0, y: 0 }, "after");
    connect(root, root, start.id, "exec-out", a.id, "exec-in");
    connect(root, root, a.id, "exec-out", b.id, "exec-in");
    connect(root, root, b.id, "exec-out", after.id, "exec-in");

    const selection = new Set([a.id, b.id]);
    expect(canCollapseSelectionToFunction(root, root, selection, root.variables, root.functions)).toBe(true);
  });

  it("is illegal when the selection isn't a single connected cluster", () => {
    const root = new Graph("root", "test");
    const start = addNode(root, "event.start", { x: 0, y: 0 }, "start");
    const a = addNode(root, "debug.print", { x: 0, y: 0 }, "a");
    const b = addNode(root, "debug.print", { x: 0, y: 0 }, "b");
    const c = addNode(root, "debug.print", { x: 0, y: 0 }, "c");
    connect(root, root, start.id, "exec-out", a.id, "exec-in");
    connect(root, root, a.id, "exec-out", b.id, "exec-in");
    connect(root, root, b.id, "exec-out", c.id, "exec-in");

    // a and c are only linked through b, which isn't part of this selection.
    const selection = new Set([a.id, c.id]);
    expect(canCollapseSelectionToFunction(root, root, selection, root.variables, root.functions)).toBe(false);
  });

  it("is illegal when more than one exec wire leaves the selection", () => {
    const root = new Graph("root", "test");
    const start = addNode(root, "event.start", { x: 0, y: 0 }, "start");
    const branch = addNode(root, "flow.branch", { x: 0, y: 0 }, "branch");
    const outA = addNode(root, "debug.print", { x: 0, y: 0 }, "outA");
    const outB = addNode(root, "debug.print", { x: 0, y: 0 }, "outB");
    connect(root, root, start.id, "exec-out", branch.id, "exec-in");
    connect(root, root, branch.id, "true", outA.id, "exec-in");
    connect(root, root, branch.id, "false", outB.id, "exec-in");

    expect(canCollapseSelectionToFunction(root, root, new Set([branch.id]), root.variables, root.functions)).toBe(false);
  });

  it("is legal when several exec wires enter the selection but all converge on the same node/pin", () => {
    const root = new Graph("root", "test");
    const start1 = addNode(root, "event.start", { x: 0, y: 0 }, "start1");
    const start2 = addNode(root, "event.interval", { x: 0, y: 0 }, "start2");
    const a = addNode(root, "debug.print", { x: 0, y: 0 }, "a");
    const b = addNode(root, "debug.print", { x: 0, y: 0 }, "b");
    connect(root, root, start1.id, "exec-out", a.id, "exec-in");
    connect(root, root, start2.id, "exec-out", a.id, "exec-in"); // converges onto a's own exec-in
    connect(root, root, a.id, "exec-out", b.id, "exec-in");

    expect(canCollapseSelectionToFunction(root, root, new Set([a.id, b.id]), root.variables, root.functions)).toBe(true);
  });

  it("is illegal when exec wires enter the selection targeting two different nodes", () => {
    const root = new Graph("root", "test");
    const start1 = addNode(root, "event.start", { x: 0, y: 0 }, "start1");
    const start2 = addNode(root, "event.interval", { x: 0, y: 0 }, "start2");
    const a = addNode(root, "debug.print", { x: 0, y: 0 }, "a");
    const b = addNode(root, "debug.print", { x: 0, y: 0 }, "b");
    connect(root, root, start1.id, "exec-out", a.id, "exec-in");
    connect(root, root, a.id, "exec-out", b.id, "exec-in");
    connect(root, root, start2.id, "exec-out", b.id, "exec-in"); // a second, independent entry point

    expect(canCollapseSelectionToFunction(root, root, new Set([a.id, b.id]), root.variables, root.functions)).toBe(false);
  });

  it("is legal for a purely-pure (exec-less) selection with nothing reading its result back out", () => {
    const root = new Graph("root", "test");
    const ext = addNode(root, "math.add", { x: 0, y: 0 }, "ext");
    const inner = addNode(root, "math.add", { x: 0, y: 0 }, "inner");
    connect(root, root, ext.id, "result", inner.id, "a");

    expect(canCollapseSelectionToFunction(root, root, new Set([inner.id]), root.variables, root.functions)).toBe(true);
  });

  it("is illegal for a purely-pure selection whose result is read back out (the Call node would never run to produce it)", () => {
    const root = new Graph("root", "test");
    const ext = addNode(root, "math.add", { x: 0, y: 0 }, "ext");
    const inner = addNode(root, "math.add", { x: 0, y: 0 }, "inner");
    const consumer = addNode(root, "math.add", { x: 0, y: 0 }, "consumer");
    connect(root, root, ext.id, "result", inner.id, "a");
    connect(root, root, inner.id, "result", consumer.id, "a"); // pulled on demand today; a Call node can't be

    expect(canCollapseSelectionToFunction(root, root, new Set([inner.id]), root.variables, root.functions)).toBe(false);
  });

  it("is illegal if the selection contains an event-trigger node", () => {
    const root = new Graph("root", "test");
    const start = addNode(root, "event.start", { x: 0, y: 0 }, "start");
    const a = addNode(root, "debug.print", { x: 0, y: 0 }, "a");
    connect(root, root, start.id, "exec-out", a.id, "exec-in");

    expect(canCollapseSelectionToFunction(root, root, new Set([start.id, a.id]), root.variables, root.functions)).toBe(false);
  });

  it("is illegal if the selection contains a node bound to a variable local to the current function body", () => {
    const root = new Graph("root", "test");
    const fn = createFunctionDef("Outer");
    root.functions.push(fn);
    const localVar: Variable = { id: nextId("var"), name: "Local", type: "number", defaultValue: 0 };
    addVariable(fn.body, localVar);
    const getNode = addVariableNode(fn.body, "variable.get", localVar, "getLocal");

    const visibleVars = root.getVisibleVariables(fn.body);
    expect(canCollapseSelectionToFunction(root, fn.body, new Set([getNode.id]), visibleVars, root.functions)).toBe(false);
  });

  it("is legal if the selection contains a node bound to a GLOBAL variable, even inside a function body", () => {
    const root = new Graph("root", "test");
    const fn = createFunctionDef("Outer");
    root.functions.push(fn);
    const globalVar: Variable = { id: nextId("var"), name: "Global", type: "number", defaultValue: 0 };
    addVariable(root, globalVar);
    const getNode = addVariableNode(fn.body, "variable.get", globalVar, "getGlobal");

    const visibleVars = root.getVisibleVariables(fn.body);
    expect(canCollapseSelectionToFunction(root, fn.body, new Set([getNode.id]), visibleVars, root.functions)).toBe(true);
  });
});

describe("collapseSelectionToFunction", () => {
  it("moves the selection into a new function body and splices in a wired Call node", () => {
    const root = new Graph("root", "test");
    const start = addNode(root, "event.start", { x: 0, y: 0 }, "start");
    const a = addNode(root, "debug.print", { x: 100, y: 100 }, "a");
    const b = addNode(root, "debug.print", { x: 300, y: 100 }, "b");
    const after = addNode(root, "debug.print", { x: 500, y: 100 }, "after");
    connect(root, root, start.id, "exec-out", a.id, "exec-in");
    connect(root, root, a.id, "exec-out", b.id, "exec-in");
    connect(root, root, b.id, "exec-out", after.id, "exec-in");

    root.commentBoxes.push({
      id: "box",
      text: "",
      position: { x: 0, y: 0 },
      size: { width: 10, height: 10 },
      containedNodeIds: [a.id, after.id],
    });

    const selection = new Set([a.id, b.id]);
    const { fn, callNodeId } = collapseSelectionToFunction(
      root,
      root,
      selection,
      root.variables,
      root.functions,
      root.scripts,
      "Extracted",
    );

    expect(root.functions).toContain(fn);
    expect(root.nodes.some((n) => n.id === a.id || n.id === b.id)).toBe(false);
    expect(fn.body.nodes.map((n) => n.id)).toEqual(expect.arrayContaining([a.id, b.id]));
    expect(fn.body.connections.some((c) => c.fromNode === a.id && c.toNode === b.id)).toBe(true);

    // The comment box no longer references the nodes that moved out from under it.
    expect(root.commentBoxes[0].containedNodeIds).toEqual([after.id]);

    // Boundary wires now run through the Call node.
    expect(
      root.connections.some((c) => c.fromNode === start.id && c.toNode === callNodeId && c.toPin === "exec-in"),
    ).toBe(true);
    expect(
      root.connections.some((c) => c.fromNode === callNodeId && c.fromPin === "exec-out" && c.toNode === after.id),
    ).toBe(true);
    expect(root.connections.some((c) => c.fromNode === a.id || c.toNode === a.id)).toBe(false);

    // Internally, Entry drives the old entry point and the old exit point drives Return.
    const entryNode = fn.body.nodes.find((n) => n.type === "function.entry")!;
    const returnNode = fn.body.nodes.find((n) => n.type === "function.return")!;
    expect(
      fn.body.connections.some(
        (c) => c.fromNode === entryNode.id && c.fromPin === "exec-out" && c.toNode === a.id && c.toPin === "exec-in",
      ),
    ).toBe(true);
    expect(
      fn.body.connections.some(
        (c) => c.fromNode === b.id && c.fromPin === "exec-out" && c.toNode === returnNode.id && c.toPin === "exec-in",
      ),
    ).toBe(true);
  });

  it("names a new input after the pin it was connected to, and preserves runtime behavior end-to-end", async () => {
    const root = new Graph("root", "test");
    const varX: Variable = { id: nextId("var"), name: "X", type: "number", defaultValue: 5 };
    const varResult: Variable = { id: nextId("var"), name: "Result", type: "number", defaultValue: -1 };
    addVariable(root, varX);
    addVariable(root, varResult);

    const start = addNode(root, "event.start", { x: 0, y: 0 }, "start");
    const getX = addVariableNode(root, "variable.get", varX, "getX");
    const add = addNode(root, "math.add", { x: 0, y: 0 }, "add");
    add.pins.b.value = 10;
    const setResult = addVariableNode(root, "variable.set", varResult, "setResult");
    const after = addNode(root, "debug.print", { x: 0, y: 0 }, "after");

    connect(root, root, start.id, "exec-out", setResult.id, "exec-in");
    connect(root, root, setResult.id, "exec-out", after.id, "exec-in");
    connect(root, root, getX.id, "value", add.id, "a");
    connect(root, root, add.id, "result", setResult.id, "value");

    const selection = new Set([add.id, setResult.id]);
    expect(canCollapseSelectionToFunction(root, root, selection, root.variables, root.functions)).toBe(true);

    const { fn, callNodeId } = collapseSelectionToFunction(
      root,
      root,
      selection,
      root.variables,
      root.functions,
      root.scripts,
      "Extracted",
    );

    expect(fn.inputs).toHaveLength(1);
    expect(fn.inputs[0].name).toBe("A"); // math.add's "a" pin is labeled "A"
    expect(fn.outputs).toHaveLength(0); // add -> setResult is entirely internal, nothing crosses out

    expect(
      root.connections.some(
        (c) => c.fromNode === getX.id && c.fromPin === "value" && c.toNode === callNodeId && c.toPin === fn.inputs[0].id,
      ),
    ).toBe(true);

    const ctx = createExecutionContext(root, { log: () => {} });
    await runExecFrom(start.id, "exec-out", ctx);

    expect(ctx.variableValues.get(varResult.id)).toBe(15); // unchanged from the pre-collapse graph's own behavior
  });

  it("gives colliding input names a numeric suffix instead of merging unrelated sources", () => {
    const root = new Graph("root", "test");
    const ext1 = addNode(root, "math.add", { x: 0, y: 0 }, "ext1");
    const ext2 = addNode(root, "math.add", { x: 0, y: 0 }, "ext2");
    const add1 = addNode(root, "math.add", { x: 0, y: 0 }, "add1");
    const add2 = addNode(root, "math.add", { x: 0, y: 0 }, "add2");
    connect(root, root, ext1.id, "result", add1.id, "a");
    connect(root, root, ext2.id, "result", add2.id, "a");
    connect(root, root, add1.id, "result", add2.id, "b"); // links the selection together

    const selection = new Set([add1.id, add2.id]);
    const { fn } = collapseSelectionToFunction(root, root, selection, root.variables, root.functions, root.scripts, "Fn");

    expect(fn.inputs.map((i) => i.name).sort()).toEqual(["A", "A 2"]);
  });

  it("merges a fanned-out external source into a single shared input", () => {
    const root = new Graph("root", "test");
    const ext = addNode(root, "math.add", { x: 0, y: 0 }, "ext");
    const add1 = addNode(root, "math.add", { x: 0, y: 0 }, "add1");
    const add2 = addNode(root, "math.add", { x: 0, y: 0 }, "add2");
    connect(root, root, ext.id, "result", add1.id, "a");
    connect(root, root, ext.id, "result", add2.id, "a"); // same external source feeds both
    connect(root, root, add1.id, "result", add2.id, "b"); // links the selection together

    const selection = new Set([add1.id, add2.id]);
    const { fn, callNodeId } = collapseSelectionToFunction(root, root, selection, root.variables, root.functions, root.scripts, "Fn");

    expect(fn.inputs).toHaveLength(1);
    const entryId = fn.inputs[0].id;
    expect(fn.body.connections.filter((c) => c.fromPin === entryId)).toHaveLength(2);
    expect(root.connections.filter((c) => c.fromNode === ext.id && c.toNode === callNodeId)).toHaveLength(1);
  });

  it("merges a fanned-out internal source feeding several external targets into a single shared output", () => {
    const root = new Graph("root", "test");
    // flow.forLoop (not math.add) so the selection has exec touching its boundary — a purely-pure
    // selection whose result is read back out is illegal (see the canCollapse test above), since a
    // Call node only ever produces outputs when something actually fires its exec-in.
    const start = addNode(root, "event.start", { x: 0, y: 0 }, "start");
    const loop = addNode(root, "flow.forLoop", { x: 0, y: 0 }, "loop");
    const after = addNode(root, "debug.print", { x: 0, y: 0 }, "after");
    const consumer1 = addNode(root, "math.add", { x: 0, y: 0 }, "consumer1");
    const consumer2 = addNode(root, "math.add", { x: 0, y: 0 }, "consumer2");
    connect(root, root, start.id, "exec-out", loop.id, "exec-in");
    connect(root, root, loop.id, "completed", after.id, "exec-in");
    connect(root, root, loop.id, "index", consumer1.id, "a");
    connect(root, root, loop.id, "index", consumer2.id, "a");

    const selection = new Set([loop.id]);
    expect(canCollapseSelectionToFunction(root, root, selection, root.variables, root.functions)).toBe(true);
    const { fn, callNodeId } = collapseSelectionToFunction(root, root, selection, root.variables, root.functions, root.scripts, "Fn");

    expect(fn.outputs).toHaveLength(1);
    expect(fn.outputs[0].name).toBe("Index");
    const outputId = fn.outputs[0].id;
    expect(
      root.connections.filter((c) => c.fromNode === callNodeId && c.fromPin === outputId),
    ).toHaveLength(2);
  });
});
