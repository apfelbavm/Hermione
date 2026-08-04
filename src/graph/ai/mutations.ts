import { Graph } from "../engine/graph";
import { addCommentBox, connectPins, disconnectOutput, disconnectPin, nextId, removeCommentBox, setPinLiteralValue } from "../engine/graphMutations";
import { NodeInstance } from "../engine/nodeInstance";
import { getNodeDef, tryGetNodeDef } from "../engine/registry";
import type { PinDef } from "../engine/types";
import { type AiGraphContext, visibleFunctions, visibleScripts, visibleVariables } from "./context";
import { isRequiredProperty, validatePropertyValue } from "./validation";
import type { ConnectOp, CreateCommentBoxOp, CreateNodeOp, DeleteCommentBoxOp, DeleteNodeOp, DisconnectOp, UpdateNodeOp, ValidationError } from "./types";

export interface MutationOutcome {
  errors: ValidationError[];
  nodeId?: string;
  connectionId?: string;
  removedConnectionIds?: string[];
  commentBoxId?: string;
  summary?: string;
}

/** Validates `properties` against a node's currently-resolved pin defs — shared by create_node
 * (also checking missing-required) and update_node. Never allows a property key that isn't one of
 * this node type's own non-exec input pins/detail properties. */
function validateProperties(nodeId: string, pinDefsById: Map<string, PinDef>, properties: Record<string, unknown>, requireMissing: boolean): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const [key, value] of Object.entries(properties)) {
    const pinDef = pinDefsById.get(key);
    if (!pinDef || pinDef.direction !== "input" || pinDef.type === "exec") {
      errors.push({ code: "UNKNOWN_PROPERTY", nodeId, port: key, message: `"${key}" is not a known property of this node` });
      continue;
    }
    const error = validatePropertyValue(pinDef, value, nodeId);
    if (error) errors.push(error);
  }

  if (requireMissing) {
    for (const pinDef of pinDefsById.values()) {
      if (isRequiredProperty(pinDef) && !(pinDef.id in properties)) {
        errors.push({ code: "MISSING_REQUIRED_PROPERTY", nodeId, port: pinDef.id, message: `"${pinDef.label}" is required` });
      }
    }
  }

  return errors;
}

export function createNode(ctx: AiGraphContext, op: CreateNodeOp, isFunctionBody: boolean = false): MutationOutcome {
  const def = tryGetNodeDef(op.nodeType);
  if (!def) return { errors: [{ code: "UNKNOWN_NODE_TYPE", message: `Unknown node type "${op.nodeType}"` }] };

  if (!ctx.graph.canPlaceNodeType(op.nodeType, isFunctionBody)) {
    return { errors: [{ code: "DUPLICATE_EVENT_TRIGGER", message: `Only one "${def.label}" node is allowed per graph, or it can't be placed here` }] };
  }

  const node = NodeInstance.createNodeInstance(op.nodeType, op.position ?? { x: 0, y: 0 }, def.pins);
  ctx.graph.nodes.push(node);

  if (op.config) {
    if (def.configurableElementType) {
      ctx.graph.changeNodeElementType(visibleVariables(ctx), visibleFunctions(ctx), node.id, op.config);
    } else if (def.configurableSubType && op.config.subType) {
      ctx.graph.changeNodeSubType(visibleVariables(ctx), visibleFunctions(ctx), node.id, op.config.subType);
    }
  }

  const pinDefsById = new Map(node.resolvePinDefs(visibleVariables(ctx), visibleFunctions(ctx), visibleScripts(ctx)).map((p) => [p.id, p] as const));
  const errors = validateProperties(node.id, pinDefsById, op.properties ?? {}, true);
  if (errors.length > 0) {
    ctx.graph.removeNode(visibleVariables(ctx), visibleFunctions(ctx), node.id, visibleScripts(ctx));
    return { errors };
  }

  for (const [key, value] of Object.entries(op.properties ?? {})) {
    setPinLiteralValue(ctx.graph, node.id, key, value);
  }
  if (op.description !== undefined) node.description = op.description;

  return { errors: [], nodeId: node.id, summary: `Created ${def.label} node "${node.id}"` };
}

export function updateNode(ctx: AiGraphContext, op: UpdateNodeOp): MutationOutcome {
  const node = ctx.graph.nodes.find((n) => n.id === op.nodeId);
  if (!node) return { errors: [{ code: "UNKNOWN_NODE", nodeId: op.nodeId, message: `Node "${op.nodeId}" not found` }] };

  const properties = op.properties ?? {};
  const pinDefsById = new Map(node.resolvePinDefs(visibleVariables(ctx), visibleFunctions(ctx), visibleScripts(ctx)).map((p) => [p.id, p] as const));
  const errors = validateProperties(node.id, pinDefsById, properties, false);

  for (const key of Object.keys(properties)) {
    if (node.pins[key]?.connectionId) {
      errors.push({ code: "INVALID_OPERATION", nodeId: node.id, port: key, message: `"${key}" is connected — disconnect it before setting a literal value` });
    }
  }
  if (errors.length > 0) return { errors };

  for (const [key, value] of Object.entries(properties)) {
    setPinLiteralValue(ctx.graph, node.id, key, value);
  }
  if (op.description !== undefined) node.description = op.description;

  const updatedFields = [...Object.keys(properties), ...(op.description !== undefined ? ["description"] : [])];
  return { errors: [], nodeId: node.id, summary: `Updated ${updatedFields.join(", ")} on node "${node.id}"` };
}

