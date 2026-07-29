import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltins } from "./index";
import { createNodeInstance, removeInstancePin, resolvePinDefs } from "../engine/graphMutations";
import { getNodeDef } from "../engine/registry";
import {  type NodeInstance } from "../engine/types";
import { Graph } from "../engine/graph";

beforeAll(() => {
  registerBuiltins();
});

function appendNode(): NodeInstance {
  const def = getNodeDef("string.append");
  return createNodeInstance("string.append", { x: 0, y: 0 }, def.pins);
}

describe("string.fromNumber / fromBoolean / fromJson", () => {
  it("stringifies a number", () => {
    const def = getNodeDef("string.fromNumber");
    expect(def.evaluate!({ node: {} as NodeInstance, inputs: { value: 42 }, ctx: {} as never })).toEqual({
      result: "42",
    });
  });

  it("stringifies a boolean", () => {
    const def = getNodeDef("string.fromBoolean");
    expect(def.evaluate!({ node: {} as NodeInstance, inputs: { value: true }, ctx: {} as never })).toEqual({
      result: "true",
    });
  });

  it("JSON-stringifies an object", () => {
    const def = getNodeDef("string.fromJson");
    const result = def.evaluate!({ node: {} as NodeInstance, inputs: { value: { a: 1 } }, ctx: {} as never });
    expect(result).toEqual({ result: '{"a":1}' });
  });

  it("compileEvaluate produces expressions that evaluate to the same result", () => {
    const num = getNodeDef("string.fromNumber");
    expect(eval(num.compileEvaluate!({ node: {} as NodeInstance, inputs: { value: "7" }, graph: {} as never }).result)).toBe(
      "7",
    );

    const json = getNodeDef("string.fromJson");
    const expr = json.compileEvaluate!({ node: {} as NodeInstance, inputs: { value: "{ b: 2 }" }, graph: {} as never })
      .result;
    expect(eval(expr)).toBe('{"b":2}');
  });
});

describe("string.append", () => {
  it("starts with exactly two string entries, concatenated in order", () => {
    const node = appendNode();
    const graph = new Graph("g", "root");
    graph.nodes.push(node);

    const pinDefs = resolvePinDefs(node, [], []);
    const entryIds = pinDefs.filter((p) => p.direction === "input").map((p) => p.id);
    expect(entryIds).toEqual(["entry-0", "entry-1"]);

    const def = getNodeDef("string.append");
    const result = def.evaluate!({ node, inputs: { "entry-0": "foo", "entry-1": "bar" }, ctx: {} as never });
    expect(result).toEqual({ result: "foobar" });
  });

  it("both default entries are removable (count exceeds the one-entry minimum)", () => {
    const node = appendNode();
    const pinDefs = resolvePinDefs(node, [], []);
    const entries = pinDefs.filter((p) => p.direction === "input");
    expect(entries.every((p) => p.removable)).toBe(true);
  });

  it("addInstancePinEntry appends a new entry with the next free suffix", () => {
    const node = appendNode();
    const def = getNodeDef("string.append");
    def.addInstancePinEntry!(node);

    const pinDefs = resolvePinDefs(node, [], []);
    const entries = pinDefs.filter((p) => p.direction === "input");
    expect(entries.map((p) => p.id)).toEqual(["entry-0", "entry-1", "entry-2"]);
    expect(entries.map((p) => p.label)).toEqual(["String 1", "String 2", "String 3"]);
    expect(node.pins["entry-2"]).toEqual({ value: "" });
  });

  it("removeInstancePin deletes the pin and prunes connections touching it; remaining entries relabel contiguously", () => {
    const node = appendNode();
    const graph = new Graph("g", "root");
    graph.nodes.push(node);
    graph.connections.push({ id: "c1", fromNode: "other", fromPin: "out", toNode: node.id, toPin: "entry-0" });

    removeInstancePin(graph, node.id, "entry-0");

    expect(node.pins["entry-0"]).toBeUndefined();
    expect(graph.connections).toHaveLength(0);

    const pinDefs = resolvePinDefs(node, [], []);
    const entries = pinDefs.filter((p) => p.direction === "input");
    expect(entries.map((p) => p.id)).toEqual(["entry-1"]);
    expect(entries[0].label).toBe("String 1"); // relabeled to position 1 even though its id is entry-1
    expect(entries[0].removable).toBe(false); // down to the minimum — can't delete the last one
  });

  it("compileEvaluate joins every current entry into a single expression", () => {
    const node = appendNode();
    const def = getNodeDef("string.append");
    const expr = def.compileEvaluate!({
      node,
      inputs: { "entry-0": '"foo"', "entry-1": '"bar"' },
      graph: {} as never,
    }).result;
    expect(eval(expr)).toBe("foobar");
  });
});
