import { deserializeGraph } from "../persistence/load";
import { serializeGraph } from "../persistence/save";
import type { Store } from "./store";

// A history ENTRY is just a full graph JSON string — the exact same format save/load already use
// (see persistence/save.ts, load.ts) — reused here rather than inventing a second serialization,
// and just as trustworthy for the same reason it already is for real save/load: everything
// reachable from Graph (nodes, connections, variables, functions — including their own nested body
// graphs — scripts, comment boxes) round-trips through it.
const UNDO_DEBOUNCE_MS = 500;
const MAX_HISTORY_ENTRIES = 200;

export interface HistoryManager {
  undo: () => void;
  redo: () => void;
}

/** Linear undo/redo history over the GRAPH ONLY (rootGraph — nodes/wires/variables/functions/
 * scripts/comment boxes) — deliberately NOT camera position, selection, which sidebar row or tab is
 * open, etc.: those are transient view state, not "content" a user expects Ctrl+Z to step back
 * through, the same distinction most editors draw between document history and view state.
 *
 * Snapshots are taken on a debounce (settling UNDO_DEBOUNCE_MS after the last change) rather than
 * on every store.notify() — dragging a node fires notify() on every mousemove, and a literal-value
 * widget commits on every keystroke (see widgetSync.ts); snapshotting each of those individually
 * would make undoing a single drag or a few typed characters take dozens of Ctrl+Z presses. Letting
 * one continuous gesture settle before recording collapses it into ONE undo step instead. */
export function createHistoryManager(store: Store): HistoryManager {
  function snapshot(): string {
    return serializeGraph(store.state.rootGraph);
  }

  let history: string[] = [snapshot()];
  let index = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  // Set only while THIS module is itself applying a restore — its own resulting store.notify()
  // must not be mistaken for a fresh user edit and scheduled for (re-)recording.
  let restoring = false;

  /** Records the current graph as a new history entry if it actually differs from the last one —
   * called both by the debounce timer and, synchronously, right before undo()/redo() navigate, so
   * a just-finished gesture that hasn't settled yet is committed rather than silently dropped. */
  function commitPending(): void {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (restoring) return;
    const current = snapshot();
    if (current === history[index]) return; // nothing actually changed since the last commit

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

  /** Restores a snapshot and resets the same volatile UI state main.ts's own file-Load flow already
   * resets when swapping in a different graph wholesale — the restored graph may no longer contain
   * whatever node/variable/function/script/tab that state referenced (e.g. undoing past the very
   * creation of the node currently selected), and leaving it dangling risks some other panel
   * reading off a since-vanished id. */
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
      store.state.selectedCommentId = null;
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

  return { undo, redo };
}