const CONNECT_ERROR_CODES: Array<[string, ValidationError["code"]]> = [
  ["node not found", "UNKNOWN_NODE"],
  ["pin not found", "UNKNOWN_PORT"],
  ["must connect an output pin to an input pin", "PORT_DIRECTION_MISMATCH"],
  ["incompatible pin types", "INCOMPATIBLE_PORTS"],
];

function classifyConnectError(message: string): ValidationError["code"] {
  for (const [needle, code] of CONNECT_ERROR_CODES) {
    if (message.includes(needle)) return code;
  }
  return "INVALID_OPERATION";
}

export function connect(ctx: AiGraphContext, op: ConnectOp): MutationOutcome {
  try {
    const connection = connectPins(ctx.graph, visibleVariables(ctx), visibleFunctions(ctx), { fromNode: op.source.nodeId, fromPin: op.source.port, toNode: op.target.nodeId, toPin: op.target.port }, visibleScripts(ctx));
    return { errors: [], connectionId: connection.id, summary: `Connected ${op.source.nodeId}.${op.source.port} -> ${op.target.nodeId}.${op.target.port}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { errors: [{ code: classifyConnectError(message), message }] };
  }
}

export function disconnect(ctx: AiGraphContext, op: DisconnectOp): MutationOutcome {
  let connectionId = op.connectionId;
  if (!connectionId) {
    if (op.source) {
      connectionId = ctx.graph.connections.find((c) => c.fromNode === op.source!.nodeId && c.fromPin === op.source!.port)?.id;
    } else if (op.target) {
      connectionId = ctx.graph.connections.find((c) => c.toNode === op.target!.nodeId && c.toPin === op.target!.port)?.id;
    }
  }
  if (!connectionId || !ctx.graph.connections.some((c) => c.id === connectionId)) {
    return { errors: [{ code: "INVALID_OPERATION", message: "Could not identify a connection to remove from the given information" }] };
  }
  ctx.graph.removeConnection(visibleVariables(ctx), visibleFunctions(ctx), connectionId, visibleScripts(ctx));
  return { errors: [], connectionId, summary: `Disconnected connection "${connectionId}"` };
}

export function deleteNode(ctx: AiGraphContext, op: DeleteNodeOp): MutationOutcome {
  const node = ctx.graph.nodes.find((n) => n.id === op.nodeId);
  if (!node) return { errors: [{ code: "UNKNOWN_NODE", nodeId: op.nodeId, message: `Node "${op.nodeId}" not found` }] };
  if (Graph.UNDELETABLE_NODE_TYPES.has(node.type)) {
    return { errors: [{ code: "INVALID_OPERATION", nodeId: op.nodeId, message: `Node type "${node.type}" is structural and cannot be deleted` }] };
  }

  const dependentConnections = ctx.graph.connections.filter((c) => c.fromNode === op.nodeId || c.toNode === op.nodeId);
  if (dependentConnections.length > 0 && !op.cascade) {
    return {
      errors: [
        {
          code: "DEPENDENT_CONNECTIONS_EXIST",
          nodeId: op.nodeId,
          message: `Node "${op.nodeId}" has ${dependentConnections.length} connection(s) — pass cascade:true to remove them too: ${dependentConnections.map((c) => c.id).join(", ")}`,
        },
      ],
    };
  }

  ctx.graph.removeNode(visibleVariables(ctx), visibleFunctions(ctx), op.nodeId, visibleScripts(ctx));
  return { errors: [], nodeId: op.nodeId, removedConnectionIds: dependentConnections.map((c) => c.id), summary: `Deleted node "${op.nodeId}" (${getNodeDef(node.type).label})` };
}

export function createCommentBox(ctx: AiGraphContext, op: CreateCommentBoxOp): MutationOutcome {
  const containedNodeIds = op.containedNodeIds ?? [];
  const unknownIds = containedNodeIds.filter((id) => !ctx.graph.nodes.some((n) => n.id === id));
  if (unknownIds.length > 0) return { errors: [{ code: "UNKNOWN_NODE", message: `Unknown node id(s) in containedNodeIds: ${unknownIds.join(", ")}` }] };

  const box = { id: nextId("comment"), text: op.text, position: op.position, size: op.size, containedNodeIds, color: op.color };
  addCommentBox(ctx.graph, box);
  return { errors: [], commentBoxId: box.id, summary: `Created comment box "${box.id}" ("${op.text}")` };
}

export function deleteCommentBox(ctx: AiGraphContext, op: DeleteCommentBoxOp): MutationOutcome {
  if (!ctx.graph.commentBoxes.some((b) => b.id === op.commentBoxId)) {
    return { errors: [{ code: "INVALID_OPERATION", message: `Comment box "${op.commentBoxId}" not found` }] };
  }
  removeCommentBox(ctx.graph, op.commentBoxId);
  return { errors: [], commentBoxId: op.commentBoxId, summary: `Deleted comment box "${op.commentBoxId}"` };
}

// Re-exported so callers of this module don't also need to import graphMutations directly for the
// rare case of a plain, unvalidated disconnect (e.g. internal cleanup) — kept here rather than
// duplicated.
export { disconnectOutput, disconnectPin };
