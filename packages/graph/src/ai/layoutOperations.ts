import { getNodeDef } from "@hermione/graph/engine/registry";
import { connectPins } from "@hermione/graph/engine/graphMutations";
import type { NodeInstance } from "@hermione/graph/engine/nodeInstance";
import type { CommentBox, PinDef } from "@hermione/graph/engine/types";
import { computeNodeLayout, type NodeLayout } from "@hermione/graph/render/layout";
import { type AiGraphContext, findNodeOrThrow, visibleFunctions, visibleScripts, visibleVariables } from "./context";
import { computeRects, findOverlaps, GraphLayoutEngine, type LayoutEdgeInput, type LayoutNodeInput } from "./layoutEngine";
import {
  DEFAULT_LAYOUT_OPTIONS,
  type GraphBounds,
  type GraphLayoutSnapshot,
  type GroupLayoutInfo,
  type LayoutDirection,
  type LayoutMode,
  type LayoutOptions,
  type LayoutPositionChange,
  type LayoutResult,
  type NodeLayoutInfo,
  type NodeRect,
  type PortGeometry,
  resolveLayoutOptions,
  type SpatialRelationship,
  unionBounds,
} from "./layoutTypes";
import type { ValidationError } from "./types";
import { connect as applyConnect, disconnect as applyDisconnect } from "./mutations";
import { validateGraph } from "./validation";

// --- Node/port geometry (single source of truth: render/layout.ts's computeNodeLayout) ----------

function computeLayoutFor(ctx: AiGraphContext, node: NodeInstance): NodeLayout {
  const def = getNodeDef(node.type);
  const variables = visibleVariables(ctx);
  const functions = visibleFunctions(ctx);
  const scripts = visibleScripts(ctx);
  const pinDefs: PinDef[] = node.resolvePinDefs(variables, functions, scripts);
  const label = node.resolveNodeLabel(def, variables, functions, scripts);
  return computeNodeLayout(label, pinDefs, { showAddButton: !!def.addInstancePinEntry, compact: !!def.compact, headerOnly: !!def.headerOnly });
}

export function getNodeSize(ctx: AiGraphContext, node: NodeInstance): { width: number; height: number } {
  const layout = computeLayoutFor(ctx, node);
  return { width: layout.width, height: layout.height };
}

export function getNodeRect(ctx: AiGraphContext, node: NodeInstance): NodeRect {
  const size = getNodeSize(ctx, node);
  return { x: node.position.x, y: node.position.y, ...size };
}

function toNodeLayoutInfo(ctx: AiGraphContext, node: NodeInstance): NodeLayoutInfo {
  const layout = computeLayoutFor(ctx, node);
  const inputs: PortGeometry[] = [];
  const outputs: PortGeometry[] = [];
  for (const p of layout.pins) {
    const geo: PortGeometry = {
      nodeId: node.id,
      port: p.pin.id,
      label: p.pin.label,
      direction: p.pin.direction,
      side: p.pin.direction === "input" ? "left" : "right",
      offset: p.y,
      x: p.x,
      y: p.y,
    };
    (p.pin.direction === "input" ? inputs : outputs).push(geo);
  }
  return { nodeId: node.id, type: node.type, position: { ...node.position }, size: { width: layout.width, height: layout.height }, ports: { inputs, outputs } };
}

function toGroupLayoutInfo(box: CommentBox): GroupLayoutInfo {
  return { id: box.id, position: { ...box.position }, size: { ...box.size }, nodeIds: [...box.containedNodeIds] };
}

// --- graph.get_layout / graph.get_node_layout ----------------------------------------------------

export function getLayoutSnapshot(ctx: AiGraphContext): GraphLayoutSnapshot {
  const nodes = ctx.graph.nodes.map((n) => toNodeLayoutInfo(ctx, n));
  const groups = ctx.graph.commentBoxes.map(toGroupLayoutInfo);
  const rects = nodes.map((n) => ({ x: n.position.x, y: n.position.y, ...n.size }));
  const bounds = unionBounds(rects, DEFAULT_LAYOUT_OPTIONS.graphPadding);
  return { nodes, groups, bounds };
}

