import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltins } from "../nodes";
import {
  addScriptInput,
  addVariable,
  canToggleDisabled,
  connectPins,
  createCodeScriptDef,
  
  hasConnectedDataOutput,
  insertRerouteOnConnection,
  moveFunction,
  moveFunctionEntry,
  moveScript,
  moveScriptInput,
  moveVariable,
  removeCodeScriptDef,
  removeNode,
  removeScriptInput,
  removeVariable,
  resolveNodeLabel,
  updateScriptInput,
  updateVariable,
} from "./graphMutations";
import { getNodeDef } from "./registry";
import { type CodeScriptDef, type FunctionDef, type Variable } from "./types";
import { Graph } from "./graph";
import { NodeInstance } from "./nodeInstance";

beforeAll(() => {
  registerBuiltins();
});

describe("canPlaceNodeType", () => {
  it("always allows a non-event node type, root or function body, regardless of what's already there", () => {
    const graph = new Graph("g", "root");
    expect(graph.canPlaceNodeType("math.add", false)).toBe(true);
    expect(graph.canPlaceNodeType("math.add", true)).toBe(true);
  });

  it("blocks any event node type inside a function body", () => {
    const graph = new Graph("g", "body");
    expect(graph.canPlaceNodeType("event.start", true)).toBe(false);
    expect(graph.canPlaceNodeType("event.interval", true)).toBe(false);
    expect(graph.canPlaceNodeType("event.run", true)).toBe(false);
  });

  it("allows an event node type in the root graph if no instance of it exists yet", () => {
    const graph = new Graph("g", "root");
    expect(graph.canPlaceNodeType("event.run", false)).toBe(true);
  });

  it("blocks a second instance of the same event type in the same graph", () => {
    const graph = new Graph("g", "root");
    const def = getNodeDef("event.run");
    graph.nodes.push(NodeInstance.createNodeInstance("event.run", { x: 0, y: 0 }, def.pins));

    expect(graph.canPlaceNodeType("event.run", false)).toBe(false);
  });

  it("still allows a DIFFERENT event type even if one event type is already present", () => {
    const graph = new Graph("g", "root");
    const runDef = getNodeDef("event.run");
    graph.nodes.push(
      NodeInstance.createNodeInstance("event.run", { x: 0, y: 0 }, runDef.pins),
    );

    expect(graph.canPlaceNodeType("event.start", false)).toBe(true);
  });
});

describe("removeNode", () => {
  it("restores a downstream input pin to its literal default instead of leaving it wired-but-dangling", () => {
    const graph = new Graph("g", "root");
    const addDef = getNodeDef("math.add");
    const addNode = NodeInstance.createNodeInstance(
      "math.add",
      { x: 100, y: 0 },
      addDef.pins,
      "add",
    );
    graph.nodes.push(addNode);

    const variable: Variable = {
      id: "v1",
      name: "Score",
      type: "number",
      defaultValue: 7,
    };
    addVariable(graph, variable);
    const getDef = getNodeDef("variable.get");
    const getNode = NodeInstance.createNodeInstance(
      "variable.get",
      { x: 0, y: 0 },
      getDef.derivePins!(variable),
      "get",
      variable.id,
    );
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
    expect(addNode.pins.a.value).toBe(
      addDef.pins.find((p) => p.id === "a")!.defaultValue,
    ); // 0, not undefined/stuck
  });
});

