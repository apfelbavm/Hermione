import { nextId, UNDELETABLE_NODE_TYPES } from "./graphMutations";
import type { Connection, Graph, NodeInstance, PinType, Variable } from "./types";

/** Tags copied JSON so paste can tell "this came from our own Ctrl+C" apart from arbitrary
 * clipboard content (plain text, something copied from another app, a hand-edited value). */
const CLIPBOARD_SOURCE = "hermione-graph-editor";
const CLIPBOARD_VERSION = 1;

const PIN_TYPES: readonly PinType[] = ["exec", "number", "boolean", "string", "object"];

export interface NodesClipboardPayload {
  source: typeof CLIPBOARD_SOURCE;
  kind: "nodes";
  version: typeof CLIPBOARD_VERSION;
  nodes: NodeInstance[];
  connections: Connection[];
}

export interface VariableClipboardPayload {
  source: typeof CLIPBOARD_SOURCE;
  kind: "variable";
  version: typeof CLIPBOARD_VERSION;
  variable: Variable;
}

export type ClipboardPayload = NodesClipboardPayload | VariableClipboardPayload;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidPosition(value: unknown): value is { x: number; y: number } {
  return isPlainObject(value) && typeof value.x === "number" && typeof value.y === "number";
}

function isValidPin(value: unknown): boolean {
  if (!isPlainObject(value)) return false;
  if ("connectionId" in value && value.connectionId !== undefined && typeof value.connectionId !== "string") {
    return false;
  }
  return true;
}

function isValidNodeInstance(value: unknown): value is NodeInstance {
  if (!isPlainObject(value)) return false;
  if (typeof value.id !== "string" || typeof value.type !== "string") return false;
  if (!isValidPosition(value.position)) return false;
  if (!isPlainObject(value.pins) || !Object.values(value.pins).every(isValidPin)) return false;
  if (value.variableId !== undefined && typeof value.variableId !== "string") return false;
  if (value.functionId !== undefined && typeof value.functionId !== "string") return false;
  return true;
}

function isValidConnection(value: unknown): value is Connection {
  return (
    isPlainObject(value) &&
    typeof value.id === "string" &&
    typeof value.fromNode === "string" &&
    typeof value.fromPin === "string" &&
    typeof value.toNode === "string" &&
    typeof value.toPin === "string"
  );
}

function isValidVariable(value: unknown): value is Variable {
  return (
    isPlainObject(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.type === "string" &&
    PIN_TYPES.includes(value.type as PinType) &&
    "defaultValue" in value
  );
}

/** Parses and validates clipboard text before trusting it as a copy/paste payload — rejects
 * anything that isn't valid JSON, doesn't carry our source/version tag, or doesn't match the
 * expected node/connection/variable shape. This is the only thing standing between a paste and
 * whatever happens to be on the system clipboard (plain text, JSON from an unrelated tool, a
 * manually edited value), so every field is checked rather than assumed. */
export function parseClipboardPayload(raw: string): ClipboardPayload | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isPlainObject(data) || data.source !== CLIPBOARD_SOURCE || data.version !== CLIPBOARD_VERSION) {
    return null;
  }

  if (data.kind === "nodes") {
    if (!Array.isArray(data.nodes) || !Array.isArray(data.connections)) return null;
    if (!data.nodes.every(isValidNodeInstance) || !data.connections.every(isValidConnection)) return null;
    return data as unknown as NodesClipboardPayload;
  }
  if (data.kind === "variable") {
    if (!isValidVariable(data.variable)) return null;
    return data as unknown as VariableClipboardPayload;
  }
  return null;
}

export function serializeNodesClipboardPayload(nodes: NodeInstance[], connections: Connection[]): string {
  const payload: NodesClipboardPayload = {
    source: CLIPBOARD_SOURCE,
    kind: "nodes",
    version: CLIPBOARD_VERSION,
    nodes,
    connections,
  };
  return JSON.stringify(payload);
}

export function serializeVariableClipboardPayload(variable: Variable): string {
  const payload: VariableClipboardPayload = {
    source: CLIPBOARD_SOURCE,
    kind: "variable",
    version: CLIPBOARD_VERSION,
    variable,
  };
  return JSON.stringify(payload);
}

