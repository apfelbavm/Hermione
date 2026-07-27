import { resolvePinDefs } from "../engine/graphMutations";
import type { Graph } from "../engine/types";
import type { Camera } from "./camera";
import type { NodeScreenGeometry } from "./nodeGeometry";
import { PIN_COLORS } from "./palette";
import type { WireDragState } from "../state/store";

export function drawWires(
  ctx: CanvasRenderingContext2D,
  graph: Graph,
  camera: Camera,
  geometries: ReadonlyMap<string, NodeScreenGeometry>,
  firedConnectionIds: ReadonlySet<string>,
): void {
  for (const conn of graph.connections) {
    const fromGeo = geometries.get(conn.fromNode);
    const toGeo = geometries.get(conn.toNode);
    if (!fromGeo || !toGeo) continue;

    const from = fromGeo.pinScreen[conn.fromPin];
    const to = toGeo.pinScreen[conn.toPin];
    if (!from || !to) continue;

    const fromNode = graph.nodes.find((n) => n.id === conn.fromNode)!;
    const pinDefs = resolvePinDefs(fromNode, graph.variables);
    const pinDef = pinDefs.find((p) => p.id === conn.fromPin);
    const color = pinDef ? PIN_COLORS[pinDef.type] : "#888";

    const fired = firedConnectionIds.has(conn.id);
    ctx.strokeStyle = fired ? "#5ad1ff" : color;
    ctx.lineWidth = (fired ? 3 : 2) * camera.zoom;
    drawBezierWire(ctx, from.x, from.y, to.x, to.y);
  }
}

export function drawWireDragPreview(
  ctx: CanvasRenderingContext2D,
  wireDrag: WireDragState,
): void {
  ctx.strokeStyle = PIN_COLORS[wireDrag.pinType];
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  drawBezierWire(ctx, wireDrag.fromScreen.x, wireDrag.fromScreen.y, wireDrag.toScreen.x, wireDrag.toScreen.y);
  ctx.setLineDash([]);
}

function drawBezierWire(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  const dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.bezierCurveTo(x1 + dx, y1, x2 - dx, y2, x2, y2);
  ctx.stroke();
}
