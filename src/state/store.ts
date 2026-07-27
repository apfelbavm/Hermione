import type { Graph, PinType } from "../engine/types";
import type { Camera } from "../render/camera";

export interface WireDragState {
  fromScreen: { x: number; y: number };
  toScreen: { x: number; y: number };
  pinType: PinType;
}

export interface AppState {
  graph: Graph;
  camera: Camera;
  selectedNodeIds: Set<string>;
  selectedCommentId: string | null;
  executingNodeId: string | null;
  firedConnectionIds: Set<string>;
  wireDrag: WireDragState | null;
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
