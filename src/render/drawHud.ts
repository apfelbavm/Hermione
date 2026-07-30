import { Colors } from "../engine/color";

const MARGIN = 24;
const FONT_SIZE = 32;

/** Bottom-right "where am I" readout — the cursor's current WORLD position (not screen pixels),
 * since that's the coordinate space nodes/positions actually live in.*/
export function drawMouseCoordinates(ctx: CanvasRenderingContext2D, worldPos: { x: number; y: number }, canvasWidth: number, canvasHeight: number): void {
  const text = `X=${Math.round(worldPos.x)}, Y=${Math.round(worldPos.y)}`;

  ctx.save();
  ctx.globalAlpha = 0.15;
  ctx.font = `${FONT_SIZE}px Segoe UI, sans-serif`;
  ctx.fillStyle = Colors.TEXT_PRIMARY;
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillText(text, canvasWidth - MARGIN, canvasHeight - MARGIN);
  ctx.restore();
}
