import { addNode, createFunctionDef, createNodeInstance, nextId, removeFunctionDef } from "../engine/graphMutations";
import { getNodeDef } from "../engine/registry";
import type { FunctionDef } from "../engine/types";
import { screenToWorld } from "../render/camera";
import { closeFunctionTab, getEditingGraph, openFunctionTab, type Store } from "../state/store";

export interface FunctionsPanelElements {
  list: HTMLElement;
  nameInput: HTMLInputElement;
  addButton: HTMLButtonElement;
}

/** Lists every user-defined function: click a row to open its body on the canvas, "Call" spawns a
 * function.call node bound to it into whichever graph is currently open, "+" creates a new one. */
export function createFunctionsPanel(elements: FunctionsPanelElements, store: Store, canvas: HTMLCanvasElement): { render: () => void } {
  let spawnCounter = 0;

  function centerWorldPos(): { x: number; y: number } {
    const pos = screenToWorld(
      store.state.camera,
      canvas.clientWidth / 2 + spawnCounter * 24,
      canvas.clientHeight / 2 + spawnCounter * 24,
    );
    spawnCounter += 1;
    return pos;
  }

  function spawnCallNode(fn: FunctionDef): void {
    const def = getNodeDef("function.call");
    const pinDefs = def.deriveFunctionPins!(fn);
    const node = createNodeInstance("function.call", centerWorldPos(), pinDefs, nextId("node"), undefined, fn.id);
    addNode(getEditingGraph(store.state), node);
    store.notify();
  }

  function render(): void {
    if (elements.list.contains(document.activeElement)) return;

    elements.list.innerHTML = "";
    for (const fn of store.state.rootGraph.functions) {
      const row = document.createElement("div");
      row.className = "variable-row" + (store.state.activeFunctionId === fn.id ? " function-row-active" : "");

      const name = document.createElement("span");
      name.className = "variable-name function-name";
      name.textContent = fn.name;
      name.title = "Click to open this function's graph in a tab";
      name.addEventListener("click", () => {
        openFunctionTab(store.state, fn.id);
        store.notify();
      });

      const callBtn = document.createElement("button");
      callBtn.textContent = "Call";
      callBtn.addEventListener("click", () => spawnCallNode(fn));

      const delBtn = document.createElement("button");
      delBtn.textContent = "✕";
      delBtn.addEventListener("click", () => {
        closeFunctionTab(store.state, fn.id);
        removeFunctionDef(store.state.rootGraph, fn.id);
        store.notify();
      });

      row.append(name, callBtn, delBtn);
      elements.list.appendChild(row);
    }
  }

  elements.addButton.addEventListener("click", () => {
    const name = elements.nameInput.value.trim() || `Function${store.state.rootGraph.functions.length + 1}`;
    const fn = createFunctionDef(name);
    store.state.rootGraph.functions.push(fn);
    elements.nameInput.value = "";
    store.notify();
  });

  return { render };
}
