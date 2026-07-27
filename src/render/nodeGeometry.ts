import { getNodeDef } from "../engine/registry";
import { resolvePinDefs } from "../engine/graphMutations";
import type { FunctionDef, Graph, NodeInstance, PinDef, Variable } from "../engine/types";
import { computeNodeLayout, type NodeLayout } from "./layout";
import { worldToScreen, type Camera } from "./camera";

export interface NodeScreenGeometry {
  screenX: number;
  screenY: number;
  width: number;
  height: number;
  pinScreen: Record<string, { x: number; y: number }>;
  layout: NodeLayout;
}

export function computeNodeScreenGeometry(
  node: NodeInstance,
  label: string,
  pinDefs: PinDef[],
  camera: Camera,
): NodeScreenGeometry {
  const layout = computeNodeLayout(label, pinDefs);
  const screen = worldToScreen(camera, node.position.x, node.position.y);
  const pinScreen: Record<string, { x: number; y: number }> = {};
  for (const p of layout.pins) {
    pinScreen[p.pin.id] = { x: screen.x + p.x * camera.zoom, y: screen.y + p.y * camera.zoom };
  }
  return {
    screenX: screen.x,
    screenY: screen.y,
    width: layout.width * camera.zoom,
    height: layout.height * camera.zoom,
    pinScreen,
    layout,
  };
}

/** A node's bounding box in world units (independent of camera) — used for comment-box containment tests. */
export function computeNodeWorldRect(node: NodeInstance, pinDefs: PinDef[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const def = getNodeDef(node.type);
  const layout = computeNodeLayout(def.label, pinDefs);
  return { x: node.position.x, y: node.position.y, width: layout.width, height: layout.height };
}

/** Computes screen geometry for every node once per frame, reused by drawing, hit-testing, and the DOM overlay.
 * `variables` must be the full VISIBLE set (see getVisibleVariables) and `functions` the root's function
 * list — `graph` may be a function's body, whose own `.variables`/`.functions` aren't the complete picture. */
export function computeAllNodeGeometries(
  graph: Graph,
  camera: Camera,
  variables: Variable[],
  functions: FunctionDef[],
): Map<string, NodeScreenGeometry> {
  const map = new Map<string, NodeScreenGeometry>();
  for (const node of graph.nodes) {
    const def = getNodeDef(node.type);
    const pinDefs = resolvePinDefs(node, variables, functions);
    map.set(node.id, computeNodeScreenGeometry(node, def.label, pinDefs, camera));
  }
  return map;
}
