import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltins } from "../../../src/graph/nodes";
import { connectPins } from "@hermione/graph/engine/graphMutations";
import { rootContext } from "@hermione/graph/ai/context";
import { getConnections, getNode, getNodes, getSummary, findNodes } from "@hermione/graph/ai/inspection";
import { addBuiltinNode, buildTestGraph } from "./helpers";

beforeAll(() => {
  registerBuiltins();
});

function buildSimpleFlow() {
  const graph = buildTestGraph();
  const start = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "start-1");
  const print = addBuiltinNode(graph, "debug.print", { x: 200, y: 0 }, "print-1");
  connectPins(graph, [], [], { fromNode: start.id, fromPin: "exec-out", toNode: print.id, toPin: "exec-in" });
  return { graph, start, print };
}

describe("inspection", () => {
  it("get_summary returns compact counts and validation status", () => {
    const { graph } = buildSimpleFlow();
    const summary = getSummary(rootContext(graph), { version: 3 });
    expect(summary.graphId).toBe(graph.id);
    expect(summary.nodeCount).toBe(2);
    expect(summary.connectionCount).toBe(1);
    expect(summary.version).toBe(3);
    expect(summary.validation.valid).toBe(true);
  });

  it("get_nodes filters by type and name pattern", () => {
    const { graph } = buildSimpleFlow();
    const ctx = rootContext(graph);
    expect(getNodes(ctx, { types: ["debug.print"] })).toHaveLength(1);
    expect(getNodes(ctx, { namePattern: "print" })).toHaveLength(1);
    expect(getNodes(ctx, {})).toHaveLength(2);
  });

  it("get_node returns properties, ports, connections and validation", () => {
    const { graph, print } = buildSimpleFlow();
    const detail = getNode(rootContext(graph), print.id);
    expect(detail.type).toBe("debug.print");
    expect(detail.properties.message).toBe("");
    expect(detail.connections).toHaveLength(1);
    expect(detail.ports.some((p) => p.id === "message")).toBe(true);
    expect(detail.metadata.type).toBe("debug.print");
    expect(detail.validation).toEqual([]);
  });

  it("find_nodes finds nodes connected to another node", () => {
    const { graph, start, print } = buildSimpleFlow();
    const found = findNodes(rootContext(graph), { connectedToNodeId: start.id });
    expect(found.map((n) => n.id)).toEqual([print.id]);
  });

  it("find_nodes finds nodes that produce a given pin type", () => {
    const graph = buildTestGraph();
    addBuiltinNode(graph, "math.add", { x: 0, y: 0 }, "add-1");
    const found = findNodes(rootContext(graph), { producesType: "number" });
    expect(found.map((n) => n.id)).toContain("add-1");
  });

  it("get_connections supports incoming/outgoing filters", () => {
    const { graph, start, print } = buildSimpleFlow();
    const ctx = rootContext(graph);
    expect(getConnections(ctx, { nodeId: start.id, direction: "outgoing" })).toHaveLength(1);
    expect(getConnections(ctx, { nodeId: start.id, direction: "incoming" })).toHaveLength(0);
    expect(getConnections(ctx, { nodeId: print.id, direction: "incoming" })).toHaveLength(1);
  });
});
