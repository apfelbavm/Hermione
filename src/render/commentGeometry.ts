import type { CommentBox } from "../engine/types";
import { worldToScreen, type Camera } from "./camera";

export const COMMENT_HEADER_HEIGHT = 26;
export const COMMENT_RESIZE_HANDLE_SCREEN_SIZE = 14;
export const COMMENT_MIN_SIZE = 80;

export interface CommentScreenRect {
  screenX: number;
  screenY: number;
  width: number;
  height: number;
  headerHeight: number;
}

export function computeCommentScreenRect(box: CommentBox, camera: Camera): CommentScreenRect {
  const topLeft = worldToScreen(camera, box.position.x, box.position.y);
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
