import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltins } from "../nodes";
import {
  addVariable,
  canPlaceNodeType,
  canToggleDisabled,
  connectPins,
  createNodeInstance,
  hasConnectedDataOutput,
  insertRerouteOnConnection,
  removeNode,
  removeVariable,
  resolveNodeLabel,
  updateVariable,
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
  it("prefixes a Get node's label with 'Get ' followed by the bound variable's name", () => {
    const variable: Variable = { id: "v1", name: "Score", type: "number", defaultValue: 0 };
    const getDef = getNodeDef("variable.get");
    const node = createNodeInstance("variable.get", { x: 0, y: 0 }, getDef.derivePins!(variable), "get", variable.id);

    expect(resolveNodeLabel(node, getDef, [variable], [])).toBe("Get Score");
  });

  it("prefixes a Set node's label with 'Set ' followed by the bound variable's name", () => {
    const variable: Variable = { id: "v1", name: "Score", type: "number", defaultValue: 0 };
    const setDef = getNodeDef("variable.set");
    const node = createNodeInstance("variable.set", { x: 0, y: 0 }, setDef.derivePins!(variable), "set", variable.id);

    expect(resolveNodeLabel(node, setDef, [variable], [])).toBe("Set Score");
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

describe("canToggleDisabled", () => {
  it("is false for a pure data node with no execution pin at all", () => {
    const def = getNodeDef("math.add");
    const node = createNodeInstance("math.add", { x: 0, y: 0 }, def.pins, "add");
    expect(canToggleDisabled(node, [], [])).toBe(false);
  });

  it("is true for an ordinary exec-capable node", () => {
    const def = getNodeDef("debug.print");
    const node = createNodeInstance("debug.print", { x: 0, y: 0 }, def.pins, "print");
    expect(canToggleDisabled(node, [], [])).toBe(true);
  });

  it("is false for an event trigger, even though it has an execution pin", () => {
    const def = getNodeDef("event.run");
    const node = createNodeInstance("event.run", { x: 0, y: 0 }, def.pins, "run");
    expect(canToggleDisabled(node, [], [])).toBe(false);
  });
});

describe("hasConnectedDataOutput", () => {
  it("is false when a node's data output has no connection", () => {
    const graph = createEmptyGraph("g", "root");
    const def = getNodeDef("math.add");
    graph.nodes.push(createNodeInstance("math.add", { x: 0, y: 0 }, def.pins, "add"));
    expect(hasConnectedDataOutput(graph, "add", [], [])).toBe(false);
  });

  it("is true once the data output feeds something else", () => {
    const graph = createEmptyGraph("g", "root");
    const addDef = getNodeDef("math.add");
    graph.nodes.push(createNodeInstance("math.add", { x: 0, y: 0 }, addDef.pins, "add1"));
    graph.nodes.push(createNodeInstance("math.add", { x: 0, y: 0 }, addDef.pins, "add2"));
    connectPins(graph, [], [], { fromNode: "add1", fromPin: "result", toNode: "add2", toPin: "a" });
    expect(hasConnectedDataOutput(graph, "add1", [], [])).toBe(true);
  });

  it("ignores a connection leaving an exec output — only DATA outputs count", () => {
    const graph = createEmptyGraph("g", "root");
    const branchDef = getNodeDef("flow.branch");
    const printDef = getNodeDef("debug.print");
    graph.nodes.push(createNodeInstance("flow.branch", { x: 0, y: 0 }, branchDef.pins, "branch"));
    graph.nodes.push(createNodeInstance("debug.print", { x: 0, y: 0 }, printDef.pins, "print"));
    connectPins(graph, [], [], { fromNode: "branch", fromPin: "true", toNode: "print", toPin: "exec-in" });
    expect(hasConnectedDataOutput(graph, "branch", [], [])).toBe(false);
  });

  it("is false for a loop node even when its data output (e.g. For Loop's Index) is wired — see NodeDef.disabledNextExec", () => {
    const graph = createEmptyGraph("g", "root");
    const loopDef = getNodeDef("flow.forLoop");
    const toStrDef = getNodeDef("string.fromNumber");
    graph.nodes.push(createNodeInstance("flow.forLoop", { x: 0, y: 0 }, loopDef.pins, "loop"));
    graph.nodes.push(createNodeInstance("string.fromNumber", { x: 0, y: 0 }, toStrDef.pins, "toStr"));
    connectPins(graph, [], [], { fromNode: "loop", fromPin: "index", toNode: "toStr", toPin: "value" });
    expect(hasConnectedDataOutput(graph, "loop", [], [])).toBe(false);
  });
});

describe("updateVariable — container support", () => {
  it("resets the default value to an empty list and disconnects wires when switching to Array", () => {
    const graph = createEmptyGraph("g", "root");
    const variable: Variable = { id: "v1", name: "Nums", type: "number", defaultValue: 7 };
    addVariable(graph, variable);
    const getDef = getNodeDef("variable.get");
    const getNode = createNodeInstance("variable.get", { x: 0, y: 0 }, getDef.derivePins!(variable), "get", variable.id);
    graph.nodes.push(getNode);
    const addDef = getNodeDef("math.add");
    graph.nodes.push(createNodeInstance("math.add", { x: 100, y: 0 }, addDef.pins, "add"));
    connectPins(graph, graph.variables, graph.functions, { fromNode: "get", fromPin: "value", toNode: "add", toPin: "a" });
    expect(graph.connections).toHaveLength(1);

    updateVariable(graph, "v1", { container: "array" });

    expect(variable.container).toBe("array");
    expect(variable.defaultValue).toEqual([]);
    expect(graph.connections).toHaveLength(0);
  });

  it("resets the default value again when switching container back to single", () => {
    const graph = createEmptyGraph("g", "root");
    const variable: Variable = { id: "v1", name: "Nums", type: "number", defaultValue: [1, 2, 3], container: "array" };
    addVariable(graph, variable);

    updateVariable(graph, "v1", { container: "single" });

    expect(variable.container).toBe("single");
    expect(variable.defaultValue).toBe(0);
  });

  it("resets the default value when only the map key type changes (container/type unchanged)", () => {
    const graph = createEmptyGraph("g", "root");
    const variable: Variable = {
      id: "v1",
      name: "Scores",
      type: "number",
      container: "map",
      keyType: "string",
      defaultValue: [{ key: "a", value: 1 }],
    };
    addVariable(graph, variable);

    updateVariable(graph, "v1", { keyType: "boolean" });

    expect(variable.keyType).toBe("boolean");
    expect(variable.defaultValue).toEqual([]);
  });

  it("leaves the default value alone when the patch itself supplies one", () => {
    const graph = createEmptyGraph("g", "root");
    const variable: Variable = { id: "v1", name: "Nums", type: "number", defaultValue: 0 };
    addVariable(graph, variable);

    updateVariable(graph, "v1", { container: "array", defaultValue: [1, 2] });

    expect(variable.defaultValue).toEqual([1, 2]);
  });
});

describe("insertRerouteOnConnection", () => {
  it("splices a data reroute node in, freezing its element type to match the spliced wire, and preserves the original endpoints", () => {
    const graph = createEmptyGraph("g", "root");
    const add1Def = getNodeDef("math.add");
    const add2Def = getNodeDef("math.add");
    const add1 = createNodeInstance("math.add", { x: 0, y: 0 }, add1Def.pins, "add1");
    const add2 = createNodeInstance("math.add", { x: 200, y: 0 }, add2Def.pins, "add2");
    graph.nodes.push(add1, add2);
    const conn = connectPins(graph, graph.variables, graph.functions, {
      fromNode: "add1",
      fromPin: "result",
      toNode: "add2",
      toPin: "a",
    });

    insertRerouteOnConnection(graph, graph.variables, graph.functions, conn.id, { x: 100, y: 0 });

    const reroute = graph.nodes.find((n) => n.type === "core.reroute");
    expect(reroute).toBeDefined();
    expect(reroute!.elementType).toBe("number");
    expect(reroute!.container).toBeUndefined();

    expect(graph.connections).toHaveLength(2);
    const first = graph.connections.find((c) => c.fromNode === "add1");
    const second = graph.connections.find((c) => c.toNode === "add2");
    expect(first).toMatchObject({ fromNode: "add1", fromPin: "result", toNode: reroute!.id, toPin: "in" });
    expect(second).toMatchObject({ fromNode: reroute!.id, fromPin: "out", toNode: "add2", toPin: "a" });
  });

  it("splices an exec reroute node in for an exec wire, using the exec-in/exec-out pins", () => {
    const graph = createEmptyGraph("g", "root");
    const branchDef = getNodeDef("flow.branch");
    const printDef = getNodeDef("debug.print");
    const branch = createNodeInstance("flow.branch", { x: 0, y: 0 }, branchDef.pins, "branch");
    const print = createNodeInstance("debug.print", { x: 200, y: 0 }, printDef.pins, "print");
    graph.nodes.push(branch, print);
    const conn = connectPins(graph, graph.variables, graph.functions, {
      fromNode: "branch",
      fromPin: "true",
      toNode: "print",
      toPin: "exec-in",
    });

    insertRerouteOnConnection(graph, graph.variables, graph.functions, conn.id, { x: 100, y: 0 });

    const reroute = graph.nodes.find((n) => n.type === "core.rerouteExec");
    expect(reroute).toBeDefined();

    expect(graph.connections).toHaveLength(2);
    expect(graph.connections.find((c) => c.fromNode === "branch")).toMatchObject({
      fromNode: "branch",
      fromPin: "true",
      toNode: reroute!.id,
      toPin: "exec-in",
    });
    expect(graph.connections.find((c) => c.toNode === "print")).toMatchObject({
      fromNode: reroute!.id,
      fromPin: "exec-out",
      toNode: "print",
      toPin: "exec-in",
    });
  });

  it("does nothing when the connection id doesn't exist", () => {
    const graph = createEmptyGraph("g", "root");
    insertRerouteOnConnection(graph, graph.variables, graph.functions, "nonexistent", { x: 0, y: 0 });
    expect(graph.nodes).toHaveLength(0);
  });
});
