import { Graph } from "../engine/graph";
import type { PinDirection, PinType, Variable } from "../engine/types";
import type { Camera } from "../render/camera";

export interface WireDragState {
  /** One entry per anchor being dragged — more than one when a Ctrl+drag picked up every
   * connection already on a pin at once (see pointerHandlers.ts's "wire-multi" drag mode). */
  fromScreens: { x: number; y: number }[];
  toScreen: { x: number; y: number };
  pinType: PinType;
  /** Direction of the anchor pin(s) in fromScreens — "output" when dragging off an output pin
   * (toScreen, the mouse, stands in for the eventual input), "input" when dragging off an input
   * pin (toScreen stands in for the eventual output). drawWireDragPreview (see drawWires.ts) needs
   * this to know which end of the preview curve to treat as the exit side vs the entry side —
   * always the SAME for every entry in fromScreens (see the wire-multi comment above: every picked-
   * up anchor shares the opposite direction of the pin that was Ctrl+dragged). */
  anchorDirection: PinDirection;
}

/** In-progress rubber-band selection box, tracked in world coordinates so it stays correct even
 * if the camera zooms mid-drag. */
export interface MarqueeSelectionState {
  startWorld: { x: number; y: number };
  currentWorld: { x: number; y: number };
}

/** Whichever Functions/Variables sidebar row was last clicked — drives the Details section at the
 * bottom of the sidebar (Unreal-style: click an item in a list, its details show below). Distinct
 * from activeFunctionId/openFunctionTabs (which tab is open on the canvas) — clicking a function's
 * name does both, but they can diverge (e.g. switching tabs via the graph-tab strip). */
export type SidebarSelection =
  | { kind: "variable"; variableId: string }
  | { kind: "function"; functionId: string }
  | { kind: "script"; scriptId: string };

export interface AppState {
  /** Always the true whole program — what Run/Compile/Save/Load and the Functions/global
   * Variables panels operate on, regardless of what's currently open for editing. */
  rootGraph: Graph;
  /** Which function's body is currently open for editing, or null for the root graph itself. */
  activeFunctionId: string | null;
  /** Ordered ids of functions currently open as tabs (the root graph's tab is implicit and
   * always first, and isn't tracked here since it can't be closed or reordered). Session-only
   * UI state — not persisted, reset to [] on load like selection/camera. */
  openFunctionTabs: string[];
  /** Ordered ids of scripts currently open as tabs in the LOWER panel (alongside the always-present,
   * unclosable "Log" tab there) — same shape as openFunctionTabs, just for the log-container's own
   * tab strip instead of the canvas one. Session-only, not persisted. */
  openScriptTabs: string[];
  /** Which lower-panel tab is active: null means the "Log" tab, otherwise a script id from
   * openScriptTabs (see scriptEditor.ts). */
  activeLowerTabId: string | null;
  camera: Camera;
  /** Toolbar toggle: when on, nodes snap to the grid as they're moved or newly dropped/placed onto
   * the canvas. Never retroactively applied to nodes already sitting at an off-grid position. */
  snapToGrid: boolean;
  selectedNodeIds: Set<string>;
  selectedCommentIds: Set<string>;
  executingNodeId: string | null;
  firedConnectionIds: Set<string>;
  wireDrag: WireDragState | null;
  marqueeSelection: MarqueeSelectionState | null;
  sidebarSelection: SidebarSelection | null;
}

/** The graph currently open for editing on the canvas — the root graph, or a function's body. */
export function getEditingGraph(state: AppState): Graph {
  if (!state.activeFunctionId) return state.rootGraph;
  const fn = state.rootGraph.functions.find(
    (f) => f.id === state.activeFunctionId,
  );
  return fn ? fn.body : state.rootGraph;
}

/** Opens (or focuses, if already open) a function's tab and makes it the active editing graph. */
export function openFunctionTab(state: AppState, functionId: string): void {
  if (!state.openFunctionTabs.includes(functionId)) {
    state.openFunctionTabs.push(functionId);
  }
  state.activeFunctionId = functionId;
}

/** Closes a function's tab. If it was the active tab, falls back to whichever tab took its place,
 * else the previous tab, else the root graph's (always-open, unclosable) tab. */
export function closeFunctionTab(state: AppState, functionId: string): void {
  const index = state.openFunctionTabs.indexOf(functionId);
  if (index === -1) return;
  state.openFunctionTabs.splice(index, 1);
  if (state.activeFunctionId === functionId) {
    state.activeFunctionId =
      state.openFunctionTabs[index] ??
      state.openFunctionTabs[index - 1] ??
      null;
  }
}

/** Variables visible from the currently open editing graph — root's own, or root + the active
 * function's local variables. */
export function getVisibleVariablesForState(state: AppState): Variable[] {
  return state.rootGraph.getVisibleVariables(getEditingGraph(state));
}

/** Opens (or focuses, if already open) a script's tab in the lower panel and makes it the active
 * lower-panel tab — mirrors openFunctionTab/the canvas tab strip, just for scripts/the log panel. */
export function openScriptTab(state: AppState, scriptId: string): void {
  if (!state.openScriptTabs.includes(scriptId)) {
    state.openScriptTabs.push(scriptId);
  }
  state.activeLowerTabId = scriptId;
}

/** Closes a script's tab. If it was the active tab, falls back to whichever tab took its place,
 * else the previous tab, else the "Log" tab (null) — mirrors closeFunctionTab. */
export function closeScriptTab(state: AppState, scriptId: string): void {
  const index = state.openScriptTabs.indexOf(scriptId);
  if (index === -1) return;
  state.openScriptTabs.splice(index, 1);
  if (state.activeLowerTabId === scriptId) {
    state.activeLowerTabId =
      state.openScriptTabs[index] ?? state.openScriptTabs[index - 1] ?? null;
  }
}

type Listener = () => void;

export interface Store {
  state: AppState;
  subscribe: (listener: Listener) => () => void;
  notify: () => void;
  /** Bumped once per coalesced notify() pass — lets a React component built on useSyncExternalStore
   * (see state/useStore.ts) detect "something changed" without state itself ever changing identity
   * (it's one mutable object, mutated in place throughout this app). Not meaningful on its own,
   * just a change ticker; components still read whatever fields they need off `state` directly. */
  getRevision: () => number;
}

/** Coalesces notify() calls into at most one listener pass per animation frame. */
export function createStore(initial: AppState): Store {
  const state = initial;
  const listeners = new Set<Listener>();
  let scheduled = false;
  let revision = 0;

  function notify(): void {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      revision++;
      listeners.forEach((l) => l());
    });
  }

  function subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function getRevision(): number {
    return revision;
  }

  return { state, subscribe, notify, getRevision };
}
