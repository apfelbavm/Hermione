import { Colors } from "../engine/color";
import type { Graph } from "../engine/types";
import type { Camera } from "./camera";
import {
  computeCommentScreenRect,
  COMMENT_RESIZE_HANDLE_SCREEN_SIZE,
  DEFAULT_COMMENT_COLOR,
} from "./commentGeometry";

const BOX_FILL = "rgba(255, 255, 255, 0.04)";
const SELECTED_BORDER = "#e8b339";
const COLOR_OPACITY = 0.5;

export function drawComments(
  ctx: CanvasRenderingContext2D,
  graph: Graph,
  camera: Camera,
  selectedCommentId: string | null,
): void {
  for (const box of graph.commentBoxes) {
    const rect = computeCommentScreenRect(box, camera);
    const selected = selectedCommentId === box.id;
    // The title bar background and the border are both the user-defined color (default
    // white), always rendered at 75% opacity so the box is never fully opaque — matching
    // Unreal's comment-box look. The body stays a neutral, low-opacity fill.
    const tint = Colors.hexToRgba(box.color ?? DEFAULT_COMMENT_COLOR, COLOR_OPACITY);

    ctx.fillStyle = BOX_FILL;
    ctx.fillRect(rect.screenX, rect.screenY, rect.width, rect.height);

    ctx.fillStyle = tint;
    ctx.fillRect(rect.screenX, rect.screenY, rect.width, rect.headerHeight);

    ctx.lineWidth = selected ? 2 : 1;
    ctx.strokeStyle = selected ? SELECTED_BORDER : tint;
    ctx.strokeRect(rect.screenX, rect.screenY, rect.width, rect.height);

    ctx.fillStyle = tint;
    const hs = COMMENT_RESIZE_HANDLE_SCREEN_SIZE;
    ctx.beginPath();
    ctx.moveTo(rect.screenX + rect.width, rect.screenY + rect.height - hs);
    ctx.lineTo(rect.screenX + rect.width, rect.screenY + rect.height);
    ctx.lineTo(rect.screenX + rect.width - hs, rect.screenY + rect.height);
    ctx.closePath();
    ctx.fill();
  }
}
