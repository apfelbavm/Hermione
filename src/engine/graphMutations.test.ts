import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltins } from "../nodes";
import {
  addVariable,
  canPlaceNodeType,
  connectPins,
  createNodeInstance,
  removeNode,
  removeVariable,
  resolveNodeLabel,
} from "./graphMutations";
import { getNodeDef } from "./registry";
import { createEmptyGraph, type Variable } from "./types";

beforeAll(() => {
  registerBuiltins();
});

describe("canPlaceNodeType", () => {
  it("always allows a non-event node type, root or function body, regardless of what's already there", () => {
    const graph = createEmptyGraph("g", "root");
    expect(canPlaceNodeType("math.add", graph, false)).toBe(true);
    expect(canPlaceNodeType("math.add", graph, true)).toBe(true);
  });

  it("blocks any event node type inside a function body", () => {
    const graph = createEmptyGraph("g", "body");
    expect(canPlaceNodeType("event.start", graph, true)).toBe(false);
    expect(canPlaceNodeType("event.interval", graph, true)).toBe(false);
    expect(canPlaceNodeType("event.run", graph, true)).toBe(false);
  });

  it("allows an event node type in the root graph if no instance of it exists yet", () => {
    const graph = createEmptyGraph("g", "root");
    expect(canPlaceNodeType("event.run", graph, false)).toBe(true);
  });

  it("blocks a second instance of the same event type in the same graph", () => {
    const graph = createEmptyGraph("g", "root");
    const def = getNodeDef("event.run");
    graph.nodes.push(createNodeInstance("event.run", { x: 0, y: 0 }, def.pins));

    expect(canPlaceNodeType("event.run", graph, false)).toBe(false);
  });

  it("still allows a DIFFERENT event type even if one event type is already present", () => {
    const graph = createEmptyGraph("g", "root");
    const runDef = getNodeDef("event.run");
    graph.nodes.push(createNodeInstance("event.run", { x: 0, y: 0 }, runDef.pins));

    expect(canPlaceNodeType("event.start", graph, false)).toBe(true);
  });
});

describe("removeNode", () => {
  it("restores a downstream input pin to its literal default instead of leaving it wired-but-dangling", () => {
    const graph = createEmptyGraph("g", "root");
    const addDef = getNodeDef("math.add");
    const addNode = createNodeInstance("math.add", { x: 100, y: 0 }, addDef.pins, "add");
    graph.nodes.push(addNode);

    const variable: Variable = { id: "v1", name: "Score", type: "number", defaultValue: 7 };
    addVariable(graph, variable);
    const getDef = getNodeDef("variable.get");
    const getNode = createNodeInstance("variable.get", { x: 0, y: 0 }, getDef.derivePins!(variable), "get", variable.id);
    graph.nodes.push(getNode);

    connectPins(graph, graph.variables, graph.functions, {
      fromNode: "get",
      fromPin: "value",
      toNode: "add",
      toPin: "a",
    });
    expect(addNode.pins.a.connectionId).toBeDefined();

    removeNode(graph, graph.variables, graph.functions, "get");

    expect(graph.nodes.find((n) => n.id === "get")).toBeUndefined();
    expect(graph.connections).toHaveLength(0);
    expect(addNode.pins.a.connectionId).toBeUndefined();
    expect(addNode.pins.a.value).toBe(addDef.pins.find((p) => p.id === "a")!.defaultValue); // 0, not undefined/stuck
  });
});

describe("removeVariable", () => {
  it("removes the Get node AND restores whatever it fed into, rather than leaving a dangling wired-looking pin", () => {
    const graph = createEmptyGraph("g", "root");
    const addDef = getNodeDef("math.add");
    const addNode = createNodeInstance("math.add", { x: 100, y: 0 }, addDef.pins, "add");
    graph.nodes.push(addNode);

    const variable: Variable = { id: "v1", name: "Score", type: "number", defaultValue: 7 };
    addVariable(graph, variable);
    const getDef = getNodeDef("variable.get");
    const getNode = createNodeInstance("variable.get", { x: 0, y: 0 }, getDef.derivePins!(variable), "get", variable.id);
    graph.nodes.push(getNode);

    connectPins(graph, graph.variables, graph.functions, {
      fromNode: "get",
      fromPin: "value",
      toNode: "add",
      toPin: "a",
    });

    removeVariable(graph, graph.variables, graph.functions, variable.id);

    expect(graph.variables).toHaveLength(0);
    expect(graph.nodes.find((n) => n.id === "get")).toBeUndefined();
    expect(graph.connections).toHaveLength(0);
    // The bug: "a" would keep its stale connectionId (so no literal widget ever reappears) and its
    // value would stay stuck at undefined (surfacing as "null") instead of falling back to a real default.
    expect(addNode.pins.a.connectionId).toBeUndefined();
    expect(addNode.pins.a.value).toBe(0);
  });
});

describe("resolveNodeLabel", () => {
  it("shows the bound variable's name for a Get/Set node instead of the generic def label", () => {
    const variable: Variable = { id: "v1", name: "Score", type: "number", defaultValue: 0 };
    const getDef = getNodeDef("variable.get");
    const node = createNodeInstance("variable.get", { x: 0, y: 0 }, getDef.derivePins!(variable), "get", variable.id);

    expect(resolveNodeLabel(node, getDef, [variable], [])).toBe("Score");
  });

  it("falls back to the def's generic label when the bound variable can't be found", () => {
    const getDef = getNodeDef("variable.get");
    const node = createNodeInstance("variable.get", { x: 0, y: 0 }, [], "get", "missing-variable-id");

    expect(resolveNodeLabel(node, getDef, [], [])).toBe("Get Variable");
  });

  it("has no effect on ordinary node types", () => {
    const addDef = getNodeDef("math.add");
    const node = createNodeInstance("math.add", { x: 0, y: 0 }, addDef.pins, "add");

    expect(resolveNodeLabel(node, addDef, [], [])).toBe(addDef.label);
  });
});
