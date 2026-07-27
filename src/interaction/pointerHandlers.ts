import {
  addCommentBox,
  connectPins,
  disconnectPin,
  nextId,
  removeCommentBox,
  removeNode,
  resolvePinDefs,
} from "../engine/graphMutations";
import { isPinTypeCompatible } from "../engine/registry";
import type { CommentBox, FunctionDef, Graph, PinDef, Variable } from "../engine/types";
import { panCamera, screenToWorld, zoomCameraAt } from "../render/camera";
import {
  COMMENT_HEADER_HEIGHT,
  COMMENT_MIN_SIZE,
  DEFAULT_COMMENT_COLOR,
  DEFAULT_COMMENT_HEIGHT,
  DEFAULT_COMMENT_WIDTH,
  rectContains,
} from "../render/commentGeometry";
import { computeAllNodeGeometries, computeNodeWorldRect } from "../render/nodeGeometry";
import {
  hitTestCommentHeader,
  hitTestCommentResizeHandle,
  hitTestNode,
  hitTestPin,
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
  | { kind: "comment-move"; commentId: string; grabOffsetX: number; grabOffsetY: number }
  | { kind: "comment-resize"; commentId: string };

export interface WireAnchor {
  /** The pin end that stays fixed while the other end follows the cursor. */
  nodeId: string;
  pinId: string;
  pin: PinDef;
}

export interface PointerInteractionCallbacks {
  /** Wire released with no compatible pin under the cursor — the "filtered node menu" moment. */
  onWireDroppedInEmptySpace: (anchor: WireAnchor, screenPos: { x: number; y: number }) => void;
}

function findConnectionToInput(graph: Graph, nodeId: string, pinId: string) {
  return graph.connections.find((c) => c.toNode === nodeId && c.toPin === pinId);
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
    .filter((n) => rectContains(innerBounds, computeNodeWorldRect(n, resolvePinDefs(n, variables, functions), functions)))
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

  canvas.addEventListener("mousedown", (e) => {
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

    const pinHit = hitTestPin(graph, geometries, pos.x, pos.y);
    if (pinHit) {
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
        fromScreen: { x: pinHit.screenX, y: pinHit.screenY },
        toScreen: pos,
        pinType: anchor.pin.type,
      };
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
          node.position.x = initial.x + dx;
          node.position.y = initial.y + dy;
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

    if (drag.kind === "wire") {
      const pos = screenPos(e);
      const variables = getVisibleVariablesForState(store.state);
      const functions = store.state.rootGraph.functions;
      const geometries = computeAllNodeGeometries(graph, camera, variables, functions);
      const anchorGeo = geometries.get(drag.anchor.nodeId);
      const anchorScreen = anchorGeo?.pinScreen[drag.anchor.pinId];
      if (anchorScreen && store.state.wireDrag) {
        store.state.wireDrag.fromScreen = anchorScreen;
        store.state.wireDrag.toScreen = pos;
      }
      store.notify();
      return;
    }

    if (drag.kind === "comment-move") {
      const { commentId, grabOffsetX, grabOffsetY } = drag;
      const box = graph.commentBoxes.find((b) => b.id === commentId);
      if (box) {
        const pos = screenPos(e);
        const worldPos = screenToWorld(camera, pos.x, pos.y);
        const newX = worldPos.x - grabOffsetX;
        const newY = worldPos.y - grabOffsetY;
        const dx = newX - box.position.x;
        const dy = newY - box.position.y;
        box.position.x = newX;
        box.position.y = newY;
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
    if (drag.kind === "wire") {
      const graph = getEditingGraph(store.state);
      const { camera } = store.state;
      const variables = getVisibleVariablesForState(store.state);
      const functions = store.state.rootGraph.functions;
      const pos = screenPos(e);
      const geometries = computeAllNodeGeometries(graph, camera, variables, functions);
      const targetHit = hitTestPin(graph, geometries, pos.x, pos.y);
      const anchor = drag.anchor;
      let connected = false;

      if (targetHit && targetHit.nodeId !== anchor.nodeId) {
        const target = targetHit;
        const anchorIsOutput = anchor.pin.direction === "output";
        const targetIsOutput = target.pin.direction === "output";

        if (anchorIsOutput !== targetIsOutput && isPinTypeCompatible(anchor.pin.type, target.pin.type)) {
          const outputEnd = anchorIsOutput ? anchor : target;
          const inputEnd = anchorIsOutput ? target : anchor;
          try {
            connectPins(graph, variables, functions, {
              fromNode: outputEnd.nodeId,
              fromPin: outputEnd.pinId,
              toNode: inputEnd.nodeId,
              toPin: inputEnd.pinId,
            });
            connected = true;
          } catch {
            // incompatible/invalid — treated the same as an empty-space drop below
          }
        }
      }

      store.state.wireDrag = null;
      drag = { kind: "none" };
      store.notify();
      if (!connected) callbacks.onWireDroppedInEmptySpace(anchor, pos);
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
        const enclosed = graph.nodes.filter((n) =>
          rectContains(box, computeNodeWorldRect(n, resolvePinDefs(n, variables, functions), functions)),
        );
        store.state.selectedNodeIds = new Set(enclosed.map((n) => n.id));
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
      for (const nodeId of selectedNodeIds) {
        removeNode(graph, nodeId);
      }
      if (selectedCommentId) removeCommentBox(graph, selectedCommentId);
      store.state.selectedNodeIds = new Set();
      store.state.selectedCommentId = null;
      store.notify();
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
          .map((n) => computeNodeWorldRect(n, resolvePinDefs(n, variables, functions), functions));

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
