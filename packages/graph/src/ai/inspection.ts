import type { NodeInstance } from "@hermione/graph/engine/nodeInstance";
import { getNodeDef, topLevelGroup, tryGetNodeDef } from "@hermione/graph/engine/registry";
import type { PinType } from "@hermione/graph/engine/types";
import { type AiGraphContext, findNodeOrThrow, visibleFunctions, visibleScripts, visibleVariables } from "./context";
import { describeNodeType } from "./metadataAdapter";
import type { ConnectionDTO, NodeDetail, NodeSummary, PortInstance } from "./types";
import { validateGraph, validateNode } from "./validation";

function toNodeSummary(node: NodeInstance): NodeSummary {
  const def = getNodeDef(node.type);
  return {
    id: node.id,
    type: node.type,
    label: def.label,
    category: topLevelGroup(def.group),
    position: node.position,
    disabled: !!node.disabled,
    hasBreakpoint: !!node.breakpoint,
  };
}

export interface GraphSummaryOptions {
  selectedNodeIds?: string[];
  version: number;
}

export function getSummary(ctx: AiGraphContext, opts: GraphSummaryOptions) {
  const graph = ctx.graph;
  const groups = [...new Set(graph.nodes.map((n) => topLevelGroup(getNodeDef(n.type).group)))].sort();
  return {
    graphId: graph.id,
    graphName: graph.name,
    nodeCount: graph.nodes.length,
    connectionCount: graph.connections.length,
    groups,
    validation: validateGraph(ctx),
    version: opts.version,
    selectedNodeIds: opts.selectedNodeIds ?? [],
  };
}

export interface NodeFilter {
  ids?: string[];
  types?: string[];
  categories?: string[];
  namePattern?: string;
  selectedNodeIds?: string[];
  connectedToNodeId?: string;
  region?: { x: number; y: number; width: number; height: number };
  limit?: number;
}

export function getNodes(ctx: AiGraphContext, filter: NodeFilter = {}): NodeSummary[] {
  let nodes = ctx.graph.nodes;

  if (filter.ids) nodes = nodes.filter((n) => filter.ids!.includes(n.id));
  if (filter.types) nodes = nodes.filter((n) => filter.types!.includes(n.type));
  if (filter.categories) {
    const categories = filter.categories.map((c) => c.toLowerCase());
    nodes = nodes.filter((n) => categories.includes(topLevelGroup(getNodeDef(n.type).group).toLowerCase()));
  }
  if (filter.namePattern) {
    const pattern = filter.namePattern.toLowerCase();
    nodes = nodes.filter((n) => {
      const def = getNodeDef(n.type);
      return def.label.toLowerCase().includes(pattern) || (n.description ?? "").toLowerCase().includes(pattern);
    });
  }
  if (filter.selectedNodeIds) nodes = nodes.filter((n) => filter.selectedNodeIds!.includes(n.id));
  if (filter.connectedToNodeId) {
    const id = filter.connectedToNodeId;
    const connectedIds = new Set(ctx.graph.connections.filter((c) => c.fromNode === id || c.toNode === id).map((c) => (c.fromNode === id ? c.toNode : c.fromNode)));
    nodes = nodes.filter((n) => connectedIds.has(n.id));
  }
  if (filter.region) {
    const { x, y, width, height } = filter.region;
    nodes = nodes.filter((n) => n.position.x >= x && n.position.x <= x + width && n.position.y >= y && n.position.y <= y + height);
  }

  return nodes.slice(0, filter.limit ?? 100).map(toNodeSummary);
}

