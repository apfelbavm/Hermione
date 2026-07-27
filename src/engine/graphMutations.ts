import { getNodeDef, isPinTypeCompatible } from "./registry";
import type { CommentBox, Connection, Graph, NodeInstance, Pin, PinDef, Variable } from "./types";

let idCounter = 0;
export function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createNodeInstance(
  type: string,
  position: { x: number; y: number },
  pinDefs: PinDef[],
  id: string = nextId("node"),
  variableId?: string,
): NodeInstance {
  const pins: Record<string, Pin> = {};
  for (const def of pinDefs) {
    pins[def.id] = def.direction === "input" ? { value: def.defaultValue } : {};
  }
  return { id, type, position, pins, variableId };
}

/** Resolves the pin defs for a node instance, accounting for variable-derived (Get/Set) nodes. */
export function resolvePinDefs(node: NodeInstance, variables: Variable[]): PinDef[] {
  const def = getNodeDef(node.type);
  if (def.derivePins && node.variableId) {
    const variable = variables.find((v) => v.id === node.variableId);
    if (variable) return def.derivePins(variable);
  }
  return def.pins;
}

export function addNode(graph: Graph, node: NodeInstance): void {
  graph.nodes.push(node);
}

export function removeNode(graph: Graph, nodeId: string): void {
  graph.nodes = graph.nodes.filter((n) => n.id !== nodeId);
  graph.connections = graph.connections.filter(
    (c) => c.fromNode !== nodeId && c.toNode !== nodeId,
  );
  for (const box of graph.commentBoxes) {
    box.containedNodeIds = box.containedNodeIds.filter((id) => id !== nodeId);
  }
}

export interface ConnectRequest {
  fromNode: string;
  fromPin: string;
  toNode: string;
  toPin: string;
}

/** Validates and creates a connection, enforcing the pin value/connection XOR invariant. */
export function connectPins(graph: Graph, req: ConnectRequest): Connection {
  const fromNode = graph.nodes.find((n) => n.id === req.fromNode);
  const toNode = graph.nodes.find((n) => n.id === req.toNode);
  if (!fromNode || !toNode) throw new Error("connectPins: node not found");

  const fromPinDef = resolvePinDefs(fromNode, graph.variables).find((p) => p.id === req.fromPin);
  const toPinDef = resolvePinDefs(toNode, graph.variables).find((p) => p.id === req.toPin);
  if (!fromPinDef || !toPinDef) throw new Error("connectPins: pin not found");
  if (fromPinDef.direction !== "output" || toPinDef.direction !== "input") {
    throw new Error("connectPins: must connect an output pin to an input pin");
  }
  if (!isPinTypeCompatible(fromPinDef.type, toPinDef.type)) {
    throw new Error(
      `connectPins: incompatible pin types "${fromPinDef.type}" -> "${toPinDef.type}"`,
    );
  }

  if (toPinDef.type === "exec") {
    // Exec pins invert the data-pin rule: an input may converge many incoming wires (several
    // branches can all lead to the same next step), but a single output can only ever drive
    // ONE next step — replace any existing wire leaving this output instead.
    disconnectOutput(graph, req.fromNode, req.fromPin);
  } else {
    // Data pins: an input takes exactly one source; an output may fan out to many freely.
    disconnectPin(graph, req.toNode, req.toPin);
  }

  const connection: Connection = { id: nextId("conn"), ...req };
  graph.connections.push(connection);

  const toPin = toNode.pins[req.toPin] ?? (toNode.pins[req.toPin] = {});
  toPin.connectionId = connection.id;
  toPin.value = undefined;

  return connection;
}

/** Removes the (first) connection feeding the given input pin, if any, restoring its literal default. */
export function disconnectPin(graph: Graph, nodeId: string, pinId: string): void {
  const existing = graph.connections.find((c) => c.toNode === nodeId && c.toPin === pinId);
  if (!existing) return;
  removeConnection(graph, existing.id);
}

/** Removes the connection leaving the given output pin, if any — enforces "one wire per exec output." */
export function disconnectOutput(graph: Graph, nodeId: string, pinId: string): void {
  const existing = graph.connections.find((c) => c.fromNode === nodeId && c.fromPin === pinId);
  if (!existing) return;
  removeConnection(graph, existing.id);
}

export function removeConnection(graph: Graph, connectionId: string): void {
  const conn = graph.connections.find((c) => c.id === connectionId);
  if (!conn) return;
  graph.connections = graph.connections.filter((c) => c.id !== connectionId);

  const toNode = graph.nodes.find((n) => n.id === conn.toNode);
  const toPin = toNode?.pins[conn.toPin];
  if (toPin) {
    // An exec input pin may still have OTHER incoming wires after this one is removed —
    // only clear connectionId/restore the literal default once none remain.
    const remaining = graph.connections.find(
      (c) => c.toNode === conn.toNode && c.toPin === conn.toPin,
    );
    toPin.connectionId = remaining?.id;
    if (!remaining) {
      const pinDef = toNode ? resolvePinDefs(toNode, graph.variables).find((p) => p.id === conn.toPin) : undefined;
      toPin.value = pinDef?.defaultValue;
    }
  }
}

export function addVariable(graph: Graph, variable: Variable): void {
  graph.variables.push(variable);
}

/** Removes a variable along with any Get/Set nodes bound to it — an orphaned binding has no valid pins. */
export function removeVariable(graph: Graph, variableId: string): void {
  const dependentNodeIds = graph.nodes.filter((n) => n.variableId === variableId).map((n) => n.id);
  for (const nodeId of dependentNodeIds) {
    removeNode(graph, nodeId);
  }
  graph.variables = graph.variables.filter((v) => v.id !== variableId);
}

export function addCommentBox(graph: Graph, box: CommentBox): void {
  graph.commentBoxes.push(box);
}

export function removeCommentBox(graph: Graph, commentId: string): void {
  graph.commentBoxes = graph.commentBoxes.filter((b) => b.id !== commentId);
}

export function setPinLiteralValue(graph: Graph, nodeId: string, pinId: string, value: unknown): void {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) throw new Error(`setPinLiteralValue: node "${nodeId}" not found`);
  const pin = node.pins[pinId] ?? (node.pins[pinId] = {});
  if (pin.connectionId) {
    throw new Error(`setPinLiteralValue: pin "${nodeId}:${pinId}" is connected, disconnect first`);
  }
  pin.value = value;
}
