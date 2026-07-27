import { createFunctionDef, removeFunctionDef } from "../engine/graphMutations";
import type { FunctionDef } from "../engine/types";
import { closeFunctionTab, openFunctionTab, type Store } from "../state/store";
import { setupCollapsibleSection } from "./collapsibleSection";
import { FUNCTION_DRAG_MIME } from "./dragTypes";
import { createEditableNameInput, createEditableNameLabel, focusAndSelect, isRenamingWithinList } from "./editableNameCell";
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
 * opens its body in a tab. Rows are drag-and-drop sources — dropping one onto the canvas (see
 * main.ts) creates a function.call node bound to it at the drop position. */
export function createFunctionsPanel(elements: FunctionsPanelElements, store: Store): { render: () => void } {
  setupCollapsibleSection(elements.header, elements.section);

  let editingId: string | null = null;

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
    if (isRenamingWithinList(elements.list)) return;

    elements.list.innerHTML = "";
    for (const fn of store.state.rootGraph.functions) {
      const isEditing = editingId === fn.id;

      const isSelected =
        store.state.sidebarSelection?.kind === "function" && store.state.sidebarSelection.functionId === fn.id;
      const row = document.createElement("div");
      row.className = "variable-row" + (isSelected ? " function-row-active" : "");
      row.draggable = !isEditing;
      row.addEventListener("dragstart", (e) => {
        e.dataTransfer?.setData(FUNCTION_DRAG_MIME, fn.id);
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "copy";
      });

      let nameInputToFocus: HTMLInputElement | null = null;
      const nameEl = isEditing
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
              openRowContextMenu(screenPos, [
                {
                  label: "Edit",
                  onClick: () => {
                    editingId = fn.id;
                    store.notify();
                  },
                },
              ]);
            });
            label.classList.add("function-name");
            label.title = "Click to open this function's graph in a tab";
            label.addEventListener("click", () => {
              openFunctionTab(store.state, fn.id);
              store.state.sidebarSelection = { kind: "function", functionId: fn.id };
              store.notify();
            });
            return label;
          })();

      const delBtn = document.createElement("button");
      delBtn.textContent = "✕";
      delBtn.addEventListener("click", () => {
        closeFunctionTab(store.state, fn.id);
        removeFunctionDef(store.state.rootGraph, fn.id);
        if (store.state.sidebarSelection?.kind === "function" && store.state.sidebarSelection.functionId === fn.id) {
          store.state.sidebarSelection = null;
        }
        store.notify();
      });

      row.append(nameEl, delBtn);
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
