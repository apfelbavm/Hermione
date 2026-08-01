import { connectPins, disconnectPin } from "../engine/graphMutations";
import { connectionsTouchingPin } from "../engine/graphQueries";
import { getNodeDef, isPinTypeCompatible } from "../engine/registry";
import { CodeScriptDef, CommentBox, FunctionDef, PinDef, Variable } from "../engine/types";
import { COMMENT_HEADER_HEIGHT, COMMENT_MIN_SIZE, rectContains, rectIntersects, type WorldRect } from "../render/commentGeometry";
import { snapPositionToGrid } from "../render/drawGrid";
import { computeAllNodeGeometries, computeNodeWorldRect } from "../render/nodeGeometry";
import { hitTestCommentHeader, hitTestCommentResizeHandle, hitTestNode, hitTestNodeAddButton, hitTestPin, type CommentCorner, type PinHit } from "../render/hitTest";
import { getEditingGraph, getVisibleVariablesForState, openFunctionTab, openScriptTab, type MarqueeSelectionState, type Store } from "../../state/store";
import { Graph } from "../engine/graph";

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
  | {
      kind: "comment-move";
      startWorld: { x: number; y: number };
      /** Every SELECTED comment box's own top-left at drag-start — the whole group moves together,
       * mirroring "nodes"'s own multi-drag above. */
      initialBoxPositions: Map<string, { x: number; y: number }>;
      /** Every node contained by any of those boxes (deduped by id, in case of overlapping boxes),
       * at drag-start — moves by the same delta as its owning box. */
      initialNodePositions: Map<string, { x: number; y: number }>;
    }
  | {
      kind: "comment-resize";
      commentId: string;
      corner: CommentCorner;
      /** World-space position of the box's OPPOSITE corner, fixed for the whole drag — e.g.
       * grabbing "nw" anchors the box's bottom-right — so the new rect can be derived from just
       * this plus the cursor's current world position, regardless of which corner was grabbed. */
      anchor: { x: number; y: number };
    };

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
function tryConnectAnchorsToTarget(graph: Graph, variables: Variable[], functions: FunctionDef[], scripts: CodeScriptDef[], anchors: WireAnchor[], target: PinHit): boolean {
  if (anchors.some((a) => a.nodeId === target.nodeId)) return false; // no self-loops
  const anchorIsOutput = anchors[0].pin.direction === "output";
  const targetIsOutput = target.pin.direction === "output";
  if (anchorIsOutput === targetIsOutput || !isPinTypeCompatible(anchors[0].pin, target.pin)) return false;

  for (const anchor of anchors) {
    const outputEnd = anchorIsOutput ? anchor : target;
    const inputEnd = anchorIsOutput ? target : anchor;
    try {
      connectPins(
        graph,
        variables,
        functions,
        {
          fromNode: outputEnd.nodeId,
          fromPin: outputEnd.pinId,
          toNode: inputEnd.nodeId,
          toPin: inputEnd.pinId,
        },
        scripts,
      );
    } catch {
      // Invalid for this particular anchor — skip it, the others may still connect fine.
    }
  }
  return true;
}

/** Recomputes which nodes currently sit geometrically inside a comment box's body — called
 * fresh whenever a header-drag starts, so it picks up nodes moved into the box since it was
 * last resized, matching Unreal's "whatever's actually inside moves with it" behavior. */
function recomputeContainment(graph: Graph, variables: Variable[], functions: FunctionDef[], scripts: CodeScriptDef[], box: CommentBox): void {
  const innerBounds = {
    x: box.position.x,
    y: box.position.y + COMMENT_HEADER_HEIGHT,
    width: box.size.width,
    height: box.size.height - COMMENT_HEADER_HEIGHT,
  };
  box.containedNodeIds = graph.nodes.filter((n) => rectContains(innerBounds, computeNodeWorldRect(n, n.resolvePinDefs(variables, functions, scripts), variables, functions, scripts))).map((n) => n.id);
}

