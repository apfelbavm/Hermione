import { Colors } from "../engine/color";
import { resolveNodeLabel } from "../engine/graphMutations";
import { connectionsTouchingPin } from "../engine/graphQueries";
import { getNodeDef, topLevelGroup } from "../engine/registry";
import type { CodeScriptDef, FunctionDef, Graph, NodeDef, NodeInstance, PinDef, Variable } from "../engine/types";
import type { Camera } from "./camera";
import type { NodeScreenGeometry } from "./nodeGeometry";
import { NODE_HEADER_HEIGHT, PIN_RADIUS } from "./layout";

/** A node bound to a Variable (Get/Set) is colored by that variable's TYPE (the same color its pin
 * would be) instead of the generic "Variables" group color — so at a glance, a graph full of
 * getters/setters reads by what KIND of data they move, not just that they're variable nodes. */
function resolveNodeHeaderColor(node: NodeInstance, def: NodeDef, variables: Variable[]): string {
  if (node.variableId) {
    const variable = variables.find((v) => v.id === node.variableId);
    if (variable) return Colors.PIN_COLORS[variable.type];
  }
  return Colors.NODE_HEADER_BG[topLevelGroup(def.group)] ?? Colors.NODE_HEADER_DEFAULT;
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
  scripts: CodeScriptDef[] = [],
  latentNodeIds: ReadonlySet<string> = new Set(),
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

    const isExecuting = executingNodeId === node.id;
    const borderWidth = isExecuting ? 2.5 : selectedNodeIds.has(node.id) ? 2 : 1;
    const borderColor = isExecuting
      ? "#5ad1ff"
      : selectedNodeIds.has(node.id)
        ? Colors.NODE_BORDER_SELECTED
        : Colors.NODE_BORDER;

    if (def.compact) {
      // A reroute "knot" (see NodeDef.compact) — just a small body + border, no header bar or
      // label; its pins (drawn below, same as any other node) carry all the visual meaning.
      ctx.beginPath();
      ctx.roundRect(geo.screenX, geo.screenY, geo.width, geo.height, 4 * camera.zoom);
      ctx.fillStyle = Colors.NODE_BODY_BG;
      ctx.fill();
      ctx.lineWidth = borderWidth;
      ctx.strokeStyle = borderColor;
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.roundRect(geo.screenX, geo.screenY, geo.width, geo.height, 6 * camera.zoom);
      ctx.fillStyle = Colors.NODE_BODY_BG;
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

      ctx.lineWidth = borderWidth;
      ctx.strokeStyle = borderColor;
      ctx.beginPath();
      ctx.roundRect(geo.screenX, geo.screenY, geo.width, geo.height, 6 * camera.zoom);
      ctx.stroke();

      if (latentNodeIds.has(node.id)) {
        drawLatentIcon(ctx, geo.screenX + geo.width, geo.screenY, 8 * camera.zoom);
      }

      ctx.fillStyle = Colors.TEXT_PRIMARY;
      ctx.textAlign = "left";
      ctx.fillText(
        resolveNodeLabel(node, def, variables, functions, scripts),
        geo.screenX + 10 * camera.zoom,
        geo.screenY + headerHeight / 2,
      );
    }

    for (const pinLayout of geo.layout.pins) {
      const pos = geo.pinScreen[pinLayout.pin.id];
      const connected = connectionsTouchingPin(graph, node.id, pinLayout.pin.id).length > 0;
      drawPinShape(ctx, pos.x, pos.y, PIN_RADIUS * camera.zoom, pinLayout.pin, connected);

      ctx.fillStyle = Colors.TEXT_MUTED;
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
      ctx.fillStyle = Colors.NODE_HEADER_DEFAULT;
      ctx.fill();
      ctx.strokeStyle = Colors.NODE_BORDER;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = Colors.TEXT_PRIMARY;
      ctx.textAlign = "center";
      ctx.fillText("+", r.x + r.width / 2, r.y + r.height / 2 + 1);
    }
  }
  ctx.textAlign = "left";
  ctx.globalAlpha = 1;
}

