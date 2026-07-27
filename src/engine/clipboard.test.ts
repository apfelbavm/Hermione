import { describe, expect, it } from "vitest";
import {
  cloneNodesForClipboard,
  parseClipboardPayload,
  pasteNodesIntoGraph,
  pasteVariableIntoGraph,
  serializeNodesClipboardPayload,
  serializeVariableClipboardPayload,
  type NodesClipboardPayload,
} from "./clipboard";
import { createEmptyGraph, type Connection, type NodeInstance, type Variable } from "./types";

function node(id: string, type: string, x: number, y: number, extra: Partial<NodeInstance> = {}): NodeInstance {
  return { id, type, position: { x, y }, pins: {}, ...extra };
}

describe("parseClipboardPayload", () => {
  it("rejects non-JSON text", () => {
    expect(parseClipboardPayload("not json at all")).toBeNull();
  });

  it("rejects JSON with no source/version tag (e.g. copied from elsewhere)", () => {
    expect(parseClipboardPayload(JSON.stringify({ kind: "nodes", nodes: [], connections: [] }))).toBeNull();
  });

  it("rejects an unknown kind", () => {
    expect(
      parseClipboardPayload(JSON.stringify({ source: "hermione-graph-editor", version: 1, kind: "mystery" })),
    ).toBeNull();
  });

  it("rejects a nodes payload with a malformed node", () => {
    const bad = JSON.stringify({
      source: "hermione-graph-editor",
      version: 1,
      kind: "nodes",
      nodes: [{ id: "n1" }], // missing type/position/pins
      connections: [],
    });
    expect(parseClipboardPayload(bad)).toBeNull();
  });

  it("accepts a well-formed nodes payload round-tripped through serialize", () => {
    const nodes = [node("n1", "math.add", 0, 0)];
    const connections: Connection[] = [];
    const parsed = parseClipboardPayload(serializeNodesClipboardPayload(nodes, connections));
    expect(parsed).toEqual({ source: "hermione-graph-editor", version: 1, kind: "nodes", nodes, connections });
  });

  it("accepts a well-formed variable payload round-tripped through serialize", () => {
    const variable: Variable = { id: "var-1", name: "Score", type: "number", defaultValue: 0 };
    const parsed = parseClipboardPayload(serializeVariableClipboardPayload(variable));
    expect(parsed).toEqual({ source: "hermione-graph-editor", version: 1, kind: "variable", variable });
  });

  it("rejects a variable payload whose type isn't a real PinType", () => {
    const bad = JSON.stringify({
      source: "hermione-graph-editor",
      version: 1,
      kind: "variable",
      variable: { id: "v1", name: "X", type: "not-a-type", defaultValue: 0 },
    });
    expect(parseClipboardPayload(bad)).toBeNull();
  });
});

describe("cloneNodesForClipboard", () => {
  it("copies only selected nodes and connections strictly between them", () => {
    const graph = createEmptyGraph("g", "Root");
    graph.nodes.push(node("a", "math.add", 0, 0), node("b", "math.add", 100, 0), node("c", "math.add", 200, 0));
    graph.connections.push(
      { id: "c1", fromNode: "a", fromPin: "out", toNode: "b", toPin: "in" },
      { id: "c2", fromNode: "b", fromPin: "out", toNode: "c", toPin: "in" }, // c is NOT selected
    );

    const { nodes, connections } = cloneNodesForClipboard(graph, new Set(["a", "b"]));
    expect(nodes.map((n) => n.id).sort()).toEqual(["a", "b"]);
    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({ fromNode: "a", toNode: "b" });
  });

  it("excludes structural function.entry/function.return nodes even if selected", () => {
    const graph = createEmptyGraph("g", "Root");
    graph.nodes.push(node("entry", "function.entry", 0, 0), node("mid", "math.add", 50, 0));

    const { nodes } = cloneNodesForClipboard(graph, new Set(["entry", "mid"]));
    expect(nodes.map((n) => n.id)).toEqual(["mid"]);
  });

  it("deep-clones so mutating the source graph doesn't affect the copy", () => {
    const graph = createEmptyGraph("g", "Root");
    graph.nodes.push(node("a", "math.add", 0, 0, { pins: { in: { value: 1 } } }));
    const { nodes } = cloneNodesForClipboard(graph, new Set(["a"]));
    graph.nodes[0].pins.in.value = 999;
    expect(nodes[0].pins.in.value).toBe(1);
  });
});

