import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltins } from "../../../src/graph/nodes";
import { rootContext } from "../../../src/graph/ai/context";
import { applyChanges } from "../../../src/graph/ai/transactions";
import { addBuiltinNode, buildTestGraph } from "./helpers";
import type { ChangeOp } from "../../../src/graph/ai/types";

beforeAll(() => {
  registerBuiltins();
});

describe("transactions (graph.apply_changes)", () => {
  it("applies a multi-op batch atomically, resolving tempIds across ops", () => {
    const graph = buildTestGraph();
    const start = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "start-1");

    const changes: ChangeOp[] = [
      { op: "create_node", tempId: "print1", nodeType: "debug.print", properties: { message: "hi" } },
      { op: "connect", source: { nodeId: start.id, port: "exec-out" }, target: { nodeId: "print1", port: "exec-in" } },
    ];

    const result = applyChanges(rootContext(graph), { changes }, { currentVersion: 0 });
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.version).toBe(1);
    expect(graph.nodes).toHaveLength(2);
    expect(graph.connections).toHaveLength(1);
    expect(result.summary).toHaveLength(2);
  });

  it("rejects the entire batch (no partial application) when one op is invalid", () => {
    const graph = buildTestGraph();
    const start = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "start-1");

    const changes: ChangeOp[] = [
      { op: "create_node", tempId: "print1", nodeType: "debug.print" },
      { op: "connect", source: { nodeId: start.id, port: "exec-out" }, target: { nodeId: "print1", port: "not-a-real-port" } },
    ];

    const result = applyChanges(rootContext(graph), { changes }, { currentVersion: 0 });
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    // Neither op should have taken effect on the real graph.
    expect(graph.nodes).toHaveLength(1);
    expect(graph.connections).toHaveLength(0);
  });

  it("dry run validates and previews without mutating the real graph", () => {
    const graph = buildTestGraph();
    const changes: ChangeOp[] = [{ op: "create_node", nodeType: "debug.print", properties: { message: "preview" } }];

    const result = applyChanges(rootContext(graph), { changes, dryRun: true }, { currentVersion: 0 });
    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    // 3, not 1: the graph had no event-trigger node, so the preview also includes the auto-added
    // event.simulate AND the auto-connect wiring it to the new node (see transactions.ts's
    // autoAddEventTriggerIfMissing).
    expect(result.changes).toHaveLength(3);
    expect(graph.nodes).toHaveLength(0); // untouched
  });

  it("auto-added event.simulate trigger is auto-connected to the new node's exec-in when it forgets to wire it", () => {
    const graph = buildTestGraph();
    const changes: ChangeOp[] = [{ op: "create_node", tempId: "print1", nodeType: "debug.print", properties: { message: "hi" } }];

    const result = applyChanges(rootContext(graph), { changes }, { currentVersion: 0 });
    expect(result.success).toBe(true);
    expect(graph.nodes).toHaveLength(2);
    const trigger = graph.nodes.find((n) => n.type === "event.simulate")!;
    const print = graph.nodes.find((n) => n.type === "debug.print")!;
    expect(graph.connections).toHaveLength(1);
    expect(graph.connections[0]).toMatchObject({ fromNode: trigger.id, fromPin: "exec-out", toNode: print.id, toPin: "exec-in" });
    // The auto-connected node must land in the horizontal chain layout (to the right, roughly
    // level with the trigger) rather than wherever the earlier collision-avoidance-only pass left
    // it (e.g. stacked directly below) — see layoutAround call in autoAddEventTriggerIfMissing.
    expect(print.position.x).toBeGreaterThan(trigger.position.x);
    expect(Math.abs(print.position.y - trigger.position.y)).toBeLessThan(20);
  });

  it("does not auto-connect the trigger to a node whose exec-in is already wired", () => {
    const graph = buildTestGraph();
    const changes: ChangeOp[] = [
      { op: "create_node", tempId: "print1", nodeType: "debug.print", properties: { message: "hi" } },
      { op: "create_node", tempId: "print2", nodeType: "debug.print", properties: { message: "bye" } },
      { op: "connect", source: { nodeId: "print1", port: "exec-out" }, target: { nodeId: "print2", port: "exec-in" } },
    ];

    const result = applyChanges(rootContext(graph), { changes }, { currentVersion: 0 });
    expect(result.success).toBe(true);
    const trigger = graph.nodes.find((n) => n.type === "event.simulate")!;
    const print1 = graph.nodes.find((n) => n.type === "debug.print" && n.pins.message?.value === "hi")!;
    // The trigger should wire to print1 (the still-unconnected exec-in), not print2 (already fed by print1).
    expect(graph.connections.some((c) => c.fromNode === trigger.id && c.toNode === print1.id)).toBe(true);
  });

  it("chains multiple independently-unwired islands created in the same batch, in order", () => {
    const graph = buildTestGraph();
    const changes: ChangeOp[] = [
      { op: "create_node", tempId: "print1", nodeType: "debug.print", properties: { message: "hi" } },
      { op: "create_node", tempId: "print2", nodeType: "debug.print", properties: { message: "bye" } },
    ];

    const result = applyChanges(rootContext(graph), { changes }, { currentVersion: 0 });
    expect(result.success).toBe(true);
    const trigger = graph.nodes.find((n) => n.type === "event.simulate")!;
    const print1 = graph.nodes.find((n) => n.type === "debug.print" && n.pins.message?.value === "hi")!;
    const print2 = graph.nodes.find((n) => n.type === "debug.print" && n.pins.message?.value === "bye")!;
    expect(graph.connections.some((c) => c.fromNode === trigger.id && c.toNode === print1.id)).toBe(true);
    expect(graph.connections.some((c) => c.fromNode === print1.id && c.toNode === print2.id)).toBe(true);
  });

  it("appends a later task's unwired node to the END of an already-wired chain instead of leaving it disconnected", () => {
    const graph = buildTestGraph();

    // Turn 1: "print hello world" — creates its own trigger + print node, already wired (as if the
    // AI remembered this time), simulating a prior conversation turn's already-committed batch.
    const firstTurn = applyChanges(rootContext(graph), { changes: [{ op: "create_node", tempId: "print1", nodeType: "debug.print", properties: { message: "Hello, world!" } }] }, { currentVersion: 0 });
    expect(firstTurn.success).toBe(true);
    const trigger = graph.nodes.find((n) => n.type === "event.simulate")!;
    const print1 = graph.nodes.find((n) => n.type === "debug.print")!;
    expect(graph.connections.some((c) => c.fromNode === trigger.id && c.toNode === print1.id)).toBe(true);

    // Turn 2: "also send an email" — creates a second node into a graph that already has a trigger
    // AND an existing wired chain. Should be appended after print1, not left dangling, and the
    // existing trigger -> print1 wire must survive untouched.
    const secondTurn = applyChanges(rootContext(graph), { changes: [{ op: "create_node", tempId: "print2", nodeType: "debug.print", properties: { message: "sent" } }] }, { currentVersion: 1 });
    expect(secondTurn.success).toBe(true);
    const print2 = graph.nodes.find((n) => n.type === "debug.print" && n.pins.message?.value === "sent")!;
    expect(graph.connections.some((c) => c.fromNode === trigger.id && c.toNode === print1.id)).toBe(true);
    expect(graph.connections.some((c) => c.fromNode === print1.id && c.toNode === print2.id)).toBe(true);
  });

  it("create_comment_box / delete_comment_box add and remove a visual annotation", () => {
    const graph = buildTestGraph();
    const print = addBuiltinNode(graph, "debug.print", { x: 0, y: 0 }, "print-1");

    const created = applyChanges(rootContext(graph), { changes: [{ op: "create_comment_box", text: "Send the notification", position: { x: 0, y: 0 }, size: { width: 200, height: 200 }, containedNodeIds: [print.id] }] }, { currentVersion: 0 });
    expect(created.success).toBe(true);
    expect(graph.commentBoxes).toHaveLength(1);
    const boxId = graph.commentBoxes[0].id;
    expect(graph.commentBoxes[0]).toMatchObject({ text: "Send the notification", containedNodeIds: [print.id] });

    const deleted = applyChanges(rootContext(graph), { changes: [{ op: "delete_comment_box", commentBoxId: boxId }] }, { currentVersion: 1 });
    expect(deleted.success).toBe(true);
    expect(graph.commentBoxes).toHaveLength(0);
  });

  it("rejects a stale expectedVersion with VERSION_CONFLICT", () => {
    const graph = buildTestGraph();
    const result = applyChanges(rootContext(graph), { changes: [{ op: "create_node", nodeType: "debug.print" }], expectedVersion: 5 }, { currentVersion: 2 });
    expect(result.success).toBe(false);
    expect(result.errors[0].code).toBe("VERSION_CONFLICT");
    expect(graph.nodes).toHaveLength(0);
  });

  it("supports create -> connect -> connect dependency ordering across three ops", () => {
    const graph = buildTestGraph();
    const start = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "start-1");
    const parser = addBuiltinNode(graph, "debug.print", { x: 0, y: 0 }, "parser-1");

    const changes: ChangeOp[] = [
      { op: "create_node", tempId: "retry1", nodeType: "debug.print", properties: { message: "retry" } },
      { op: "connect", source: { nodeId: start.id, port: "exec-out" }, target: { nodeId: "retry1", port: "exec-in" } },
      { op: "connect", source: { nodeId: "retry1", port: "exec-out" }, target: { nodeId: parser.id, port: "exec-in" } },
    ];

    const result = applyChanges(rootContext(graph), { changes }, { currentVersion: 0 });
    expect(result.success).toBe(true);
    expect(graph.connections).toHaveLength(2);
  });
});
