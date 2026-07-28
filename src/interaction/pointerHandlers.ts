import {
  cloneNodesForClipboard,
  parseClipboardPayload,
  pasteNodesIntoGraph,
  pasteVariableIntoGraph,
  serializeNodesClipboardPayload,
  serializeVariableClipboardPayload,
} from "../engine/clipboard";
import {
  addCommentBox,
  canPlaceNodeType,
  connectPins,
  disconnectPin,
  nextId,
  removeCommentBox,
  removeConnection,
  removeNode,
  resolvePinDefs,
} from "../engine/graphMutations";
import { connectionsTouchingPin } from "../engine/graphQueries";
import { getNodeDef, isPinTypeCompatible } from "../engine/registry";
import type { CommentBox, FunctionDef, Graph, PinDef, Variable } from "../engine/types";
import { panCamera, screenToWorld, zoomCameraAt } from "../render/camera";
import {
  COMMENT_HEADER_HEIGHT,
  COMMENT_MIN_SIZE,
  DEFAULT_COMMENT_COLOR,
  DEFAULT_COMMENT_HEIGHT,
  DEFAULT_COMMENT_WIDTH,
  rectContains,
  rectIntersects,
} from "../render/commentGeometry";
import { snapPositionToGrid } from "../render/drawGrid";
import { computeAllNodeGeometries, computeNodeWorldRect } from "../render/nodeGeometry";
import {
  hitTestCommentHeader,
  hitTestCommentResizeHandle,
  hitTestNode,
  hitTestNodeAddButton,
  hitTestPin,
  type PinHit,
} from "../render/hitTest";
import { getEditingGraph, getVisibleVariablesForState, openFunctionTab, type Store } from "../state/store";

type DragMode =
  | { kind: "none" }
  | { kind: "pan"; lastX: number; lastY: number }
  | {
      kind: "nodes";
      startWorld: { x: number; y: number };
      initialPositions: Map<string, { x: number; y: number }>;
    }
  | { kind: "marquee" }
  | { kind: "wire"; anchor: WireAnchor }
  // Ctrl+drag off a pin that already has connections: every one of them was detached at drag-start
  // and is now looking for a new home, all together — see the pinHit branch in mousedown below.
  | { kind: "wire-multi"; anchors: WireAnchor[] }
  | { kind: "comment-move"; commentId: string; grabOffsetX: number; grabOffsetY: number }
  | { kind: "comment-resize"; commentId: string };

export interface WireAnchor {
  /** The pin end that stays fixed while the other end follows the cursor. */
  nodeId: string;
  pinId: string;
  pin: PinDef;
}

export interface PointerInteractionCallbacks {
  /** Wire(s) released with no compatible pin under the cursor — the "filtered node menu" moment.
   * Always an array — a plain single-pin drag passes one anchor, a Ctrl+drag pickup passes every
   * anchor it grabbed, so picking a node from that menu reconnects all of them to it at once. */
  onWireDroppedInEmptySpace: (anchors: WireAnchor[], screenPos: { x: number; y: number }) => void;
}

function findConnectionToInput(graph: Graph, nodeId: string, pinId: string) {
  return graph.connections.find((c) => c.toNode === nodeId && c.toPin === pinId);
}

/** Connects every anchor to `target` (all sharing the same direction/type, guaranteed by however
 * they were gathered) if `target` is a valid, compatible, non-self partner — returns whether it
 * connected anything. Used by both a plain single-anchor wire release and a Ctrl+drag "wire-multi"
 * release, so dropping on a real pin behaves the same whether one or several anchors are in flight. */
function tryConnectAnchorsToTarget(
  graph: Graph,
  variables: Variable[],
  functions: FunctionDef[],
  anchors: WireAnchor[],
  target: PinHit,
): boolean {
  if (anchors.some((a) => a.nodeId === target.nodeId)) return false; // no self-loops
  const anchorIsOutput = anchors[0].pin.direction === "output";
  const targetIsOutput = target.pin.direction === "output";
  if (anchorIsOutput === targetIsOutput || !isPinTypeCompatible(anchors[0].pin, target.pin)) return false;

  for (const anchor of anchors) {
    const outputEnd = anchorIsOutput ? anchor : target;
    const inputEnd = anchorIsOutput ? target : anchor;
    try {
      connectPins(graph, variables, functions, {
        fromNode: outputEnd.nodeId,
        fromPin: outputEnd.pinId,
        toNode: inputEnd.nodeId,
        toPin: inputEnd.pinId,
      });
    } catch {
      // Invalid for this particular anchor — skip it, the others may still connect fine.
    }
  }
  return true;
}

