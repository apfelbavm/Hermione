import { resolveNodeLabel } from "../engine/graphMutations";
import { getNodeDef, topLevelGroup } from "../engine/registry";
import type { FunctionDef, Graph, NodeDef, NodeInstance, PinDef, Variable } from "../engine/types";
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

/** A node bound to a Variable (Get/Set) is colored by that variable's TYPE (the same color its pin
 * would be) instead of the generic "Variables" group color — so at a glance, a graph full of
 * getters/setters reads by what KIND of data they move, not just that they're variable nodes. */
function resolveNodeHeaderColor(node: NodeInstance, def: NodeDef, variables: Variable[]): string {
  if (node.variableId) {
    const variable = variables.find((v) => v.id === node.variableId);
    if (variable) return PIN_COLORS[variable.type];
  }
  return NODE_HEADER_BG[topLevelGroup(def.group)] ?? NODE_HEADER_DEFAULT;
}

export function drawNodes(
  ctx: CanvasRenderingContext2D,
  graph: Graph,
  camera: Camera,
  geometries: ReadonlyMap<string, NodeScreenGeometry>,
  selectedNodeIds: ReadonlySet<string>,
  executingNodeId: string | null,
  variables: Variable[],
  functions: FunctionDef[],
): void {
  // Text scales with zoom too — a camera zooming over world-space content, same as everything else.
  ctx.font = `${13 * camera.zoom}px Segoe UI, sans-serif`;
  ctx.textBaseline = "middle";

  for (const node of graph.nodes) {
    const def = getNodeDef(node.type);
    const geo = geometries.get(node.id);
    if (!geo) continue;

    // Dimmed rather than hidden — its wires stay visible too (drawWires.ts doesn't check this),
    // so it's clear at a glance both that it's disabled and what it would otherwise still connect to.
    ctx.globalAlpha = node.disabled ? 0.45 : 1;

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
    ctx.fillStyle = resolveNodeHeaderColor(node, def, variables);
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
    ctx.fillText(
      resolveNodeLabel(node, def, variables, functions),
      geo.screenX + 10 * camera.zoom,
      geo.screenY + headerHeight / 2,
    );

    for (const pinLayout of geo.layout.pins) {
      const pos = geo.pinScreen[pinLayout.pin.id];
      drawPinShape(ctx, pos.x, pos.y, PIN_RADIUS * camera.zoom, pinLayout.pin);

      ctx.fillStyle = TEXT_MUTED;
      if (pinLayout.pin.direction === "input") {
        ctx.textAlign = "left";
        ctx.fillText(pinLayout.pin.label, pos.x + 10 * camera.zoom, pos.y);
      } else {
        ctx.textAlign = "right";
        ctx.fillText(pinLayout.pin.label, pos.x - 10 * camera.zoom, pos.y);
      }
    }

    if (geo.addButtonScreen) {
      const r = geo.addButtonScreen;
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.width, r.height, 3 * camera.zoom);
      ctx.fillStyle = NODE_HEADER_DEFAULT;
      ctx.fill();
      ctx.strokeStyle = NODE_BORDER;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = TEXT_PRIMARY;
      ctx.textAlign = "center";
      ctx.fillText("+", r.x + r.width / 2, r.y + r.height / 2 + 1);
    }
  }
  ctx.textAlign = "left";
  ctx.globalAlpha = 1;
}

function drawPinShape(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  pin: PinDef,
): void {
  // Map pins are colored by their VALUE type (pin.type) — the key type isn't drawn on the dot,
  // only visible via the type-select controls (see typedValueInput.ts).
  ctx.fillStyle = PIN_COLORS[pin.type];
  if (pin.type === "exec") {
    ctx.beginPath();
    ctx.moveTo(x - r, y - r);
    ctx.lineTo(x + r * 1.2, y);
    ctx.lineTo(x - r, y + r);
    ctx.closePath();
    ctx.fill();
    return;
  }

  switch (pin.container) {
    case "array":
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
      break;
    case "set":
      // A ring: filled circle at the element's radius, plus a stroked circle just outside it.
      ctx.beginPath();
      ctx.arc(x, y, r * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, r * 1.15, 0, Math.PI * 2);
      ctx.lineWidth = 1;
      ctx.strokeStyle = PIN_COLORS[pin.type];
      ctx.stroke();
      break;
    case "map":
      // A diamond (square rotated 45°).
      ctx.beginPath();
      ctx.moveTo(x, y - r * 1.2);
      ctx.lineTo(x + r * 1.2, y);
      ctx.lineTo(x, y + r * 1.2);
      ctx.lineTo(x - r * 1.2, y);
      ctx.closePath();
      ctx.fill();
      break;
    default:
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
  }
}
