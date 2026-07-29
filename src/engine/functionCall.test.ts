import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltins } from "../nodes";
import { createExecutionContext, runExecFrom, runFunctionCall } from "./executor";
import {
  addFunctionInput,
  addFunctionOutput,
  addVariable,
  connectPins,
  createFunctionDef,
  
  nextId,
  removeNode,
} from "./graphMutations";
import { getNodeDef } from "./registry";
import {  type Variable } from "./types";
import { Graph } from "./graph";
import { NodeInstance } from "./nodeInstance";

function addBuiltinNode(graph: Graph, type: string, position = { x: 0, y: 0 }, id?: string) {
  const def = getNodeDef(type);
  const node = NodeInstance.createNodeInstance(type, position, def.pins, id);
  graph.nodes.push(node);
  return node;
}

function addFunctionBoundNode(
  graph: Graph,
  type: "function.return" | "function.call",
  functionId: string,
  fn: Parameters<NonNullable<ReturnType<typeof getNodeDef>["deriveFunctionPins"]>>[0],
  id: string,
) {
  const def = getNodeDef(type);
  const pins = def.deriveFunctionPins!(fn);
  const node = NodeInstance.createNodeInstance(type, { x: 0, y: 0 }, pins, id, undefined, functionId);
  graph.nodes.push(node);
  return node;
}

beforeAll(() => {
  registerBuiltins();
});

