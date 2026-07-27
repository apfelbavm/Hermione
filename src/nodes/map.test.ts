import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltins } from "./index";
import { createExecutionContext, runExecFrom } from "../engine/executor";
import { connectPins, createNodeInstance, removeInstancePin } from "../engine/graphMutations";
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

describe("map.make", () => {
  it("exposes a configurable value type AND key type, starting with one key/value pair", () => {
    const def = getNodeDef("map.make");
    expect(def.configurableElementType?.includeKeyType).toBe(true);
    const node = createNodeInstance("map.make", { x: 0, y: 0 }, def.pins, "make");
    expect(node.elementType).toBe("number");
    expect(node.mapKeyType).toBe("string");
    const pins = def.deriveInstancePins!(node);
    expect(pins.map((p) => p.id)).toEqual(["key-0", "value-0", "result"]);
    expect(pins.find((p) => p.id === "value-0")?.removable).toBe(true);
    expect(pins.find((p) => p.id === "key-0")?.removable).toBeFalsy();
  });

  it("assembles key/value pairs into an array of {key,value} entries", async () => {
    const def = getNodeDef("map.make");
    const node = createNodeInstance("map.make", { x: 0, y: 0 }, def.pins, "make");
    def.addInstancePinEntry!(node); // key-1/value-1

    const outputs = await def.evaluate!({
      node,
      inputs: { "key-0": "a", "value-0": 1, "key-1": "b", "value-1": 2 },
      ctx: ctxFor(createEmptyGraph("g", "r")),
    });
    expect(outputs.result).toEqual([
      { key: "a", value: 1 },
      { key: "b", value: 2 },
    ]);

    const compiled = def.compileEvaluate!({
      node,
      inputs: { "key-0": '"a"', "value-0": "1", "key-1": '"b"', "value-1": "2" },
      graph: createEmptyGraph("g", "r"),
    });
    expect(evalExpr(compiled.result)).toEqual([
      { key: "a", value: 1 },
      { key: "b", value: 2 },
    ]);
  });

  it("removing a value-N pin (the only removable side) also removes its paired key-N", () => {
    const graph = createEmptyGraph("g", "root");
    const def = getNodeDef("map.make");
    const node = createNodeInstance("map.make", { x: 0, y: 0 }, def.pins, "make");
    graph.nodes.push(node);
    def.addInstancePinEntry!(node); // key-1/value-1
    expect(Object.keys(node.pins)).toEqual(expect.arrayContaining(["key-0", "value-0", "key-1", "value-1"]));

    removeInstancePin(graph, "make", "value-1");

    expect(node.pins["value-1"]).toBeUndefined();
    expect(node.pins["key-1"]).toBeUndefined();
    expect(node.pins["key-0"]).toBeDefined();
    expect(node.pins["value-0"]).toBeDefined();
  });
});

describe("map.set (Add)", () => {
  const def = getNodeDef("map.set");
  const node = createNodeInstance("map.set", { x: 0, y: 0 }, def.pins, "set");

  it("appends a new key", async () => {
    const outputs = await def.evaluate!({ node, inputs: { map: [{ key: "a", value: 1 }], key: "b", value: 2 }, ctx: ctxFor(createEmptyGraph("g", "r")) });
    expect(outputs.result).toEqual([
      { key: "a", value: 1 },
      { key: "b", value: 2 },
    ]);
  });

  it("overwrites the value for an existing key instead of duplicating it", async () => {
    const outputs = await def.evaluate!({ node, inputs: { map: [{ key: "a", value: 1 }], key: "a", value: 99 }, ctx: ctxFor(createEmptyGraph("g", "r")) });
    expect(outputs.result).toEqual([{ key: "a", value: 99 }]);
  });
});

describe("map.remove", () => {
  const def = getNodeDef("map.remove");
  const node = createNodeInstance("map.remove", { x: 0, y: 0 }, def.pins, "remove");

  it("removes an existing key and reports removed=true", async () => {
    const outputs = await def.evaluate!({
      node,
      inputs: { map: [{ key: "a", value: 1 }, { key: "b", value: 2 }], key: "a" },
      ctx: ctxFor(createEmptyGraph("g", "r")),
    });
    expect(outputs).toEqual({ result: [{ key: "b", value: 2 }], removed: true });
  });

  it("reports removed=false for a missing key", async () => {
    const outputs = await def.evaluate!({ node, inputs: { map: [{ key: "a", value: 1 }], key: "z" }, ctx: ctxFor(createEmptyGraph("g", "r")) });
    expect(outputs).toEqual({ result: [{ key: "a", value: 1 }], removed: false });
  });
});

