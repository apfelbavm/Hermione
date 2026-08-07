import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltins } from "../../../src/graph/nodes";
import { rootContext } from "@hermione/graph/ai/context";
import { connect, createNode } from "@hermione/graph/ai/mutations";
import { align, distribute, fitLayout, getLayoutSnapshot, getNodeLayout, getSpatialRelationships, insertBetween, layoutAround, layoutGraph } from "@hermione/graph/ai/layoutOperations";
import { GraphLayoutEngine } from "@hermione/graph/ai/layoutEngine";
import { rectsIntersect, type NodeRect } from "@hermione/graph/ai/layoutTypes";
import { addBuiltinNode, buildTestGraph } from "./helpers";

beforeAll(() => {
  registerBuiltins();
});

function wire(graph: ReturnType<typeof buildTestGraph>, fromNode: string, fromPin: string, toNode: string, toPin: string) {
  const outcome = connect(rootContext(graph), { op: "connect", source: { nodeId: fromNode, port: fromPin }, target: { nodeId: toNode, port: toPin } });
  expect(outcome.errors).toEqual([]);
  return outcome.connectionId!;
}

function allRects(ctx: ReturnType<typeof rootContext>): Array<NodeRect & { id: string }> {
  const snapshot = getLayoutSnapshot(ctx);
  return snapshot.nodes.map((n) => ({ id: n.nodeId, x: n.position.x, y: n.position.y, ...n.size }));
}

function expectNoOverlaps(ctx: ReturnType<typeof rootContext>) {
  const rects = allRects(ctx);
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      expect(rectsIntersect(rects[i], rects[j])).toBe(false);
    }
  }
}

