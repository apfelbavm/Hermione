import type { CommentBox } from "../engine/types";
import type { Camera } from "./camera";

// Tall enough for a wrapped title to show ~2 lines (see commentOverlay.ts) before clipping —
// deliberately not dynamic: every render/hit-test/containment call site treats this as one fixed
// constant, so a title needing more room just means resizing the box, not the header growing on its own.
export const COMMENT_HEADER_HEIGHT = 36;
export const COMMENT_RESIZE_HANDLE_SCREEN_SIZE = 14;
export const COMMENT_MIN_SIZE = 80;
export const DEFAULT_COMMENT_COLOR = "#ffffff";
export const DEFAULT_COMMENT_WIDTH = 300;
export const DEFAULT_COMMENT_HEIGHT = 200;

export interface CommentScreenRect {
  screenX: number;
  screenY: number;
  width: number;
  height: number;
  headerHeight: number;
}

export function computeCommentScreenRect(box: CommentBox, camera: Camera): CommentScreenRect {
  const topLeft = camera.worldToScreen(box.position.x, box.position.y);
  return {
    screenX: topLeft.x,
    screenY: topLeft.y,
    width: box.size.width * camera.zoom,
    height: box.size.height * camera.zoom,
    headerHeight: COMMENT_HEADER_HEIGHT * camera.zoom,
  };
}

export interface WorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function rectContains(outer: WorldRect, inner: WorldRect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

/** True if the two rects overlap at all (touching counts) — unlike rectContains, neither has to
 * fully enclose the other. Used for marquee selection, where a node need only be touched by the
 * drag box, not wholly inside it. */
export function rectIntersects(a: WorldRect, b: WorldRect): boolean {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
}