/** The marquee's own start/current corners (in either order) as a normalized world-space rect —
 * shared by every "what does the marquee touch" query below. */
function marqueeWorldRect(marquee: MarqueeSelectionState): WorldRect {
  return {
    x: Math.min(marquee.startWorld.x, marquee.currentWorld.x),
    y: Math.min(marquee.startWorld.y, marquee.currentWorld.y),
    width: Math.abs(marquee.currentWorld.x - marquee.startWorld.x),
    height: Math.abs(marquee.currentWorld.y - marquee.startWorld.y),
  };
}

/** Every node id whose world rect intersects a marquee-select box (start/current corners, in either
 * order) — shared by the marquee's own mousemove (so the selection updates live as the box is
 * dragged, matching Unreal/most node editors) and its mouseup (which just finalizes the same
 * computation one last time before clearing the drag). */
function computeMarqueeSelectedNodeIds(graph: Graph, variables: Variable[], functions: FunctionDef[], scripts: CodeScriptDef[], marquee: MarqueeSelectionState): Set<string> {
  const box = marqueeWorldRect(marquee);
  const touched = graph.nodes.filter((n) => rectIntersects(box, computeNodeWorldRect(n, n.resolvePinDefs(variables, functions, scripts), variables, functions, scripts)));
  return new Set(touched.map((n) => n.id));
}

/** Every comment box id the marquee touches — the hot zone is deliberately just the box's TITLE
 * BAR (matching hitTestCommentHeader's own click/drag hot zone), not its whole body, so a marquee
 * drawn entirely inside a large comment box (to select nodes placed within it) doesn't also always
 * drag the comment box itself into the selection. */
function computeMarqueeSelectedCommentIds(graph: Graph, marquee: MarqueeSelectionState): Set<string> {
  const box = marqueeWorldRect(marquee);
  const touched = graph.commentBoxes.filter((commentBox) => {
    const headerRect: WorldRect = {
      x: commentBox.position.x,
      y: commentBox.position.y,
      width: commentBox.size.width,
      height: COMMENT_HEADER_HEIGHT,
    };
    return rectIntersects(box, headerRect);
  });
  return new Set(touched.map((b) => b.id));
}

export interface PointerInteraction {
  /** True if a right-drag pan just moved the camera — consumed once, so the trailing native
   * "contextmenu" event knows to suppress the node-creation menu instead of opening it at the
   * release point. A plain right-click with no drag still opens the menu as normal. */
  shouldSuppressContextMenu: () => boolean;
  /** Cursor position in canvas-local screen space, last observed on "mousemove" — consumed by
   * ShortcutManager to place pasted nodes/new comment boxes at the cursor, since keydown events
   * carry no pointer coordinates of their own. */
  getCursorScreenPos: () => { x: number; y: number };
}

