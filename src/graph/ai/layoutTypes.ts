import type { ValidationError } from "./types";

/** Flow direction for a layered layout — see GraphLayoutEngine. Defaults to "LR" (left-to-right),
 * matching how exec chains read left-to-right on the canvas today. */
export type LayoutDirection = "LR" | "RL" | "TB" | "BT";

/** How aggressively a layout operation is allowed to move nodes that already have a position:
 * - "tidy"/"auto": recompute a clean layout for the whole scope, ignoring existing positions.
 * - "incremental": keep existing positions where possible, only resolving what changed.
 * - "local": lay out only the given node set, leaving everything outside it untouched.
 * - "insert": place newly-created nodes relative to already-positioned neighbors. */
export type LayoutMode = "tidy" | "auto" | "incremental" | "local" | "insert";

export interface LayoutOptions {
  direction?: LayoutDirection;
  mode?: LayoutMode;
  /** Gap between nodes sharing a layer, along the axis perpendicular to `direction`. */
  nodeSpacingX?: number;
  nodeSpacingY?: number;
  /** Gap between successive layers, along the `direction` axis. */
  layerSpacing?: number;
  groupPadding?: number;
  graphPadding?: number;
}

export const DEFAULT_LAYOUT_OPTIONS: Required<LayoutOptions> = {
  direction: "LR",
  mode: "tidy",
  nodeSpacingX: 40,
  nodeSpacingY: 40,
  layerSpacing: 100,
  groupPadding: 24,
  graphPadding: 60,
};

export function resolveLayoutOptions(options?: LayoutOptions): Required<LayoutOptions> {
  const defined: Partial<LayoutOptions> = {};
  if (options) {
    for (const [key, value] of Object.entries(options)) {
      if (value !== undefined) (defined as Record<string, unknown>)[key] = value;
    }
  }
  return { ...DEFAULT_LAYOUT_OPTIONS, ...defined };
}

export interface NodeSize {
  width: number;
  height: number;
}

export interface NodeRect extends NodeSize {
  x: number;
  y: number;
}

export type PortSide = "left" | "right" | "top" | "bottom";

/** A single port's geometry relative to its own node's rectangle — NOT world/screen coordinates
 * (add the node's position to get world space). Derived from the same computeNodeLayout the
 * canvas renderer/hit-testing already use (see render/layout.ts) — never a second source of truth. */
export interface PortGeometry {
  nodeId: string;
  port: string;
  label: string;
  direction: "input" | "output";
  side: PortSide;
  /** Distance from the node's top-left corner along the axis the port row runs on (vertical
   * offset for a left/right port, horizontal offset for a top/bottom one). */
  offset: number;
  /** Node-local coordinates of the port's connection point. */
  x: number;
  y: number;
}

export interface NodeLayoutInfo {
  nodeId: string;
  type: string;
  position: { x: number; y: number };
  size: NodeSize;
  ports: { inputs: PortGeometry[]; outputs: PortGeometry[] };
}

export interface GroupLayoutInfo {
  id: string;
  position: { x: number; y: number };
  size: NodeSize;
  nodeIds: string[];
}

export interface GraphBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GraphLayoutSnapshot {
  nodes: NodeLayoutInfo[];
  groups: GroupLayoutInfo[];
  bounds: GraphBounds;
}

export interface LayoutPositionChange {
  nodeId: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

export interface LayoutResult {
  success: boolean;
  errors: ValidationError[];
  changes: LayoutPositionChange[];
  bounds: GraphBounds;
  summary: string;
}

export type SpatialRelation = "left_of" | "right_of" | "above" | "below" | "overlaps" | "same_group";

export interface SpatialRelationship {
  a: string;
  b: string;
  relation: SpatialRelation;
  distance: number;
}

export function rectsIntersect(a: NodeRect, b: NodeRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function unionBounds(rects: NodeRect[], padding: number): GraphBounds {
  if (rects.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.width));
  const maxY = Math.max(...rects.map((r) => r.y + r.height));
  return { x: minX - padding, y: minY - padding, width: maxX - minX + padding * 2, height: maxY - minY + padding * 2 };
}
