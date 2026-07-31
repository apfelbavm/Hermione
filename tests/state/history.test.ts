import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { registerBuiltins } from "../../src/nodes";
import { getNodeDef } from "../../src/engine/registry";
import { Graph } from "../../src/engine/graph";
import { NodeInstance } from "../../src/engine/nodeInstance";
import type { AppState, Store } from "../../src/state/store";
import { createHistoryManager } from "../../src/state/history";

// A minimal Store stand-in: notify() runs listeners synchronously instead of coalescing via
// requestAnimationFrame (unavailable in this project's plain-node vitest environment, and
// irrelevant to what createHistoryManager itself needs to behave correctly — it only depends on
// the subscribe/notify CONTRACT, not on real rAF batching).
function createFakeStore(rootGraph: Graph): Store {
  const listeners = new Set<() => void>();
  let revision = 0;
  const state: AppState = {
    rootGraph,
    activeFunctionId: null,
    openFunctionTabs: [],
    openScriptTabs: [],
    activeLowerTabId: null,
    camera: {} as AppState["camera"],
    snapToGrid: true,
    simulating: false,
    autoPan: true,
    selectedNodeIds: new Set(),
    selectedCommentIds: new Set(),
    executingNodeId: null,
    firedConnectionIds: new Set(),
    wireDrag: null,
    marqueeSelection: null,
    sidebarSelection: null,
  };
  return {
    state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    notify() {
      revision++;
      listeners.forEach((l) => l());
    },
    getRevision() {
      return revision;
    },
  };
}

function addBuiltinNode(graph: Graph, type: string, id: string) {
  const def = getNodeDef(type);
  const node = NodeInstance.createNodeInstance(type, { x: 0, y: 0 }, def.pins, id);
  graph.nodes.push(node);
  return node;
}

const UNDO_DEBOUNCE_MS = 500;

beforeAll(() => {
  registerBuiltins();
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createHistoryManager", () => {
  it("does nothing on undo/redo when nothing has changed yet", () => {
    const store = createFakeStore(new Graph("g1", "Test"));
    const history = createHistoryManager(store);
    const nodeCountBefore = store.state.rootGraph.nodes.length;

    history.undo();
    history.redo();

    expect(store.state.rootGraph.nodes.length).toBe(nodeCountBefore);
  });

  it("undoes a change once it has settled past the debounce", () => {
    const store = createFakeStore(new Graph("g1", "Test"));
    const history = createHistoryManager(store);

    addBuiltinNode(store.state.rootGraph, "event.start", "n1");
    store.notify();
    vi.advanceTimersByTime(UNDO_DEBOUNCE_MS);

    expect(store.state.rootGraph.nodes).toHaveLength(1);

    history.undo();

    expect(store.state.rootGraph.nodes).toHaveLength(0);
  });

  it("commits a still-pending (not yet debounced) change synchronously before navigating", () => {
    const store = createFakeStore(new Graph("g1", "Test"));
    const history = createHistoryManager(store);

    addBuiltinNode(store.state.rootGraph, "event.start", "n1");
    store.notify();
    // No vi.advanceTimersByTime here — the debounce timer has NOT fired yet.

    history.undo();

    expect(store.state.rootGraph.nodes).toHaveLength(0);
  });

  it("redoes back to the change after an undo", () => {
    const store = createFakeStore(new Graph("g1", "Test"));
    const history = createHistoryManager(store);

    addBuiltinNode(store.state.rootGraph, "event.start", "n1");
    store.notify();
    vi.advanceTimersByTime(UNDO_DEBOUNCE_MS);

    history.undo();
    expect(store.state.rootGraph.nodes).toHaveLength(0);

    history.redo();
    expect(store.state.rootGraph.nodes).toHaveLength(1);
    expect(store.state.rootGraph.nodes[0].id).toBe("n1");
  });

  it("collapses a continuous burst of changes settling together into a single undo step", () => {
    const store = createFakeStore(new Graph("g1", "Test"));
    const history = createHistoryManager(store);

    addBuiltinNode(store.state.rootGraph, "event.start", "n1");
    store.notify();
    vi.advanceTimersByTime(100);
    addBuiltinNode(store.state.rootGraph, "event.start", "n2");
    store.notify();
    vi.advanceTimersByTime(100);
    addBuiltinNode(store.state.rootGraph, "event.start", "n3");
    store.notify();
    vi.advanceTimersByTime(UNDO_DEBOUNCE_MS);

    expect(store.state.rootGraph.nodes).toHaveLength(3);

    history.undo();

    expect(store.state.rootGraph.nodes).toHaveLength(0);
  });

  it("truncates the redo branch once a new edit is made after an undo", () => {
    const store = createFakeStore(new Graph("g1", "Test"));
    const history = createHistoryManager(store);

    addBuiltinNode(store.state.rootGraph, "event.start", "n1");
    store.notify();
    vi.advanceTimersByTime(UNDO_DEBOUNCE_MS);

    history.undo();
    expect(store.state.rootGraph.nodes).toHaveLength(0);

    addBuiltinNode(store.state.rootGraph, "event.start", "n2");
    store.notify();
    vi.advanceTimersByTime(UNDO_DEBOUNCE_MS);

    // The redone-away "n1" branch is gone — redo() must be a no-op now.
    history.redo();
    expect(store.state.rootGraph.nodes).toHaveLength(1);
    expect(store.state.rootGraph.nodes[0].id).toBe("n2");
  });

  it("resets transient UI/selection state on undo/redo, not just the graph", () => {
    const store = createFakeStore(new Graph("g1", "Test"));
    const history = createHistoryManager(store);

    addBuiltinNode(store.state.rootGraph, "event.start", "n1");
    store.notify();
    vi.advanceTimersByTime(UNDO_DEBOUNCE_MS);

    store.state.selectedNodeIds = new Set(["n1"]);
    store.state.activeFunctionId = "some-function";

    history.undo();

    expect(store.state.selectedNodeIds.size).toBe(0);
    expect(store.state.activeFunctionId).toBeNull();
  });
});
