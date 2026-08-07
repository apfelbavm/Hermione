import { type LayoutDirection, type NodeRect, type NodeSize, rectsIntersect, resolveLayoutOptions, type LayoutOptions } from "./layoutTypes";

export interface LayoutNodeInput {
  id: string;
  size: NodeSize;
  /** Existing world position, if any — used only to seed layer-ordering/tie-breaking so a repeated
   * layout of an unchanged graph doesn't reorder nodes arbitrarily (see section 33 "layout
   * stability"). Never required. */
  position?: { x: number; y: number };
}

export interface LayoutEdgeInput {
  fromId: string;
  toId: string;
}

export interface EngineLayoutRequest {
  nodes: LayoutNodeInput[];
  edges: LayoutEdgeInput[];
  options?: LayoutOptions;
}

export interface EngineLayoutResult {
  positions: Map<string, { x: number; y: number }>;
  /** Assigned layer index per node id — exposed mainly for tests/debugging. */
  layers: Map<string, number>;
}

/** Deterministic layered ("Sugiyama-style") DAG layout engine — see section 6/7 of the design.
 * Pure geometry: knows nothing about NodeInstance/Graph/pins. Given the same nodes+edges+options
 * it always produces the same layer assignment and node order (only coordinates can shift if
 * node sizes change), so repeated layout of an unchanged graph never causes drift. */
export class GraphLayoutEngine {
  layout(request: EngineLayoutRequest): EngineLayoutResult {
    const options = resolveLayoutOptions(request.options);
    const nodes = request.nodes;
    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges = request.edges.filter((e) => nodeIds.has(e.fromId) && nodeIds.has(e.toId) && e.fromId !== e.toId);

    const acyclicEdges = breakCycles(nodeIds, edges);
    const layers = assignLayers(nodeIds, acyclicEdges);
    const layerGroups = groupByLayer(nodes, layers);
    orderLayers(layerGroups, edges, nodes);

    const positions = computePositions(layerGroups, nodes, options.direction, options);
    return { positions, layers };
  }
}

/** DFS-based back-edge detection: any edge that closes a cycle (points to a node already on the
 * current DFS stack) is dropped for the purposes of LAYER assignment only — the real connection
 * list is never touched, this only prevents an infinite/undefined layer for a cyclic subgraph. */
function breakCycles(nodeIds: Set<string>, edges: LayoutEdgeInput[]): LayoutEdgeInput[] {
  const out = new Map<string, string[]>();
  for (const id of nodeIds) out.set(id, []);
  for (const e of edges) out.get(e.fromId)!.push(e.toId);

  const state = new Map<string, "visiting" | "done">();
  const acyclic: LayoutEdgeInput[] = [];
  const dropped = new Set<string>(); // "fromId->toId" keys

  function visit(id: string): void {
    state.set(id, "visiting");
    for (const next of out.get(id) ?? []) {
      const s = state.get(next);
      if (s === "visiting") {
        dropped.add(`${id}->${next}`);
        continue;
      }
      if (s !== "done") visit(next);
    }
    state.set(id, "done");
  }

  for (const id of nodeIds) {
    if (!state.has(id)) visit(id);
  }
  for (const e of edges) {
    if (!dropped.has(`${e.fromId}->${e.toId}`)) acyclic.push(e);
  }
  return acyclic;
}

/** Longest-path layering over the (now acyclic) edge set via Kahn's algorithm — a node with no
 * incoming edges starts at layer 0; every other node sits one layer past its deepest predecessor. */
function assignLayers(nodeIds: Set<string>, edges: LayoutEdgeInput[]): Map<string, number> {
  const inDegree = new Map<string, number>();
  const out = new Map<string, string[]>();
  for (const id of nodeIds) {
    inDegree.set(id, 0);
    out.set(id, []);
  }
  for (const e of edges) {
    inDegree.set(e.toId, (inDegree.get(e.toId) ?? 0) + 1);
    out.get(e.fromId)!.push(e.toId);
  }

  const layers = new Map<string, number>();
  const queue: string[] = [];
  for (const id of nodeIds) {
    if (inDegree.get(id) === 0) {
      layers.set(id, 0);
      queue.push(id);
    }
  }

  const remainingIn = new Map(inDegree);
  while (queue.length > 0) {
    const id = queue.shift()!;
    const layer = layers.get(id) ?? 0;
    for (const next of out.get(id) ?? []) {
      layers.set(next, Math.max(layers.get(next) ?? 0, layer + 1));
      remainingIn.set(next, remainingIn.get(next)! - 1);
      if (remainingIn.get(next) === 0) queue.push(next);
    }
  }

  // Anything left unassigned only happens if breakCycles somehow missed an edge — defensively
  // give it layer 0 rather than leaving it undefined.
  for (const id of nodeIds) {
    if (!layers.has(id)) layers.set(id, 0);
  }
  return layers;
}

function groupByLayer(nodes: LayoutNodeInput[], layers: Map<string, number>): string[][] {
  const maxLayer = Math.max(0, ...nodes.map((n) => layers.get(n.id) ?? 0));
  const groups: string[][] = Array.from({ length: maxLayer + 1 }, () => []);
  for (const node of nodes) {
    groups[layers.get(node.id) ?? 0].push(node.id);
  }
  return groups;
}

/** Barycenter/median crossing-minimization heuristic (section 11): repeatedly sweeps
 * layer-by-layer left-to-right then right-to-left, reordering each layer by the average position
 * of its neighbors in the adjacent layer already visited this sweep. Deterministic and heuristic
 * only, not a perfect optimizer, per the design's own explicit allowance. */