export function getNodeLayout(ctx: AiGraphContext, nodeId: string): NodeLayoutInfo {
  const node = findNodeOrThrow(ctx, nodeId);
  return toNodeLayoutInfo(ctx, node);
}

// --- graph.update_node_position -------------------------------------------------------------------

function invalidPositionError(x: number, y: number): ValidationError | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { code: "INVALID_OPERATION", message: `Position (${x}, ${y}) must be finite — NaN/Infinity coordinates are not allowed` };
  }
  return null;
}

export function updateNodePosition(ctx: AiGraphContext, nodeId: string, x: number, y: number): LayoutResult {
  const node = ctx.graph.nodes.find((n) => n.id === nodeId);
  if (!node) return { success: false, errors: [{ code: "UNKNOWN_NODE", nodeId, message: `Node "${nodeId}" not found` }], changes: [], bounds: { x: 0, y: 0, width: 0, height: 0 }, summary: "" };

  const posError = invalidPositionError(x, y);
  if (posError) return { success: false, errors: [posError], changes: [], bounds: { x: 0, y: 0, width: 0, height: 0 }, summary: "" };

  const from = { ...node.position };
  node.position = { x, y };
  const bounds = boundsOf(ctx);
  return { success: true, errors: [], changes: [{ nodeId, from, to: { x, y } }], bounds, summary: `Moved node "${nodeId}" to (${x}, ${y})` };
}

function boundsOf(ctx: AiGraphContext): GraphBounds {
  const rects = ctx.graph.nodes.map((n) => getNodeRect(ctx, n));
  return unionBounds(rects, DEFAULT_LAYOUT_OPTIONS.graphPadding);
}

// --- Shared layered-layout runner (graph.layout / graph.fit_layout / graph.layout_around) --------

export interface LayoutGraphRequest {
  scope?: "graph" | "subgraph" | "selection";
  nodeIds?: string[];
  direction?: LayoutDirection;
  mode?: LayoutMode;
  options?: LayoutOptions;
}

function targetNodes(ctx: AiGraphContext, request: LayoutGraphRequest): { nodes: NodeInstance[]; errors: ValidationError[] } {
  const scope = request.scope ?? "graph";
  if (scope === "graph") return { nodes: ctx.graph.nodes, errors: [] };

  if (!request.nodeIds || request.nodeIds.length === 0) {
    return { nodes: [], errors: [{ code: "INVALID_OPERATION", message: `scope "${scope}" requires at least one nodeId` }] };
  }
  const byId = new Map(ctx.graph.nodes.map((n) => [n.id, n] as const));
  const nodes: NodeInstance[] = [];
  for (const id of request.nodeIds) {
    const node = byId.get(id);
    if (!node) return { nodes: [], errors: [{ code: "UNKNOWN_NODE", nodeId: id, message: `Node "${id}" not found` }] };
    nodes.push(node);
  }
  return { nodes, errors: [] };
}

/** Runs the layered layout engine over `nodes` (using only connections between them) and applies
 * the result to their real `position`s. When `anchor` is "preserve-bounds" the whole result is
 * translated so its bounding box starts where the targeted nodes' bounding box used to be — used
 * by subgraph/selection scope and incremental/local modes so an unrelated part of the graph never
 * visibly jumps (section 19); "origin" (full-graph tidy) instead lays out from the graph padding
 * origin for a clean canvas. After translating, the whole cluster is nudged along the cross axis
 * until it no longer overlaps any node OUTSIDE the moved set (section 20/23). */