describe("pasteNodesIntoGraph", () => {
  it("assigns fresh ids, offsets positions so the selection's top-left lands at the target, and remaps connections", () => {
    const graph = createEmptyGraph("g", "Root");
    const payload: NodesClipboardPayload = {
      source: "hermione-graph-editor",
      version: 1,
      kind: "nodes",
      nodes: [
        node("a", "math.add", 10, 10),
        node("b", "math.add", 60, 10, { pins: { in: { connectionId: "c1" } } }),
      ],
      connections: [{ id: "c1", fromNode: "a", fromPin: "out", toNode: "b", toPin: "in" }],
    };

    const newIds = pasteNodesIntoGraph(graph, payload, { x: 100, y: 200 });

    expect(newIds).toHaveLength(2);
    expect(newIds).not.toContain("a");
    expect(newIds).not.toContain("b");
    expect(graph.nodes).toHaveLength(2);

    const pastedA = graph.nodes.find((n) => n.id === newIds[0])!;
    expect(pastedA.position).toEqual({ x: 100, y: 200 }); // "a" was the top-left node

    expect(graph.connections).toHaveLength(1);
    const conn = graph.connections[0];
    expect(conn.id).not.toBe("c1");
    expect(newIds).toContain(conn.fromNode);
    expect(newIds).toContain(conn.toNode);

    const toNode = graph.nodes.find((n) => n.id === conn.toNode)!;
    expect(toNode.pins.in.connectionId).toBe(conn.id);
  });

  it("drops connections to nodes outside the pasted set and returns [] for an empty payload", () => {
    const graph = createEmptyGraph("g", "Root");
    const payload: NodesClipboardPayload = {
      source: "hermione-graph-editor",
      version: 1,
      kind: "nodes",
      nodes: [node("a", "math.add", 0, 0)],
      connections: [{ id: "c1", fromNode: "a", fromPin: "out", toNode: "outside", toPin: "in" }],
    };
    pasteNodesIntoGraph(graph, payload, { x: 0, y: 0 });
    expect(graph.connections).toHaveLength(0);

    const empty: NodesClipboardPayload = { ...payload, nodes: [] };
    expect(pasteNodesIntoGraph(createEmptyGraph("g2", "Root"), empty, { x: 0, y: 0 })).toEqual([]);
  });
});

describe("pasteVariableIntoGraph", () => {
  it("clones with a fresh id, preserving name/type/defaultValue when there's no collision", () => {
    const graph = createEmptyGraph("g", "Root");
    const variable: Variable = { id: "v1", name: "Score", type: "number", defaultValue: 5 };

    const pasted = pasteVariableIntoGraph(graph, variable);

    expect(pasted.id).not.toBe("v1");
    expect(pasted).toMatchObject({ name: "Score", type: "number", defaultValue: 5 });
    expect(graph.variables).toEqual([pasted]);
  });

  it("dedupes the name against what's already in the target graph", () => {
    const graph = createEmptyGraph("g", "Root");
    graph.variables.push({ id: "v1", name: "Score", type: "number", defaultValue: 0 });

    const pasted = pasteVariableIntoGraph(graph, { id: "v2", name: "Score", type: "number", defaultValue: 0 });
    expect(pasted.name).toBe("Score 2");

    const pastedAgain = pasteVariableIntoGraph(graph, { id: "v3", name: "Score", type: "number", defaultValue: 0 });
    expect(pastedAgain.name).toBe("Score 3");
  });
});