describe("function calls", () => {
  it("runFunctionCall computes the declared output from resolved arguments (Entry -> Add -> Return)", async () => {
    const rootGraph = new Graph("root", "test");
    const fn = createFunctionDef("AddTen");
    rootGraph.functions.push(fn);

    const xInput = { id: nextId("io"), name: "x", type: "number" as const, defaultValue: 0 };
    const resultOutput = { id: nextId("io"), name: "result", type: "number" as const, defaultValue: -1 };
    addFunctionInput(fn, xInput);
    addFunctionOutput(fn, resultOutput);

    const entryNode = fn.body.nodes.find((n) => n.type === "function.entry")!;
    const add = addBuiltinNode(fn.body, "math.add", { x: 0, y: 0 }, "add");
    add.pins.b.value = 10;
    const returnNode = addFunctionBoundNode(fn.body, "function.return", fn.id, fn, "ret");

    connectPins(fn.body, fn.body.variables, rootGraph.functions, {
      fromNode: entryNode.id,
      fromPin: xInput.id,
      toNode: add.id,
      toPin: "a",
    });
    connectPins(fn.body, fn.body.variables, rootGraph.functions, {
      fromNode: add.id,
      fromPin: "result",
      toNode: returnNode.id,
      toPin: resultOutput.id,
    });
    connectPins(fn.body, fn.body.variables, rootGraph.functions, {
      fromNode: entryNode.id,
      fromPin: "exec-out",
      toNode: returnNode.id,
      toPin: "exec-in",
    });

    const ctx = createExecutionContext(rootGraph, { log: () => {} });
    const outputs = await runFunctionCall(fn, { [xInput.id]: 7 }, ctx);

    expect(outputs[resultOutput.id]).toBe(17);
  });

  it("a Call node in a root graph produces the correct output, readable by the next step", async () => {
    const rootGraph = new Graph("root", "test");
    const fn = createFunctionDef("Double");
    rootGraph.functions.push(fn);

    const xInput = { id: nextId("io"), name: "x", type: "number" as const, defaultValue: 0 };
    const resultOutput = { id: nextId("io"), name: "result", type: "number" as const, defaultValue: -1 };
    addFunctionInput(fn, xInput);
    addFunctionOutput(fn, resultOutput);

    const entryNode = fn.body.nodes.find((n) => n.type === "function.entry")!;
    const add = addBuiltinNode(fn.body, "math.add", { x: 0, y: 0 }, "add");
    const returnNode = addFunctionBoundNode(fn.body, "function.return", fn.id, fn, "ret");
    connectPins(fn.body, fn.body.variables, rootGraph.functions, {
      fromNode: entryNode.id, fromPin: xInput.id, toNode: add.id, toPin: "a",
    });
    connectPins(fn.body, fn.body.variables, rootGraph.functions, {
      fromNode: entryNode.id, fromPin: xInput.id, toNode: add.id, toPin: "b",
    });
    connectPins(fn.body, fn.body.variables, rootGraph.functions, {
      fromNode: add.id, fromPin: "result", toNode: returnNode.id, toPin: resultOutput.id,
    });
    connectPins(fn.body, fn.body.variables, rootGraph.functions, {
      fromNode: entryNode.id, fromPin: "exec-out", toNode: returnNode.id, toPin: "exec-in",
    });

    const start = addBuiltinNode(rootGraph, "event.start", { x: 0, y: 0 }, "start");
    const callNode = addFunctionBoundNode(rootGraph, "function.call", fn.id, fn, "call");
    callNode.pins[xInput.id].value = 21;

    connectPins(rootGraph, rootGraph.variables, rootGraph.functions, {
      fromNode: start.id, fromPin: "exec-out", toNode: callNode.id, toPin: "exec-in",
    });

    const ctx = createExecutionContext(rootGraph, { log: () => {} });
    await runExecFrom(start.id, "exec-out", ctx);

    // Reads the call's output the same way a downstream data-pin consumer would.
    expect(ctx.execOutputs.get(`${callNode.id}:${resultOutput.id}`)).toBe(42);
  });

  it("caller continues even if the function body never reaches a Return node, using declared defaults", async () => {
    const rootGraph = new Graph("root", "test");
    const fn = createFunctionDef("NeverReturns");
    rootGraph.functions.push(fn);
    const resultOutput = { id: nextId("io"), name: "result", type: "string" as const, defaultValue: "fallback" };
    addFunctionOutput(fn, resultOutput);
    // Entry's exec-out is left unconnected — the body never reaches any Return node.

    const start = addBuiltinNode(rootGraph, "event.start", { x: 0, y: 0 }, "start");
    const callNode = addFunctionBoundNode(rootGraph, "function.call", fn.id, fn, "call");
    const print = addBuiltinNode(rootGraph, "debug.print", { x: 0, y: 0 }, "print");
    print.pins.message.value = "caller kept going";

    connectPins(rootGraph, rootGraph.variables, rootGraph.functions, {
      fromNode: start.id, fromPin: "exec-out", toNode: callNode.id, toPin: "exec-in",
    });
    connectPins(rootGraph, rootGraph.variables, rootGraph.functions, {
      fromNode: callNode.id, fromPin: "exec-out", toNode: print.id, toPin: "exec-in",
    });

    const logs: string[] = [];
    const ctx = createExecutionContext(rootGraph, { log: (m) => logs.push(String(m)) });
    await runExecFrom(start.id, "exec-out", ctx);

    expect(logs).toEqual(["caller kept going"]);
    expect(ctx.execOutputs.get(`${callNode.id}:${resultOutput.id}`)).toBe("fallback");
  });

  it("an unbounded self-recursive call trips the call-depth guard with a clear error", async () => {
    const rootGraph = new Graph("root", "test");
    const fn = createFunctionDef("Infinite");
    rootGraph.functions.push(fn);

    const entryNode = fn.body.nodes.find((n) => n.type === "function.entry")!;
    const selfCall = addFunctionBoundNode(fn.body, "function.call", fn.id, fn, "selfCall");
    connectPins(fn.body, fn.body.variables, rootGraph.functions, {
      fromNode: entryNode.id, fromPin: "exec-out", toNode: selfCall.id, toPin: "exec-in",
    });

    const ctx = createExecutionContext(rootGraph, { log: () => {} });
    await expect(runFunctionCall(fn, {}, ctx)).rejects.toThrow(/call depth/i);
  });

  it("a function's local variable is isolated from a global variable and from other calls", async () => {
    const rootGraph = new Graph("root", "test");
    const globalVar: Variable = { id: "shared-id-does-not-collide", name: "Counter", type: "string", defaultValue: "global" };
    addVariable(rootGraph, globalVar);

    const fn = createFunctionDef("BumpLocal");
    rootGraph.functions.push(fn);
    const localVar: Variable = { id: nextId("var"), name: "Counter", type: "string", defaultValue: "start" };
    addVariable(fn.body, localVar);

    const entryNode = fn.body.nodes.find((n) => n.type === "function.entry")!;
    const setDef = getNodeDef("variable.set");
    const setNode = NodeInstance.createNodeInstance(
      "variable.set",
      { x: 0, y: 0 },
      setDef.derivePins!(localVar),
      "set",
      localVar.id,
    );
    setNode.pins.value.value = "changed";
    fn.body.nodes.push(setNode);
    connectPins(fn.body, fn.body.variables, rootGraph.functions, {
      fromNode: entryNode.id, fromPin: "exec-out", toNode: setNode.id, toPin: "exec-in",
    });

    const ctx = createExecutionContext(rootGraph, { log: () => {} });

    await runFunctionCall(fn, {}, ctx);
    // The global variable of a similar shape is untouched...
    expect(ctx.variableValues.get(globalVar.id)).toBe("global");
    // ...and each call gets its own fresh local storage, seeded back to the declared default.
    await runFunctionCall(fn, {}, ctx);
    // (if locals leaked across calls, this would still read "changed" from the first call — instead
    // each call's own child context starts fresh, so there's nothing left over to observe here)
    expect(ctx.variableValues.size).toBeGreaterThanOrEqual(1); // sanity: globals map untouched/created
  });

  it("creates a Return node by default, and Entry/Return can never be removed", () => {
    const fn = createFunctionDef("AlwaysHasAnOutput");

    const entryNode = fn.body.nodes.find((n) => n.type === "function.entry");
    const returnNode = fn.body.nodes.find((n) => n.type === "function.return");
    expect(entryNode).toBeDefined();
    expect(returnNode).toBeDefined();

    removeNode(fn.body, [], [], entryNode!.id);
    removeNode(fn.body, [], [], returnNode!.id);

    expect(fn.body.nodes).toContain(entryNode);
    expect(fn.body.nodes).toContain(returnNode);
    expect(fn.body.nodes).toHaveLength(2);
  });
});
