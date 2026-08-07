import { getNodeDef } from "@hermione/graph/engine/registry";
import type { CodeScriptDef, FunctionDef, PinDef, Variable } from "@hermione/graph/engine/types";
import { computeNodeLayout, type NodeLayout } from "./layout";
import type { Camera } from "./camera";
import { Graph } from "@hermione/graph/engine/graph";
import { NodeInstance } from "@hermione/graph/engine/nodeInstance";

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

export function computeNodeScreenGeometry(node: NodeInstance, label: string, pinDefs: PinDef[], camera: Camera, showAddButton: boolean = false, compact: boolean = false, headerOnly: boolean = false): NodeScreenGeometry {
  const layout = computeNodeLayout(label, pinDefs, { showAddButton, compact, headerOnly });
  const screen = camera.worldToScreen(node.position.x, node.position.y);
  const pinScreen: Record<string, { x: number; y: number }> = {};
  for (const p of layout.pins) {
    pinScreen[p.pin.id] = {
      x: screen.x + p.x * camera.zoom,
      y: screen.y + p.y * camera.zoom,
    };
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
export function computeNodeWorldRect(
  node: NodeInstance,
  pinDefs: PinDef[],
  variables: Variable[],
  functions: FunctionDef[],
  scripts: CodeScriptDef[] = [],
): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const def = getNodeDef(node.type);
  const layout = computeNodeLayout(node.resolveNodeLabel(def, variables, functions, scripts), pinDefs, {
    showAddButton: !!def.addInstancePinEntry,
    compact: !!def.compact,
    headerOnly: !!def.headerOnly,
  });
  return {
    x: node.position.x,
    y: node.position.y,
    width: layout.width,
    height: layout.height,
  };
}

/** Computes screen geometry for every node once per frame, reused by drawing, hit-testing, and the DOM overlay.
 * `variables` must be the full VISIBLE set (see getVisibleVariables) and `functions`/`scripts` the root's
 * function/script lists — `graph` may be a function's body, whose own `.variables`/`.functions`/`.scripts`
 * aren't the complete picture. */
export function computeAllNodeGeometries(graph: Graph, camera: Camera, variables: Variable[], functions: FunctionDef[], scripts: CodeScriptDef[] = []): Map<string, NodeScreenGeometry> {
  const map = new Map<string, NodeScreenGeometry>();
  for (const node of graph.nodes) {
    const def = getNodeDef(node.type);
    const pinDefs = node.resolvePinDefs(variables, functions, scripts);
    map.set(node.id, computeNodeScreenGeometry(node, node.resolveNodeLabel(def, variables, functions, scripts), pinDefs, camera, !!def.addInstancePinEntry, !!def.compact, !!def.headerOnly));
  }
  return map;
}
