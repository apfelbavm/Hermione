import { Colors } from "../engine/color";
import type { Camera } from "./camera";

export const GRID_SIZE = 20;
const MINOR_SPACING = GRID_SIZE;
const MAJOR_EVERY = 5;

/** Rounds a world-space position to the nearest grid intersection — used to snap newly
 * dropped/moved nodes onto the same grid this file draws, when the toolbar's "Snap to Grid"
 * toggle is on. */
export function snapPositionToGrid(position: { x: number; y: number }): { x: number; y: number } {
  return {
    x: Math.round(position.x / GRID_SIZE) * GRID_SIZE,
    y: Math.round(position.y / GRID_SIZE) * GRID_SIZE,
  };
}

export function drawGrid(ctx: CanvasRenderingContext2D, camera: Camera, width: number, height: number): void {
  ctx.fillStyle = Colors.CANVAS_BG;
  ctx.fillRect(0, 0, width, height);

  const spacing = MINOR_SPACING * camera.zoom;
  if (spacing >= 4) {
    // too dense to draw usefully when zoomed way out — the origin axes below still draw regardless,
    // since they're a landmark rather than a measuring aid.
    const topLeft = camera.screenToWorld(0, 0);
    const startX = Math.floor(topLeft.x / MINOR_SPACING) * MINOR_SPACING;
    const startY = Math.floor(topLeft.y / MINOR_SPACING) * MINOR_SPACING;

    ctx.lineWidth = 1;
    let col = Math.round(startX / MINOR_SPACING);
    for (let wx = startX, sx = (wx - camera.x) * camera.zoom; sx < width; wx += MINOR_SPACING, sx = (wx - camera.x) * camera.zoom) {
      ctx.strokeStyle = col % MAJOR_EVERY === 0 ? Colors.GRID_LINE_MAJOR : Colors.GRID_LINE_MINOR;
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, height);
      ctx.stroke();
      col++;
    }

    let row = Math.round(startY / MINOR_SPACING);
    for (let wy = startY, sy = (wy - camera.y) * camera.zoom; sy < height; wy += MINOR_SPACING, sy = (wy - camera.y) * camera.zoom) {
      ctx.strokeStyle = row % MAJOR_EVERY === 0 ? Colors.GRID_LINE_MAJOR : Colors.GRID_LINE_MINOR;
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(width, sy);
      ctx.stroke();
      row++;
    }
  }

  drawOriginAxes(ctx, camera, width, height);
}

/** The world-space x=0/y=0 axes — a fixed landmark distinct from the regular grid, so heavier and
 * plain black rather than the grid's own greys. Skipped entirely when panned/zoomed far enough
 * that the axis itself would land off-screen. */
function drawOriginAxes(ctx: CanvasRenderingContext2D, camera: Camera, width: number, height: number): void {
  const originX = (0 - camera.x) * camera.zoom;
  const originY = (0 - camera.y) * camera.zoom;

  ctx.lineWidth = 2;
  ctx.strokeStyle = Colors.AXIS_LINE;

  if (originX >= 0 && originX <= width) {
    ctx.beginPath();
    ctx.moveTo(originX, 0);
    ctx.lineTo(originX, height);
    ctx.stroke();
  }

  if (originY >= 0 && originY <= height) {
    ctx.beginPath();
    ctx.moveTo(0, originY);
    ctx.lineTo(width, originY);
    ctx.stroke();
  }
}
