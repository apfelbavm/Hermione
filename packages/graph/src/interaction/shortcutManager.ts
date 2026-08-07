import { cloneNodesForClipboard, parseClipboardPayload, pasteNodesIntoGraph, pasteVariableIntoGraph, serializeNodesClipboardPayload, serializeVariableClipboardPayload } from "@hermione/graph/engine/clipboard";
import { Graph } from "@hermione/graph/engine/graph";
import { addCommentBox, nextId, removeCommentBox } from "@hermione/graph/engine/graphMutations";
import { getNodeDef } from "@hermione/graph/engine/registry";
import type { CommentBox } from "@hermione/graph/engine/types";
import { COMMENT_HEADER_HEIGHT, DEFAULT_COMMENT_COLOR, DEFAULT_COMMENT_HEIGHT, DEFAULT_COMMENT_WIDTH } from "@hermione/graph/render/commentGeometry";
import { snapPositionToGrid } from "@hermione/graph/render/drawGrid";
import { computeNodeWorldRect } from "@hermione/graph/render/nodeGeometry";
import type { HistoryManager } from "@hermione/graph/state/history";
import { getEditingGraph, getVisibleVariablesForState, type Store } from "@hermione/graph/state/store";

export function selectAllNodes(graph: Graph): Set<string> {
  return new Set(graph.nodes.map((n) => n.id));
}

export function selectAllCommentBoxes(graph: Graph): Set<string> {
  return new Set(graph.commentBoxes.map((b) => b.id));
}

export interface ShortcutManagerOptions {
  scopeRoot: HTMLElement;

  /** Elements nested inside scopeRoot (e.g. the AI chat panel) that should still be able to use
   * native browser copy/paste/undo instead of having this manager intercept them. */
  excludeRoots?: HTMLElement[];

  getCursorScreenPos: () => { x: number; y: number };
}

export class ShortcutManager {
  private active = false;

  private readonly handleKeyDown = (e: KeyboardEvent): void => this.onKeyDown(e);
  private readonly handlePointerDown = (e: MouseEvent): void => this.updateActive(e.target);
  private readonly handleFocusIn = (e: FocusEvent): void => this.updateActive(e.target);

  constructor(
    private readonly store: Store,
    private readonly history: HistoryManager,
    private readonly options: ShortcutManagerOptions,
  ) {
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("mousedown", this.handlePointerDown, true);
    window.addEventListener("focusin", this.handleFocusIn);
  }

  dispose(): void {
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("mousedown", this.handlePointerDown, true);
    window.removeEventListener("focusin", this.handleFocusIn);
  }

  private updateActive(target: EventTarget | null): void {
    if (!(target instanceof Node)) {
      this.active = false;
      return;
    }
    const excluded = this.options.excludeRoots?.some((root) => root.contains(target)) ?? false;
    this.active = !excluded && this.options.scopeRoot.contains(target);
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (this.store.state.simulating) return; // graph is locked for the duration of a Simulate run
    if (!this.active) return;

    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement || (activeElement instanceof HTMLElement && activeElement.isContentEditable)) {
      return;
    }