function runLayeredLayout(ctx: AiGraphContext, nodes: NodeInstance[], direction: LayoutDirection, options: Required<LayoutOptions>, anchor: "origin" | "preserve-bounds"): LayoutResult {
  if (nodes.length === 0) {
    return { success: true, errors: [], changes: [], bounds: boundsOf(ctx), summary: "Nothing to lay out" };
  }

  const movedIds = new Set(nodes.map((n) => n.id));
  const inputNodes: LayoutNodeInput[] = nodes.map((n) => ({ id: n.id, size: getNodeSize(ctx, n), position: n.position }));
  const edges: LayoutEdgeInput[] = ctx.graph.connections.filter((c) => movedIds.has(c.fromNode) && movedIds.has(c.toNode)).map((c) => ({ fromId: c.fromNode, toId: c.toNode }));

  const engine = new GraphLayoutEngine();
  const { positions } = engine.layout({ nodes: inputNodes, edges, options: { ...options, direction } });

  if (anchor === "preserve-bounds") {
    const originalRects = nodes.map((n) => getNodeRect(ctx, n));
    const originalBounds = unionBounds(originalRects, 0);
    const newRects = computeRects(inputNodes, positions);
    const newBounds = unionBounds(newRects, 0);
    const dx = originalBounds.x - newBounds.x;
    const dy = originalBounds.y - newBounds.y;
    for (const [id, pos] of positions) positions.set(id, { x: pos.x + dx, y: pos.y + dy });
  }

  resolveClusterCollisions(ctx, movedIds, inputNodes, positions, direction);

  const errors: ValidationError[] = [];
  for (const [, pos] of positions) {
    const err = invalidPositionError(pos.x, pos.y);
    if (err) errors.push(err);
  }
  if (errors.length > 0) return { success: false, errors, changes: [], bounds: boundsOf(ctx), summary: "" };

  const changes: LayoutPositionChange[] = [];
  for (const node of nodes) {
    const to = positions.get(node.id)!;
    if (node.position.x !== to.x || node.position.y !== to.y) {
      changes.push({ nodeId: node.id, from: { ...node.position }, to });
      node.position = to;
    }
  }
  syncGroupsToChildren(ctx, options.groupPadding);

  return { success: true, errors: [], changes, bounds: boundsOf(ctx), summary: `Laid out ${nodes.length} node(s)` };
}

/** Nudges the whole moved cluster (translated together, so its own internal layout never changes)
 * along the axis perpendicular to `direction` until none of its nodes overlap a node OUTSIDE the
 * moved set — bounded so a pathological graph can't loop forever. */
function resolveClusterCollisions(ctx: AiGraphContext, movedIds: Set<string>, movedInputs: LayoutNodeInput[], positions: Map<string, { x: number; y: number }>, direction: LayoutDirection): void {
  const others = ctx.graph.nodes.filter((n) => !movedIds.has(n.id)).map((n) => ({ id: n.id, rect: getNodeRect(ctx, n) }));
  if (others.length === 0) return;

  const step = direction === "LR" || direction === "RL" ? { x: 0, y: 40 } : { x: 40, y: 0 };
  const MAX_ITERATIONS = 200;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const movedRects = movedInputs.map((n) => ({ id: n.id, ...n.size, ...positions.get(n.id)! }));
    const collides = movedRects.some((mr) => others.some((o) => rectOverlap(mr, o.rect)));
    if (!collides) return;
    for (const [id, pos] of positions) positions.set(id, { x: pos.x + step.x, y: pos.y + step.y });
  }
}

