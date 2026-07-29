import { getNodeDef } from "../engine/registry";
import { hitTestNode } from "../render/hitTest";
import { computeAllNodeGeometries } from "../render/nodeGeometry";
import { getEditingGraph, getVisibleVariablesForState, type Store } from "../state/store";
import { cursorOffset, hideTooltip, moveTooltip, showTooltip } from "./tooltip";

const HOVER_DELAY_MS = 500;

/** Shows the same hover tooltip the create-node menu uses (see tooltip.ts) for whichever canvas
 * node the mouse rests over for ~0.5s, following the cursor for as long as it keeps resting on that
 * same node. Canvas nodes are drawn, not real DOM elements, so — unlike tooltip.ts's
 * attachHoverTooltip, which wires real mouseenter/mousemove/mouseleave per element — this drives its
 * own hit-test-on-every-mousemove timer instead, resetting whenever the hovered node changes. */
export function setupNodeHoverTooltip(canvas: HTMLCanvasElement, store: Store): void {
  let hoveredNodeId: string | null = null;
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
    hoveredNodeId = null;
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
    const hit = hitTestNode(graph, geometries, pos.x, pos.y);

    if ((hit?.nodeId ?? null) === hoveredNodeId) {
      if (hit) moveTooltip(lastScreenPos); // still resting on the same node — follow the cursor
      return;
    }

    clearTimer();
    hideTooltip();
    hoveredNodeId = hit?.nodeId ?? null;
    if (!hit) return;

    const { nodeId } = hit;
    timer = window.setTimeout(() => {
      const node = graph.nodes.find((n) => n.id === nodeId);
      if (!node) return; // deleted (or the graph switched) since the timer was scheduled
      const text = node.resolveNodeDescription(getNodeDef(node.type), functions);
      if (text) showTooltip(lastScreenPos, text);
    }, HOVER_DELAY_MS);
  });

  canvas.addEventListener("mouseleave", reset);
  canvas.addEventListener("mousedown", reset);
  canvas.addEventListener("wheel", reset, { passive: true });
}
