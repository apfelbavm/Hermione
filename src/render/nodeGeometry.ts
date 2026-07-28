import { getNodeDef } from "../engine/registry";
import { resolveNodeLabel, resolvePinDefs } from "../engine/graphMutations";
import type { FunctionDef, Graph, NodeInstance, PinDef, Variable } from "../engine/types";
import { computeNodeLayout, type NodeLayout } from "./layout";
import { worldToScreen, type Camera } from "./camera";

export interface NodeScreenGeometry {
  screenX: number;
  screenY: number;
  width: number;
  height: number;
  pinScreen: Record<string, { x: number; y: number }>;
  /** Screen-space rect of the "+" add-entry affordance, only for a node whose type has
   * NodeDef.addInstancePinEntry (see NodeLayout.addButton). */
  addButtonScreen?: { x: number; y: number; width: number; height: number };
  layout: NodeLayout;
}

export function computeNodeScreenGeometry(
  node: NodeInstance,
  label: string,
  pinDefs: PinDef[],
  camera: Camera,
  showAddButton: boolean = false,
  compact: boolean = false,
): NodeScreenGeometry {
  const layout = computeNodeLayout(label, pinDefs, { showAddButton, compact });
  const screen = worldToScreen(camera, node.position.x, node.position.y);
  const pinScreen: Record<string, { x: number; y: number }> = {};
  for (const p of layout.pins) {
    pinScreen[p.pin.id] = { x: screen.x + p.x * camera.zoom, y: screen.y + p.y * camera.zoom };
  }
  const addButtonScreen = layout.addButton
    ? {
        x: screen.x + layout.addButton.x * camera.zoom,
        y: screen.y + layout.addButton.y * camera.zoom,
        width: layout.addButton.width * camera.zoom,
        height: layout.addButton.height * camera.zoom,
      }
    : undefined;
  return {
    screenX: screen.x,
    screenY: screen.y,
    width: layout.width * camera.zoom,
    height: layout.height * camera.zoom,
    pinScreen,
    addButtonScreen,
    layout,
  };
}

/** A node's bounding box in world units (independent of camera) — used for comment-box containment tests. */
export function computeNodeWorldRect(node: NodeInstance, pinDefs: PinDef[], variables: Variable[], functions: FunctionDef[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const def = getNodeDef(node.type);
  const layout = computeNodeLayout(resolveNodeLabel(node, def, variables, functions), pinDefs, {
    showAddButton: !!def.addInstancePinEntry,
    compact: !!def.compact,
  });
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
    map.set(
      node.id,
      computeNodeScreenGeometry(
        node,
        resolveNodeLabel(node, def, variables, functions),
        pinDefs,
        camera,
        !!def.addInstancePinEntry,
        !!def.compact,
      ),
    );
  }
  return map;
}
