import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltins } from "../../../src/graph/nodes";
import { connectPins } from "../../../src/graph/engine/graphMutations";
import { rootContext } from "../../../src/graph/ai/context";
import { connect, createNode, deleteNode, disconnect, updateNode } from "../../../src/graph/ai/mutations";
import { addBuiltinNode, buildTestGraph } from "./helpers";

beforeAll(() => {
  registerBuiltins();
});

describe("mutations", () => {
  it("creates a valid node with properties applied", () => {
    const graph = buildTestGraph();
    const outcome = createNode(rootContext(graph), { op: "create_node", nodeType: "debug.print", properties: { message: "hello" }, position: { x: 10, y: 20 } });
    expect(outcome.errors).toEqual([]);
    const node = graph.nodes.find((n) => n.id === outcome.nodeId)!;
    expect(node.pins.message.value).toBe("hello");
    expect(node.position).toEqual({ x: 10, y: 20 });
  });

  it("rejects an unknown node type without mutating the graph", () => {
    const graph = buildTestGraph();
    const outcome = createNode(rootContext(graph), { op: "create_node", nodeType: "does.not.exist" });
    expect(outcome.errors[0].code).toBe("UNKNOWN_NODE_TYPE");
    expect(graph.nodes).toHaveLength(0);
  });

  it("rejects an unknown property and rolls back node creation", () => {
    const graph = buildTestGraph();
    const outcome = createNode(rootContext(graph), { op: "create_node", nodeType: "debug.print", properties: { notARealPin: 1 } });
    expect(outcome.errors[0].code).toBe("UNKNOWN_PROPERTY");
    expect(graph.nodes).toHaveLength(0);
  });

  it("rejects a missing required property (string.fromJson's value pin has no default)", () => {
    const graph = buildTestGraph();
    const outcome = createNode(rootContext(graph), { op: "create_node", nodeType: "string.fromJson" });
    expect(outcome.errors[0].code).toBe("MISSING_REQUIRED_PROPERTY");
    expect(graph.nodes).toHaveLength(0);
  });

  it("rejects a wrong-typed property value", () => {
    const graph = buildTestGraph();
    const outcome = createNode(rootContext(graph), { op: "create_node", nodeType: "math.add", properties: { a: "not a number" } });
    expect(outcome.errors[0].code).toBe("INVALID_PROPERTY_TYPE");
  });

  it("updates valid properties on an existing node", () => {
    const graph = buildTestGraph();
    const node = addBuiltinNode(graph, "debug.print", { x: 0, y: 0 }, "print-1");
    const outcome = updateNode(rootContext(graph), { op: "update_node", nodeId: node.id, properties: { message: "updated" } });
    expect(outcome.errors).toEqual([]);
    expect(node.pins.message.value).toBe("updated");
  });

  it("rejects updating an unknown node", () => {
    const graph = buildTestGraph();
    const outcome = updateNode(rootContext(graph), { op: "update_node", nodeId: "missing", properties: {} });
    expect(outcome.errors[0].code).toBe("UNKNOWN_NODE");
  });

  it("connects two compatible ports", () => {
    const graph = buildTestGraph();
    const start = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "start-1");
    const print = addBuiltinNode(graph, "debug.print", { x: 0, y: 0 }, "print-1");
    const outcome = connect(rootContext(graph), { op: "connect", source: { nodeId: start.id, port: "exec-out" }, target: { nodeId: print.id, port: "exec-in" } });
    expect(outcome.errors).toEqual([]);
    expect(graph.connections).toHaveLength(1);
  });

  it("rejects connecting incompatible port types", () => {
    const graph = buildTestGraph();
    const addNode = addBuiltinNode(graph, "math.add", { x: 0, y: 0 }, "add-1");
    const print = addBuiltinNode(graph, "debug.print", { x: 0, y: 0 }, "print-1");
    const outcome = connect(rootContext(graph), { op: "connect", source: { nodeId: addNode.id, port: "result" }, target: { nodeId: print.id, port: "exec-in" } });
    expect(outcome.errors[0].code).toBe("INCOMPATIBLE_PORTS");
  });

  it("disconnects an existing connection", () => {
    const graph = buildTestGraph();
    const start = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "start-1");
    const print = addBuiltinNode(graph, "debug.print", { x: 0, y: 0 }, "print-1");
    const conn = connectPins(graph, [], [], { fromNode: start.id, fromPin: "exec-out", toNode: print.id, toPin: "exec-in" });
    const outcome = disconnect(rootContext(graph), { op: "disconnect", connectionId: conn.id });
    expect(outcome.errors).toEqual([]);
    expect(graph.connections).toHaveLength(0);
  });

  it("deletes a node with no connections", () => {
    const graph = buildTestGraph();
    const node = addBuiltinNode(graph, "debug.print", { x: 0, y: 0 }, "print-1");
    const outcome = deleteNode(rootContext(graph), { op: "delete_node", nodeId: node.id });
    expect(outcome.errors).toEqual([]);
    expect(graph.nodes).toHaveLength(0);
  });

  it("refuses to delete a connected node unless cascade is set, then reports removed connections", () => {
    const graph = buildTestGraph();
    const start = addBuiltinNode(graph, "event.start", { x: 0, y: 0 }, "start-1");
    const print = addBuiltinNode(graph, "debug.print", { x: 0, y: 0 }, "print-1");
    connectPins(graph, [], [], { fromNode: start.id, fromPin: "exec-out", toNode: print.id, toPin: "exec-in" });

    const blocked = deleteNode(rootContext(graph), { op: "delete_node", nodeId: print.id });
    expect(blocked.errors[0].code).toBe("DEPENDENT_CONNECTIONS_EXIST");
    expect(graph.nodes).toHaveLength(2);

    const cascaded = deleteNode(rootContext(graph), { op: "delete_node", nodeId: print.id, cascade: true });
    expect(cascaded.errors).toEqual([]);
    expect(cascaded.removedConnectionIds).toHaveLength(1);
    expect(graph.connections).toHaveLength(0);
  });
});