describe("removeVariable", () => {
  it("removes the Get node AND restores whatever it fed into, rather than leaving a dangling wired-looking pin", () => {
    const graph = new Graph("g", "root");
    const addDef = getNodeDef("math.add");
    const addNode = NodeInstance.createNodeInstance(
      "math.add",
      { x: 100, y: 0 },
      addDef.pins,
      "add",
    );
    graph.nodes.push(addNode);

    const variable: Variable = {
      id: "v1",
      name: "Score",
      type: "number",
      defaultValue: 7,
    };
    addVariable(graph, variable);
    const getDef = getNodeDef("variable.get");
    const getNode = NodeInstance.createNodeInstance(
      "variable.get",
      { x: 0, y: 0 },
      getDef.derivePins!(variable),
      "get",
      variable.id,
    );
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
    const variable: Variable = {
      id: "v1",
      name: "Score",
      type: "number",
      defaultValue: 0,
    };
    const getDef = getNodeDef("variable.get");
    const node = NodeInstance.createNodeInstance(
      "variable.get",
      { x: 0, y: 0 },
      getDef.derivePins!(variable),
      "get",
      variable.id,
    );

    expect(resolveNodeLabel(node, getDef, [variable], [])).toBe("Get Score");
  });

  it("prefixes a Set node's label with 'Set ' followed by the bound variable's name", () => {
    const variable: Variable = {
      id: "v1",
      name: "Score",
      type: "number",
      defaultValue: 0,
    };
    const setDef = getNodeDef("variable.set");
    const node = NodeInstance.createNodeInstance(
      "variable.set",
      { x: 0, y: 0 },
      setDef.derivePins!(variable),
      "set",
      variable.id,
    );

    expect(resolveNodeLabel(node, setDef, [variable], [])).toBe("Set Score");
  });

  it("falls back to the def's generic label when the bound variable can't be found", () => {
    const getDef = getNodeDef("variable.get");
    const node = NodeInstance.createNodeInstance(
      "variable.get",
      { x: 0, y: 0 },
      [],
      "get",
      "missing-variable-id",
    );

    expect(resolveNodeLabel(node, getDef, [], [])).toBe("Get Variable");
  });

  it("has no effect on ordinary node types", () => {
    const addDef = getNodeDef("math.add");
    const node = NodeInstance.createNodeInstance(
      "math.add",
      { x: 0, y: 0 },
      addDef.pins,
      "add",
    );

    expect(resolveNodeLabel(node, addDef, [], [])).toBe(addDef.label);
  });
});

describe("canToggleDisabled", () => {
  it("is false for a pure data node with no execution pin at all", () => {
    const def = getNodeDef("math.add");
    const node = NodeInstance.createNodeInstance(
      "math.add",
      { x: 0, y: 0 },
      def.pins,
      "add",
    );
    expect(canToggleDisabled(node, [], [])).toBe(false);
  });

  it("is true for an ordinary exec-capable node", () => {
    const def = getNodeDef("debug.print");
    const node = NodeInstance.createNodeInstance(
      "debug.print",
      { x: 0, y: 0 },
      def.pins,
      "print",
    );
    expect(canToggleDisabled(node, [], [])).toBe(true);
  });

  it("is false for an event trigger, even though it has an execution pin", () => {
    const def = getNodeDef("event.run");
    const node = NodeInstance.createNodeInstance(
      "event.run",
      { x: 0, y: 0 },
      def.pins,
      "run",
    );
    expect(canToggleDisabled(node, [], [])).toBe(false);
  });
});

describe("hasConnectedDataOutput", () => {
  it("is false when a node's data output has no connection", () => {
    const graph = new Graph("g", "root");
    const def = getNodeDef("math.add");
    graph.nodes.push(
      NodeInstance.createNodeInstance("math.add", { x: 0, y: 0 }, def.pins, "add"),
    );
    expect(hasConnectedDataOutput(graph, "add", [], [])).toBe(false);
  });

  it("is true once the data output feeds something else", () => {
    const graph = new Graph("g", "root");
    const addDef = getNodeDef("math.add");
    graph.nodes.push(
      NodeInstance.createNodeInstance("math.add", { x: 0, y: 0 }, addDef.pins, "add1"),
    );
    graph.nodes.push(
      NodeInstance.createNodeInstance("math.add", { x: 0, y: 0 }, addDef.pins, "add2"),
    );
    connectPins(graph, [], [], {
      fromNode: "add1",
      fromPin: "result",
      toNode: "add2",
      toPin: "a",
    });
    expect(hasConnectedDataOutput(graph, "add1", [], [])).toBe(true);
  });

  it("ignores a connection leaving an exec output — only DATA outputs count", () => {
    const graph = new Graph("g", "root");
    const branchDef = getNodeDef("flow.branch");
    const printDef = getNodeDef("debug.print");
    graph.nodes.push(
      NodeInstance.createNodeInstance(
        "flow.branch",
        { x: 0, y: 0 },
        branchDef.pins,
        "branch",
      ),
    );
    graph.nodes.push(
      NodeInstance.createNodeInstance("debug.print", { x: 0, y: 0 }, printDef.pins, "print"),
    );
    connectPins(graph, [], [], {
      fromNode: "branch",
      fromPin: "true",
      toNode: "print",
      toPin: "exec-in",
    });
    expect(hasConnectedDataOutput(graph, "branch", [], [])).toBe(false);
  });

  it("is false for a loop node even when its data output (e.g. For Loop's Index) is wired — see NodeDef.disabledNextExec", () => {
    const graph = new Graph("g", "root");
    const loopDef = getNodeDef("flow.forLoop");
    const toStrDef = getNodeDef("string.fromNumber");
    graph.nodes.push(
      NodeInstance.createNodeInstance("flow.forLoop", { x: 0, y: 0 }, loopDef.pins, "loop"),
    );
    graph.nodes.push(
      NodeInstance.createNodeInstance(
        "string.fromNumber",
        { x: 0, y: 0 },
        toStrDef.pins,
        "toStr",
      ),
    );
    connectPins(graph, [], [], {
      fromNode: "loop",
      fromPin: "index",
      toNode: "toStr",
      toPin: "value",
    });
    expect(hasConnectedDataOutput(graph, "loop", [], [])).toBe(false);
  });
});

