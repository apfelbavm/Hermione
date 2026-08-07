import { Colors } from "@hermione/graph/engine/color";
import type { CodeScriptDef, FunctionDef, Variable } from "@hermione/graph/engine/types";
import { bezierControlPoints } from "./bezier";
import type { Camera } from "./camera";
import type { NodeScreenGeometry } from "./nodeGeometry";
import type { WireDragState } from "@hermione/graph/state/store";
import { Graph } from "@hermione/graph/engine/graph";

export function drawWires(ctx: CanvasRenderingContext2D, graph: Graph, camera: Camera, geometries: ReadonlyMap<string, NodeScreenGeometry>, firedConnectionIds: ReadonlySet<string>, variables: Variable[], functions: FunctionDef[], scripts: CodeScriptDef[] = []): void {
  for (const conn of graph.connections) {
    const fromGeo = geometries.get(conn.fromNode);
    const toGeo = geometries.get(conn.toNode);
    if (!fromGeo || !toGeo) continue;

    const from = fromGeo.pinScreen[conn.fromPin];
    const to = toGeo.pinScreen[conn.toPin];
    if (!from || !to) continue;

    const fromNode = graph.nodes.find((n) => n.id === conn.fromNode)!;
    const pinDefs = fromNode.resolvePinDefs(variables, functions, scripts);
    const pinDef = pinDefs.find((p) => p.id === conn.fromPin);
    const color = pinDef ? Colors.PIN_COLORS[pinDef.type] : "#888";

    const fired = firedConnectionIds.has(conn.id);
    ctx.strokeStyle = fired ? "#5ad1ff" : color;
    ctx.lineWidth = (fired ? 3 : 2) * camera.zoom;
    drawBezierWire(ctx, from.x, from.y, to.x, to.y);
  }
}

export function drawWireDragPreview(ctx: CanvasRenderingContext2D, wireDrag: WireDragState): void {
  ctx.strokeStyle = Colors.PIN_COLORS[wireDrag.pinType];
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  for (const from of wireDrag.fromScreens) {
    // drawBezierWire always treats its (x1,y1) as the OUTPUT/exit side (curve bulges right out of
    // it) and (x2,y2) as the INPUT/entry side (curve pulls in from the left into it) — correct as-
    // is when dragging off an output pin, but backwards when dragging off an INPUT pin, where the
    // anchor itself is the entry side and the mouse (toScreen) stands in for the eventual output —
    // so the argument order swaps to match.
    if (wireDrag.anchorDirection === "output") {
      drawBezierWire(ctx, from.x, from.y, wireDrag.toScreen.x, wireDrag.toScreen.y);
    } else {
      drawBezierWire(ctx, wireDrag.toScreen.x, wireDrag.toScreen.y, from.x, from.y);
    }
  }
  ctx.setLineDash([]);
}

function drawBezierWire(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  const g = bezierControlPoints(x1, y1, x2, y2);
  ctx.beginPath();
  ctx.moveTo(g.x1, g.y1);
  ctx.bezierCurveTo(g.cx1, g.cy1, g.cx2, g.cy2, g.x2, g.y2);
  ctx.stroke();
}
