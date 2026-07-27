import { closeFunctionTab } from "../state/store";
import type { Store } from "../state/store";

/** Tab strip above the canvas: the root graph's tab is always first and can't be closed or
 * reordered; each open function gets its own closable tab, reorderable via native drag-and-drop. */
export function createGraphTabs(container: HTMLElement, store: Store): { render: () => void } {
  let draggingFunctionId: string | null = null;

  function reorder(fromId: string, toId: string): void {
    const tabs = store.state.openFunctionTabs;
    const fromIndex = tabs.indexOf(fromId);
    const toIndex = tabs.indexOf(toId);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
    tabs.splice(fromIndex, 1);
    tabs.splice(toIndex, 0, fromId);
    store.notify();
  }

  function render(): void {
    container.innerHTML = "";

    const rootTab = document.createElement("div");
    rootTab.className = "graph-tab" + (store.state.activeFunctionId === null ? " graph-tab-active" : "");
    rootTab.textContent = store.state.rootGraph.name || "Main Graph";
    rootTab.title = "The main graph — always open";
    rootTab.addEventListener("click", () => {
      store.state.activeFunctionId = null;
      store.notify();
    });
    container.appendChild(rootTab);

    for (const functionId of store.state.openFunctionTabs) {
      const fn = store.state.rootGraph.functions.find((f) => f.id === functionId);
      if (!fn) continue; // stale reference to a since-deleted function

      const tab = document.createElement("div");
      tab.className = "graph-tab" + (store.state.activeFunctionId === functionId ? " graph-tab-active" : "");
      tab.draggable = true;

      const label = document.createElement("span");
      label.className = "graph-tab-label";
      label.textContent = fn.name;
      label.addEventListener("click", () => {
        store.state.activeFunctionId = functionId;
        store.notify();
      });

      const closeBtn = document.createElement("button");
      closeBtn.className = "graph-tab-close";
      closeBtn.textContent = "✕";
      closeBtn.title = "Close tab";
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeFunctionTab(store.state, functionId);
        store.notify();
      });

      tab.append(label, closeBtn);

      tab.addEventListener("dragstart", (e) => {
        draggingFunctionId = functionId;
        e.dataTransfer?.setData("text/plain", functionId);
      });
      tab.addEventListener("dragover", (e) => {
        if (draggingFunctionId) e.preventDefault();
      });
      tab.addEventListener("drop", (e) => {
        e.preventDefault();
        if (draggingFunctionId && draggingFunctionId !== functionId) reorder(draggingFunctionId, functionId);
        draggingFunctionId = null;
      });
      tab.addEventListener("dragend", () => {
        draggingFunctionId = null;
      });

      container.appendChild(tab);
    }
  }

  return { render };
}