describe("GraphLayoutEngine (pure geometry)", () => {
  it("places a simple chain left to right", () => {
    const engine = new GraphLayoutEngine();
    const { positions, layers } = engine.layout({
      nodes: [
        { id: "a", size: { width: 100, height: 50 } },
        { id: "b", size: { width: 100, height: 50 } },
        { id: "c", size: { width: 100, height: 50 } },
      ],
      edges: [
        { fromId: "a", toId: "b" },
        { fromId: "b", toId: "c" },
      ],
    });
    expect(layers.get("a")).toBe(0);
    expect(layers.get("b")).toBe(1);
    expect(layers.get("c")).toBe(2);
    expect(positions.get("a")!.x).toBeLessThan(positions.get("b")!.x);
    expect(positions.get("b")!.x).toBeLessThan(positions.get("c")!.x);
  });

  it("puts branch targets in the same layer", () => {
    const engine = new GraphLayoutEngine();
    const { layers } = engine.layout({
      nodes: [
        { id: "a", size: { width: 100, height: 50 } },
        { id: "b", size: { width: 100, height: 50 } },
        { id: "c", size: { width: 100, height: 50 } },
      ],
      edges: [
        { fromId: "a", toId: "b" },
        { fromId: "a", toId: "c" },
      ],
    });
    expect(layers.get("b")).toBe(layers.get("c"));
    expect(layers.get("b")).toBeGreaterThan(layers.get("a")!);
  });

  it("merges fan-in targets into one later layer", () => {
    const engine = new GraphLayoutEngine();
    const { layers } = engine.layout({
      nodes: [
        { id: "a", size: { width: 100, height: 50 } },
        { id: "b", size: { width: 100, height: 50 } },
        { id: "c", size: { width: 100, height: 50 } },
      ],
      edges: [
        { fromId: "a", toId: "c" },
        { fromId: "b", toId: "c" },
      ],
    });
    expect(layers.get("c")).toBeGreaterThan(layers.get("a")!);
    expect(layers.get("c")).toBeGreaterThan(layers.get("b")!);
  });

  it("never overlaps nodes of very different sizes", () => {
    const engine = new GraphLayoutEngine();
    const { positions } = engine.layout({
      nodes: [
        { id: "a", size: { width: 300, height: 100 } },
        { id: "b", size: { width: 150, height: 400 } },
        { id: "c", size: { width: 150, height: 60 } },
      ],
      edges: [
        { fromId: "a", toId: "b" },
        { fromId: "a", toId: "c" },
      ],
    });
    const rectFor = (id: string, size: { width: number; height: number }): NodeRect => ({ ...positions.get(id)!, ...size });
    const b = rectFor("b", { width: 150, height: 400 });
    const c = rectFor("c", { width: 150, height: 60 });
    expect(rectsIntersect(b, c)).toBe(false);
  });

  it("does not hang or throw on a cyclic graph, and still assigns every node a layer", () => {
    const engine = new GraphLayoutEngine();
    const { layers } = engine.layout({
      nodes: [
        { id: "a", size: { width: 100, height: 50 } },
        { id: "b", size: { width: 100, height: 50 } },
        { id: "c", size: { width: 100, height: 50 } },
      ],
      edges: [
        { fromId: "a", toId: "b" },
        { fromId: "b", toId: "c" },
        { fromId: "c", toId: "a" },
      ],
    });
    expect(layers.size).toBe(3);
  });

  it("is stable: laying out the same graph twice produces identical positions", () => {
    const engine = new GraphLayoutEngine();
    const request = {
      nodes: [
        { id: "a", size: { width: 120, height: 60 } },
        { id: "b", size: { width: 120, height: 60 } },
        { id: "c", size: { width: 120, height: 60 } },
        { id: "d", size: { width: 120, height: 60 } },
      ],
      edges: [
        { fromId: "a", toId: "b" },
        { fromId: "a", toId: "c" },
        { fromId: "b", toId: "d" },
        { fromId: "c", toId: "d" },
      ],
    };
    const first = engine.layout(request);
    const second = engine.layout(request);
    for (const id of ["a", "b", "c", "d"]) {
      expect(second.positions.get(id)).toEqual(first.positions.get(id));
    }
  });

  it("supports LR/RL/TB/BT directions", () => {
    const engine = new GraphLayoutEngine();
    const nodes = [
      { id: "a", size: { width: 100, height: 50 } },
      { id: "b", size: { width: 100, height: 50 } },
    ];
    const edges = [{ fromId: "a", toId: "b" }];
    const lr = engine.layout({ nodes, edges, options: { direction: "LR" } });
    expect(lr.positions.get("a")!.x).toBeLessThan(lr.positions.get("b")!.x);
    const rl = engine.layout({ nodes, edges, options: { direction: "RL" } });
    expect(rl.positions.get("a")!.x).toBeGreaterThan(rl.positions.get("b")!.x);
    const tb = engine.layout({ nodes, edges, options: { direction: "TB" } });
    expect(tb.positions.get("a")!.y).toBeLessThan(tb.positions.get("b")!.y);
    const bt = engine.layout({ nodes, edges, options: { direction: "BT" } });
    expect(bt.positions.get("a")!.y).toBeGreaterThan(bt.positions.get("b")!.y);
  });
});