export function getNode(ctx: AiGraphContext, nodeId: string): NodeDetail {
  const node = findNodeOrThrow(ctx, nodeId);
  const def = getNodeDef(node.type);
  const variables = visibleVariables(ctx);
  const functions = visibleFunctions(ctx);
  const scripts = visibleScripts(ctx);
  const pinDefs = node.resolvePinDefs(variables, functions, scripts);

  const ports: PortInstance[] = pinDefs.map((pinDef) => {
    const pin = node.pins[pinDef.id];
    return { id: pinDef.id, label: pinDef.label, direction: pinDef.direction, type: pinDef.type, value: pin?.value, connectionId: pin?.connectionId };
  });

  const properties: Record<string, unknown> = {};
  for (const pinDef of pinDefs) {
    if (pinDef.direction === "input" && pinDef.type !== "exec") {
      properties[pinDef.id] = node.pins[pinDef.id]?.value;
    }
  }

  const connections: ConnectionDTO[] = ctx.graph.connections.filter((c) => c.fromNode === nodeId || c.toNode === nodeId).map((c) => ({ id: c.id, source: { nodeId: c.fromNode, port: c.fromPin }, target: { nodeId: c.toNode, port: c.toPin } }));

  return {
    ...toNodeSummary(node),
    description: node.resolveNodeDescription(def, functions),
    properties,
    ports,
    connections,
    metadata: describeNodeType(def),
    validation: validateNode(ctx, nodeId),
  };
}

export interface FindNodesQuery {
  type?: string;
  namePattern?: string;
  connectedToNodeId?: string;
  producesType?: PinType;
  consumesFromNodeId?: string;
  propertyEquals?: { pinId: string; value: unknown };
  limit?: number;
}

/** Semantic node search — see graph.find_nodes in the design doc: layers a few extra predicates
 * (produces/consumes a type, a property's current value) on top of getNodes' structural filters. */
export function findNodes(ctx: AiGraphContext, query: FindNodesQuery = {}): NodeSummary[] {
  let nodes = ctx.graph.nodes;

  if (query.type) nodes = nodes.filter((n) => n.type === query.type || n.type.toLowerCase().includes(query.type!.toLowerCase()));
  if (query.namePattern) {
    const pattern = query.namePattern.toLowerCase();
    nodes = nodes.filter((n) => getNodeDef(n.type).label.toLowerCase().includes(pattern));
  }
  if (query.connectedToNodeId) {
    const id = query.connectedToNodeId;
    const connectedIds = new Set(ctx.graph.connections.filter((c) => c.fromNode === id || c.toNode === id).map((c) => (c.fromNode === id ? c.toNode : c.fromNode)));
    nodes = nodes.filter((n) => connectedIds.has(n.id));
  }
  if (query.consumesFromNodeId) {
    const id = query.consumesFromNodeId;
    const consumerIds = new Set(ctx.graph.connections.filter((c) => c.fromNode === id).map((c) => c.toNode));
    nodes = nodes.filter((n) => consumerIds.has(n.id));
  }
  if (query.producesType) {
    nodes = nodes.filter((n) => {
      const def = tryGetNodeDef(n.type);
      return def?.pins.some((p) => p.direction === "output" && p.type === query.producesType);
    });
  }
  if (query.propertyEquals) {
    const { pinId, value } = query.propertyEquals;
    nodes = nodes.filter((n) => n.pins[pinId]?.value === value);
  }

  return nodes.slice(0, query.limit ?? 50).map(toNodeSummary);
}

export interface ConnectionFilter {
  nodeId?: string;
  direction?: "incoming" | "outgoing" | "both";
  betweenNodeIds?: string[];
}

export function getConnections(ctx: AiGraphContext, filter: ConnectionFilter = {}): ConnectionDTO[] {
  let connections = ctx.graph.connections;

  if (filter.nodeId) {
    const direction = filter.direction ?? "both";
    connections = connections.filter((c) => {
      const isOutgoing = c.fromNode === filter.nodeId;
      const isIncoming = c.toNode === filter.nodeId;
      if (direction === "incoming") return isIncoming;
      if (direction === "outgoing") return isOutgoing;
      return isOutgoing || isIncoming;
    });
  }
  if (filter.betweenNodeIds) {
    const ids = new Set(filter.betweenNodeIds);
    connections = connections.filter((c) => ids.has(c.fromNode) && ids.has(c.toNode));
  }

  return connections.map((c) => ({ id: c.id, source: { nodeId: c.fromNode, port: c.fromPin }, target: { nodeId: c.toNode, port: c.toPin } }));
}
