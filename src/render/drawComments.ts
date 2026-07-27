import type { Graph } from "../engine/types";
import type { Camera } from "./camera";
import { computeCommentScreenRect, COMMENT_RESIZE_HANDLE_SCREEN_SIZE } from "./commentGeometry";

const BOX_FILL = "rgba(255, 255, 255, 0.04)";
const BOX_BORDER = "rgba(255, 255, 255, 0.22)";
const HEADER_FILL = "rgba(255, 255, 255, 0.09)";
const SELECTED_BORDER = "#e8b339";

export function drawComments(
  ctx: CanvasRenderingContext2D,
  graph: Graph,
  camera: Camera,
  selectedCommentId: string | null,
): void {
  for (const box of graph.commentBoxes) {
    const rect = computeCommentScreenRect(box, camera);
    const selected = selectedCommentId === box.id;

    ctx.fillStyle = box.color ?? BOX_FILL;
    ctx.fillRect(rect.screenX, rect.screenY, rect.width, rect.height);

    ctx.fillStyle = HEADER_FILL;
    ctx.fillRect(rect.screenX, rect.screenY, rect.width, rect.headerHeight);

    ctx.lineWidth = selected ? 2 : 1;
    ctx.strokeStyle = selected ? SELECTED_BORDER : BOX_BORDER;
    ctx.strokeRect(rect.screenX, rect.screenY, rect.width, rect.height);

    ctx.fillStyle = BOX_BORDER;
    const hs = COMMENT_RESIZE_HANDLE_SCREEN_SIZE;
    ctx.beginPath();
    ctx.moveTo(rect.screenX + rect.width, rect.screenY + rect.height - hs);
    ctx.lineTo(rect.screenX + rect.width, rect.screenY + rect.height);
    ctx.lineTo(rect.screenX + rect.width - hs, rect.screenY + rect.height);
    ctx.closePath();
    ctx.fill();
  }
}