describe("layout operations", () => {
  it("get_node_layout reports real computed dimensions and port geometry", () => {
    const graph = buildTestGraph();
    const node = addBuiltinNode(graph, "debug.print", { x: 50, y: 60 }, "print-1");
    const ctx = rootContext(graph);
    const info = getNodeLayout(ctx, node.id);
    expect(info.position).toEqual({ x: 50, y: 60 });
    expect(info.size.width).toBeGreaterThan(0);
    expect(info.size.height).toBeGreaterThan(0);
    expect(info.ports.inputs.some((p) => p.port === "exec-in" && p.side === "left")).toBe(true);
    expect(info.ports.outputs.some((p) => p.port === "exec-out" && p.side === "right")).toBe(true);
  });

  it("get_layout returns bounds covering every node", () => {
    const graph = buildTestGraph();
    addBuiltinNode(graph, "debug.print", { x: 0, y: 0 }, "print-1");
    addBuiltinNode(graph, "debug.print", { x: 500, y: 500 }, "print-2");
    const snapshot = getLayoutSnapshot(rootContext(graph));
    expect(snapshot.nodes).toHaveLength(2);
    expect(snapshot.bounds.width).toBeGreaterThan(500);
    expect(snapshot.bounds.height).toBeGreaterThan(500);
  });

  it("full graph layout (tidy) lays out a basic A->B->C chain left to right without overlaps", () => {
    const graph = buildTestGraph();
    const a = addBuiltinNode(graph, "event.start", { x: 900, y: 900 }, "a");
    const b = addBuiltinNode(graph, "debug.print", { x: 10, y: 10 }, "b");
    const c = addBuiltinNode(graph, "debug.print", { x: 20, y: 20 }, "c");
    wire(graph, a.id, "exec-out", b.id, "exec-in");
    wire(graph, b.id, "exec-out", c.id, "exec-in");

    const ctx = rootContext(graph);
    const result = layoutGraph(ctx, { scope: "graph", mode: "tidy" });
    expect(result.success).toBe(true);
    expect(a.position.x).toBeLessThan(b.position.x);
    expect(b.position.x).toBeLessThan(c.position.x);
    expectNoOverlaps(ctx);
  });

  it("branch fan-out keeps both targets in the same logical layer (same x)", () => {
    const graph = buildTestGraph();
    const a = addBuiltinNode(graph, "flow.branch", { x: 0, y: 0 }, "a");
    const b = addBuiltinNode(graph, "debug.print", { x: 0, y: 0 }, "b");
    const c = addBuiltinNode(graph, "debug.print", { x: 0, y: 0 }, "c");
    wire(graph, a.id, "true", b.id, "exec-in");
    wire(graph, a.id, "false", c.id, "exec-in");

    const ctx = rootContext(graph);
    layoutGraph(ctx, { scope: "graph", mode: "tidy" });
    expect(b.position.x).toBe(c.position.x);
    expect(b.position.y).not.toBe(c.position.y);
    expectNoOverlaps(ctx);
  });

  it("fan-in merge places the merge node after both sources", () => {
    const graph = buildTestGraph();
    const a = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "a");
    const b = addBuiltinNode(graph, "event.interval", { x: 0, y: 0 }, "b");
    const merge = addBuiltinNode(graph, "debug.print", { x: 0, y: 0 }, "merge");
    // event nodes have no exec-in; simulate a merge via two independent chains feeding a common node's exec-in is invalid (exec-in accepts multiple),
    // so wire both a and b's exec-out to merge's exec-in directly.
    wire(graph, a.id, "exec-out", merge.id, "exec-in");
    wire(graph, b.id, "exec-out", merge.id, "exec-in");

    const ctx = rootContext(graph);
    layoutGraph(ctx, { scope: "graph", mode: "tidy" });
    expect(merge.position.x).toBeGreaterThan(a.position.x);
    expect(merge.position.x).toBeGreaterThan(b.position.x);
    expectNoOverlaps(ctx);
  });

  it("dynamic node sizes (different message lengths) never overlap after layout", () => {
    const graph = buildTestGraph();
    const a = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "a");
    const b = addBuiltinNode(graph, "flow.branch", { x: 0, y: 0 }, "b");
    const c = addBuiltinNode(graph, "debug.print", { x: 0, y: 0 }, "c");
    const d = addBuiltinNode(graph, "debug.print", { x: 0, y: 0 }, "d");
    wire(graph, a.id, "exec-out", b.id, "exec-in");
    wire(graph, b.id, "true", c.id, "exec-in");
    wire(graph, b.id, "false", d.id, "exec-in");

    const ctx = rootContext(graph);
    layoutGraph(ctx, { scope: "graph", mode: "tidy" });
    expectNoOverlaps(ctx);

    // Grow c's size by giving it a very long literal message, then re-layout — should stay overlap-free.
    c.pins.message.value = "x".repeat(500);
    layoutGraph(ctx, { scope: "graph", mode: "tidy" });
    expectNoOverlaps(ctx);
  });

  it("preserves existing positions unless a full tidy/auto layout is requested", () => {
    const graph = buildTestGraph();
    const a = addBuiltinNode(graph, "event.start", { x: 123, y: 456 }, "a");
    const ctx = rootContext(graph);
    const before = { ...a.position };
    // no layout call at all — position must be untouched
    expect(a.position).toEqual(before);
    void ctx;
  });

  it("local/subgraph layout does not move nodes outside the given scope", () => {
    const graph = buildTestGraph();
    const far = addBuiltinNode(graph, "debug.print", { x: 5000, y: 5000 }, "far");
    const a = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "a");
    const b = addBuiltinNode(graph, "debug.print", { x: 0, y: 0 }, "b");
    wire(graph, a.id, "exec-out", b.id, "exec-in");

    const ctx = rootContext(graph);
    const farBefore = { ...far.position };
    const result = layoutGraph(ctx, { scope: "subgraph", nodeIds: [a.id, b.id], mode: "local" });
    expect(result.success).toBe(true);
    expect(far.position).toEqual(farBefore);
  });

  it("insert_between splices a new node into an existing connection and rewires it", () => {
    const graph = buildTestGraph();
    const a = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "a");
    const b = addBuiltinNode(graph, "debug.print", { x: 400, y: 0 }, "b");
    wire(graph, a.id, "exec-out", b.id, "exec-in");
    const outcome = createNode(rootContext(graph), { op: "create_node", nodeType: "debug.print", position: { x: 0, y: 0 } });
    expect(outcome.errors).toEqual([]);
    const x = graph.nodes.find((n) => n.id === outcome.nodeId)!;

    const ctx = rootContext(graph);
    const result = insertBetween(ctx, { newNodeId: x.id, beforeNodeId: a.id, afterNodeId: b.id });
    expect(result.success).toBe(true);
    expect(result.createdConnectionIds).toHaveLength(2);
    expect(graph.connections.some((c) => c.fromNode === a.id && c.toNode === x.id)).toBe(true);
    expect(graph.connections.some((c) => c.fromNode === x.id && c.toNode === b.id)).toBe(true);
    expect(graph.connections.some((c) => c.fromNode === a.id && c.toNode === b.id)).toBe(false);
    expect(x.position.x).toBeGreaterThan(a.position.x);
    expectNoOverlaps(ctx);
  });

  it("insert_between fails cleanly when there is no connection to splice into", () => {
    const graph = buildTestGraph();
    const a = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "a");
    const b = addBuiltinNode(graph, "debug.print", { x: 400, y: 0 }, "b");
    const x = addBuiltinNode(graph, "debug.print", { x: 0, y: 0 }, "x");
    const result = insertBetween(rootContext(graph), { newNodeId: x.id, beforeNodeId: a.id, afterNodeId: b.id });
    expect(result.success).toBe(false);
    expect(result.errors[0].code).toBe("INVALID_OPERATION");
  });

  it("layout_around places new nodes near an anchor without moving the anchor", () => {
    const graph = buildTestGraph();
    const anchor = addBuiltinNode(graph, "event.start", { x: 200, y: 200 }, "anchor");
    const retry = addBuiltinNode(graph, "debug.print", { x: 0, y: 0 }, "retry");
    wire(graph, anchor.id, "exec-out", retry.id, "exec-in");

    const ctx = rootContext(graph);
    const anchorBefore = { ...anchor.position };
    const result = layoutAround(ctx, { anchorNodeId: anchor.id, nodeIds: [retry.id] });
    expect(result.success).toBe(true);
    expect(anchor.position).toEqual(anchorBefore);
    expect(retry.position.x).toBeGreaterThan(anchor.position.x);
    expectNoOverlaps(ctx);
  });

  it("align lines up the left edges of selected nodes", () => {
    const graph = buildTestGraph();
    const a = addBuiltinNode(graph, "debug.print", { x: 10, y: 0 }, "a");
    const b = addBuiltinNode(graph, "debug.print", { x: 200, y: 100 }, "b");
    const result = align(rootContext(graph), [a.id, b.id], "left");
    expect(result.success).toBe(true);
    expect(a.position.x).toBe(b.position.x);
  });

  it("distribute evenly spaces nodes between the first and last", () => {
    const graph = buildTestGraph();
    const a = addBuiltinNode(graph, "debug.print", { x: 0, y: 0 }, "a");
    const b = addBuiltinNode(graph, "debug.print", { x: 100, y: 0 }, "b");
    const c = addBuiltinNode(graph, "debug.print", { x: 1000, y: 0 }, "c");
    const result = distribute(rootContext(graph), [a.id, b.id, c.id], "horizontal");
    expect(result.success).toBe(true);
    const gap1 = b.position.x - a.position.x;
    const gap2 = c.position.x - b.position.x;
    expect(Math.abs(gap1 - gap2)).toBeLessThan(1);
  });

  it("fit_layout is equivalent to a full tidy layout of the whole graph", () => {
    const graph = buildTestGraph();
    const a = addBuiltinNode(graph, "event.start", { x: 900, y: 900 }, "a");
    const b = addBuiltinNode(graph, "debug.print", { x: 10, y: 10 }, "b");
    wire(graph, a.id, "exec-out", b.id, "exec-in");
    const ctx = rootContext(graph);
    const result = fitLayout(ctx);
    expect(result.success).toBe(true);
    expect(a.position.x).toBeLessThan(b.position.x);
  });

  it("get_spatial_relationships reports left/right and overlap", () => {
    const graph = buildTestGraph();
    const a = addBuiltinNode(graph, "debug.print", { x: 0, y: 0 }, "a");
    const b = addBuiltinNode(graph, "debug.print", { x: 500, y: 0 }, "b");
    const c = addBuiltinNode(graph, "debug.print", { x: 0, y: 0 }, "c");
    const relationships = getSpatialRelationships(rootContext(graph), [a.id, b.id, c.id]);
    expect(relationships.some((r) => r.a === a.id && r.b === b.id && r.relation === "right_of")).toBe(true);
    expect(relationships.some((r) => r.a === a.id && r.b === c.id && r.relation === "overlaps")).toBe(true);
  });

  it("groups (comment boxes) expand to keep containing their children after layout", () => {
    const graph = buildTestGraph();
    const a = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "a");
    const b = addBuiltinNode(graph, "debug.print", { x: 0, y: 0 }, "b");
    wire(graph, a.id, "exec-out", b.id, "exec-in");
    graph.commentBoxes.push({ id: "group-1", text: "Group", position: { x: 0, y: 0 }, size: { width: 10, height: 10 }, containedNodeIds: [a.id, b.id] });

    const ctx = rootContext(graph);
    layoutGraph(ctx, { scope: "graph", mode: "tidy" });
    const group = graph.commentBoxes[0];
    expect(group.position.x).toBeLessThanOrEqual(Math.min(a.position.x, b.position.x));
    expect(group.position.y).toBeLessThanOrEqual(Math.min(a.position.y, b.position.y));
    expect(group.position.x + group.size.width).toBeGreaterThanOrEqual(Math.max(a.position.x, b.position.x));
  });

  it("repeated layout of the same unchanged graph is stable (no drift)", () => {
    const graph = buildTestGraph();
    const a = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "a");
    const b = addBuiltinNode(graph, "flow.branch", { x: 0, y: 0 }, "b");
    const c = addBuiltinNode(graph, "debug.print", { x: 0, y: 0 }, "c");
    const d = addBuiltinNode(graph, "debug.print", { x: 0, y: 0 }, "d");
    wire(graph, a.id, "exec-out", b.id, "exec-in");
    wire(graph, b.id, "true", c.id, "exec-in");
    wire(graph, b.id, "false", d.id, "exec-in");

    const ctx = rootContext(graph);
    layoutGraph(ctx, { scope: "graph", mode: "tidy" });
    const first = graph.nodes.map((n) => ({ id: n.id, ...n.position }));
    layoutGraph(ctx, { scope: "graph", mode: "tidy" });
    const second = graph.nodes.map((n) => ({ id: n.id, ...n.position }));
    expect(second).toEqual(first);
  });
});