    if (e.key === "Delete" || e.key === "Backspace") {
      this.handleDelete();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
      this.handleSelectAll(e);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      this.handleUndoRedo(e);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
      this.handleCopy(e);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "x") {
      this.handleCut(e);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
      this.handlePaste(e);
      return;
    }
    if (e.key.toLowerCase() === "c" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      this.handleWrapInComment();
      return;
    }
    if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
      this.handleArrowMove(e);
      return;
    }
  }

  private handleArrowMove(e: KeyboardEvent): void {
    const store = this.store;
    if (store.state.readOnly) return;
    const { selectedNodeIds, selectedCommentIds } = store.state;
    if (selectedNodeIds.size === 0 && selectedCommentIds.size === 0) return;

    e.preventDefault();
    const STEP = 10;
    const dx = e.key === "ArrowLeft" ? -STEP : e.key === "ArrowRight" ? STEP : 0;
    const dy = e.key === "ArrowUp" ? -STEP : e.key === "ArrowDown" ? STEP : 0;

    const graph = getEditingGraph(store.state);
    for (const nodeId of selectedNodeIds) {
      const node = graph.nodes.find((n) => n.id === nodeId);
      if (node) {
        node.position.x += dx;
        node.position.y += dy;
      }
    }
    for (const commentId of selectedCommentIds) {
      const box = graph.commentBoxes.find((b) => b.id === commentId);
      if (box) {
        box.position.x += dx;
        box.position.y += dy;
      }
    }
    store.notify();
  }

  private handleDelete(): void {
    const store = this.store;
    if (store.state.readOnly) return;
    const { selectedNodeIds, selectedCommentIds } = store.state;
    if (selectedNodeIds.size === 0 && selectedCommentIds.size === 0) return;
    const graph = getEditingGraph(store.state);
    const variables = getVisibleVariablesForState(store.state);
    const functions = store.state.rootGraph.functions;
    const scripts = store.state.rootGraph.scripts;
    for (const nodeId of selectedNodeIds) {
      graph.removeNode(variables, functions, nodeId, scripts);
    }
    for (const commentId of selectedCommentIds) {
      removeCommentBox(graph, commentId);
    }
    store.state.selectedNodeIds = new Set();
    store.state.selectedCommentIds = new Set();
    store.notify();
  }

  private handleSelectAll(e: KeyboardEvent): void {
    e.preventDefault();
    const store = this.store;
    const graph = getEditingGraph(store.state);
    store.state.selectedNodeIds = selectAllNodes(graph);
    store.state.selectedCommentIds = selectAllCommentBoxes(graph);
    store.notify();
  }

  private handleUndoRedo(e: KeyboardEvent): void {
    if (this.store.state.readOnly) return;
    e.preventDefault();
    if (e.shiftKey) this.history.redo();
    else this.history.undo();
  }

  private handleCopy(e: KeyboardEvent): void {
    const selection = window.getSelection();
    const logPanel = document.getElementById("log-panel");
    const copyingLogText = !!selection && !selection.isCollapsed && selection.toString().length > 0 && !!logPanel && !!selection.anchorNode && logPanel.contains(selection.anchorNode);
    if (copyingLogText) return;

    e.preventDefault();
    const store = this.store;
    const graph = getEditingGraph(store.state);
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
  }

  private handleCut(e: KeyboardEvent): void {
    if (this.store.state.readOnly) return;
    const selection = window.getSelection();
    const logPanel = document.getElementById("log-panel");
    const cuttingLogText = !!selection && !selection.isCollapsed && selection.toString().length > 0 && !!logPanel && !!selection.anchorNode && logPanel.contains(selection.anchorNode);
    if (cuttingLogText) return;

    e.preventDefault();
    const store = this.store;
    const { selectedNodeIds } = store.state;
    if (selectedNodeIds.size === 0) return;

    const graph = getEditingGraph(store.state);
    const { nodes, connections } = cloneNodesForClipboard(graph, selectedNodeIds);
    if (nodes.length === 0) return; // selection was entirely undeletable nodes (Entry/Return) — nothing to cut
    navigator.clipboard.writeText(serializeNodesClipboardPayload(nodes, connections)).catch(() => {});

    const variables = getVisibleVariablesForState(store.state);
    const functions = store.state.rootGraph.functions;
    const scripts = store.state.rootGraph.scripts;
    for (const nodeId of selectedNodeIds) {
      graph.removeNode(variables, functions, nodeId, scripts);
    }
    store.state.selectedNodeIds = new Set();
    store.notify();
  }

  private handlePaste(e: KeyboardEvent): void {
    if (this.store.state.readOnly) return;
    e.preventDefault();
    const store = this.store;
    navigator.clipboard
      .readText()
      .then((text) => {
        const payload = parseClipboardPayload(text);
        if (!payload) return; // not our own copied data (or nothing/garbage on the clipboard) — no-op

        const pasteGraph = getEditingGraph(store.state);
        if (payload.kind === "nodes") {
          const isFunctionBody = store.state.activeFunctionId !== null;
          const seenEventTypes = new Set<string>();
          const placeableNodes = payload.nodes.filter((n) => {
            if (!pasteGraph.canPlaceNodeType(n.type, isFunctionBody)) return false;
            if (getNodeDef(n.type).eventTrigger) {
              if (seenEventTypes.has(n.type)) return false;
              seenEventTypes.add(n.type);
            }
            return true;
          });
          const placeablePayload = { ...payload, nodes: placeableNodes };

          const cursor = this.options.getCursorScreenPos();
          const rawTarget = store.state.camera.screenToWorld(cursor.x, cursor.y);
          const targetTopLeft = store.state.snapToGrid ? snapPositionToGrid(rawTarget) : rawTarget;
          const newIds = pasteNodesIntoGraph(pasteGraph, placeablePayload, targetTopLeft);
          if (newIds.length > 0) {
            store.state.selectedNodeIds = new Set(newIds);
            store.state.selectedCommentIds = new Set();
            store.state.sidebarSelection = null;
            store.notify();
          }
        } else {
          const newVariable = pasteVariableIntoGraph(pasteGraph, payload.variable);
          store.state.sidebarSelection = {
            kind: "variable",
            variableId: newVariable.id,
          };
          store.notify();
        }
      })
      .catch(() => {}); // clipboard permission denied/unavailable — fail silently, nothing to paste
  }

  private handleWrapInComment(): void {
    const store = this.store;
    if (store.state.readOnly) return;
    const graph = getEditingGraph(store.state);
    const { camera, selectedNodeIds } = store.state;
    const variables = getVisibleVariablesForState(store.state);
    const functions = store.state.rootGraph.functions;
    const scripts = store.state.rootGraph.scripts;

    if (selectedNodeIds.size > 0) {
      // Nodes selected: wrap them, Unreal-style.
      const rects = [...selectedNodeIds]
        .map((id) => graph.nodes.find((n) => n.id === id))
        .filter((n): n is NonNullable<typeof n> => !!n)
        .map((n) => computeNodeWorldRect(n, n.resolvePinDefs(variables, functions, scripts), variables, functions, scripts));

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
        size: {
          width: maxX - minX + PAD * 2,
          height: maxY - minY + HEADER_PAD + PAD,
        },
        containedNodeIds: [...selectedNodeIds],
        color: DEFAULT_COMMENT_COLOR,
      };
      addCommentBox(graph, box);
      store.state.selectedCommentIds = new Set([box.id]);
      store.notify();
    } else {
      // Nothing selected: drop a default-sized empty box at the cursor.
      const cursor = this.options.getCursorScreenPos();
      const worldPos = camera.screenToWorld(cursor.x, cursor.y);
      const box: CommentBox = {
        id: nextId("comment"),
        text: "Comment",
        position: { x: worldPos.x, y: worldPos.y },
        size: {
          width: DEFAULT_COMMENT_WIDTH,
          height: DEFAULT_COMMENT_HEIGHT,
        },
        containedNodeIds: [],
        color: DEFAULT_COMMENT_COLOR,
      };
      addCommentBox(graph, box);
      store.state.selectedCommentIds = new Set([box.id]);
      store.notify();
    }
  }
}
