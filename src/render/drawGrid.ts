import type { Camera } from "./camera";
import { screenToWorld } from "./camera";
import { CANVAS_BG, GRID_LINE_MAJOR, GRID_LINE_MINOR } from "./palette";

const MINOR_SPACING = 20;
const MAJOR_EVERY = 5;

export function drawGrid(ctx: CanvasRenderingContext2D, camera: Camera, width: number, height: number): void {
  ctx.fillStyle = CANVAS_BG;
  ctx.fillRect(0, 0, width, height);

  const spacing = MINOR_SPACING * camera.zoom;
  if (spacing < 4) return; // too dense to draw usefully when zoomed way out

  const topLeft = screenToWorld(camera, 0, 0);
  const startX = Math.floor(topLeft.x / MINOR_SPACING) * MINOR_SPACING;
  const startY = Math.floor(topLeft.y / MINOR_SPACING) * MINOR_SPACING;

  ctx.lineWidth = 1;
  let col = Math.round(startX / MINOR_SPACING);
  for (let wx = startX, sx = (wx - camera.x) * camera.zoom; sx < width; wx += MINOR_SPACING, sx = (wx - camera.x) * camera.zoom) {
    ctx.strokeStyle = col % MAJOR_EVERY === 0 ? GRID_LINE_MAJOR : GRID_LINE_MINOR;
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, height);
    ctx.stroke();
    col++;
  }

  let row = Math.round(startY / MINOR_SPACING);
  for (let wy = startY, sy = (wy - camera.y) * camera.zoom; sy < height; wy += MINOR_SPACING, sy = (wy - camera.y) * camera.zoom) {
    ctx.strokeStyle = row % MAJOR_EVERY === 0 ? GRID_LINE_MAJOR : GRID_LINE_MINOR;
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(width, sy);
    ctx.stroke();
    row++;
  }
}
