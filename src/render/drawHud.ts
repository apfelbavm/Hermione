import { Colors } from "../engine/color";

const MARGIN = 24;
const FONT_SIZE = 26;

/** Bottom-right "where am I" readout — the cursor's current WORLD position (not screen pixels),
 * since that's the coordinate space nodes/positions actually live in. Deliberately faint (low
 * opacity) and drawn LAST so it always reads as a HUD overlay sitting above the graph rather than
 * competing with it, without needing a separate DOM element synced on every frame. */
export function drawMouseCoordinates(
  ctx: CanvasRenderingContext2D,
  worldPos: { x: number; y: number },
  canvasWidth: number,
  canvasHeight: number,
): void {
  const text = `${Math.round(worldPos.x)}, ${Math.round(worldPos.y)}`;

  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.font = `${FONT_SIZE}px Segoe UI, sans-serif`;
  ctx.fillStyle = Colors.TEXT_PRIMARY;
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillText(text, canvasWidth - MARGIN, canvasHeight - MARGIN);
  ctx.restore();
}