describe("map.find", () => {
  const def = getNodeDef("map.find");
  const node = createNodeInstance("map.find", { x: 0, y: 0 }, def.pins, "find");

  it("returns the value and found=true for an existing key", async () => {
    const outputs = await def.evaluate!({ node, inputs: { map: [{ key: "a", value: 1 }], key: "a" }, ctx: ctxFor(createEmptyGraph("g", "r")) });
    expect(outputs).toEqual({ value: 1, found: true });
  });

  it("returns the value type's default and found=false for a missing key", async () => {
    const outputs = await def.evaluate!({ node, inputs: { map: [{ key: "a", value: 1 }], key: "z" }, ctx: ctxFor(createEmptyGraph("g", "r")) });
    expect(outputs).toEqual({ value: 0, found: false });
  });

  it("compiles to the same value/found result", () => {
    const compiled = def.compileEvaluate!({
      node,
      inputs: { map: JSON.stringify([{ key: "a", value: 1 }]), key: '"a"' },
      graph: createEmptyGraph("g", "r"),
    });
    expect(evalExpr(compiled.value)).toBe(1);
    expect(evalExpr(compiled.found)).toBe(true);
  });
});

describe("map.clear / containsKey / keys / values / isEmpty", () => {
  it("Clear always returns an empty map", async () => {
    const def = getNodeDef("map.clear");
    const node = createNodeInstance("map.clear", { x: 0, y: 0 }, def.pins, "clear");
    expect((await def.evaluate!({ node, inputs: { map: [{ key: "a", value: 1 }] }, ctx: ctxFor(createEmptyGraph("g", "r")) })).result).toEqual([]);
  });

  it("Contains Key checks key equality", async () => {
    const def = getNodeDef("map.containsKey");
    const node = createNodeInstance("map.containsKey", { x: 0, y: 0 }, def.pins, "containsKey");
    expect((await def.evaluate!({ node, inputs: { map: [{ key: "a", value: 1 }], key: "a" }, ctx: ctxFor(createEmptyGraph("g", "r")) })).contains).toBe(true);
    expect((await def.evaluate!({ node, inputs: { map: [{ key: "a", value: 1 }], key: "z" }, ctx: ctxFor(createEmptyGraph("g", "r")) })).contains).toBe(false);
  });

  it("Keys returns an Array-container pin of just the keys, in order", async () => {
    const def = getNodeDef("map.keys");
    const node = createNodeInstance("map.keys", { x: 0, y: 0 }, def.pins, "keys");
    const outputs = await def.evaluate!({
      node,
      inputs: { map: [{ key: "a", value: 1 }, { key: "b", value: 2 }] },
      ctx: ctxFor(createEmptyGraph("g", "r")),
    });
    expect(outputs.result).toEqual(["a", "b"]);
    const pins = def.deriveInstancePins!(node);
    expect(pins.find((p) => p.id === "result")).toMatchObject({ container: "array", type: "string" });
  });

  it("Values returns an Array-container pin of just the values, in order", async () => {
    const def = getNodeDef("map.values");
    const node = createNodeInstance("map.values", { x: 0, y: 0 }, def.pins, "values");
    const outputs = await def.evaluate!({
      node,
      inputs: { map: [{ key: "a", value: 1 }, { key: "b", value: 2 }] },
      ctx: ctxFor(createEmptyGraph("g", "r")),
    });
    expect(outputs.result).toEqual([1, 2]);
  });

  it("Is Empty reflects the map's length", async () => {
    const def = getNodeDef("map.isEmpty");
    const node = createNodeInstance("map.isEmpty", { x: 0, y: 0 }, def.pins, "isEmpty");
    expect((await def.evaluate!({ node, inputs: { map: [] }, ctx: ctxFor(createEmptyGraph("g", "r")) })).isEmpty).toBe(true);
    expect((await def.evaluate!({ node, inputs: { map: [{ key: "a", value: 1 }] }, ctx: ctxFor(createEmptyGraph("g", "r")) })).isEmpty).toBe(false);
  });
});

describe("map.forEach", () => {
  it("runs the loop-body chain once per entry, exposing Key and Value, then fires Completed", async () => {
    const graph = createEmptyGraph("g", "test");
    const forEachDef = getNodeDef("map.forEach");
    const forEach = createNodeInstance("map.forEach", { x: 0, y: 0 }, forEachDef.pins, "forEach");
    graph.nodes.push(forEach);
    const printDef = getNodeDef("debug.print");
    graph.nodes.push(createNodeInstance("debug.print", { x: 0, y: 0 }, printDef.pins, "printKey"));
    const printDone = createNodeInstance("debug.print", { x: 0, y: 0 }, printDef.pins, "printDone");
    printDone.pins.message.value = "Done";
    graph.nodes.push(printDone);

    connectPins(graph, graph.variables, graph.functions, { fromNode: "forEach", fromPin: "key", toNode: "printKey", toPin: "message" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: "forEach", fromPin: "loop-body", toNode: "printKey", toPin: "exec-in" });
    connectPins(graph, graph.variables, graph.functions, { fromNode: "forEach", fromPin: "completed", toNode: "printDone", toPin: "exec-in" });

    forEach.pins.map.value = [
      { key: "a", value: 1 },
      { key: "b", value: 2 },
    ];

    const logs: string[] = [];
    await runExecFrom("forEach", "exec-in", createExecutionContext(graph, { log: (m) => logs.push(m) }));

    expect(logs).toEqual(["a", "b", "Done"]);
  });
});