/** Recomputes which nodes currently sit geometrically inside a comment box's body — called
 * fresh whenever a header-drag starts, so it picks up nodes moved into the box since it was
 * last resized, matching Unreal's "whatever's actually inside moves with it" behavior. */
function recomputeContainment(graph: Graph, variables: Variable[], functions: FunctionDef[], box: CommentBox): void {
  const innerBounds = {
    x: box.position.x,
    y: box.position.y + COMMENT_HEADER_HEIGHT,
    width: box.size.width,
    height: box.size.height - COMMENT_HEADER_HEIGHT,
  };
  box.containedNodeIds = graph.nodes
    .filter((n) => rectContains(innerBounds, computeNodeWorldRect(n, resolvePinDefs(n, variables, functions), variables, functions)))
    .map((n) => n.id);
}

export interface PointerInteraction {
  /** True if a right-drag pan just moved the camera — consumed once, so the trailing native
   * "contextmenu" event knows to suppress the node-creation menu instead of opening it at the
   * release point. A plain right-click with no drag still opens the menu as normal. */
  shouldSuppressContextMenu: () => boolean;
}

export function setupPointerInteraction(
  canvas: HTMLCanvasElement,
  store: Store,
  callbacks: PointerInteractionCallbacks,
): PointerInteraction {
  let drag: DragMode = { kind: "none" };
  // Tracked continuously so the "C" comment-box shortcut knows where the cursor is —
  // keydown events carry no pointer coordinates of their own.
  let lastMouseScreenPos = { x: 0, y: 0 };
  // Set once a right-drag pan actually moves; consumed by shouldSuppressContextMenu so a
  // right-drag-to-pan doesn't also pop the node-creation context menu at the release point.
  let rightDragMoved = false;

  function screenPos(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // --- Auto-pan while dragging a new wire off a pin and holding the cursor near (or past) the
  // canvas edge — otherwise a wire couldn't reach a pin that's currently off-screen without the
  // user separately panning first. Runs its own requestAnimationFrame ticker (rather than reacting
  // only to mousemove) since the whole point is to keep panning while the mouse stays HELD STILL
  // right at the edge — no further mousemove events fire in that case.
  const AUTO_PAN_EDGE_MARGIN = 50; // canvas px from an edge where auto-pan kicks in
  const AUTO_PAN_MAX_SPEED = 16; // canvas px panned per animation frame, right at/past the edge
  let autoPanFrame: number | null = null;

  /** 0 outside the margin, ramping up to `maxSpeed` right at (and beyond) the edge itself. */
  function edgePanComponent(distanceFromEdge: number, margin: number, maxSpeed: number): number {
    if (distanceFromEdge >= margin) return 0;
    const t = 1 - Math.max(0, distanceFromEdge) / margin;
    return t * maxSpeed;
  }

  function computeAutoPanDelta(pos: { x: number; y: number }, width: number, height: number) {
    return {
      dx: edgePanComponent(pos.x, AUTO_PAN_EDGE_MARGIN, AUTO_PAN_MAX_SPEED) -
        edgePanComponent(width - pos.x, AUTO_PAN_EDGE_MARGIN, AUTO_PAN_MAX_SPEED),
      dy: edgePanComponent(pos.y, AUTO_PAN_EDGE_MARGIN, AUTO_PAN_MAX_SPEED) -
        edgePanComponent(height - pos.y, AUTO_PAN_EDGE_MARGIN, AUTO_PAN_MAX_SPEED),
    };
  }

  /** Recomputes the in-flight wire-drag preview's screen endpoints from the CURRENT camera —
   * shared by the mousemove handler (cursor actually moved) and the auto-pan ticker (camera moved
   * under a stationary cursor instead), since both change what a fixed-world-position pin's own
   * screen position resolves to. */
  function updateWireDragPreview(): void {
    if ((drag.kind !== "wire" && drag.kind !== "wire-multi") || !store.state.wireDrag) return;
    const graph = getEditingGraph(store.state);
    const { camera } = store.state;
    const variables = getVisibleVariablesForState(store.state);
    const functions = store.state.rootGraph.functions;
    const geometries = computeAllNodeGeometries(graph, camera, variables, functions);

    if (drag.kind === "wire") {
      const anchorScreen = geometries.get(drag.anchor.nodeId)?.pinScreen[drag.anchor.pinId];
      if (anchorScreen) store.state.wireDrag.fromScreens = [anchorScreen];
    } else {
      store.state.wireDrag.fromScreens = drag.anchors
        .map((a) => geometries.get(a.nodeId)?.pinScreen[a.pinId])
        .filter((p): p is { x: number; y: number } => !!p);
    }
    store.state.wireDrag.toScreen = lastMouseScreenPos;
  }

  function startAutoPanLoop(): void {
    if (autoPanFrame !== null) return;
    const tick = () => {
      autoPanFrame = null;
      if (drag.kind !== "wire" && drag.kind !== "wire-multi") return; // drag ended — stop rescheduling
      const rect = canvas.getBoundingClientRect();
      const { dx, dy } = computeAutoPanDelta(lastMouseScreenPos, rect.width, rect.height);
      if (dx !== 0 || dy !== 0) {
        panCamera(store.state.camera, dx, dy);
        updateWireDragPreview();
        store.notify();
      }
      autoPanFrame = requestAnimationFrame(tick);
    };
    autoPanFrame = requestAnimationFrame(tick);
  }

  canvas.addEventListener("mousedown", (e) => {
    // Any click inside the graph view — regardless of what it hits — stands down whatever
    // Variables/Functions sidebar row was selected, so the Details panel only ever reflects
    // whichever was clicked last (see detailsPanel.ts).
    store.state.sidebarSelection = null;

    if (e.button === 2) {
      // Right-drag pans the camera; a right-click with no drag still opens the context menu
      // (see shouldSuppressContextMenu, consumed by main.ts's "contextmenu" listener).
      rightDragMoved = false;
      drag = { kind: "pan", lastX: e.clientX, lastY: e.clientY };
      return;
    }
    if (e.button !== 0) return; // ignore middle-click etc.

    const graph = getEditingGraph(store.state);
    const { camera } = store.state;
    const variables = getVisibleVariablesForState(store.state);
    const functions = store.state.rootGraph.functions;
    const pos = screenPos(e);
    const geometries = computeAllNodeGeometries(graph, camera, variables, functions);

    const addButtonHit = hitTestNodeAddButton(graph, geometries, pos.x, pos.y);
    if (addButtonHit) {
      const node = graph.nodes.find((n) => n.id === addButtonHit.nodeId);
      const def = node && getNodeDef(node.type);
      if (node && def?.addInstancePinEntry) {
        def.addInstancePinEntry(node);
        store.notify();
      }
      return;
    }

    const pinHit = hitTestPin(graph, geometries, pos.x, pos.y);
    if (pinHit) {
      const touching = connectionsTouchingPin(graph, pinHit.nodeId, pinHit.pinId);

      if ((e.ctrlKey || e.metaKey) && touching.length > 0) {
        // Ctrl+drag off a pin that already has connections picks up ALL of them at once: each
        // detached connection's OTHER end becomes an anchor (all sharing this pin's type and the
        // opposite direction), so dropping them on one new pin — or picking one new node — rewires
        // every one of them there in a single motion, instead of just this one pin's own wire.
        const anchors: WireAnchor[] = touching.map((conn) => {
          const otherIsFromEnd = conn.toNode === pinHit.nodeId && conn.toPin === pinHit.pinId;
          const otherNodeId = otherIsFromEnd ? conn.fromNode : conn.toNode;
          const otherPinId = otherIsFromEnd ? conn.fromPin : conn.toPin;
          const otherNode = graph.nodes.find((n) => n.id === otherNodeId)!;
          const otherPinDef = resolvePinDefs(otherNode, variables, functions).find((p) => p.id === otherPinId)!;
          return { nodeId: otherNodeId, pinId: otherPinId, pin: otherPinDef };
        });
        for (const conn of touching) {
          removeConnection(graph, variables, functions, conn.id);
        }

        drag = { kind: "wire-multi", anchors };
        store.state.wireDrag = {
          fromScreens: anchors
            .map((a) => geometries.get(a.nodeId)?.pinScreen[a.pinId])
            .filter((p): p is { x: number; y: number } => !!p),
          toScreen: pos,
          pinType: anchors[0].pin.type,
          anchorDirection: anchors[0].pin.direction,
        };
        startAutoPanLoop();
        store.notify();
        return;
      }

      let anchor: WireAnchor = { nodeId: pinHit.nodeId, pinId: pinHit.pinId, pin: pinHit.pin };

      // Grabbing a connected input pin picks up the existing wire: detach it and
      // keep dragging from its upstream output, mirroring Unreal's pin-grab behavior.
      if (pinHit.pin.direction === "input") {
        const existing = findConnectionToInput(graph, pinHit.nodeId, pinHit.pinId);
        if (existing) {
          const fromNode = graph.nodes.find((n) => n.id === existing.fromNode)!;
          const fromPinDef = resolvePinDefs(fromNode, variables, functions).find(
            (p) => p.id === existing.fromPin,
          )!;
          disconnectPin(graph, variables, functions, pinHit.nodeId, pinHit.pinId);
          anchor = { nodeId: fromNode.id, pinId: fromPinDef.id, pin: fromPinDef };
        }
      }

      drag = { kind: "wire", anchor };
      store.state.wireDrag = {
        fromScreens: [{ x: pinHit.screenX, y: pinHit.screenY }],
        toScreen: pos,
        pinType: anchor.pin.type,
        anchorDirection: anchor.pin.direction,
      };
      startAutoPanLoop();
      store.notify();
      return;
    }

    const nodeHit = hitTestNode(graph, geometries, pos.x, pos.y);
    if (nodeHit) {
      const node = graph.nodes.find((n) => n.id === nodeHit.nodeId)!;
      const worldPos = screenToWorld(camera, pos.x, pos.y);

      if (e.ctrlKey || e.metaKey) {
        // Ctrl/Cmd-click toggles this node's membership in the current multi-selection.
        const next = new Set(store.state.selectedNodeIds);
        if (next.has(node.id)) next.delete(node.id);
        else next.add(node.id);
        store.state.selectedNodeIds = next;
        store.state.selectedCommentId = null;
        if (!next.has(node.id)) {
          // Just deselected it — nothing to grab from here.
          drag = { kind: "none" };
          store.notify();
          return;
        }
        // Otherwise fall through and start a group-drag of the updated selection below.
      } else if (!store.state.selectedNodeIds.has(node.id)) {
        // Fresh click on a node outside the current selection replaces the selection.
        store.state.selectedNodeIds = new Set([node.id]);
        store.state.selectedCommentId = null;
      }
      // else: the clicked node is already part of an existing multi-selection — keep the whole
      // selection intact so the drag below moves the whole group, Unreal-style.

      const initialPositions = new Map<string, { x: number; y: number }>();
      for (const id of store.state.selectedNodeIds) {
        const n = graph.nodes.find((gn) => gn.id === id);
        if (n) initialPositions.set(id, { x: n.position.x, y: n.position.y });
      }
      drag = { kind: "nodes", startWorld: worldPos, initialPositions };
      store.notify();
      return;
    }

    const resizeHit = hitTestCommentResizeHandle(graph, camera, pos.x, pos.y);
    if (resizeHit) {
      store.state.selectedCommentId = resizeHit.commentId;
      store.state.selectedNodeIds = new Set();
      drag = { kind: "comment-resize", commentId: resizeHit.commentId };
      store.notify();
      return;
    }

    const headerHit = hitTestCommentHeader(graph, camera, pos.x, pos.y);
    if (headerHit) {
      const box = graph.commentBoxes.find((b) => b.id === headerHit.commentId)!;
      recomputeContainment(graph, variables, functions, box);
      const worldPos = screenToWorld(camera, pos.x, pos.y);
      store.state.selectedCommentId = box.id;
      store.state.selectedNodeIds = new Set();
      drag = {
        kind: "comment-move",
        commentId: box.id,
        grabOffsetX: worldPos.x - box.position.x,
        grabOffsetY: worldPos.y - box.position.y,
      };
      store.notify();
      return;
    }

    // Empty space: clear selection and start a rubber-band marquee-select box.
    store.state.selectedNodeIds = new Set();
    store.state.selectedCommentId = null;
    const worldPos = screenToWorld(camera, pos.x, pos.y);
    store.state.marqueeSelection = { startWorld: worldPos, currentWorld: worldPos };
    drag = { kind: "marquee" };
    store.notify();
  });

  canvas.addEventListener("dblclick", (e) => {
    const graph = getEditingGraph(store.state);
    const { camera } = store.state;
    const variables = getVisibleVariablesForState(store.state);
    const functions = store.state.rootGraph.functions;
    const pos = screenPos(e);
    const geometries = computeAllNodeGeometries(graph, camera, variables, functions);

    const nodeHit = hitTestNode(graph, geometries, pos.x, pos.y);
    if (!nodeHit) return;
    const node = graph.nodes.find((n) => n.id === nodeHit.nodeId);
    if (!node || node.type !== "function.call" || !node.functionId) return;

    openFunctionTab(store.state, node.functionId);
    store.notify();
  });

  window.addEventListener("mousemove", (e) => {
    lastMouseScreenPos = screenPos(e);

    // Resize-cursor hover feedback over the comment box's corner handle — shown while just
    // hovering it (not dragging anything) or throughout an active resize (keeps it consistent for
    // the whole drag, rather than flickering back to the default cursor mid-resize).
    if (drag.kind === "none" || drag.kind === "comment-resize") {
      const hovering =
        drag.kind === "comment-resize" ||
        !!hitTestCommentResizeHandle(getEditingGraph(store.state), store.state.camera, lastMouseScreenPos.x, lastMouseScreenPos.y);
      canvas.style.cursor = hovering ? "nwse-resize" : "";
    }

    if (drag.kind === "none") return;
    const graph = getEditingGraph(store.state);
    const { camera } = store.state;

    if (drag.kind === "pan") {
      panCamera(camera, e.clientX - drag.lastX, e.clientY - drag.lastY);
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      rightDragMoved = true;
      store.notify();
      return;
    }

    if (drag.kind === "nodes") {
      const { startWorld, initialPositions } = drag;
      const pos = screenPos(e);
      const worldPos = screenToWorld(camera, pos.x, pos.y);
      const dx = worldPos.x - startWorld.x;
      const dy = worldPos.y - startWorld.y;
      for (const [nodeId, initial] of initialPositions) {
        const node = graph.nodes.find((n) => n.id === nodeId);
        if (node) {
          const next = { x: initial.x + dx, y: initial.y + dy };
          const snapped = store.state.snapToGrid ? snapPositionToGrid(next) : next;
          node.position.x = snapped.x;
          node.position.y = snapped.y;
        }
      }
      store.notify();
      return;
    }

    if (drag.kind === "marquee") {
      const pos = screenPos(e);
      const worldPos = screenToWorld(camera, pos.x, pos.y);
      if (store.state.marqueeSelection) store.state.marqueeSelection.currentWorld = worldPos;
      store.notify();
      return;
    }

    if (drag.kind === "wire" || drag.kind === "wire-multi") {
      updateWireDragPreview();
      store.notify();
      return;
    }

    if (drag.kind === "comment-move") {
      const { commentId, grabOffsetX, grabOffsetY } = drag;
      const box = graph.commentBoxes.find((b) => b.id === commentId);
      if (box) {
        const pos = screenPos(e);
        const worldPos = screenToWorld(camera, pos.x, pos.y);
        const raw = { x: worldPos.x - grabOffsetX, y: worldPos.y - grabOffsetY };
        const snapped = store.state.snapToGrid ? snapPositionToGrid(raw) : raw;
        const dx = snapped.x - box.position.x;
        const dy = snapped.y - box.position.y;
        box.position.x = snapped.x;
        box.position.y = snapped.y;
        for (const nodeId of box.containedNodeIds) {
          const node = graph.nodes.find((n) => n.id === nodeId);
          if (node) {
            node.position.x += dx;
            node.position.y += dy;
          }
        }
      }
      store.notify();
      return;
    }

    if (drag.kind === "comment-resize") {
      const { commentId } = drag;
      const box = graph.commentBoxes.find((b) => b.id === commentId);
      if (box) {
        const pos = screenPos(e);
        const worldPos = screenToWorld(camera, pos.x, pos.y);
        box.size.width = Math.max(COMMENT_MIN_SIZE, worldPos.x - box.position.x);
        box.size.height = Math.max(COMMENT_MIN_SIZE, worldPos.y - box.position.y);
      }
      store.notify();
    }
  });

  window.addEventListener("mouseup", (e) => {
    if (drag.kind === "wire" || drag.kind === "wire-multi") {
      const graph = getEditingGraph(store.state);
      const { camera } = store.state;
      const variables = getVisibleVariablesForState(store.state);
      const functions = store.state.rootGraph.functions;
      const pos = screenPos(e);
      const geometries = computeAllNodeGeometries(graph, camera, variables, functions);
      const targetHit = hitTestPin(graph, geometries, pos.x, pos.y);
      const anchors = drag.kind === "wire" ? [drag.anchor] : drag.anchors;

      const connected = targetHit ? tryConnectAnchorsToTarget(graph, variables, functions, anchors, targetHit) : false;

      store.state.wireDrag = null;
      drag = { kind: "none" };
      if (autoPanFrame !== null) {
        cancelAnimationFrame(autoPanFrame);
        autoPanFrame = null;
      }
      store.notify();
      if (!connected) callbacks.onWireDroppedInEmptySpace(anchors, pos);
      return;
    }

    if (drag.kind === "comment-resize") {
      const graph = getEditingGraph(store.state);
      const { commentId } = drag;
      const box = graph.commentBoxes.find((b) => b.id === commentId);
      if (box) {
        recomputeContainment(graph, getVisibleVariablesForState(store.state), store.state.rootGraph.functions, box);
      }
      drag = { kind: "none" };
      store.notify();
      return;
    }

    if (drag.kind === "marquee") {
      const marquee = store.state.marqueeSelection;
      if (marquee) {
        const graph = getEditingGraph(store.state);
        const variables = getVisibleVariablesForState(store.state);
        const functions = store.state.rootGraph.functions;
        const box = {
          x: Math.min(marquee.startWorld.x, marquee.currentWorld.x),
          y: Math.min(marquee.startWorld.y, marquee.currentWorld.y),
          width: Math.abs(marquee.currentWorld.x - marquee.startWorld.x),
          height: Math.abs(marquee.currentWorld.y - marquee.startWorld.y),
        };
        const touched = graph.nodes.filter((n) =>
          rectIntersects(box, computeNodeWorldRect(n, resolvePinDefs(n, variables, functions), variables, functions)),
        );
        store.state.selectedNodeIds = new Set(touched.map((n) => n.id));
      }
      store.state.marqueeSelection = null;
      drag = { kind: "none" };
      store.notify();
      return;
    }

    drag = { kind: "none" };
  });

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      zoomCameraAt(store.state.camera, e.clientX - rect.left, e.clientY - rect.top, factor);
      store.notify();
    },
    { passive: false },
  );

  window.addEventListener("keydown", (e) => {
    if (document.activeElement instanceof HTMLInputElement) return; // don't hijack text-field editing
    const graph = getEditingGraph(store.state);

    if (e.key === "Delete" || e.key === "Backspace") {
      const { selectedNodeIds, selectedCommentId } = store.state;
      if (selectedNodeIds.size === 0 && !selectedCommentId) return;
      const variables = getVisibleVariablesForState(store.state);
      const functions = store.state.rootGraph.functions;
      for (const nodeId of selectedNodeIds) {
        removeNode(graph, variables, functions, nodeId);
      }
      if (selectedCommentId) removeCommentBox(graph, selectedCommentId);
      store.state.selectedNodeIds = new Set();
      store.state.selectedCommentId = null;
      store.notify();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
      e.preventDefault();
      const { selectedNodeIds, sidebarSelection } = store.state;
      if (selectedNodeIds.size > 0) {
        const { nodes, connections } = cloneNodesForClipboard(graph, selectedNodeIds);
        if (nodes.length > 0) {
          navigator.clipboard.writeText(serializeNodesClipboardPayload(nodes, connections)).catch(() => {});
        }
      } else if (sidebarSelection?.kind === "variable") {
        const variable = getVisibleVariablesForState(store.state).find((v) => v.id === sidebarSelection.variableId);
        if (variable) navigator.clipboard.writeText(serializeVariableClipboardPayload(variable)).catch(() => {});
      }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
      e.preventDefault();
      navigator.clipboard
        .readText()
        .then((text) => {
          const payload = parseClipboardPayload(text);
          if (!payload) return; // not our own copied data (or nothing/garbage on the clipboard) — no-op

          const pasteGraph = getEditingGraph(store.state);
          if (payload.kind === "nodes") {
            // Event nodes can't go inside a function body, and at most one instance of each event
            // type may exist per graph — drop any pasted node that would violate that (also
            // guarding against pasting two of the same event type in one go).
            const isFunctionBody = store.state.activeFunctionId !== null;
            const seenEventTypes = new Set<string>();
            const placeableNodes = payload.nodes.filter((n) => {
              if (!canPlaceNodeType(n.type, pasteGraph, isFunctionBody)) return false;
              if (getNodeDef(n.type).eventTrigger) {
                if (seenEventTypes.has(n.type)) return false;
                seenEventTypes.add(n.type);
              }
              return true;
            });
            const placeablePayload = { ...payload, nodes: placeableNodes };

            const rawTarget = screenToWorld(store.state.camera, lastMouseScreenPos.x, lastMouseScreenPos.y);
            const targetTopLeft = store.state.snapToGrid ? snapPositionToGrid(rawTarget) : rawTarget;
            const newIds = pasteNodesIntoGraph(pasteGraph, placeablePayload, targetTopLeft);
            if (newIds.length > 0) {
              store.state.selectedNodeIds = new Set(newIds);
              store.state.selectedCommentId = null;
              store.state.sidebarSelection = null;
              store.notify();
            }
          } else {
            const newVariable = pasteVariableIntoGraph(pasteGraph, payload.variable);
            store.state.sidebarSelection = { kind: "variable", variableId: newVariable.id };
            store.notify();
          }
        })
        .catch(() => {}); // clipboard permission denied/unavailable — fail silently, nothing to paste
      return;
    }

    if (e.key.toLowerCase() === "c" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const { camera, selectedNodeIds } = store.state;
      const variables = getVisibleVariablesForState(store.state);
      const functions = store.state.rootGraph.functions;

      if (selectedNodeIds.size > 0) {
        // Nodes selected: wrap them, Unreal-style.
        const rects = [...selectedNodeIds]
          .map((id) => graph.nodes.find((n) => n.id === id))
          .filter((n): n is NonNullable<typeof n> => !!n)
          .map((n) => computeNodeWorldRect(n, resolvePinDefs(n, variables, functions), variables, functions));

        const minX = Math.min(...rects.map((r) => r.x));
        const minY = Math.min(...rects.map((r) => r.y));
        const maxX = Math.max(...rects.map((r) => r.x + r.width));
        const maxY = Math.max(...rects.map((r) => r.y + r.height));
        const PAD = 30;
        const HEADER_PAD = COMMENT_HEADER_HEIGHT + 16;

        const box: CommentBox = {
          id: nextId("comment"),
          text: "Comment",
          position: { x: minX - PAD, y: minY - HEADER_PAD },
          size: { width: maxX - minX + PAD * 2, height: maxY - minY + HEADER_PAD + PAD },
          containedNodeIds: [...selectedNodeIds],
          color: DEFAULT_COMMENT_COLOR,
        };
        addCommentBox(graph, box);
        store.state.selectedCommentId = box.id;
        store.notify();
      } else {
        // Nothing selected: drop a default-sized empty box at the cursor.
        const worldPos = screenToWorld(camera, lastMouseScreenPos.x, lastMouseScreenPos.y);
        const box: CommentBox = {
          id: nextId("comment"),
          text: "Comment",
          position: { x: worldPos.x, y: worldPos.y },
          size: { width: DEFAULT_COMMENT_WIDTH, height: DEFAULT_COMMENT_HEIGHT },
          containedNodeIds: [],
          color: DEFAULT_COMMENT_COLOR,
        };
        addCommentBox(graph, box);
        store.state.selectedCommentId = box.id;
        store.notify();
      }
    }
  });

  return {
    shouldSuppressContextMenu: () => {
      const moved = rightDragMoved;
      rightDragMoved = false;
      return moved;
    },
  };
}