function rectOverlap(a: NodeRect, b: NodeRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** Groups (CommentBox) act as layout containers (section 22) — after any layout mutation, expand
 * every group's box to keep containing its children rather than letting them escape it. Never
 * shrinks a group past its own padding-only minimum, and never touches containedNodeIds itself
 * (that's graph semantics, not layout). */
function syncGroupsToChildren(ctx: AiGraphContext, groupPadding: number): void {
  for (const box of ctx.graph.commentBoxes) {
    const childRects = box.containedNodeIds
      .map((id) => ctx.graph.nodes.find((n) => n.id === id))
      .filter((n): n is NodeInstance => !!n)
      .map((n) => getNodeRect(ctx, n));
    if (childRects.length === 0) continue;
    const bounds = unionBounds(childRects, groupPadding);
    box.position = { x: bounds.x, y: bounds.y };
    box.size = { width: bounds.width, height: bounds.height };
  }
}

export function layoutGraph(ctx: AiGraphContext, request: LayoutGraphRequest): LayoutResult {
  const options = resolveLayoutOptions(request.options ?? { direction: request.direction, mode: request.mode });
  const { nodes, errors } = targetNodes(ctx, request);
  if (errors.length > 0) return { success: false, errors, changes: [], bounds: boundsOf(ctx), summary: "" };

  const scope = request.scope ?? "graph";
  const mode = request.mode ?? options.mode;
  const anchor = scope === "graph" && (mode === "tidy" || mode === "auto") ? "origin" : "preserve-bounds";
  return runLayeredLayout(ctx, nodes, options.direction, options, anchor);
}

export function fitLayout(ctx: AiGraphContext, direction?: LayoutDirection, options?: LayoutOptions): LayoutResult {
  return layoutGraph(ctx, { scope: "graph", mode: "tidy", direction, options });
}

// --- graph.layout_around ---------------------------------------------------------------------------

export interface LayoutAroundRequest {
  anchorNodeId: string;
  nodeIds: string[];
  direction?: LayoutDirection;
  options?: LayoutOptions;
}

/** Lays out `nodeIds` (typically freshly-created nodes) relative to `anchorNodeId` without moving
 * the anchor or anything outside the given set (section 17's graph.layout_around) — runs the same
 * layered engine over anchor+nodeIds together, then discards the anchor's own (unchanged) position
 * from the result and keeps the relative placement of the rest. */
export function layoutAround(ctx: AiGraphContext, request: LayoutAroundRequest): LayoutResult {
  const anchor = ctx.graph.nodes.find((n) => n.id === request.anchorNodeId);
  if (!anchor) return { success: false, errors: [{ code: "UNKNOWN_NODE", nodeId: request.anchorNodeId, message: `Node "${request.anchorNodeId}" not found` }], changes: [], bounds: boundsOf(ctx), summary: "" };

  const others = request.nodeIds.map((id) => ctx.graph.nodes.find((n) => n.id === id)).filter((n): n is NodeInstance => !!n);
  if (others.length !== request.nodeIds.length) {
    const missing = request.nodeIds.find((id) => !ctx.graph.nodes.some((n) => n.id === id));
    return { success: false, errors: [{ code: "UNKNOWN_NODE", nodeId: missing, message: `Node "${missing}" not found` }], changes: [], bounds: boundsOf(ctx), summary: "" };
  }

  const options = resolveLayoutOptions(request.options ?? { direction: request.direction });
  const clusterNodes = [anchor, ...others];
  const clusterIds = new Set(clusterNodes.map((n) => n.id));
  const inputNodes: LayoutNodeInput[] = clusterNodes.map((n) => ({ id: n.id, size: getNodeSize(ctx, n), position: n.position }));
  const edges: LayoutEdgeInput[] = ctx.graph.connections.filter((c) => clusterIds.has(c.fromNode) && clusterIds.has(c.toNode)).map((c) => ({ fromId: c.fromNode, toId: c.toNode }));

  const engine = new GraphLayoutEngine();
  const { positions } = engine.layout({ nodes: inputNodes, edges, options: { ...options, direction: options.direction } });

  // Translate the whole cluster so the anchor lands exactly back on its own real (unmoved) position.
  const anchorNew = positions.get(anchor.id)!;
  const dx = anchor.position.x - anchorNew.x;
  const dy = anchor.position.y - anchorNew.y;
  for (const [id, pos] of positions) positions.set(id, { x: pos.x + dx, y: pos.y + dy });

  const movedIds = new Set(others.map((n) => n.id));
  resolveClusterCollisions(
    ctx,
    movedIds,
    inputNodes.filter((n) => movedIds.has(n.id)),
    positions,
    options.direction,
  );

  const changes: LayoutPositionChange[] = [];
  for (const node of others) {
    const to = positions.get(node.id)!;
    const err = invalidPositionError(to.x, to.y);
    if (err) return { success: false, errors: [err], changes: [], bounds: boundsOf(ctx), summary: "" };
    if (node.position.x !== to.x || node.position.y !== to.y) {
      changes.push({ nodeId: node.id, from: { ...node.position }, to });
      node.position = to;
    }
  }
  syncGroupsToChildren(ctx, options.groupPadding);

  return { success: true, errors: [], changes, bounds: boundsOf(ctx), summary: `Laid out ${others.length} node(s) around "${request.anchorNodeId}"` };
}

// --- graph.insert_between --------------------------------------------------------------------------

export interface InsertBetweenRequest {
  newNodeId: string;
  beforeNodeId: string;
  afterNodeId: string;
  beforePort?: string;
  afterPort?: string;
  options?: LayoutOptions;
}

export interface InsertBetweenResult extends LayoutResult {
  removedConnectionId?: string;
  createdConnectionIds: string[];
}

/** High-level "insert node X between A and B" operation (section 17/18): finds the existing
 * connection between beforeNodeId/afterNodeId, splices newNodeId into it (matching newNodeId's
 * own input/output ports by type against the connection it's replacing), then positions newNodeId
 * between A and B — shifting B (and whatever's downstream of it) only as far right as needed to
 * make room, never touching any other node. `newNodeId` must already exist in the graph (create it
 * via graph.apply_changes first); this operation only rewires + repositions it. */
export function insertBetween(ctx: AiGraphContext, request: InsertBetweenRequest): InsertBetweenResult {
  const newNode = ctx.graph.nodes.find((n) => n.id === request.newNodeId);
  const beforeNode = ctx.graph.nodes.find((n) => n.id === request.beforeNodeId);
  const afterNode = ctx.graph.nodes.find((n) => n.id === request.afterNodeId);
  const errorResult = (errors: ValidationError[]): InsertBetweenResult => ({ success: false, errors, changes: [], bounds: boundsOf(ctx), createdConnectionIds: [], summary: "" });

  if (!newNode) return errorResult([{ code: "UNKNOWN_NODE", nodeId: request.newNodeId, message: `Node "${request.newNodeId}" not found` }]);
  if (!beforeNode) return errorResult([{ code: "UNKNOWN_NODE", nodeId: request.beforeNodeId, message: `Node "${request.beforeNodeId}" not found` }]);
  if (!afterNode) return errorResult([{ code: "UNKNOWN_NODE", nodeId: request.afterNodeId, message: `Node "${request.afterNodeId}" not found` }]);

  const candidateConnections = ctx.graph.connections.filter((c) => c.fromNode === request.beforeNodeId && c.toNode === request.afterNodeId && (!request.beforePort || c.fromPin === request.beforePort) && (!request.afterPort || c.toPin === request.afterPort));
  const removedConnection = candidateConnections.find((c) => c.fromPin.startsWith("exec")) ?? candidateConnections[0];
  if (!removedConnection) {
    return errorResult([{ code: "INVALID_OPERATION", message: `No connection found from "${request.beforeNodeId}" to "${request.afterNodeId}" to insert into` }]);
  }

  const variables = visibleVariables(ctx);
  const functions = visibleFunctions(ctx);
  const scripts = visibleScripts(ctx);
  const beforePinDefs = beforeNode.resolvePinDefs(variables, functions, scripts);
  const afterPinDefs = afterNode.resolvePinDefs(variables, functions, scripts);
  const sourcePinDef = beforePinDefs.find((p) => p.id === removedConnection.fromPin);
  const targetPinDef = afterPinDefs.find((p) => p.id === removedConnection.toPin);
  if (!sourcePinDef || !targetPinDef) {
    return errorResult([{ code: "INVALID_OPERATION", message: "Could not resolve the pin types of the connection being replaced" }]);
  }

  const newNodePinDefs = newNode.resolvePinDefs(variables, functions, scripts);
  const newNodeInput = newNodePinDefs.find((p) => p.direction === "input" && p.type === sourcePinDef.type && (p.container ?? "single") === (sourcePinDef.container ?? "single"));
  const newNodeOutput = newNodePinDefs.find((p) => p.direction === "output" && p.type === targetPinDef.type && (p.container ?? "single") === (targetPinDef.container ?? "single"));
  if (!newNodeInput || !newNodeOutput) {
    return errorResult([{ code: "INVALID_OPERATION", nodeId: request.newNodeId, message: `Node "${request.newNodeId}" has no compatible input/output port pair (need input:${sourcePinDef.type}, output:${targetPinDef.type})` }]);
  }

  ctx.graph.removeConnection(variables, functions, removedConnection.id, scripts);

  const restoreOriginalConnection = () => {
    connectPins(ctx.graph, variables, functions, { fromNode: removedConnection.fromNode, fromPin: removedConnection.fromPin, toNode: removedConnection.toNode, toPin: removedConnection.toPin }, scripts);
  };

  const firstConnect = applyConnect(ctx, { op: "connect", source: { nodeId: request.beforeNodeId, port: removedConnection.fromPin }, target: { nodeId: request.newNodeId, port: newNodeInput.id } });
  if (firstConnect.errors.length > 0) {
    restoreOriginalConnection();
    return errorResult(firstConnect.errors);
  }
  const secondConnect = applyConnect(ctx, { op: "connect", source: { nodeId: request.newNodeId, port: newNodeOutput.id }, target: { nodeId: request.afterNodeId, port: removedConnection.toPin } });
  if (secondConnect.errors.length > 0) {
    applyDisconnect(ctx, { op: "disconnect", connectionId: firstConnect.connectionId });
    restoreOriginalConnection();
    return errorResult(secondConnect.errors);
  }

  const options = resolveLayoutOptions(request.options);
  const beforeRect = getNodeRect(ctx, beforeNode);
  const afterRect = getNodeRect(ctx, afterNode);
  const newSize = getNodeSize(ctx, newNode);
  const spacing = options.layerSpacing / 2;

  const newX = beforeRect.x + beforeRect.width + spacing;
  const newY = (beforeRect.y + beforeRect.height / 2 + (afterRect.y + afterRect.height / 2)) / 2 - newSize.height / 2;
  const changes: LayoutPositionChange[] = [];
  const oldNewNodePos = { ...newNode.position };
  newNode.position = { x: newX, y: newY };
  changes.push({ nodeId: newNode.id, from: oldNewNodePos, to: { ...newNode.position } });

  const requiredAfterX = newX + newSize.width + spacing;
  if (afterRect.x < requiredAfterX) {
    const delta = requiredAfterX - afterRect.x;
    for (const node of reachableDownstream(ctx, afterNode.id)) {
      const from = { ...node.position };
      node.position = { x: node.position.x + delta, y: node.position.y };
      changes.push({ nodeId: node.id, from, to: { ...node.position } });
    }
  }

  syncGroupsToChildren(ctx, options.groupPadding);
  const validation = validateGraph(ctx);

  return {
    success: true,
    errors: validation.errors,
    changes,
    bounds: boundsOf(ctx),
    removedConnectionId: removedConnection.id,
    createdConnectionIds: [firstConnect.connectionId!, secondConnect.connectionId!],
    summary: `Inserted "${request.newNodeId}" between "${request.beforeNodeId}" and "${request.afterNodeId}"`,
  };
}

/** BFS over outgoing connections starting at (and including) `startNodeId` — used to shift only
 * the part of the graph actually downstream of an insertion point, never unrelated nodes
 * (section 19). */
function reachableDownstream(ctx: AiGraphContext, startNodeId: string): NodeInstance[] {
  const visited = new Set<string>([startNodeId]);
  const queue = [startNodeId];
  const result: NodeInstance[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = ctx.graph.nodes.find((n) => n.id === id);
    if (node) result.push(node);
    for (const c of ctx.graph.connections) {
      if (c.fromNode === id && !visited.has(c.toNode)) {
        visited.add(c.toNode);
        queue.push(c.toNode);
      }
    }
  }
  return result;
}

// --- graph.align / graph.distribute ------------------------------------------------------------

export type AlignEdge = "left" | "right" | "top" | "bottom" | "center-horizontal" | "center-vertical";

export function align(ctx: AiGraphContext, nodeIds: string[], edge: AlignEdge): LayoutResult {
  const nodes = nodeIds.map((id) => ctx.graph.nodes.find((n) => n.id === id)).filter((n): n is NodeInstance => !!n);
  if (nodes.length !== nodeIds.length) {
    const missing = nodeIds.find((id) => !ctx.graph.nodes.some((n) => n.id === id));
    return { success: false, errors: [{ code: "UNKNOWN_NODE", nodeId: missing, message: `Node "${missing}" not found` }], changes: [], bounds: boundsOf(ctx), summary: "" };
  }
  if (nodes.length < 2) return { success: true, errors: [], changes: [], bounds: boundsOf(ctx), summary: "Nothing to align (need at least 2 nodes)" };

  const rects = nodes.map((n) => ({ node: n, rect: getNodeRect(ctx, n) }));
  const changes: LayoutPositionChange[] = [];

  const target = (() => {
    switch (edge) {
      case "left":
        return Math.min(...rects.map((r) => r.rect.x));
      case "right":
        return Math.max(...rects.map((r) => r.rect.x + r.rect.width));
      case "top":
        return Math.min(...rects.map((r) => r.rect.y));
      case "bottom":
        return Math.max(...rects.map((r) => r.rect.y + r.rect.height));
      case "center-horizontal":
        return (Math.min(...rects.map((r) => r.rect.x)) + Math.max(...rects.map((r) => r.rect.x + r.rect.width))) / 2;
      case "center-vertical":
        return (Math.min(...rects.map((r) => r.rect.y)) + Math.max(...rects.map((r) => r.rect.y + r.rect.height))) / 2;
    }
  })();

  for (const { node, rect } of rects) {
    const from = { ...node.position };
    let to = { ...node.position };
    switch (edge) {
      case "left":
        to = { x: target, y: node.position.y };
        break;
      case "right":
        to = { x: target - rect.width, y: node.position.y };
        break;
      case "top":
        to = { x: node.position.x, y: target };
        break;
      case "bottom":
        to = { x: node.position.x, y: target - rect.height };
        break;
      case "center-horizontal":
        to = { x: target - rect.width / 2, y: node.position.y };
        break;
      case "center-vertical":
        to = { x: node.position.x, y: target - rect.height / 2 };
        break;
    }
    if (from.x !== to.x || from.y !== to.y) {
      node.position = to;
      changes.push({ nodeId: node.id, from, to });
    }
  }

  return { success: true, errors: [], changes, bounds: boundsOf(ctx), summary: `Aligned ${nodes.length} node(s) to ${edge}` };
}

export function distribute(ctx: AiGraphContext, nodeIds: string[], axis: "horizontal" | "vertical"): LayoutResult {
  const nodes = nodeIds.map((id) => ctx.graph.nodes.find((n) => n.id === id)).filter((n): n is NodeInstance => !!n);
  if (nodes.length !== nodeIds.length) {
    const missing = nodeIds.find((id) => !ctx.graph.nodes.some((n) => n.id === id));
    return { success: false, errors: [{ code: "UNKNOWN_NODE", nodeId: missing, message: `Node "${missing}" not found` }], changes: [], bounds: boundsOf(ctx), summary: "" };
  }
  if (nodes.length < 3) return { success: true, errors: [], changes: [], bounds: boundsOf(ctx), summary: "Nothing to distribute (need at least 3 nodes)" };

  const rects = nodes.map((n) => ({ node: n, rect: getNodeRect(ctx, n) }));
  rects.sort((a, b) => (axis === "horizontal" ? a.rect.x - b.rect.x : a.rect.y - b.rect.y));

  const first = rects[0];
  const last = rects[rects.length - 1];
  const totalSpan = axis === "horizontal" ? last.rect.x + last.rect.width - first.rect.x : last.rect.y + last.rect.height - first.rect.y;
  const sumSizes = rects.reduce((sum, r) => sum + (axis === "horizontal" ? r.rect.width : r.rect.height), 0);
  const gap = rects.length > 1 ? Math.max(0, (totalSpan - sumSizes) / (rects.length - 1)) : 0;

  const changes: LayoutPositionChange[] = [];
  let cursor = axis === "horizontal" ? first.rect.x : first.rect.y;
  for (const { node, rect } of rects) {
    const from = { ...node.position };
    const to = axis === "horizontal" ? { x: cursor, y: node.position.y } : { x: node.position.x, y: cursor };
    if (from.x !== to.x || from.y !== to.y) {
      node.position = to;
      changes.push({ nodeId: node.id, from, to });
    }
    cursor += (axis === "horizontal" ? rect.width : rect.height) + gap;
  }

  return { success: true, errors: [], changes, bounds: boundsOf(ctx), summary: `Distributed ${nodes.length} node(s) ${axis}ly` };
}

// --- graph.get_spatial_relationships --------------------------------------------------------------

export function getSpatialRelationships(ctx: AiGraphContext, nodeIds?: string[]): SpatialRelationship[] {
  const nodes = nodeIds && nodeIds.length > 0 ? nodeIds.map((id) => ctx.graph.nodes.find((n) => n.id === id)).filter((n): n is NodeInstance => !!n) : ctx.graph.nodes;
  const rects = new Map(nodes.map((n) => [n.id, getNodeRect(ctx, n)] as const));
  const groupOf = new Map<string, string>();
  for (const box of ctx.graph.commentBoxes) {
    for (const id of box.containedNodeIds) groupOf.set(id, box.id);
  }

  const relationships: SpatialRelationship[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const ra = rects.get(a.id)!;
      const rb = rects.get(b.id)!;
      const ca = { x: ra.x + ra.width / 2, y: ra.y + ra.height / 2 };
      const cb = { x: rb.x + rb.width / 2, y: rb.y + rb.height / 2 };
      const distance = Math.hypot(ca.x - cb.x, ca.y - cb.y);

      if (rectOverlap(ra, rb)) {
        relationships.push({ a: a.id, b: b.id, relation: "overlaps", distance });
        continue;
      }
      const dx = cb.x - ca.x;
      const dy = cb.y - ca.y;
      if (Math.abs(dx) >= Math.abs(dy)) {
        relationships.push({ a: a.id, b: b.id, relation: dx >= 0 ? "right_of" : "left_of", distance });
      } else {
        relationships.push({ a: a.id, b: b.id, relation: dy >= 0 ? "below" : "above", distance });
      }
      if (groupOf.has(a.id) && groupOf.get(a.id) === groupOf.get(b.id)) {
        relationships.push({ a: a.id, b: b.id, relation: "same_group", distance });
      }
    }
  }
  return relationships;
}

// --- Layout validation (section 23) ---------------------------------------------------------------

export function findOverlappingNodes(ctx: AiGraphContext): Array<[string, string]> {
  const rects = ctx.graph.nodes.map((n) => ({ id: n.id, ...getNodeRect(ctx, n) }));
  return findOverlaps(rects);
}
