import { getNodeDef, topLevelGroup } from "../engine/registry";
import type { Graph } from "../engine/types";
import type { Camera } from "./camera";
import type { NodeScreenGeometry } from "./nodeGeometry";
import { NODE_HEADER_HEIGHT, PIN_RADIUS } from "./layout";
import {
  NODE_BODY_BG,
  NODE_BORDER,
  NODE_BORDER_SELECTED,
  NODE_HEADER_BG,
  NODE_HEADER_DEFAULT,
  PIN_COLORS,
  TEXT_MUTED,
  TEXT_PRIMARY,
} from "./palette";
import type { PinType } from "../engine/types";

export function drawNodes(
  ctx: CanvasRenderingContext2D,
  graph: Graph,
  camera: Camera,
  geometries: ReadonlyMap<string, NodeScreenGeometry>,
  selectedNodeIds: ReadonlySet<string>,
  executingNodeId: string | null,
): void {
  // Text scales with zoom too — a camera zooming over world-space content, same as everything else.
  ctx.font = `${13 * camera.zoom}px Segoe UI, sans-serif`;
  ctx.textBaseline = "middle";

  for (const node of graph.nodes) {
    const def = getNodeDef(node.type);
    const geo = geometries.get(node.id);
    if (!geo) continue;

    ctx.beginPath();
    ctx.roundRect(geo.screenX, geo.screenY, geo.width, geo.height, 6 * camera.zoom);
    ctx.fillStyle = NODE_BODY_BG;
    ctx.fill();

    const headerHeight = NODE_HEADER_HEIGHT * camera.zoom;
    ctx.beginPath();
    ctx.roundRect(geo.screenX, geo.screenY, geo.width, headerHeight, [
      6 * camera.zoom,
      6 * camera.zoom,
      0,
      0,
    ]);
    ctx.fillStyle = NODE_HEADER_BG[topLevelGroup(def.group)] ?? NODE_HEADER_DEFAULT;
    ctx.fill();

    const isExecuting = executingNodeId === node.id;
    ctx.lineWidth = isExecuting ? 2.5 : selectedNodeIds.has(node.id) ? 2 : 1;
    ctx.strokeStyle = isExecuting
      ? "#5ad1ff"
      : selectedNodeIds.has(node.id)
        ? NODE_BORDER_SELECTED
        : NODE_BORDER;
    ctx.beginPath();
    ctx.roundRect(geo.screenX, geo.screenY, geo.width, geo.height, 6 * camera.zoom);
    ctx.stroke();

    ctx.fillStyle = TEXT_PRIMARY;
    ctx.textAlign = "left";
    ctx.fillText(def.label, geo.screenX + 10 * camera.zoom, geo.screenY + headerHeight / 2);

    for (const pinLayout of geo.layout.pins) {
      const pos = geo.pinScreen[pinLayout.pin.id];
      drawPinShape(ctx, pos.x, pos.y, PIN_RADIUS * camera.zoom, pinLayout.pin.type);

      ctx.fillStyle = TEXT_MUTED;
      if (pinLayout.pin.direction === "input") {
        ctx.textAlign = "left";
        ctx.fillText(pinLayout.pin.label, pos.x + 10 * camera.zoom, pos.y);
      } else {
        ctx.textAlign = "right";
        ctx.fillText(pinLayout.pin.label, pos.x - 10 * camera.zoom, pos.y);
      }
    }
  }
  ctx.textAlign = "left";
}

function drawPinShape(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  type: PinType,
): void {
  ctx.fillStyle = PIN_COLORS[type];
  if (type === "exec") {
    ctx.beginPath();
    ctx.moveTo(x - r, y - r);
    ctx.lineTo(x + r * 1.2, y);
    ctx.lineTo(x - r, y + r);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}