function orderLayers(layerGroups: string[][], edges: LayoutEdgeInput[], nodes: LayoutNodeInput[]): void {
  // Seed initial order within each layer using existing position (perpendicular axis) when
  // available, else the node's original array order — keeps a re-layout of an unchanged graph
  // stable instead of shuffling ties arbitrarily (section 33).
  const nodeIndex = new Map(nodes.map((n, i) => [n.id, i] as const));
  for (const layer of layerGroups) {
    layer.sort((a, b) => {
      const na = nodes[nodeIndex.get(a)!];
      const nb = nodes[nodeIndex.get(b)!];
      const posA = na.position?.y;
      const posB = nb.position?.y;
      if (posA !== undefined && posB !== undefined && posA !== posB) return posA - posB;
      return nodeIndex.get(a)! - nodeIndex.get(b)!;
    });
  }

  const neighborsOf = new Map<string, string[]>();
  for (const e of edges) {
    if (!neighborsOf.has(e.fromId)) neighborsOf.set(e.fromId, []);
    if (!neighborsOf.has(e.toId)) neighborsOf.set(e.toId, []);
    neighborsOf.get(e.fromId)!.push(e.toId);
    neighborsOf.get(e.toId)!.push(e.fromId);
  }

  function order(positionOf: Map<string, number>, layer: string[]): void {
    const barycenter = new Map<string, number>();
    layer.forEach((id, i) => barycenter.set(id, i));
    for (const id of layer) {
      const neighbors = (neighborsOf.get(id) ?? []).filter((n) => positionOf.has(n));
      if (neighbors.length === 0) continue;
      const avg = neighbors.reduce((sum, n) => sum + positionOf.get(n)!, 0) / neighbors.length;
      barycenter.set(id, avg);
    }
    layer.sort((a, b) => barycenter.get(a)! - barycenter.get(b)!);
  }

  const SWEEPS = 4;
  for (let sweep = 0; sweep < SWEEPS; sweep++) {
    const forward = sweep % 2 === 0;
    const positionOf = new Map<string, number>();
    const range = forward ? layerGroups.keys() : [...layerGroups.keys()].reverse();
    for (const li of range) {
      const layer = layerGroups[li];
      if ((forward && li > 0) || (!forward && li < layerGroups.length - 1)) order(positionOf, layer);
      layer.forEach((id, i) => positionOf.set(id, i));
    }
  }
}

function computePositions(layerGroups: string[][], nodes: LayoutNodeInput[], direction: LayoutDirection, options: Required<LayoutOptions>): Map<string, { x: number; y: number }> {
  const sizeOf = new Map(nodes.map((n) => [n.id, n.size] as const));
  const horizontal = direction === "LR" || direction === "RL";
  const reversed = direction === "RL" || direction === "BT";

  // Along the layer axis: cumulative offset by each layer's max extent (width for LR/RL, height for TB/BT).
  const layerExtent = layerGroups.map((layer) => Math.max(0, ...layer.map((id) => (horizontal ? sizeOf.get(id)!.width : sizeOf.get(id)!.height))));
  const layerOffset: number[] = [];
  let cursor = options.graphPadding;
  for (const extent of layerExtent) {
    layerOffset.push(cursor);
    cursor += extent + options.layerSpacing;
  }

  // Within a layer: stack nodes along the cross axis, centered on the tallest/widest layer's total span.
  const crossSpacing = horizontal ? options.nodeSpacingY : options.nodeSpacingX;
  const layerSpans = layerGroups.map((layer) => {
    const sizes = layer.map((id) => (horizontal ? sizeOf.get(id)!.height : sizeOf.get(id)!.width));
    return sizes.reduce((sum, s) => sum + s, 0) + Math.max(0, layer.length - 1) * crossSpacing;
  });
  const maxSpan = Math.max(0, ...layerSpans);

  const positions = new Map<string, { x: number; y: number }>();
  layerGroups.forEach((layer, li) => {
    const span = layerSpans[li];
    let crossCursor = options.graphPadding + (maxSpan - span) / 2;
    for (const id of layer) {
      const size = sizeOf.get(id)!;
      const along = layerOffset[li];
      const across = crossCursor;
      const x = horizontal ? along : across;
      const y = horizontal ? across : along;
      positions.set(id, { x, y });
      crossCursor += (horizontal ? size.height : size.width) + crossSpacing;
    }
  });

  if (reversed) {
    // Mirror the layer axis so layer 0 ends up on the right (RL) / bottom (BT) instead of the
    // left/top computePositions above always produces.
    const totalExtent = cursor - options.layerSpacing;
    for (const [id, pos] of positions) {
      const size = sizeOf.get(id)!;
      if (horizontal) positions.set(id, { x: totalExtent - (pos.x - options.graphPadding) - size.width + options.graphPadding, y: pos.y });
      else positions.set(id, { x: pos.x, y: totalExtent - (pos.y - options.graphPadding) - size.height + options.graphPadding });
    }
  }

  return positions;
}

export function computeRects(nodes: LayoutNodeInput[], positions: Map<string, { x: number; y: number }>): NodeRect[] {
  return nodes.map((n) => {
    const pos = positions.get(n.id) ?? n.position ?? { x: 0, y: 0 };
    return { x: pos.x, y: pos.y, width: n.size.width, height: n.size.height };
  });
}

export function findOverlaps(rects: Array<NodeRect & { id: string }>): Array<[string, string]> {
  const overlaps: Array<[string, string]> = [];
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (rectsIntersect(rects[i], rects[j])) overlaps.push([rects[i].id, rects[j].id]);
    }
  }
  return overlaps;
}
