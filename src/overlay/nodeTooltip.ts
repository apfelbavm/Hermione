import { getNodeDef } from "../engine/registry";
import type { PinDef } from "../engine/types";
import { hitTestNode, hitTestPin } from "../render/hitTest";
import { computeAllNodeGeometries } from "../render/nodeGeometry";
import { getEditingGraph, getVisibleVariablesForState, type Store } from "../state/store";
import { cursorOffset, hideTooltip, moveTooltip, showTooltip } from "./tooltip";

const HOVER_DELAY_MS = 500;

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "String", "Array<Number>", "Map<String, Boolean>" — the same Array<Type>/Map<Key, Value>
 * bracket notation used throughout the engine's own doc comments (see PinContainer/PinDef). */
function describePinType(pin: PinDef): string {
  const type = capitalize(pin.type);
  const container = pin.container ?? "single";
  if (container === "single") return type;
  if (container === "map") return `Map<${capitalize(pin.keyType ?? "string")}, ${type}>`;
  return `${capitalize(container)}<${type}>`;
}

/** Either a pin or a whole node — whichever the mouse is currently resting on (see
 * setupNodeHoverTooltip below). Compared by identity fields only, not object reference, since a
 * fresh hit-test object is computed on every mousemove. */
type HoverTarget = { kind: "pin"; nodeId: string; pinId: string } | { kind: "node"; nodeId: string } | null;

function sameTarget(a: HoverTarget, b: HoverTarget): boolean {
  if (!a || !b) return a === b;
  if (a.kind !== b.kind) return false;
  if (a.kind === "pin" && b.kind === "pin") return a.nodeId === b.nodeId && a.pinId === b.pinId;
  return a.nodeId === b.nodeId;
}

/** Shows the same hover tooltip the create-node menu uses (see tooltip.ts) for whichever canvas
 * node — or, taking priority, whichever of its individual pins — the mouse rests over for ~0.5s,
 * following the cursor for as long as it keeps resting on that same target. A pin's tooltip shows
 * its type (e.g. "String", "Array<Number>") instead of the node's own description, mirroring how
 * main.ts's right-click menu also checks a pin hit before falling back to the node itself. Canvas
 * nodes are drawn, not real DOM elements, so — unlike tooltip.ts's attachHoverTooltip, which wires
 * real mouseenter/mousemove/mouseleave per element — this drives its own hit-test-on-every-mousemove
 * timer instead, resetting whenever the hovered target changes. */
export function setupNodeHoverTooltip(canvas: HTMLCanvasElement, store: Store): void {
  let hovered: HoverTarget = null;
  let timer: number | null = null;
  // Read by the pending timeout at fire time (not the position captured when the hover started) so
  // the tooltip appears wherever the cursor actually is once the delay elapses, not where it entered.
  let lastScreenPos = { x: 0, y: 0 };

  function clearTimer(): void {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  }

  function reset(): void {
    clearTimer();
    hovered = null;
    hideTooltip();
  }

  canvas.addEventListener("mousemove", (e) => {
    // Any mouse button held means a drag/pan/wire/marquee gesture is in progress (see
    // pointerHandlers.ts) — never show a tooltip mid-gesture.
    if (e.buttons !== 0) {
      reset();
      return;
    }

    lastScreenPos = cursorOffset(e);

    const rect = canvas.getBoundingClientRect();
    const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const graph = getEditingGraph(store.state);
    const { camera } = store.state;
    const variables = getVisibleVariablesForState(store.state);
    const functions = store.state.rootGraph.functions;
    const scripts = store.state.rootGraph.scripts;
    const geometries = computeAllNodeGeometries(graph, camera, variables, functions, scripts);

    const pinHit = hitTestPin(graph, geometries, pos.x, pos.y);
    const nodeHit = pinHit ? null : hitTestNode(graph, geometries, pos.x, pos.y);
    const target: HoverTarget = pinHit ? { kind: "pin", nodeId: pinHit.nodeId, pinId: pinHit.pinId } : nodeHit ? { kind: "node", nodeId: nodeHit.nodeId } : null;

    if (sameTarget(target, hovered)) {
      if (target) moveTooltip(lastScreenPos); // still resting on the same target — follow the cursor
      return;
    }

    clearTimer();
    hideTooltip();
    hovered = target;
    if (!target) return;

    timer = window.setTimeout(() => {
      if (target.kind === "pin") {
        const node = graph.nodes.find((n) => n.id === target.nodeId);
        const pin = node?.resolvePinDefs(variables, functions, scripts).find((p) => p.id === target.pinId);
        if (pin) showTooltip(lastScreenPos, describePinType(pin));
        return;
      }
      const node = graph.nodes.find((n) => n.id === target.nodeId);
      if (!node) return; // deleted (or the graph switched) since the timer was scheduled
      const text = node.resolveNodeDescription(getNodeDef(node.type), functions);
      if (text) showTooltip(lastScreenPos, text);
    }, HOVER_DELAY_MS);
  });

  canvas.addEventListener("mouseleave", reset);
  canvas.addEventListener("mousedown", reset);
  canvas.addEventListener("wheel", reset, { passive: true });
}
