import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltins } from "./index";
import { createExecutionContext, runExecFrom } from "../engine/executor";
import { connectPins, createNodeInstance } from "../engine/graphMutations";
import { getNodeDef } from "../engine/registry";
import { createEmptyGraph, type Graph } from "../engine/types";

beforeAll(() => {
  registerBuiltins();
});

function evalExpr(expr: string): unknown {
  // eslint-disable-next-line no-new-func
  return new Function(`return (${expr});`)();
}

function ctxFor(graph: Graph) {
  return createExecutionContext(graph, { log: () => {} });
}

describe("set.make", () => {
  it("dedupes duplicate literal entries in the assembled set", async () => {
    const def = getNodeDef("set.make");
    const node = createNodeInstance("set.make", { x: 0, y: 0 }, def.pins, "make");
    def.addInstancePinEntry!(node); // entry-0, entry-1

    const outputs = await def.evaluate!({ node, inputs: { "entry-0": 5, "entry-1": 5 }, ctx: ctxFor(createEmptyGraph("g", "r")) });
    expect(outputs.result).toEqual([5]);

    const compiled = def.compileEvaluate!({ node, inputs: { "entry-0": "5", "entry-1": "5" }, graph: createEmptyGraph("g", "r") });
    expect(evalExpr(compiled.result)).toEqual([5]);
  });
});

describe("set.add", () => {
  const def = getNodeDef("set.add");
  const node = createNodeInstance("set.add", { x: 0, y: 0 }, def.pins, "add");

  it("adds a new item and reports added=true", async () => {
    const outputs = await def.evaluate!({ node, inputs: { set: [1, 2], item: 3 }, ctx: ctxFor(createEmptyGraph("g", "r")) });
    expect(outputs).toEqual({ result: [1, 2, 3], added: true });
  });

  it("leaves the set unchanged and reports added=false for an existing item", async () => {
    const outputs = await def.evaluate!({ node, inputs: { set: [1, 2], item: 2 }, ctx: ctxFor(createEmptyGraph("g", "r")) });
    expect(outputs).toEqual({ result: [1, 2], added: false });
  });

  it("compiles to the same added/result values", () => {
    const compiled = def.compileEvaluate!({ node, inputs: { set: JSON.stringify([1, 2]), item: "3" }, graph: createEmptyGraph("g", "r") });
    expect(evalExpr(compiled.result)).toEqual([1, 2, 3]);
    expect(evalExpr(compiled.added)).toBe(true);
  });
});

describe("set.remove", () => {
  const def = getNodeDef("set.remove");
  const node = createNodeInstance("set.remove", { x: 0, y: 0 }, def.pins, "remove");

  it("removes an existing item and reports removed=true", async () => {
    const outputs = await def.evaluate!({ node, inputs: { set: [1, 2, 3], item: 2 }, ctx: ctxFor(createEmptyGraph("g", "r")) });
    expect(outputs).toEqual({ result: [1, 3], removed: true });
  });

  it("leaves the set unchanged and reports removed=false for a missing item", async () => {
    const outputs = await def.evaluate!({ node, inputs: { set: [1, 2], item: 9 }, ctx: ctxFor(createEmptyGraph("g", "r")) });
    expect(outputs).toEqual({ result: [1, 2], removed: false });
  });
});

