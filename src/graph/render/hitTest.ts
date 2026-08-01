import { Graph } from "../engine/graph";
import { PinDef } from "../engine/types";
import { bezierControlPoints, sampleBezier } from "./bezier";
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
export function hitTestNodeAddButton(graph: Graph, geometries: ReadonlyMap<string, NodeScreenGeometry>, screenX: number, screenY: number): NodeAddButtonHit | null {
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

export function hitTestPin(graph: Graph, geometries: ReadonlyMap<string, NodeScreenGeometry>, screenX: number, screenY: number): PinHit | null {
  for (const node of graph.nodes) {
    const geo = geometries.get(node.id);
    if (!geo) continue;
    for (const pinLayout of geo.layout.pins) {
      // An "enum" pin is never wireable (see isPinTypeCompatible) and always shows its own literal
      // dropdown widget — excluding it here means a click/hover right on its dot falls through to
      // whatever's next (the node body), instead of starting a wire-drag that could only ever fail.
      if (pinLayout.pin.type === "enum") continue;
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

/** Which corner of a comment box is being grabbed to resize it — all four are resizable, even
 * though the drawn triangle affordance (see drawComments.ts) only ever appears at "se", matching
 * Unreal's own comment box (a visible handle in one corner, but every corner is actually live). */
export type CommentCorner = "nw" | "ne" | "sw" | "se";

export interface CommentResizeHit {
  kind: "comment-resize";
  commentId: string;
  corner: CommentCorner;
}

export interface CommentHeaderHit {
  kind: "comment-header";
  commentId: string;
}

export function hitTestCommentResizeHandle(graph: Graph, camera: Camera, screenX: number, screenY: number): CommentResizeHit | null {
  for (let i = graph.commentBoxes.length - 1; i >= 0; i--) {
    const box = graph.commentBoxes[i];
    const rect = computeCommentScreenRect(box, camera);
    const hs = COMMENT_RESIZE_HANDLE_SCREEN_SIZE;
    const corners: { corner: CommentCorner; x: number; y: number }[] = [
      { corner: "nw", x: rect.screenX, y: rect.screenY },
      { corner: "ne", x: rect.screenX + rect.width, y: rect.screenY },
      { corner: "sw", x: rect.screenX, y: rect.screenY + rect.height },
      { corner: "se", x: rect.screenX + rect.width, y: rect.screenY + rect.height },
    ];
    for (const c of corners) {
      if (screenX >= c.x - hs && screenX <= c.x + hs && screenY >= c.y - hs && screenY <= c.y + hs) {
        return { kind: "comment-resize", commentId: box.id, corner: c.corner };
      }
    }
  }
  return null;
}

export function hitTestCommentHeader(graph: Graph, camera: Camera, screenX: number, screenY: number): CommentHeaderHit | null {
  for (let i = graph.commentBoxes.length - 1; i >= 0; i--) {
    const box = graph.commentBoxes[i];
    const rect = computeCommentScreenRect(box, camera);
    if (screenX >= rect.screenX && screenX <= rect.screenX + rect.width && screenY >= rect.screenY && screenY <= rect.screenY + rect.headerHeight) {
      return { kind: "comment-header", commentId: box.id };
    }
  }
  return null;
}

export function hitTestNode(graph: Graph, geometries: ReadonlyMap<string, NodeScreenGeometry>, screenX: number, screenY: number): NodeHit | null {
  for (let i = graph.nodes.length - 1; i >= 0; i--) {
    const node = graph.nodes[i];
    const geo = geometries.get(node.id);
    if (!geo) continue;
    if (screenX >= geo.screenX && screenX <= geo.screenX + geo.width && screenY >= geo.screenY && screenY <= geo.screenY + geo.height) {
      return { kind: "node", nodeId: node.id };
    }
  }
  return null;
}

export interface WireHit {
  kind: "wire";
  connectionId: string;
}

const WIRE_HIT_DISTANCE = 6;

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  const closestX = ax + t * dx;
  const closestY = ay + t * dy;
  return Math.hypot(px - closestX, py - closestY);
}

/** Right-click-on-a-wire support (see main.ts's "Add Reroute Node" menu item) — samples the same
 * bezier curve drawWires.ts renders (see bezier.ts) into a polyline and finds the closest one
 * within WIRE_HIT_DISTANCE screen pixels, scaled by zoom so the click tolerance feels consistent at
 * any zoom level. */
export function hitTestWire(graph: Graph, geometries: ReadonlyMap<string, NodeScreenGeometry>, camera: Camera, screenX: number, screenY: number): WireHit | null {
  const tolerance = WIRE_HIT_DISTANCE * camera.zoom;
  for (let i = graph.connections.length - 1; i >= 0; i--) {
    const conn = graph.connections[i];
    const fromGeo = geometries.get(conn.fromNode);
    const toGeo = geometries.get(conn.toNode);
    if (!fromGeo || !toGeo) continue;
    const from = fromGeo.pinScreen[conn.fromPin];
    const to = toGeo.pinScreen[conn.toPin];
    if (!from || !to) continue;

    const points = sampleBezier(bezierControlPoints(from.x, from.y, to.x, to.y));
    for (let j = 0; j < points.length - 1; j++) {
      const d = distanceToSegment(screenX, screenY, points[j].x, points[j].y, points[j + 1].x, points[j + 1].y);
      if (d <= tolerance) return { kind: "wire", connectionId: conn.id };
    }
  }
  return null;
}