describe("updateVariable — container support", () => {
  it("resets the default value to an empty list and disconnects wires when switching to Array", () => {
    const graph = new Graph("g", "root");
    const variable: Variable = {
      id: "v1",
      name: "Nums",
      type: "number",
      defaultValue: 7,
    };
    addVariable(graph, variable);
    const getDef = getNodeDef("variable.get");
    const getNode = NodeInstance.createNodeInstance(
      "variable.get",
      { x: 0, y: 0 },
      getDef.derivePins!(variable),
      "get",
      variable.id,
    );
    graph.nodes.push(getNode);
    const addDef = getNodeDef("math.add");
    graph.nodes.push(
      NodeInstance.createNodeInstance("math.add", { x: 100, y: 0 }, addDef.pins, "add"),
    );
    connectPins(graph, graph.variables, graph.functions, {
      fromNode: "get",
      fromPin: "value",
      toNode: "add",
      toPin: "a",
    });
    expect(graph.connections).toHaveLength(1);

    updateVariable(graph, "v1", { container: "array" });

    expect(variable.container).toBe("array");
    expect(variable.defaultValue).toEqual([]);
    expect(graph.connections).toHaveLength(0);
  });

  it("resets the default value again when switching container back to single", () => {
    const graph = new Graph("g", "root");
    const variable: Variable = {
      id: "v1",
      name: "Nums",
      type: "number",
      defaultValue: [1, 2, 3],
      container: "array",
    };
    addVariable(graph, variable);

    updateVariable(graph, "v1", { container: "single" });

    expect(variable.container).toBe("single");
    expect(variable.defaultValue).toBe(0);
  });

  it("resets the default value when only the map key type changes (container/type unchanged)", () => {
    const graph = new Graph("g", "root");
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
    const graph = new Graph("g", "root");
    const variable: Variable = {
      id: "v1",
      name: "Nums",
      type: "number",
      defaultValue: 0,
    };
    addVariable(graph, variable);

    updateVariable(graph, "v1", { container: "array", defaultValue: [1, 2] });

    expect(variable.defaultValue).toEqual([1, 2]);
  });
});

