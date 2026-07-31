import { Colors } from "../engine/color";
import { connectionsTouchingPin } from "../engine/graphQueries";
import { getNodeDef, topLevelGroup } from "../engine/registry";
import type { CodeScriptDef, FunctionDef, NodeDef, PinDef, Variable } from "../engine/types";
import type { Camera } from "./camera";
import type { NodeScreenGeometry } from "./nodeGeometry";
import { NODE_HEADER_HEIGHT, PIN_RADIUS } from "./layout";
import { Graph } from "../engine/graph";
import { NodeInstance } from "../engine/nodeInstance";

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
  simulating: boolean = false,
): void {
  // Text scales with zoom too — a camera zooming over world-space content, same as everything else.
  ctx.font = `${13 * camera.zoom}px Segoe UI, sans-serif`;
  ctx.textBaseline = "middle";

  for (const node of graph.nodes) {
    const def = getNodeDef(node.type);
    const geo = geometries.get(node.id);
    if (!geo) continue;

    // The plain resting-state border is gone entirely (shadow + top-left highlight carry the
    // node's edge on their own now) — but selection/execution feedback is functional, not just
    // decorative chrome, so THAT still draws a ring, only for the two states that need one.
    const isExecuting = executingNodeId === node.id;

    // Dimmed rather than hidden — its wires stay visible too (drawWires.ts doesn't check this), so
    // it's clear at a glance both that it's disabled/backgrounded and what it would otherwise still
    // connect to. While a Simulate run is in progress, every node but the one currently executing
    // dims to 75% opacity, so the active node reads as the obvious focal point.
    ctx.globalAlpha = node.disabled ? 0.45 : simulating && !isExecuting ? 0.75 : 1;
    const isSelected = selectedNodeIds.has(node.id);
    const showStateBorder = isExecuting || isSelected;
    const borderWidth = isExecuting ? 2.5 : 2;
    const borderColor = isExecuting ? "#5ad1ff" : Colors.NODE_BORDER_SELECTED;

    if (def.compact) {
      // A reroute "knot" (see NodeDef.compact) — just a small body + border, no header bar or
      // label; its pins (drawn below, same as any other node) carry all the visual meaning.
      drawNodeShadow(ctx, geo.screenX, geo.screenY, geo.width, geo.height, 4 * camera.zoom, camera.zoom);
      drawTopHighlight(ctx, geo.screenX, geo.screenY, geo.width, geo.height, 4 * camera.zoom, camera.zoom);
      if (showStateBorder) {
        ctx.lineWidth = borderWidth;
        ctx.strokeStyle = borderColor;
        ctx.beginPath();
        ctx.roundRect(geo.screenX, geo.screenY, geo.width, geo.height, 4 * camera.zoom);
        ctx.stroke();
      }
    } else {
      drawNodeShadow(ctx, geo.screenX, geo.screenY, geo.width, geo.height, 6 * camera.zoom, camera.zoom);

      const headerHeight = NODE_HEADER_HEIGHT * camera.zoom;
      ctx.beginPath();
      ctx.roundRect(geo.screenX, geo.screenY, geo.width, headerHeight, [6 * camera.zoom, 6 * camera.zoom, 0, 0]);
      ctx.fillStyle = resolveNodeHeaderColor(node, def, variables);
      ctx.fill();
      // A left-to-right black falloff over the header's own color — same path, no beginPath()
      // needed (fill() doesn't clear it) — reads as a subtle depth/sheen rather than a flat block.
      const headerShade = ctx.createLinearGradient(geo.screenX, 0, geo.screenX + geo.width, 0);
      headerShade.addColorStop(0, "rgba(0, 0, 0, 0.75)");
      headerShade.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = headerShade;
      ctx.fill();

      drawTopHighlight(ctx, geo.screenX, geo.screenY, geo.width, geo.height, 6 * camera.zoom, camera.zoom);
      if (showStateBorder) {
        ctx.lineWidth = borderWidth;
        ctx.strokeStyle = borderColor;
        ctx.beginPath();
        ctx.roundRect(geo.screenX, geo.screenY, geo.width, geo.height, 6 * camera.zoom);
        ctx.stroke();
      }

      const isLatent = latentNodeIds.has(node.id);
      if (isLatent) {
        drawLatentIcon(ctx, geo.screenX + geo.width, geo.screenY, 8 * camera.zoom);
      }
      if (node.breakpoint) {
        // Sits right next to the latent (clock) icon when both are present, sharing its corner
        // instead of overlapping it — otherwise takes the latent icon's own spot alone.
        const breakpointRadius = 6 * camera.zoom;
        const cx = isLatent ? geo.screenX + geo.width - 8 * camera.zoom * 2 - 4 * camera.zoom : geo.screenX + geo.width;
        drawBreakpointDot(ctx, cx, geo.screenY, breakpointRadius);
      }

      ctx.fillStyle = Colors.TEXT_PRIMARY;
      ctx.textAlign = "left";
      ctx.fillText(node.resolveNodeLabel(def, variables, functions, scripts), geo.screenX + 10 * camera.zoom, geo.screenY + headerHeight / 2);
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

/** Fills a node's own body silhouette (the same rounded-rect shape every caller then draws a
 * header/border/pins over) once with a drop shadow applied, via canvas's native shadow
 * properties — wrapped in save/restore so the shadow only ever applies to this one fill and
 * doesn't bleed into anything drawn after it (header, gradient, border, pins, text), which would
 * otherwise each cast their own small shadow too. Subtle by design: a slight lift off the canvas,
 * not a heavy floating-card effect. Light comes from the top-left at 45°, so the shadow it casts
 * falls toward the bottom-right — equal X/Y offsets, since a 45° direction is exactly where those
 * two agree. (drawTopHighlight below simplifies this to a top-only cue, so the two no longer
 * share an identical light angle — a deliberate simplicity-over-precision tradeoff.) */
function drawNodeShadow(ctx: CanvasRenderingContext2D, screenX: number, screenY: number, width: number, height: number, cornerRadius: number, zoom: number): void {
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
  ctx.shadowBlur = 10 * zoom;
  ctx.shadowOffsetX = 3 * zoom;
  ctx.shadowOffsetY = 3 * zoom;
  ctx.beginPath();
  ctx.roundRect(screenX, screenY, width, height, cornerRadius);
  ctx.fillStyle = Colors.NODE_BODY_BG;
  ctx.fill();
  ctx.restore();
}

/** A soft light-from-above cue: a plain top-to-bottom gradient, white fading to transparent
 * within just a few pixels of the top edge, filled over the node's own rounded-rect shape.
 * Simpler than an actual inset-shadow simulation (no clip/shadow-offset trick needed) — a
 * gradient fill already only paints within the current path, so this reads as a thin top-lit
 * sheen at a fraction of the cost and code of clipping + casting a shadow. */
function drawTopHighlight(ctx: CanvasRenderingContext2D, screenX: number, screenY: number, width: number, height: number, cornerRadius: number, zoom: number): void {
  ctx.beginPath();
  ctx.roundRect(screenX, screenY, width, height, cornerRadius);
  const fadeDistance = 4 * zoom;
  const highlight = ctx.createLinearGradient(0, screenY, 0, screenY + fadeDistance);
  highlight.addColorStop(0, "rgba(255, 255, 255, 0.3)");
  highlight.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = highlight;
  ctx.fill();
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

/** A small solid red dot straddling (cx, cy) — marks a node whose NodeInstance.breakpoint is set
 * (see AppShell.tsx's "Add Breakpoint" context menu item). Deliberately plainer than
 * drawLatentIcon's clock (no internal detail to read at a glance, just "this is a breakpoint"). */
function drawBreakpointDot(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#e5484d";
  ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.18);
  ctx.strokeStyle = "#7a1f22";
  ctx.stroke();
}

function drawPinShape(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, pin: PinDef, connected: boolean): void {
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
    // Same "hollow until wired, filled once connected" convention as a plain data pin below —
    // an unconnected exec arrow is outline-only so an unwired exec chain reads at a glance.
    if (connected) {
      ctx.fill();
    } else {
      ctx.lineWidth = Math.max(1, r * 0.3);
      ctx.strokeStyle = color;
      ctx.stroke();
    }
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
      // data pins (and now exec pins too, above). The container shapes (array/set/map) stay solid
      // regardless of wiring — there's no natural "hollow" rendering for a grid or brace glyph.
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
function drawContainerGrid(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, mergeMiddleRowLeft: boolean): void {
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
