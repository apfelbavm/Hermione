import type { Graph, PinDef } from "../engine/types";
import type { Camera } from "./camera";
import { computeCommentScreenRect, COMMENT_RESIZE_HANDLE_SCREEN_SIZE } from "./commentGeometry";
import type { NodeScreenGeometry } from "./nodeGeometry";

export interface PinHit {
  kind: "pin";
  nodeId: string;
  pinId: string;
  pin: PinDef;
  screenX: number;
  screenY: number;
}

export interface NodeHit {
  kind: "node";
  nodeId: string;
}

export interface NodeAddButtonHit {
  kind: "node-add-button";
  nodeId: string;
}

/** Hit-tests the "+" add-entry affordance drawn on a node with NodeDef.addInstancePinEntry (see
 * NodeScreenGeometry.addButtonScreen) — checked ahead of hitTestNode so clicking it doesn't also
 * start a node drag. */
export function hitTestNodeAddButton(
  graph: Graph,
  geometries: ReadonlyMap<string, NodeScreenGeometry>,
  screenX: number,
  screenY: number,
): NodeAddButtonHit | null {
  for (let i = graph.nodes.length - 1; i >= 0; i--) {
    const node = graph.nodes[i];
    const rect = geometries.get(node.id)?.addButtonScreen;
    if (!rect) continue;
    if (screenX >= rect.x && screenX <= rect.x + rect.width && screenY >= rect.y && screenY <= rect.y + rect.height) {
      return { kind: "node-add-button", nodeId: node.id };
    }
  }
  return null;
}

const PIN_HIT_RADIUS = 9;

export function hitTestPin(
  graph: Graph,
  geometries: ReadonlyMap<string, NodeScreenGeometry>,
  screenX: number,
  screenY: number,
): PinHit | null {
  for (const node of graph.nodes) {
    const geo = geometries.get(node.id);
    if (!geo) continue;
    for (const pinLayout of geo.layout.pins) {
      const pos = geo.pinScreen[pinLayout.pin.id];
      const dx = pos.x - screenX;
      const dy = pos.y - screenY;
      if (dx * dx + dy * dy <= PIN_HIT_RADIUS * PIN_HIT_RADIUS) {
        return {
          kind: "pin",
          nodeId: node.id,
          pinId: pinLayout.pin.id,
          pin: pinLayout.pin,
          screenX: pos.x,
          screenY: pos.y,
        };
      }
    }
  }
  return null;
}

export interface CommentResizeHit {
  kind: "comment-resize";
  commentId: string;
}

export interface CommentHeaderHit {
  kind: "comment-header";
  commentId: string;
}

export function hitTestCommentResizeHandle(
  graph: Graph,
  camera: Camera,
  screenX: number,
  screenY: number,
): CommentResizeHit | null {
  for (let i = graph.commentBoxes.length - 1; i >= 0; i--) {
    const box = graph.commentBoxes[i];
    const rect = computeCommentScreenRect(box, camera);
    const hs = COMMENT_RESIZE_HANDLE_SCREEN_SIZE;
    const hx = rect.screenX + rect.width;
    const hy = rect.screenY + rect.height;
    if (screenX >= hx - hs && screenX <= hx && screenY >= hy - hs && screenY <= hy) {
      return { kind: "comment-resize", commentId: box.id };
    }
  }
  return null;
}

export function hitTestCommentHeader(
  graph: Graph,
  camera: Camera,
  screenX: number,
  screenY: number,
): CommentHeaderHit | null {
  for (let i = graph.commentBoxes.length - 1; i >= 0; i--) {
    const box = graph.commentBoxes[i];
    const rect = computeCommentScreenRect(box, camera);
    if (
      screenX >= rect.screenX &&
      screenX <= rect.screenX + rect.width &&
      screenY >= rect.screenY &&
      screenY <= rect.screenY + rect.headerHeight
    ) {
      return { kind: "comment-header", commentId: box.id };
    }
  }
  return null;
}

export function hitTestNode(
  graph: Graph,
  geometries: ReadonlyMap<string, NodeScreenGeometry>,
  screenX: number,
  screenY: number,
): NodeHit | null {
  for (let i = graph.nodes.length - 1; i >= 0; i--) {
    const node = graph.nodes[i];
    const geo = geometries.get(node.id);
    if (!geo) continue;
    if (
      screenX >= geo.screenX &&
      screenX <= geo.screenX + geo.width &&
      screenY >= geo.screenY &&
      screenY <= geo.screenY + geo.height
    ) {
      return { kind: "node", nodeId: node.id };
    }
  }
  return null;
}
