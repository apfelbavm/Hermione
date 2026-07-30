import { Colors } from "../engine/color";
import { Graph } from "../engine/graph";
import type { Camera } from "./camera";
import {
  computeCommentScreenRect,
  COMMENT_RESIZE_HANDLE_SCREEN_SIZE,
  DEFAULT_COMMENT_COLOR,
} from "./commentGeometry";

const SELECTED_BORDER = "#e8b339";
const HEADER_COLOR_OPACITY = 0.5;
// The body uses the SAME user-chosen color as the header (see box.color), just far more
// transparent — a colored wash rather than the header's solid-reading band.
const BODY_COLOR_OPACITY = 0.14;

export function drawComments(
  ctx: CanvasRenderingContext2D,
  graph: Graph,
  camera: Camera,
  selectedCommentIds: ReadonlySet<string>,
): void {
  for (const box of graph.commentBoxes) {
    const rect = computeCommentScreenRect(box, camera);
    const selected = selectedCommentIds.has(box.id);
    const color = box.color ?? DEFAULT_COMMENT_COLOR;
    // The title bar background and the border are both the user-defined color (default
    // white), always rendered at 75% opacity so the box is never fully opaque — matching
    // Unreal's comment-box look. The body uses that same color, just far more transparent.
    const tint = Colors.hexToRgba(color, HEADER_COLOR_OPACITY);
    const bodyTint = Colors.hexToRgba(color, BODY_COLOR_OPACITY);

    ctx.fillStyle = bodyTint;
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
