import { deserializeGraph } from "../persistence/load";
import { serializeGraph } from "../persistence/save";
import type { Store } from "./store";

const UNDO_DEBOUNCE_MS = 500;
const MAX_HISTORY_ENTRIES = 200;
export interface HistoryManager {
  undo: () => void;
  redo: () => void;
  /** Discards all prior entries and starts a fresh history at the current graph — call once the
   * "real" graph (flow load, version restore) has replaced whatever placeholder state the manager
   * was created with, so undo can never rewind past it. */
  reset: () => void;
}

export function createHistoryManager(store: Store): HistoryManager {
  function snapshot(): string {
    return serializeGraph(store.state.rootGraph);
  }

  let history: string[] = [snapshot()];
  let index = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  let restoring = false;

  function commitPending(): void {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (restoring) return;
    const current = snapshot();
    if (current === history[index]) return;

    history = history.slice(0, index + 1);
    history.push(current);
    index = history.length - 1;
    if (history.length > MAX_HISTORY_ENTRIES) {
      history.shift();
      index--;
    }
  }

  store.subscribe(() => {
    if (restoring) return;
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(commitPending, UNDO_DEBOUNCE_MS);
  });

  function restore(json: string): void {
    restoring = true;
    try {
      store.state.rootGraph = deserializeGraph(json);
      store.state.activeFunctionId = null;
      store.state.openFunctionTabs = [];
      store.state.openScriptTabs = [];
      store.state.activeLowerTabId = null;
      store.state.sidebarSelection = null;
      store.state.selectedNodeIds = new Set();
      store.state.selectedCommentIds = new Set();
      store.state.executingNodeId = null;
      store.state.firedConnectionIds = new Set();
      store.notify();
    } finally {
      restoring = false;
    }
  }

  function undo(): void {
    commitPending();
    if (index === 0) return;
    index--;
    restore(history[index]);
  }

  function redo(): void {
    commitPending();
    if (index >= history.length - 1) return;
    index++;
    restore(history[index]);
  }

  function reset(): void {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    history = [snapshot()];
    index = 0;
  }

  return { undo, redo, reset };
}
