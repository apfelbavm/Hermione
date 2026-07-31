import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltins } from "../../src/nodes";
import { createExecutionContext, runExecFrom } from "../../src/engine/executor";
import { connectPins } from "../../src/engine/graphMutations";
import { getNodeDef } from "../../src/engine/registry";
import { type Variable } from "../../src/engine/types";
import { deserializeGraph } from "../../src/persistence/load";
import { serializeGraph } from "../../src/persistence/save";
import { CURRENT_FORMAT_VERSION } from "../../src/persistence/schema";
import { Graph } from "../../src/engine/graph";
import { NodeInstance } from "../../src/engine/nodeInstance";

function addBuiltinNode(
  graph: Graph,
  type: string,
  position = { x: 0, y: 0 },
  id?: string,
) {
  const def = getNodeDef(type);
  const node = NodeInstance.createNodeInstance(type, position, def.pins, id);
  graph.nodes.push(node);
  return node;
}

beforeAll(() => {
  registerBuiltins();
});

describe("persistence round-trip", () => {
  it("preserves nodes, positions, literal values, connections, variables, and comment boxes", () => {
    const graph = new Graph("g1", "Round Trip Test");

    const variable: Variable = {
      id: "var1",
      name: "Score",
      type: "number",
      defaultValue: 0,
    };
    graph.variables.push(variable);

    const start = addBuiltinNode(
      graph,
      "event.start",
      { x: 12, y: 34 },
      "start",
    );
    const print = addBuiltinNode(
      graph,
      "debug.print",
      { x: 200, y: 50 },
      "print",
    );
    print.pins.message.value = "round-tripped";
    print.description = "Reminder: this logs to the shared log panel";
    connectPins(graph, graph.variables, graph.functions, {
      fromNode: start.id,
      fromPin: "exec-out",
      toNode: print.id,
      toPin: "exec-in",
    });

    graph.commentBoxes.push({
      id: "comment1",
      text: "A note",
      position: { x: 0, y: 0 },
      size: { width: 300, height: 200 },
      containedNodeIds: [start.id],
    });

    const json = serializeGraph(graph);
    const loaded = deserializeGraph(json);

    expect(loaded).toEqual(graph);
    // toEqual ignores prototypes, so it wouldn't catch `loaded` coming back as a plain
    // JSON object missing Graph.prototype methods (e.g. getVisibleVariables) — assert directly.
    expect(loaded).toBeInstanceOf(Graph);
  });

  it("re-executes identically after a save/load round trip", async () => {
    const graph = new Graph("g2", "test");
    const start = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "start");
    const branch = addBuiltinNode(
      graph,
      "flow.branch",
      { x: 100, y: 0 },
      "branch",
    );
    const printTrue = addBuiltinNode(
      graph,
      "debug.print",
      { x: 200, y: -50 },
      "printTrue",
    );
    const printFalse = addBuiltinNode(
      graph,
      "debug.print",
      { x: 200, y: 50 },
      "printFalse",
    );
    branch.pins.condition.value = true;
    printTrue.pins.message.value = "took true branch";
    printFalse.pins.message.value = "took false branch";

    connectPins(graph, graph.variables, graph.functions, {
      fromNode: start.id,
      fromPin: "exec-out",
      toNode: branch.id,
      toPin: "exec-in",
    });
    connectPins(graph, graph.variables, graph.functions, {
      fromNode: branch.id,
      fromPin: "true",
      toNode: printTrue.id,
      toPin: "exec-in",
    });
    connectPins(graph, graph.variables, graph.functions, {
      fromNode: branch.id,
      fromPin: "false",
      toNode: printFalse.id,
      toPin: "exec-in",
    });

    const runLogs = async (g: Graph) => {
      const logs: string[] = [];
      await runExecFrom(
        start.id,
        "exec-out",
        createExecutionContext(g, { log: (m) => logs.push(m) }),
      );
      return logs;
    };

    const before = await runLogs(graph);
    const loaded = deserializeGraph(serializeGraph(graph));
    const after = await runLogs(loaded);

    expect(after).toEqual(before);
  });

  it("migrates a v1 document (predating Functions) by defaulting an empty functions array", () => {
    const graph = new Graph("g3", "Legacy");
    addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "start");
    const v1Doc = JSON.parse(serializeGraph(graph)) as {
      formatVersion: number;
      graph: Graph;
    };
    v1Doc.formatVersion = 1;
    // @ts-expect-error simulating a v1 save file that predates the `functions` field entirely
    delete v1Doc.graph.functions;
    // @ts-expect-error a v1 save file predates `scripts` too, migrated in the same chain
    delete v1Doc.graph.scripts;

    const loaded = deserializeGraph(JSON.stringify(v1Doc));

    expect(loaded.functions).toEqual([]);
    expect(loaded.scripts).toEqual([]);
  });

  it("migrates a v2 document (predating the Code node/Scripts) by defaulting an empty scripts array", () => {
    const graph = new Graph("g5", "Legacy v2");
    addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "start");
    const v2Doc = JSON.parse(serializeGraph(graph)) as {
      formatVersion: number;
      graph: Graph;
    };
    v2Doc.formatVersion = 2;
    // @ts-expect-error simulating a v2 save file that predates the `scripts` field entirely
    delete v2Doc.graph.scripts;

    const loaded = deserializeGraph(JSON.stringify(v2Doc));

    expect(loaded.scripts).toEqual([]);
  });

  it("migrates a script saved before Outputs existed by defaulting an empty outputs array", () => {
    const graph = new Graph("g6", "Legacy script outputs");
    const script = { id: "s1", name: "Old Script", source: "", compiledJs: "", inputs: [], outputs: [] };
    graph.scripts.push(script);
    const doc = JSON.parse(serializeGraph(graph)) as {
      formatVersion: number;
      graph: Graph;
    };
    // @ts-expect-error simulating a save from before CodeScriptDef gained an `outputs` field
    delete doc.graph.scripts[0].outputs;

    const loaded = deserializeGraph(JSON.stringify(doc));

    expect(loaded.scripts[0].outputs).toEqual([]);
  });

  it("saves at the current format version", () => {
    const graph = new Graph("g4", "test");
    const doc = JSON.parse(serializeGraph(graph)) as { formatVersion: number };
    expect(doc.formatVersion).toBe(CURRENT_FORMAT_VERSION);
  });
});