export function setupPointerInteraction(canvas: HTMLCanvasElement, store: Store, callbacks: PointerInteractionCallbacks): PointerInteraction {
  let drag: DragMode = { kind: "none" };
  // Tracked continuously so ShortcutManager's comment-box/paste shortcuts know where the cursor is —
  // keydown events carry no pointer coordinates of their own.
  let lastMouseScreenPos = { x: 0, y: 0 };
  // Set once a right-drag pan actually moves; consumed by shouldSuppressContextMenu so a
  // right-drag-to-pan doesn't also pop the node-creation context menu at the release point.
  let rightDragMoved = false;

  function screenPos(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // --- Auto-pan while dragging a new wire off a pin, OR dragging node(s) around, and holding the
  // cursor near (or past) the canvas edge — otherwise a wire (or a node) couldn't reach a spot
  // that's currently off-screen without the user separately panning first. Runs its own
  // requestAnimationFrame ticker (rather than reacting only to mousemove) since the whole point is
  // to keep panning while the mouse stays HELD STILL right at the edge — no further mousemove
  // events fire in that case.
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
      dx: edgePanComponent(pos.x, AUTO_PAN_EDGE_MARGIN, AUTO_PAN_MAX_SPEED) - edgePanComponent(width - pos.x, AUTO_PAN_EDGE_MARGIN, AUTO_PAN_MAX_SPEED),
      dy: edgePanComponent(pos.y, AUTO_PAN_EDGE_MARGIN, AUTO_PAN_MAX_SPEED) - edgePanComponent(height - pos.y, AUTO_PAN_EDGE_MARGIN, AUTO_PAN_MAX_SPEED),
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
    const scripts = store.state.rootGraph.scripts;
    const geometries = computeAllNodeGeometries(graph, camera, variables, functions, scripts);

    if (drag.kind === "wire") {
      const anchorScreen = geometries.get(drag.anchor.nodeId)?.pinScreen[drag.anchor.pinId];
      if (anchorScreen) store.state.wireDrag.fromScreens = [anchorScreen];
    } else {
      store.state.wireDrag.fromScreens = drag.anchors.map((a) => geometries.get(a.nodeId)?.pinScreen[a.pinId]).filter((p): p is { x: number; y: number } => !!p);
    }
    store.state.wireDrag.toScreen = lastMouseScreenPos;
  }

  /** Recomputes dragged node(s)' world positions from the CURRENT camera and the cursor's last
   * known SCREEN position — shared by the mousemove handler and the auto-pan ticker, same reason
   * as updateWireDragPreview: panning the camera under a stationary cursor changes what world
   * point that screen position resolves to, exactly as if the cursor itself had moved there. */
  function updateNodeDragPositions(): void {
    if (drag.kind !== "nodes") return;
    const graph = getEditingGraph(store.state);
    const { camera } = store.state;
    const { startWorld, initialPositions } = drag;
    const worldPos = camera.screenToWorld(lastMouseScreenPos.x, lastMouseScreenPos.y);
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
  }

  /** Recomputes the marquee box's far corner and which nodes it currently touches from the CURRENT
   * camera and the cursor's last known SCREEN position — shared by the mousemove handler and the
   * auto-pan ticker, same reason as updateNodeDragPositions/updateWireDragPreview: panning the
   * camera under a stationary cursor (dragging the selection box right up against a canvas edge)
   * changes what world point/nodes that screen position resolves to, exactly as if the cursor
   * itself had moved there. */
  function updateMarqueeSelection(): void {
    if (drag.kind !== "marquee" || !store.state.marqueeSelection) return;
    const graph = getEditingGraph(store.state);
    const { camera } = store.state;
    const marquee = store.state.marqueeSelection;
    marquee.currentWorld = camera.screenToWorld(lastMouseScreenPos.x, lastMouseScreenPos.y);
    const variables = getVisibleVariablesForState(store.state);
    const functions = store.state.rootGraph.functions;
    const scripts = store.state.rootGraph.scripts;
    store.state.selectedNodeIds = computeMarqueeSelectedNodeIds(graph, variables, functions, scripts, marquee);
    store.state.selectedCommentIds = computeMarqueeSelectedCommentIds(graph, marquee);
  }

  function startAutoPanLoop(): void {
    if (autoPanFrame !== null) return;
    const tick = () => {
      autoPanFrame = null;
      // Drag ended — stop rescheduling.
      if (drag.kind !== "wire" && drag.kind !== "wire-multi" && drag.kind !== "nodes" && drag.kind !== "marquee") return;
      const rect = canvas.getBoundingClientRect();
      const { dx, dy } = computeAutoPanDelta(lastMouseScreenPos, rect.width, rect.height);
      if (dx !== 0 || dy !== 0) {
        store.state.camera.pan(dx, dy);
        if (drag.kind === "nodes") updateNodeDragPositions();
        else if (drag.kind === "marquee") updateMarqueeSelection();
        else updateWireDragPreview();
        store.notify();
      }
      autoPanFrame = requestAnimationFrame(tick);
    };
    autoPanFrame = requestAnimationFrame(tick);
  }

  // Firefox (unlike Chromium) treats a plain <canvas> as natively draggable by default: a
  // click-drag starting on it kicks off the browser's own OS-level drag-ghost gesture (the whole
  // canvas visibly drags away as a translucent image) INSTEAD OF delivering the ordinary mousedown/
  // mousemove/mouseup sequence the marquee-select and node-drag logic below rely on. Once that
  // native drag steals the gesture, the mouseup that would reset `drag` back to "none" never fires,
  // so `drag.kind` gets stuck (e.g. at "marquee") and every later plain mousemove — even with no
  // button held — keeps resizing the stale selection box, exactly as if it were still being dragged.
  // Canvas content should never be natively draggable here, so unconditionally cancel it.
  canvas.draggable = false;
  canvas.addEventListener("dragstart", (e) => e.preventDefault());

  canvas.addEventListener("mousedown", (e) => {
    if (e.button === 2) {
      // Right-drag pans the camera; a right-click with no drag still opens the context menu
      // (see shouldSuppressContextMenu, consumed by main.ts's "contextmenu" listener). Left
      // available during a Simulate run too — it only moves the camera, never the locked graph.
      rightDragMoved = false;
      drag = { kind: "pan", lastX: e.clientX, lastY: e.clientY };
      return;
    }

    if (store.state.simulating) return; // graph is locked for the duration of a Simulate run

    // Any click inside the graph view — regardless of what it hits — stands down whatever
    // Variables/Functions sidebar row was selected, so the Details panel only ever reflects
    // whichever was clicked last (see detailsPanel.ts).
    store.state.sidebarSelection = null;

    // Clicking on <canvas> (no text content of its own) does NOT clear a pre-existing browser text
    // selection elsewhere on the page — e.g. from an earlier drag across log lines to copy them —
    // the way clicking on ordinary text does. Left alone, that stale selection stays non-collapsed
    // indefinitely, so the Ctrl+C handler's "is the user copying log text?" check (below, keyed off
    // window.getSelection() being anchored in the log panel) kept firing for an old selection long
    // after the user had moved on to selecting nodes here instead — permanently shadowing graph-node
    // copying until something else happened to clear it. Starting a fresh canvas interaction is a
    // clear signal focus has moved to the graph, so clear it here.
    window.getSelection()?.removeAllRanges();

    if (e.button !== 0) return; // ignore middle-click etc.

    const graph = getEditingGraph(store.state);
    const { camera } = store.state;
    const variables = getVisibleVariablesForState(store.state);
    const functions = store.state.rootGraph.functions;
    const scripts = store.state.rootGraph.scripts;
    const pos = screenPos(e);
    const geometries = computeAllNodeGeometries(graph, camera, variables, functions, scripts);

    const addButtonHit = hitTestNodeAddButton(graph, geometries, pos.x, pos.y);
    if (addButtonHit) {
      if (store.state.readOnly) return;
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
      if (store.state.readOnly) return; // no wire dragging in read-only mode
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
          const otherPinDef = otherNode.resolvePinDefs(variables, functions, scripts).find((p) => p.id === otherPinId)!;
          return { nodeId: otherNodeId, pinId: otherPinId, pin: otherPinDef };
        });
        for (const conn of touching) {
          graph.removeConnection(variables, functions, conn.id, scripts);
        }

        drag = { kind: "wire-multi", anchors };
        store.state.wireDrag = {
          fromScreens: anchors.map((a) => geometries.get(a.nodeId)?.pinScreen[a.pinId]).filter((p): p is { x: number; y: number } => !!p),
          toScreen: pos,
          pinType: anchors[0].pin.type,
          anchorDirection: anchors[0].pin.direction,
        };
        startAutoPanLoop();
        store.notify();
        return;
      }

      let anchor: WireAnchor = {
        nodeId: pinHit.nodeId,
        pinId: pinHit.pinId,
        pin: pinHit.pin,
      };

      // Grabbing a connected input pin picks up the existing wire: detach it and
      // keep dragging from its upstream output, mirroring Unreal's pin-grab behavior.
      if (pinHit.pin.direction === "input") {
        const existing = findConnectionToInput(graph, pinHit.nodeId, pinHit.pinId);
        if (existing) {
          const fromNode = graph.nodes.find((n) => n.id === existing.fromNode)!;
          const fromPinDef = fromNode.resolvePinDefs(variables, functions, scripts).find((p) => p.id === existing.fromPin)!;
          disconnectPin(graph, variables, functions, pinHit.nodeId, pinHit.pinId, scripts);
          anchor = {
            nodeId: fromNode.id,
            pinId: fromPinDef.id,
            pin: fromPinDef,
          };
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
      const worldPos = camera.screenToWorld(pos.x, pos.y);

      // A single click on a Code node jumps straight to its script's Inputs/Outputs in the
      // sidebar Details panel, same as clicking that script's own row in the Scripts list would —
      // unlike Get/Set Variable (only on double-click, see the dblclick handler below), since a
      // script's whole reason for being on the canvas is usually to check/edit its signature.
      // mousedown's own unconditional reset above already cleared sidebarSelection; setting it
      // here afterward correctly wins in detailsPanel.ts's own precedence order.
      if (node.type === "code.run" && node.scriptId) {
        store.state.sidebarSelection = {
          kind: "script",
          scriptId: node.scriptId,
        };
      }

      if (e.ctrlKey || e.metaKey) {
        // Ctrl/Cmd-click toggles this node's membership in the current multi-selection.
        const next = new Set(store.state.selectedNodeIds);
        if (next.has(node.id)) next.delete(node.id);
        else next.add(node.id);
        store.state.selectedNodeIds = next;
        store.state.selectedCommentIds = new Set();
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
        store.state.selectedCommentIds = new Set();
      }
      // else: the clicked node is already part of an existing multi-selection — keep the whole
      // selection intact so the drag below moves the whole group, Unreal-style.

      if (store.state.readOnly) {
        // Selection above already applied; just skip starting an actual drag.
        drag = { kind: "none" };
        store.notify();
        return;
      }

      const initialPositions = new Map<string, { x: number; y: number }>();
      for (const id of store.state.selectedNodeIds) {
        const n = graph.nodes.find((gn) => gn.id === id);
        if (n) initialPositions.set(id, { x: n.position.x, y: n.position.y });
      }
      drag = { kind: "nodes", startWorld: worldPos, initialPositions };
      startAutoPanLoop();
      store.notify();
      return;
    }

    const resizeHit = hitTestCommentResizeHandle(graph, camera, pos.x, pos.y);
    if (resizeHit && !store.state.readOnly) {
      const box = graph.commentBoxes.find((b) => b.id === resizeHit.commentId)!;
      // The FIXED opposite corner — e.g. grabbing "nw" anchors the box's bottom-right — captured
      // once here so the whole drag can derive the new rect from just this plus the live cursor
      // position (see the mousemove handler below), regardless of which corner was grabbed.
      const anchor = {
        x: resizeHit.corner === "nw" || resizeHit.corner === "sw" ? box.position.x + box.size.width : box.position.x,
        y: resizeHit.corner === "nw" || resizeHit.corner === "ne" ? box.position.y + box.size.height : box.position.y,
      };
      // Resizing always targets just the one grabbed box, even if it's part of a larger
      // multi-selection — there's no meaningful "resize several boxes at once" gesture here.
      store.state.selectedCommentIds = new Set([resizeHit.commentId]);
      store.state.selectedNodeIds = new Set();
      drag = {
        kind: "comment-resize",
        commentId: resizeHit.commentId,
        corner: resizeHit.corner,
        anchor,
      };
      store.notify();
      return;
    }

    const headerHit = hitTestCommentHeader(graph, camera, pos.x, pos.y);
    if (headerHit) {
      const worldPos = camera.screenToWorld(pos.x, pos.y);

      if (e.ctrlKey || e.metaKey) {
        // Ctrl/Cmd-click toggles this box's membership in the current multi-selection, mirroring
        // the node ctrl-click above.
        const next = new Set(store.state.selectedCommentIds);
        if (next.has(headerHit.commentId)) next.delete(headerHit.commentId);
        else next.add(headerHit.commentId);
        store.state.selectedCommentIds = next;
        store.state.selectedNodeIds = new Set();
        if (!next.has(headerHit.commentId)) {
          // Just deselected it — nothing to grab from here.
          drag = { kind: "none" };
          store.notify();
          return;
        }
        // Otherwise fall through and start a group-drag of the updated selection below.
      } else if (!store.state.selectedCommentIds.has(headerHit.commentId)) {
        // Fresh click on a box outside the current selection replaces the selection.
        store.state.selectedCommentIds = new Set([headerHit.commentId]);
        store.state.selectedNodeIds = new Set();
      }
      // else: the clicked box is already part of an existing multi-selection — keep the whole
      // selection intact so the drag below moves the whole group, Unreal-style.

      if (store.state.readOnly) {
        // Selection above already applied; just skip starting an actual drag.
        drag = { kind: "none" };
        store.notify();
        return;
      }

      // Every selected box (not just the one grabbed) moves together — same "whole group, one
      // motion" shape as the node drag above. Containment is recomputed fresh per box (picking up
      // anything moved into it since its last resize/move) before capturing drag-start positions.
      const initialBoxPositions = new Map<string, { x: number; y: number }>();
      const initialNodePositions = new Map<string, { x: number; y: number }>();
      for (const id of store.state.selectedCommentIds) {
        const box = graph.commentBoxes.find((b) => b.id === id);
        if (!box) continue;
        recomputeContainment(graph, variables, functions, scripts, box);
        initialBoxPositions.set(id, { x: box.position.x, y: box.position.y });
        for (const nodeId of box.containedNodeIds) {
          if (initialNodePositions.has(nodeId)) continue; // already captured via another selected box
          const node = graph.nodes.find((n) => n.id === nodeId);
          if (node)
            initialNodePositions.set(nodeId, {
              x: node.position.x,
              y: node.position.y,
            });
        }
      }
      drag = {
        kind: "comment-move",
        startWorld: worldPos,
        initialBoxPositions,
        initialNodePositions,
      };
      store.notify();
      return;
    }

    // Empty space: clear selection and start a rubber-band marquee-select box.
    store.state.selectedNodeIds = new Set();
    store.state.selectedCommentIds = new Set();
    const worldPos = camera.screenToWorld(pos.x, pos.y);
    store.state.marqueeSelection = {
      startWorld: worldPos,
      currentWorld: worldPos,
    };
    drag = { kind: "marquee" };
    startAutoPanLoop();
    store.notify();
  });

  canvas.addEventListener("dblclick", (e) => {
    if (store.state.simulating) return;
    const graph = getEditingGraph(store.state);
    const { camera } = store.state;
    const variables = getVisibleVariablesForState(store.state);
    const functions = store.state.rootGraph.functions;
    const scripts = store.state.rootGraph.scripts;
    const pos = screenPos(e);
    const geometries = computeAllNodeGeometries(graph, camera, variables, functions, scripts);

    const nodeHit = hitTestNode(graph, geometries, pos.x, pos.y);
    if (!nodeHit) return;
    const node = graph.nodes.find((n) => n.id === nodeHit.nodeId);
    if (!node) return;

    if (node.type === "function.call" && node.functionId) {
      openFunctionTab(store.state, node.functionId);
      store.notify();
      return;
    }

    // Entry (the function's inputs, as its own output pins) or Return (the function's outputs, as
    // its own input pins) — jump to that function's Inputs/Outputs in the sidebar Details panel,
    // same as double-clicking a Get/Set Variable node jumps to its variable below.
    if ((node.type === "function.entry" || node.type === "function.return") && node.functionId) {
      store.state.sidebarSelection = {
        kind: "function",
        functionId: node.functionId,
      };
      store.notify();
      return;
    }

    // Same idea as Call Function above, but for the lower panel instead of the canvas tab strip —
    // opens (or focuses) this script's Monaco tab there (see scriptEditor.ts/openScriptTab).
    if (node.type === "code.run" && node.scriptId) {
      openScriptTab(store.state, node.scriptId);
      store.notify();
      return;
    }

    // Any Get/Set Variable node instance — jump to that variable in the sidebar list (highlighting
    // it there, same as clicking its row directly) and the Details panel, mirroring the Call
    // Function double-click above. The plain click that precedes this dblclick already cleared
    // sidebarSelection (see mousedown's unconditional reset) and selected the node itself, so
    // setting it here afterward correctly wins in detailsPanel.ts's own precedence order.
    if (node.variableId) {
      store.state.sidebarSelection = {
        kind: "variable",
        variableId: node.variableId,
      };
      store.notify();
    }
  });

  window.addEventListener("mousemove", (e) => {
    lastMouseScreenPos = screenPos(e);

    // Resize-cursor hover feedback over any of the comment box's four corners — shown while just
    // hovering one (not dragging anything) or throughout an active resize (keeps it consistent for
    // the whole drag, rather than flickering back to the default cursor mid-resize). The diagonal
    // matches the corner: "nw"/"se" run top-left-to-bottom-right, "ne"/"sw" the other way.
    if (drag.kind === "none" || drag.kind === "comment-resize") {
      const corner = drag.kind === "comment-resize" ? drag.corner : hitTestCommentResizeHandle(getEditingGraph(store.state), store.state.camera, lastMouseScreenPos.x, lastMouseScreenPos.y)?.corner;
      canvas.style.cursor = corner ? (corner === "nw" || corner === "se" ? "nwse-resize" : "nesw-resize") : "";
    }

    if (drag.kind === "none") return;
    const graph = getEditingGraph(store.state);
    const { camera } = store.state;

    if (drag.kind === "pan") {
      camera.pan(e.clientX - drag.lastX, e.clientY - drag.lastY);
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      rightDragMoved = true;
      store.notify();
      return;
    }

    if (drag.kind === "nodes") {
      updateNodeDragPositions();
      store.notify();
      return;
    }

    if (drag.kind === "marquee") {
      updateMarqueeSelection();
      store.notify();
      return;
    }

    if (drag.kind === "wire" || drag.kind === "wire-multi") {
      updateWireDragPreview();
      store.notify();
      return;
    }

    if (drag.kind === "comment-move") {
      // Same "delta from drag-start, applied to each initial position, independently snapped"
      // shape as updateNodeDragPositions above — here applied to every selected box AND every
      // node any of them contains, so the whole group moves together in one motion.
      const { startWorld, initialBoxPositions, initialNodePositions } = drag;
      const pos = screenPos(e);
      const worldPos = camera.screenToWorld(pos.x, pos.y);
      const dx = worldPos.x - startWorld.x;
      const dy = worldPos.y - startWorld.y;
      for (const [commentId, initial] of initialBoxPositions) {
        const box = graph.commentBoxes.find((b) => b.id === commentId);
        if (!box) continue;
        const next = { x: initial.x + dx, y: initial.y + dy };
        const snapped = store.state.snapToGrid ? snapPositionToGrid(next) : next;
        box.position.x = snapped.x;
        box.position.y = snapped.y;
      }
      for (const [nodeId, initial] of initialNodePositions) {
        const node = graph.nodes.find((n) => n.id === nodeId);
        if (!node) continue;
        const next = { x: initial.x + dx, y: initial.y + dy };
        const snapped = store.state.snapToGrid ? snapPositionToGrid(next) : next;
        node.position.x = snapped.x;
        node.position.y = snapped.y;
      }
      store.notify();
      return;
    }

    if (drag.kind === "comment-resize") {
      const { commentId, anchor } = drag;
      const box = graph.commentBoxes.find((b) => b.id === commentId);
      if (box) {
        const pos = screenPos(e);
        const worldPos = camera.screenToWorld(pos.x, pos.y);
        // The new rect is fully determined by the fixed anchor (the opposite corner) plus the
        // cursor's current world position — works for any of the four corners uniformly, since
        // "which side grows" falls out of which side of the anchor the cursor is currently on.
        const rawWidth = worldPos.x - anchor.x;
        const rawHeight = worldPos.y - anchor.y;
        const width = Math.max(COMMENT_MIN_SIZE, Math.abs(rawWidth));
        const height = Math.max(COMMENT_MIN_SIZE, Math.abs(rawHeight));
        box.position.x = rawWidth >= 0 ? anchor.x : anchor.x - width;
        box.position.y = rawHeight >= 0 ? anchor.y : anchor.y - height;
        box.size.width = width;
        box.size.height = height;
      }
      store.notify();
    }
  });

  window.addEventListener("mouseup", (e) => {
    // Stops the auto-pan ticker the instant any drag ends, regardless of which kind — it would
    // otherwise keep rescheduling itself for one more idle frame before its own drag.kind check
    // (see startAutoPanLoop) notices the drag is over. A no-op when nothing was scheduled.
    if (autoPanFrame !== null) {
      cancelAnimationFrame(autoPanFrame);
      autoPanFrame = null;
    }

    if (drag.kind === "wire" || drag.kind === "wire-multi") {
      const graph = getEditingGraph(store.state);
      const { camera } = store.state;
      const variables = getVisibleVariablesForState(store.state);
      const functions = store.state.rootGraph.functions;
      const scripts = store.state.rootGraph.scripts;
      const pos = screenPos(e);
      const geometries = computeAllNodeGeometries(graph, camera, variables, functions, scripts);
      const targetHit = hitTestPin(graph, geometries, pos.x, pos.y);
      const anchors = drag.kind === "wire" ? [drag.anchor] : drag.anchors;

      const connected = targetHit ? tryConnectAnchorsToTarget(graph, variables, functions, scripts, anchors, targetHit) : false;

      store.state.wireDrag = null;
      drag = { kind: "none" };
      store.notify();
      if (!connected) callbacks.onWireDroppedInEmptySpace(anchors, pos);
      return;
    }

    if (drag.kind === "comment-resize") {
      const graph = getEditingGraph(store.state);
      const { commentId } = drag;
      const box = graph.commentBoxes.find((b) => b.id === commentId);
      if (box) {
        recomputeContainment(graph, getVisibleVariablesForState(store.state), store.state.rootGraph.functions, store.state.rootGraph.scripts, box);
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
        const scripts = store.state.rootGraph.scripts;
        store.state.selectedNodeIds = computeMarqueeSelectedNodeIds(graph, variables, functions, scripts, marquee);
        store.state.selectedCommentIds = computeMarqueeSelectedCommentIds(graph, marquee);
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
      // Zooming, like panning, only moves the camera — allowed during a Simulate run.
      const rect = canvas.getBoundingClientRect();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      store.state.camera.zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor);
      store.notify();
    },
    { passive: false },
  );

  return {
    getCursorScreenPos: () => lastMouseScreenPos,
    shouldSuppressContextMenu: () => {
      const moved = rightDragMoved;
      rightDragMoved = false;
      return moved;
    },
  };
}