/** Draws a small clock icon straddling (cx, cy) — used centered on a node's top-right CORNER so
 * it sits half outside the node's own border, matching Unreal's latent-node marker (a node that
 * genuinely spans real time/multiple ticks, e.g. Delay, or a Function/loop that contains one —
 * see NodeDef.latent/latentBodyPin and engine/latency.ts). */
function drawLatentIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#e8b339";
  ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.strokeStyle = "#7a5a12";
  ctx.stroke();

  ctx.strokeStyle = "#3a2a08";
  ctx.lineWidth = Math.max(1, r * 0.18);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx, cy - r * 0.55);
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + r * 0.4, cy - r * 0.15);
  ctx.stroke();
}

function drawPinShape(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  pin: PinDef,
  connected: boolean,
): void {
  // Map pins are colored by their VALUE type (pin.type) — the key type isn't drawn on the dot,
  // only visible via the type-select controls (see typedValueInput.ts).
  const color = Colors.PIN_COLORS[pin.type];
  ctx.fillStyle = color;
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
      // A 3x3 grid of filled quads with gaps — mirrors the container-select dropdown's icon (see
      // typedValueInput.ts's createContainerIcon).
      drawContainerGrid(ctx, x, y, r, false);
      break;
    case "set":
      drawSetBraces(ctx, x, y, r);
      break;
    case "map":
      // Same 3x3 grid as array, but the middle row's first two quads merge into one wide quad
      // spanning columns 1-2 — visually distinct from a plain Array pin.
      drawContainerGrid(ctx, x, y, r, true);
      break;
    default:
      // A single-container data pin is hollow (border only) until something's actually wired to
      // it, filled once it is — same "empty vs. filled circle" convention Unreal uses for its own
      // data pins. Exec pins (above) and the container shapes stay solid regardless.
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      if (connected) {
        ctx.fill();
      } else {
        ctx.lineWidth = Math.max(1, r * 0.3);
        ctx.strokeStyle = color;
        ctx.stroke();
      }
  }
}

/** Draws a 3x3 grid of filled quads centered at (x, y), each `quad` size apart with a gap between
 * them. When `mergeMiddleRowLeft` is set (Map pins), the middle row's first two quads merge into
 * one wide quad spanning columns 1-2 instead of being drawn separately (Array pins never merge). */
function drawContainerGrid(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  mergeMiddleRowLeft: boolean,
): void {
  const quad = r * 0.42;
  const gap = r * 0.18;
  const step = quad + gap;
  const colX = [x - step, x, x + step];
  const rowY = [y - step, y, y + step];

  for (let row = 0; row < 3; row++) {
    if (row === 1 && mergeMiddleRowLeft) {
      const left = colX[0] - quad / 2;
      const right = colX[1] + quad / 2;
      ctx.fillRect(left, rowY[1] - quad / 2, right - left, quad);
      ctx.fillRect(colX[2] - quad / 2, rowY[1] - quad / 2, quad, quad);
    } else {
      for (let col = 0; col < 3; col++) {
        ctx.fillRect(colX[col] - quad / 2, rowY[row] - quad / 2, quad, quad);
      }
    }
  }
}

/** Draws a "{ }" curly-brace pair centered at (x, y) — the Set pin icon. Restores whatever font
 * was active beforehand, since drawNodes.ts reuses ctx.font for every subsequent label/pin. */
function drawSetBraces(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const savedFont = ctx.font;
  const savedAlign = ctx.textAlign;
  ctx.font = `${Math.round(r * 2.4)}px Georgia, serif`;
  ctx.textAlign = "center";
  ctx.fillText("{", x - r * 0.55, y);
  ctx.fillText("}", x + r * 0.55, y);
  ctx.font = savedFont;
  ctx.textAlign = savedAlign;
}
