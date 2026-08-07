"use client";

import { useState } from "react";
import { i18n } from "@i18n";
import { closeFunctionTab, type Store } from "@hermione/graph/state/store";
import { useStoreRevision } from "@hermione/graph/state/useStore";

export function GraphTabs({ store }: { store: Store }) {
  useStoreRevision(store);
  const [draggingFunctionId, setDraggingFunctionId] = useState<string | null>(null);
  const disabled = store.state.simulating || store.state.readOnly;
  // Closing a tab is just navigation (see closeFunctionTab, state/store.ts) — unlike reordering it
  // stays available in read-only mode, so a read-only viewer can back out of a function's graph.
  const closeDisabled = store.state.simulating;

  function reorder(fromId: string, toId: string): void {
    const tabs = store.state.openFunctionTabs;
    const fromIndex = tabs.indexOf(fromId);
    const toIndex = tabs.indexOf(toId);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
    tabs.splice(fromIndex, 1);
    tabs.splice(toIndex, 0, fromId);
    store.notify();
  }

  return (
    <>
      <div
        className={"graph-tab" + (store.state.activeFunctionId === null ? " graph-tab-active" : "")}
        title={i18n.components.graph_tabs.main_graph_title}
        onClick={() => {
          store.state.activeFunctionId = null;
          store.notify();
        }}
      >
        {store.state.rootGraph.name || i18n.components.graph_tabs.main_graph}
      </div>

      {store.state.openFunctionTabs.map((functionId) => {
        const fn = store.state.rootGraph.functions.find((f) => f.id === functionId);
        if (!fn) return null; // stale reference to a since-deleted function

        return (
          <div
            key={functionId}
            className={"graph-tab" + (store.state.activeFunctionId === functionId ? " graph-tab-active" : "")}
            draggable={!disabled}
            onDragStart={(e) => {
              setDraggingFunctionId(functionId);
              e.dataTransfer.setData("text/plain", functionId);
            }}
            onDragOver={(e) => {
              if (draggingFunctionId) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (draggingFunctionId && draggingFunctionId !== functionId) reorder(draggingFunctionId, functionId);
              setDraggingFunctionId(null);
            }}
            onDragEnd={() => setDraggingFunctionId(null)}
          >
            <span
              className="graph-tab-label"
              onClick={() => {
                store.state.activeFunctionId = functionId;
                store.notify();
              }}
            >
              {fn.name}
            </span>
            <button
              type="button"
              className="graph-tab-close btn btn-ghost btn-sm"
              title={i18n.components.graph_tabs.close_tab}
              disabled={closeDisabled}
              onClick={(e) => {
                e.stopPropagation();
                closeFunctionTab(store.state, functionId);
                store.notify();
              }}
            >
              ✕
            </button>
          </div>
        );
      })}
    </>
  );
}
