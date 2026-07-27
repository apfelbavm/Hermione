import type { MarqueeSelectionState } from "../state/store";
import { worldToScreen, type Camera } from "./camera";
import { hexToRgba } from "./palette";

const MARQUEE_COLOR = "#5ad1ff";

/** Draws the in-progress rubber-band selection box. Stored in world coordinates, converted to
 * screen space here (like everything else) so it stays correct if the camera zooms mid-drag. */
export function drawMarqueeSelection(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  marquee: MarqueeSelectionState,
): void {
  const start = worldToScreen(camera, marquee.startWorld.x, marquee.startWorld.y);
  const current = worldToScreen(camera, marquee.currentWorld.x, marquee.currentWorld.y);
  const x = Math.min(start.x, current.x);
  const y = Math.min(start.y, current.y);
  const width = Math.abs(current.x - start.x);
  const height = Math.abs(current.y - start.y);

  ctx.fillStyle = hexToRgba(MARQUEE_COLOR, 0.12);
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = MARQUEE_COLOR;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, height);
}