describe("set.clear / contains / isEmpty / toArray", () => {
  it("Clear always returns an empty set", async () => {
    const def = getNodeDef("set.clear");
    const node = createNodeInstance("set.clear", { x: 0, y: 0 }, def.pins, "clear");
    expect((await def.evaluate!({ node, inputs: { set: [1, 2] }, ctx: ctxFor(createEmptyGraph("g", "r")) })).result).toEqual([]);
  });

  it("Contains checks deep equality", async () => {
    const def = getNodeDef("set.contains");
    const node = createNodeInstance("set.contains", { x: 0, y: 0 }, def.pins, "contains");
    expect((await def.evaluate!({ node, inputs: { set: [1, 2], item: 2 }, ctx: ctxFor(createEmptyGraph("g", "r")) })).contains).toBe(true);
    expect((await def.evaluate!({ node, inputs: { set: [1, 2], item: 9 }, ctx: ctxFor(createEmptyGraph("g", "r")) })).contains).toBe(false);
  });

  it("Is Empty reflects the set's length", async () => {
    const def = getNodeDef("set.isEmpty");
    const node = createNodeInstance("set.isEmpty", { x: 0, y: 0 }, def.pins, "isEmpty");
    expect((await def.evaluate!({ node, inputs: { set: [] }, ctx: ctxFor(createEmptyGraph("g", "r")) })).isEmpty).toBe(true);
    expect((await def.evaluate!({ node, inputs: { set: [1] }, ctx: ctxFor(createEmptyGraph("g", "r")) })).isEmpty).toBe(false);
  });

  it("To Array retags the container without changing the values", async () => {
    const def = getNodeDef("set.toArray");
    const node = createNodeInstance("set.toArray", { x: 0, y: 0 }, def.pins, "toArray");
    const outputs = await def.evaluate!({ node, inputs: { set: [1, 2, 3] }, ctx: ctxFor(createEmptyGraph("g", "r")) });
    expect(outputs.result).toEqual([1, 2, 3]);
    const pins = def.deriveInstancePins!(node);
    expect(pins.find((p) => p.id === "result")).toMatchObject({ container: "array" });
  });
});

describe("set.union / intersection / difference", () => {
  it("Union merges and dedupes both sets", async () => {
    const def = getNodeDef("set.union");
    const node = createNodeInstance("set.union", { x: 0, y: 0 }, def.pins, "union");
    const outputs = await def.evaluate!({ node, inputs: { a: [1, 2], b: [2, 3] }, ctx: ctxFor(createEmptyGraph("g", "r")) });
    expect(outputs.result).toEqual([1, 2, 3]);
  });

  it("Intersection keeps only items present in both sets", async () => {
    const def = getNodeDef("set.intersection");
    const node = createNodeInstance("set.intersection", { x: 0, y: 0 }, def.pins, "intersection");
    const outputs = await def.evaluate!({ node, inputs: { a: [1, 2, 3], b: [2, 3, 4] }, ctx: ctxFor(createEmptyGraph("g", "r")) });
    expect(outputs.result).toEqual([2, 3]);
  });

  it("Difference keeps only items in A that are absent from B", async () => {
    const def = getNodeDef("set.difference");
    const node = createNodeInstance("set.difference", { x: 0, y: 0 }, def.pins, "difference");
    const outputs = await def.evaluate!({ node, inputs: { a: [1, 2, 3], b: [2, 3, 4] }, ctx: ctxFor(createEmptyGraph("g", "r")) });
    expect(outputs.result).toEqual([1]);
  });
});

describe("set.forEach", () => {
  it("runs the loop-body chain once per element, then fires Completed", async () => {
    const graph = createEmptyGraph("g", "test");
    const forEachDef = getNodeDef("set.forEach");
    const forEach = createNodeInstance("set.forEach", { x: 0, y: 0 }, forEachDef.pins, "forEach");
    graph.nodes.push(forEach);
    const toStrDef = getNodeDef("string.fromNumber");
    graph.nodes.push(createNodeInstance("string.fromNumber", { x: 0, y: 0 }, toStrDef.pins, "toStr"));
    const printDef = getNodeDef("debug.print");
    graph.nodes.push(createNodeInstance("debug.print", { x: 0, y: 0 }, printDef.pins, "printElement"));
    const printDone = createNodeInstance("debug.print", { x: 0, y: 0 }, printDef.pins, "printDone");
    printDone.pins.message.value = "Done";
    graph.nodes.push(printDone);

    connectPins(graph, graph.variables, graph.functions, { fromNode: "forEach", fromPin: "element", toNode: "toStr", toPin: "value" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: "toStr", fromPin: "result", toNode: "printElement", toPin: "message" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: "forEach", fromPin: "loop-body", toNode: "printElement", toPin: "exec-in" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: "forEach", fromPin: "completed", toNode: "printDone", toPin: "exec-in" });

    forEach.pins.set.value = [1, 2];

    const logs: string[] = [];
    await runExecFrom("forEach", "exec-in", createExecutionContext(graph, { log: (m) => logs.push(m) }));

    expect(logs).toEqual(["1", "2", "Done"]);
  });
});