describe("insertRerouteOnConnection", () => {
  it("splices a data reroute node in, freezing its element type to match the spliced wire, and preserves the original endpoints", () => {
    const graph = new Graph("g", "root");
    const add1Def = getNodeDef("math.add");
    const add2Def = getNodeDef("math.add");
    const add1 = NodeInstance.createNodeInstance(
      "math.add",
      { x: 0, y: 0 },
      add1Def.pins,
      "add1",
    );
    const add2 = NodeInstance.createNodeInstance(
      "math.add",
      { x: 200, y: 0 },
      add2Def.pins,
      "add2",
    );
    graph.nodes.push(add1, add2);
    const conn = connectPins(graph, graph.variables, graph.functions, {
      fromNode: "add1",
      fromPin: "result",
      toNode: "add2",
      toPin: "a",
    });

    insertRerouteOnConnection(
      graph,
      graph.variables,
      graph.functions,
      conn.id,
      { x: 100, y: 0 },
    );

    const reroute = graph.nodes.find((n) => n.type === "core.reroute");
    expect(reroute).toBeDefined();
    expect(reroute!.elementType).toBe("number");
    expect(reroute!.container).toBeUndefined();

    expect(graph.connections).toHaveLength(2);
    const first = graph.connections.find((c) => c.fromNode === "add1");
    const second = graph.connections.find((c) => c.toNode === "add2");
    expect(first).toMatchObject({
      fromNode: "add1",
      fromPin: "result",
      toNode: reroute!.id,
      toPin: "in",
    });
    expect(second).toMatchObject({
      fromNode: reroute!.id,
      fromPin: "out",
      toNode: "add2",
      toPin: "a",
    });
  });

  it("splices an exec reroute node in for an exec wire, using the exec-in/exec-out pins", () => {
    const graph = new Graph("g", "root");
    const branchDef = getNodeDef("flow.branch");
    const printDef = getNodeDef("debug.print");
    const branch = NodeInstance.createNodeInstance(
      "flow.branch",
      { x: 0, y: 0 },
      branchDef.pins,
      "branch",
    );
    const print = NodeInstance.createNodeInstance(
      "debug.print",
      { x: 200, y: 0 },
      printDef.pins,
      "print",
    );
    graph.nodes.push(branch, print);
    const conn = connectPins(graph, graph.variables, graph.functions, {
      fromNode: "branch",
      fromPin: "true",
      toNode: "print",
      toPin: "exec-in",
    });

    insertRerouteOnConnection(
      graph,
      graph.variables,
      graph.functions,
      conn.id,
      { x: 100, y: 0 },
    );

    const reroute = graph.nodes.find((n) => n.type === "core.rerouteExec");
    expect(reroute).toBeDefined();

    expect(graph.connections).toHaveLength(2);
    expect(
      graph.connections.find((c) => c.fromNode === "branch"),
    ).toMatchObject({
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
    const graph = new Graph("g", "root");
    insertRerouteOnConnection(
      graph,
      graph.variables,
      graph.functions,
      "nonexistent",
      { x: 0, y: 0 },
    );
    expect(graph.nodes).toHaveLength(0);
  });
});

describe("moveVariable", () => {
  function buildGraphWithVariables(...names: string[]) {
    const graph = new Graph("g", "root");
    for (const name of names) {
      graph.variables.push({ id: name, name, type: "number", defaultValue: 0 });
    }
    return graph;
  }

  it("moves a variable to sit immediately before the target", () => {
    const graph = buildGraphWithVariables("a", "b", "c", "d");
    moveVariable(graph, "d", "b", "before");
    expect(graph.variables.map((v) => v.id)).toEqual(["a", "d", "b", "c"]);
  });

  it("moves a variable to sit immediately after the target", () => {
    const graph = buildGraphWithVariables("a", "b", "c", "d");
    moveVariable(graph, "a", "c", "after");
    expect(graph.variables.map((v) => v.id)).toEqual(["b", "c", "a", "d"]);
  });

  it("moving a variable backwards past the target lands in the right spot", () => {
    const graph = buildGraphWithVariables("a", "b", "c", "d");
    moveVariable(graph, "c", "a", "before");
    expect(graph.variables.map((v) => v.id)).toEqual(["c", "a", "b", "d"]);
  });

  it("is a no-op when dropped onto itself", () => {
    const graph = buildGraphWithVariables("a", "b", "c");
    moveVariable(graph, "b", "b", "before");
    expect(graph.variables.map((v) => v.id)).toEqual(["a", "b", "c"]);
  });

  it("is a no-op when the dragged variable id doesn't exist", () => {
    const graph = buildGraphWithVariables("a", "b", "c");
    moveVariable(graph, "nonexistent", "b", "after");
    expect(graph.variables.map((v) => v.id)).toEqual(["a", "b", "c"]);
  });

  it("puts the variable back where it was if the target id doesn't exist", () => {
    const graph = buildGraphWithVariables("a", "b", "c");
    moveVariable(graph, "a", "nonexistent", "after");
    expect(graph.variables.map((v) => v.id)).toEqual(["a", "b", "c"]);
  });
});

describe("moveFunction", () => {
  function buildGraphWithFunctions(...names: string[]) {
    const graph = new Graph("g", "root");
    for (const name of names) {
      graph.functions.push({
        id: name,
        name,
        inputs: [],
        outputs: [],
        body: new Graph(`${name}-body`, name),
      });
    }
    return graph;
  }

  it("moves a function to sit immediately before the target", () => {
    const graph = buildGraphWithFunctions("a", "b", "c");
    moveFunction(graph, "c", "a", "before");
    expect(graph.functions.map((f) => f.id)).toEqual(["c", "a", "b"]);
  });

  it("moves a function to sit immediately after the target", () => {
    const graph = buildGraphWithFunctions("a", "b", "c");
    moveFunction(graph, "a", "b", "after");
    expect(graph.functions.map((f) => f.id)).toEqual(["b", "a", "c"]);
  });

  it("is a no-op when dropped onto itself", () => {
    const graph = buildGraphWithFunctions("a", "b", "c");
    moveFunction(graph, "b", "b", "after");
    expect(graph.functions.map((f) => f.id)).toEqual(["a", "b", "c"]);
  });
});

describe("moveFunctionEntry", () => {
  function buildFunctionWithInputs(...names: string[]): FunctionDef {
    return {
      id: "fn",
      name: "Fn",
      inputs: names.map((name) => ({
        id: name,
        name,
        type: "number" as const,
        defaultValue: 0,
      })),
      outputs: [{ id: "out1", name: "Out1", type: "number", defaultValue: 0 }],
      body: new Graph("fn-body", "Fn"),
    };
  }

  it("reorders the Inputs list without touching Outputs", () => {
    const fn = buildFunctionWithInputs("a", "b", "c");
    moveFunctionEntry(fn, "input", "c", "a", "before");
    expect(fn.inputs.map((e) => e.id)).toEqual(["c", "a", "b"]);
    expect(fn.outputs.map((e) => e.id)).toEqual(["out1"]);
  });

  it("reorders the Outputs list independently of Inputs", () => {
    const fn = buildFunctionWithInputs("a", "b");
    fn.outputs.push({
      id: "out2",
      name: "Out2",
      type: "number",
      defaultValue: 0,
    });
    moveFunctionEntry(fn, "output", "out2", "out1", "before");
    expect(fn.outputs.map((e) => e.id)).toEqual(["out2", "out1"]);
    expect(fn.inputs.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("is a no-op when the dragged entry id belongs to the other list (input dragged onto an output row)", () => {
    const fn = buildFunctionWithInputs("a", "b");
    moveFunctionEntry(fn, "output", "a", "out1", "before");
    expect(fn.inputs.map((e) => e.id)).toEqual(["a", "b"]);
    expect(fn.outputs.map((e) => e.id)).toEqual(["out1"]);
  });
});

describe("createCodeScriptDef", () => {
  it("creates an empty, unsaved script with no inputs yet", () => {
    const script = createCodeScriptDef("MyScript");
    expect(script.name).toBe("MyScript");
    expect(script.source).toBe("");
    expect(script.compiledJs).toBe("");
    expect(script.inputs).toEqual([]);
    expect(script.id).toBeTruthy();
  });
});

describe("removeCodeScriptDef", () => {
  it("removes the bound code.run node AND restores whatever it fed into, rather than leaving a dangling wired-looking pin", () => {
    const graph = new Graph("g", "root");
    const script = createCodeScriptDef("Greet");
    graph.scripts.push(script);

    const addDef = getNodeDef("math.add");
    const addNode = NodeInstance.createNodeInstance(
      "math.add",
      { x: 200, y: 0 },
      addDef.pins,
      "add",
    );
    graph.nodes.push(addNode);

    const codeDef = getNodeDef("code.run");
    const codeNode = NodeInstance.createNodeInstance(
      "code.run",
      { x: 0, y: 0 },
      codeDef.deriveScriptPins!(script),
      "code1",
      undefined,
      undefined,
      script.id,
    );
    graph.nodes.push(codeNode);

    // code.run has no output pins (see nodes/code.ts), so wire its exec-out into the Add node's
    // exec pin isn't representative — instead prove the general "removeNode cleans up connections"
    // path via an exec wire from a fresh On Run node into the Code node.
    const startDef = getNodeDef("event.run");
    const startNode = NodeInstance.createNodeInstance(
      "event.run",
      { x: -200, y: 0 },
      startDef.pins,
      "start",
    );
    graph.nodes.push(startNode);
    connectPins(
      graph,
      graph.variables,
      graph.functions,
      {
        fromNode: "start",
        fromPin: "exec-out",
        toNode: "code1",
        toPin: "exec-in",
      },
      graph.scripts,
    );

    removeCodeScriptDef(graph, script.id);

    expect(graph.scripts).toHaveLength(0);
    expect(graph.nodes.find((n) => n.id === "code1")).toBeUndefined();
    expect(graph.connections).toHaveLength(0);
  });

  it("only removes code.run nodes bound to THIS script, leaving other scripts' nodes untouched", () => {
    const graph = new Graph("g", "root");
    const keep = createCodeScriptDef("Keep");
    const drop = createCodeScriptDef("Drop");
    graph.scripts.push(keep, drop);

    const codeDef = getNodeDef("code.run");
    graph.nodes.push(
      NodeInstance.createNodeInstance(
        "code.run",
        { x: 0, y: 0 },
        codeDef.deriveScriptPins!(keep),
        "keepNode",
        undefined,
        undefined,
        keep.id,
      ),
      NodeInstance.createNodeInstance(
        "code.run",
        { x: 0, y: 100 },
        codeDef.deriveScriptPins!(drop),
        "dropNode",
        undefined,
        undefined,
        drop.id,
      ),
    );

    removeCodeScriptDef(graph, drop.id);

    expect(graph.scripts.map((s) => s.id)).toEqual([keep.id]);
    expect(graph.nodes.map((n) => n.id)).toEqual(["keepNode"]);
  });
});

describe("addScriptInput / removeScriptInput", () => {
  function buildGraphWithBoundCodeNode(script: CodeScriptDef) {
    const graph = new Graph("g", "root");
    graph.scripts.push(script);
    const codeDef = getNodeDef("code.run");
    const codeNode = NodeInstance.createNodeInstance(
      "code.run",
      { x: 0, y: 0 },
      codeDef.deriveScriptPins!(script),
      "code1",
      undefined,
      undefined,
      script.id,
    );
    graph.nodes.push(codeNode);
    return graph;
  }

  it("adding an input makes it appear as a new pin on every code.run node bound to the script", () => {
    const script = createCodeScriptDef("Greet");
    const graph = buildGraphWithBoundCodeNode(script);

    addScriptInput(script, {
      id: "name",
      name: "name",
      type: "string",
      defaultValue: "",
    });
    const codeNode = graph.nodes.find((n) => n.id === "code1")!;
    const pins = codeNode.resolvePinDefs(
      graph.variables,
      graph.functions,
      graph.scripts,
    );
    expect(pins.some((p) => p.id === "name" && p.direction === "input")).toBe(
      true,
    );
  });

  it("removing an input prunes the now-dangling pin/connection off every bound code.run node", () => {
    const script = createCodeScriptDef("Greet");
    script.inputs.push({
      id: "name",
      name: "name",
      type: "string",
      defaultValue: "",
    });
    const graph = buildGraphWithBoundCodeNode(script);

    const varDef = getNodeDef("variable.get");
    const variable: Variable = {
      id: "v1",
      name: "PlayerName",
      type: "string",
      defaultValue: "Alice",
    };
    addVariable(graph, variable);
    const getNode = NodeInstance.createNodeInstance(
      "variable.get",
      { x: -200, y: 0 },
      varDef.derivePins!(variable),
      "get",
      variable.id,
    );
    graph.nodes.push(getNode);
    connectPins(
      graph,
      graph.variables,
      graph.functions,
      { fromNode: "get", fromPin: "value", toNode: "code1", toPin: "name" },
      graph.scripts,
    );

    expect(graph.connections).toHaveLength(1);

    removeScriptInput(graph, script, "name");

    expect(script.inputs).toHaveLength(0);
    expect(graph.connections).toHaveLength(0);
    const codeNode = graph.nodes.find((n) => n.id === "code1")!;
    expect(codeNode.pins.name).toBeUndefined();
  });
});

describe("updateScriptInput", () => {
  it("renaming an input does NOT disconnect its wire", () => {
    const script = createCodeScriptDef("Greet");
    script.inputs.push({
      id: "name",
      name: "name",
      type: "string",
      defaultValue: "",
    });
    const graph = new Graph("g", "root");
    graph.scripts.push(script);

    const codeDef = getNodeDef("code.run");
    const codeNode = NodeInstance.createNodeInstance(
      "code.run",
      { x: 0, y: 0 },
      codeDef.deriveScriptPins!(script),
      "code1",
      undefined,
      undefined,
      script.id,
    );
    graph.nodes.push(codeNode);
    const variable: Variable = {
      id: "v1",
      name: "PlayerName",
      type: "string",
      defaultValue: "Alice",
    };
    addVariable(graph, variable);
    const getDef = getNodeDef("variable.get");
    graph.nodes.push(
      NodeInstance.createNodeInstance(
        "variable.get",
        { x: -200, y: 0 },
        getDef.derivePins!(variable),
        "get",
        variable.id,
      ),
    );
    connectPins(
      graph,
      graph.variables,
      graph.functions,
      { fromNode: "get", fromPin: "value", toNode: "code1", toPin: "name" },
      graph.scripts,
    );

    updateScriptInput(graph, script, "name", { name: "playerName" });

    expect(script.inputs[0].name).toBe("playerName");
    expect(graph.connections).toHaveLength(1);
  });

  it("retyping an input DOES disconnect its wire (the old wire may no longer be type-compatible)", () => {
    const script = createCodeScriptDef("Greet");
    script.inputs.push({
      id: "name",
      name: "name",
      type: "string",
      defaultValue: "",
    });
    const graph = new Graph("g", "root");
    graph.scripts.push(script);

    const codeDef = getNodeDef("code.run");
    const codeNode = NodeInstance.createNodeInstance(
      "code.run",
      { x: 0, y: 0 },
      codeDef.deriveScriptPins!(script),
      "code1",
      undefined,
      undefined,
      script.id,
    );
    graph.nodes.push(codeNode);
    const variable: Variable = {
      id: "v1",
      name: "PlayerName",
      type: "string",
      defaultValue: "Alice",
    };
    addVariable(graph, variable);
    const getDef = getNodeDef("variable.get");
    graph.nodes.push(
      NodeInstance.createNodeInstance(
        "variable.get",
        { x: -200, y: 0 },
        getDef.derivePins!(variable),
        "get",
        variable.id,
      ),
    );
    connectPins(
      graph,
      graph.variables,
      graph.functions,
      { fromNode: "get", fromPin: "value", toNode: "code1", toPin: "name" },
      graph.scripts,
    );

    updateScriptInput(graph, script, "name", { type: "number" });

    expect(script.inputs[0].type).toBe("number");
    expect(graph.connections).toHaveLength(0);
  });
});

describe("moveScript", () => {
  it("reorders scripts on the graph", () => {
    const graph = new Graph("g", "root");
    graph.scripts.push(
      createCodeScriptDef("a"),
      createCodeScriptDef("b"),
      createCodeScriptDef("c"),
    );
    const [a, b, c] = graph.scripts;
    moveScript(graph, c.id, a.id, "before");
    expect(graph.scripts.map((s) => s.id)).toEqual([c.id, a.id, b.id]);
  });
});

describe("moveScriptInput", () => {
  it("reorders a script's inputs list", () => {
    const script = createCodeScriptDef("Fn");
    script.inputs.push(
      { id: "a", name: "a", type: "number", defaultValue: 0 },
      { id: "b", name: "b", type: "number", defaultValue: 0 },
      { id: "c", name: "c", type: "number", defaultValue: 0 },
    );
    moveScriptInput(script, "c", "a", "before");
    expect(script.inputs.map((e) => e.id)).toEqual(["c", "a", "b"]);
  });
});
