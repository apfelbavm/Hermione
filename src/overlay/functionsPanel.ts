import { addNode, createFunctionDef, createNodeInstance, nextId, removeFunctionDef } from "../engine/graphMutations";
import { getNodeDef } from "../engine/registry";
import type { FunctionDef } from "../engine/types";
import { screenToWorld } from "../render/camera";
import { closeFunctionTab, getEditingGraph, openFunctionTab, type Store } from "../state/store";
import { setupCollapsibleSection } from "./collapsibleSection";
import { createEditableNameInput, createEditableNameLabel, focusAndSelect } from "./editableNameCell";
import { openRowContextMenu } from "./rowContextMenu";
import { nextAvailableName } from "./uniqueName";

export interface FunctionsPanelElements {
  section: HTMLElement;
  header: HTMLElement;
  list: HTMLElement;
  addButton: HTMLButtonElement;
}

/** Lists every user-defined function: collapsible, "+" creates one with an unused default name
 * and immediately enters rename mode, right-click > Edit renames an existing one, click its name
 * opens its body in a tab, "Call" spawns a function.call node bound to it into whichever graph is
 * currently open. */
export function createFunctionsPanel(elements: FunctionsPanelElements, store: Store, canvas: HTMLCanvasElement): { render: () => void } {
  setupCollapsibleSection(elements.header, elements.section);

  let spawnCounter = 0;
  let editingId: string | null = null;

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

  function commitRename(fn: FunctionDef, rawNewName: string): void {
    const trimmed = rawNewName.trim();
    const isDuplicate =
      trimmed.length === 0 || store.state.rootGraph.functions.some((f) => f.id !== fn.id && f.name === trimmed);
    if (!isDuplicate) {
      fn.name = trimmed;
    }
    editingId = null;
    store.notify();
  }

  function render(): void {
    if (elements.list.contains(document.activeElement)) return;

    elements.list.innerHTML = "";
    for (const fn of store.state.rootGraph.functions) {
      const row = document.createElement("div");
      row.className = "variable-row" + (store.state.activeFunctionId === fn.id ? " function-row-active" : "");

      let nameInputToFocus: HTMLInputElement | null = null;
      const nameEl =
        editingId === fn.id
          ? (() => {
              const input = createEditableNameInput(
                fn.name,
                (newName) => commitRename(fn, newName),
                () => {
                  editingId = null;
                  store.notify();
                },
              );
              nameInputToFocus = input;
              return input;
            })()
          : (() => {
              const label = createEditableNameLabel(fn.name, (screenPos) => {
                openRowContextMenu(screenPos, () => {
                  editingId = fn.id;
                  store.notify();
                });
              });
              label.classList.add("function-name");
              label.title = "Click to open this function's graph in a tab";
              label.addEventListener("click", () => {
                openFunctionTab(store.state, fn.id);
                store.notify();
              });
              return label;
            })();

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

      row.append(nameEl, callBtn, delBtn);
      elements.list.appendChild(row);
      if (nameInputToFocus) focusAndSelect(nameInputToFocus);
    }
  }

  elements.addButton.addEventListener("click", (e) => {
    e.stopPropagation();
    elements.section.classList.remove("collapsed");
    const name = nextAvailableName(store.state.rootGraph.functions.map((f) => f.name), "NewFunction");
    const fn = createFunctionDef(name);
    store.state.rootGraph.functions.push(fn);
    editingId = fn.id;
    store.notify();
  });

  return { render };
}
