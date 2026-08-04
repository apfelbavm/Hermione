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
    // 2, not 1: the graph had no event-trigger node, so the preview also includes the auto-added
    // event.simulate (see transactions.ts's autoAddEventTriggerIfMissing).
    expect(result.changes).toHaveLength(2);
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
