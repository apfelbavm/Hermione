import { getNodeDef } from "@hermione/graph/engine/registry";
import { tryGetEnumTypeDef } from "@hermione/graph/engine/enumRegistry";
import { tryGetStructTypeDef } from "@hermione/graph/engine/structRegistry";
import type { PinDef, PinType } from "@hermione/graph/engine/types";
import type { NodeInstance } from "@hermione/graph/engine/nodeInstance";
import { hitTestNode, hitTestPin } from "@hermione/graph/render/hitTest";
import { computeAllNodeGeometries } from "@hermione/graph/render/nodeGeometry";
import { getEditingGraph, getVisibleVariablesForState, type Store } from "@hermione/graph/state/store";
import { cursorOffset, hideTooltip, moveTooltip, showTooltip } from "./tooltip";

const HOVER_DELAY_MS = 500;

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** For struct/enum pins, shows the registered class's own label (e.g. "Player") instead of the
 * generic "Struct"/"Enum" type name — same lookup typedValueInput.ts's labelFor uses. */
function describeScalarType(type: PinType, subType?: string): string {
  if (type === "struct") return (subType && tryGetStructTypeDef(subType)?.label) ?? capitalize(type);
  if (type === "enum") return (subType && tryGetEnumTypeDef(subType)?.label) ?? capitalize(type);
  return capitalize(type);
}

/** "String", "Array<Number>", "Map<String, Boolean>" — the same Array<Type>/Map<Key, Value>
 * bracket notation used throughout the engine's own doc comments (see PinContainer/PinDef). */
function describePinType(pin: PinDef): string {
  const type = describeScalarType(pin.type, pin.subType);
  const container = pin.container ?? "single";
  if (container === "single") return type;
  if (container === "map") return `Map<${capitalize(pin.keyType ?? "string")}, ${type}>`;
  return `${capitalize(container)}<${type}>`;
}

const MAX_VALUE_STRING_LENGTH = 60;
const MAX_CONTAINER_PREVIEW_ROWS = 3;

function clampValueString(s: string): string {
  return s.length > MAX_VALUE_STRING_LENGTH ? `${s.slice(0, MAX_VALUE_STRING_LENGTH)}…` : s;
}

/** A single scalar value, formatted for display in a pin's hover tooltip — same per-type shapes
 * createScalarInput (typedValueInput.ts) uses for editing, just rendered as read-only clamped text
 * instead of a live control. `object` has no literal editor anywhere in this app either; JSON is the
 * closest thing it has to a readable display form. */
function formatScalarValue(type: PinType, value: unknown): string {
  if (value === undefined || value === null) return "—";
  if (type === "boolean") return value ? "true" : "false";
  if (type === "object") {
    try {
      return clampValueString(JSON.stringify(value));
    } catch {
      return clampValueString(String(value));
    }
  }
  return clampValueString(String(value));
}

interface MapEntry {
  key: unknown;
  value: unknown;
}

function isMapEntry(value: unknown): value is MapEntry {
  return typeof value === "object" && value !== null && "key" in value && "value" in value;
}

/** An Array/Set/Map default value's runtime shape is always a plain array (a Map's own entries as
 * `{key, value}` objects — see nodes/map.ts's own doc comment for why no real Map/Set instance is
 * ever used) — previews at most the first 3 elements, one per row, each independently clamped. */
function formatContainerValue(pin: PinDef, value: unknown): string {
  const entries = Array.isArray(value) ? value : [];
  const rows = entries.slice(0, MAX_CONTAINER_PREVIEW_ROWS).map((entry) => {
    if (pin.container === "map" && isMapEntry(entry)) {
      return `${formatScalarValue(pin.keyType ?? "string", entry.key)}: ${formatScalarValue(pin.type, entry.value)}`;
    }
    return formatScalarValue(pin.type, entry);
  });
  return rows.join("\n");
}

/** "Number: 42", "String: hello world", or (for a container pin) the type label followed by up to
 * 3 preview rows on their own lines — shown instead of the plain type-only tooltip while simulating,
 * for any OUTPUT pin currently carrying a known value (see AppState.pinValues/onPinValues). Returns
 * just the type label when no value's been recorded for this pin yet (e.g. its node hasn't run in
 * this simulation run). */
function formatPinValueTooltip(pin: PinDef, value: unknown): string {
  const typeLabel = describePinType(pin);
  if (value === undefined) return typeLabel;
  const container = pin.container ?? "single";
  if (container === "single") return `${typeLabel}: ${formatScalarValue(pin.type, value)}`;
  return `${typeLabel}:\n${formatContainerValue(pin, value)}`;
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
        if (!pin) return;

        // While simulating, an output pin (never exec — a wire, not a value) shows whatever it's
        // currently carrying instead of just its type, if anything's been recorded for it yet.
        if (store.state.simulating && pin.direction === "output" && pin.type !== "exec") {
          const value = store.state.pinValues.get(`${target.nodeId}:${target.pinId}`);
          showTooltip(lastScreenPos, formatPinValueTooltip(pin, value));
          return;
        }

        showTooltip(lastScreenPos, describePinType(pin));
        return;
      }
      const node = graph.nodes.find((n) => n.id === target.nodeId);
      if (!node) return; // deleted (or the graph switched) since the timer was scheduled
      const text = node.resolveNodeDescription(getNodeDef(node.type), functions);
      const combined = [text, executeFlowEndpointLine(node)].filter(Boolean).join("\n");
      if (combined) showTooltip(lastScreenPos, combined);
    }, HOVER_DELAY_MS);
  });

  canvas.addEventListener("mouseleave", reset);
  canvas.addEventListener("mousedown", reset);
  canvas.addEventListener("wheel", reset, { passive: true });
}

/** Sibling detail line for an Execute Flow node's tooltip (see nodes/flow.ts): its target flow's
 * own HTTP endpoint (see api/hooks/[projectId]/[flowId]/route.ts) is genuinely useful to see here
 * too — an "On HTTP Request" event on that flow is reachable at this exact URL, even though THIS
 * node itself invokes it directly (see server/executeDeployedFlow.ts) rather than over HTTP. */
function executeFlowEndpointLine(node: NodeInstance): string {
  if (node.type !== "flow.executeFlow" || !node.targetFlowId) return "";
  return `Endpoint: ${window.location.origin}/api/hooks/${node.targetProjectId ?? ""}/${node.targetFlowId}`;
}
