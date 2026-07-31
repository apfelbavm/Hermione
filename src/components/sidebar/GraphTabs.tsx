"use client";

import { useState } from "react";
import { closeFunctionTab, type Store } from "../../state/store";
import { useStoreRevision } from "../../state/useStore";

/** Tab strip above the canvas: the root graph's tab is always first and can't be closed or
 * reordered; each open function gets its own closable tab, reorderable via native drag-and-drop. */
export function GraphTabs({ store }: { store: Store }) {
  useStoreRevision(store);
  const [draggingFunctionId, setDraggingFunctionId] = useState<string | null>(null);

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
        title="The main graph — always open"
        onClick={() => {
          store.state.activeFunctionId = null;
          store.notify();
        }}
      >
        {store.state.rootGraph.name || "Main Graph"}
      </div>

      {store.state.openFunctionTabs.map((functionId) => {
        const fn = store.state.rootGraph.functions.find((f) => f.id === functionId);
        if (!fn) return null; // stale reference to a since-deleted function

        return (
          <div
            key={functionId}
            className={"graph-tab" + (store.state.activeFunctionId === functionId ? " graph-tab-active" : "")}
            draggable
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
              className="graph-tab-close"
              title="Close tab"
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
