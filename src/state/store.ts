import { getVisibleVariables } from "../engine/graphMutations";
import type { Graph, PinType, Variable } from "../engine/types";
import type { Camera } from "../render/camera";

export interface WireDragState {
  fromScreen: { x: number; y: number };
  toScreen: { x: number; y: number };
  pinType: PinType;
}

export interface AppState {
  /** Always the true whole program — what Run/Compile/Save/Load and the Functions/global
   * Variables panels operate on, regardless of what's currently open for editing. */
  rootGraph: Graph;
  /** Which function's body is currently open for editing, or null for the root graph itself. */
  activeFunctionId: string | null;
  camera: Camera;
  selectedNodeIds: Set<string>;
  selectedCommentId: string | null;
  executingNodeId: string | null;
  firedConnectionIds: Set<string>;
  wireDrag: WireDragState | null;
}

/** The graph currently open for editing on the canvas — the root graph, or a function's body. */
export function getEditingGraph(state: AppState): Graph {
  if (!state.activeFunctionId) return state.rootGraph;
  const fn = state.rootGraph.functions.find((f) => f.id === state.activeFunctionId);
  return fn ? fn.body : state.rootGraph;
}

/** Variables visible from the currently open editing graph — root's own, or root + the active
 * function's local variables. */
export function getVisibleVariablesForState(state: AppState): Variable[] {
  return getVisibleVariables(state.rootGraph, getEditingGraph(state));
}

type Listener = () => void;

export interface Store {
  state: AppState;
  subscribe: (listener: Listener) => () => void;
  notify: () => void;
}

/** Coalesces notify() calls into at most one listener pass per animation frame. */
export function createStore(initial: AppState): Store {
  const state = initial;
  const listeners = new Set<Listener>();
  let scheduled = false;

  function notify(): void {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      listeners.forEach((l) => l());
    });
  }

  function subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { state, subscribe, notify };
}