/** Deep-clones the given selection for copying: the nodes themselves (minus Entry/Return, which are
 * structural and can never be duplicated — see UNDELETABLE_NODE_TYPES) plus only the connections
 * that run strictly between two selected nodes. A wire to a node outside the selection is dropped,
 * same as Ctrl+C in Unreal's Blueprint editor would. */
export function cloneNodesForClipboard(
  graph: Graph,
  nodeIds: Set<string>,
): { nodes: NodeInstance[]; connections: Connection[] } {
  const selectedNodes = graph.nodes.filter((n) => nodeIds.has(n.id) && !UNDELETABLE_NODE_TYPES.has(n.type));
  const copyableIds = new Set(selectedNodes.map((n) => n.id));
  const nodes = selectedNodes.map((n) => structuredClone(n));
  const connections = graph.connections
    .filter((c) => copyableIds.has(c.fromNode) && copyableIds.has(c.toNode))
    .map((c) => structuredClone(c));
  return { nodes, connections };
}

/** Instantiates a copied node/connection set into `graph` with fresh ids throughout (nodes,
 * connections, and the pin `connectionId`s that reference them), positioned so the selection's
 * top-left lands at `targetTopLeft`. Mirrors createNodeInstance/addNode's "fresh id, append to
 * graph" pattern. Returns the pasted nodes' new ids so the caller can select them. */
export function pasteNodesIntoGraph(
  graph: Graph,
  payload: NodesClipboardPayload,
  targetTopLeft: { x: number; y: number },
): string[] {
  if (payload.nodes.length === 0) return [];

  const minX = Math.min(...payload.nodes.map((n) => n.position.x));
  const minY = Math.min(...payload.nodes.map((n) => n.position.y));
  const offset = { x: targetTopLeft.x - minX, y: targetTopLeft.y - minY };

  const idMap = new Map<string, string>();
  const pastedNodes: NodeInstance[] = payload.nodes.map((original) => {
    const id = nextId("node");
    idMap.set(original.id, id);
    const pins: NodeInstance["pins"] = {};
    for (const [pinId, pin] of Object.entries(original.pins)) {
      pins[pinId] = { value: pin.value };
    }
    return {
      ...original,
      id,
      position: { x: original.position.x + offset.x, y: original.position.y + offset.y },
      pins,
    };
  });

  const pastedConnections: Connection[] = payload.connections
    .filter((c) => idMap.has(c.fromNode) && idMap.has(c.toNode))
    .map((original) => {
      const id = nextId("conn");
      const fromNode = idMap.get(original.fromNode)!;
      const toNode = idMap.get(original.toNode)!;
      const connection: Connection = { id, fromNode, fromPin: original.fromPin, toNode, toPin: original.toPin };
      const toPin = pastedNodes.find((n) => n.id === toNode)?.pins[original.toPin];
      if (toPin) toPin.connectionId = id;
      return connection;
    });

  graph.nodes.push(...pastedNodes);
  graph.connections.push(...pastedConnections);
  return pastedNodes.map((n) => n.id);
}

/** The first "{name}"/"{name} 2"/"{name} 3"/... not already taken — used so pasting a variable
 * never silently collides with one of the same name already in the target graph. */
function uniqueVariableName(existingNames: Iterable<string>, desiredName: string): string {
  const taken = new Set(existingNames);
  if (!taken.has(desiredName)) return desiredName;
  let i = 2;
  while (taken.has(`${desiredName} ${i}`)) i++;
  return `${desiredName} ${i}`;
}

/** Clones a copied variable into `graph` with a fresh id, deduping its name against whatever's
 * already there. Pasted Get/Set nodes are never part of this — copying a variable only ever
 * copies its definition, matching how copying a variable.get/set node keeps its original
 * variableId rather than cloning the variable it points to. */
export function pasteVariableIntoGraph(graph: Graph, variable: Variable): Variable {
  const clone: Variable = {
    ...structuredClone(variable),
    id: nextId("var"),
    name: uniqueVariableName(graph.variables.map((v) => v.name), variable.name),
  };
  graph.variables.push(clone);
  return clone;
}
