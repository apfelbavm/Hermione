import { createFunctionDef, moveFunction, removeFunctionDef } from "../engine/graphMutations";
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
  // Same direct-classList (not store.notify()) hover-indicator approach as variablePanel.ts's own
  // drag-to-reorder — see its comment for why a full re-render mid-drag would be actively harmful.
  let dropIndicatorRow: HTMLElement | null = null;

  function clearDropIndicator(): void {
    dropIndicatorRow?.classList.remove("variable-row-drop-above", "variable-row-drop-below");
    dropIndicatorRow = null;
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
        // "copyMove", not just "copy" — see variablePanel.ts's identical fix for why a dropEffect
        // the dragstart's effectAllowed doesn't include gets the drop silently refused by real
        // browsers: this same gesture now also reorders in place (move) when dropped on another
        // row here, alongside the original copy-onto-canvas behavior (spawns a Call node).
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "copyMove";
      });

      // Dropping this SAME drag gesture back onto another row in this list reorders functions in
      // place (see moveFunction) instead of spawning a Call node — that only happens when the drop
      // lands on the canvas (main.ts's own dragover/drop), a different drop target entirely.
      row.addEventListener("dragover", (e) => {
        if (!e.dataTransfer?.types.includes(FUNCTION_DRAG_MIME)) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        const rect = row.getBoundingClientRect();
        const before = e.clientY < rect.top + rect.height / 2;
        if (dropIndicatorRow !== row) clearDropIndicator();
        row.classList.toggle("variable-row-drop-above", before);
        row.classList.toggle("variable-row-drop-below", !before);
        dropIndicatorRow = row;
      });
      row.addEventListener("dragleave", () => {
        if (dropIndicatorRow === row) clearDropIndicator();
      });
      row.addEventListener("drop", (e) => {
        if (!e.dataTransfer?.types.includes(FUNCTION_DRAG_MIME)) return;
        e.preventDefault();
        e.stopPropagation(); // don't also let this bubble to the canvas's own drop handler
        const draggedId = e.dataTransfer.getData(FUNCTION_DRAG_MIME);
        clearDropIndicator();
        if (!draggedId) return;
        const rect = row.getBoundingClientRect();
        const position = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
        moveFunction(store.state.rootGraph, draggedId, fn.id, position);
        store.notify();
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
                  label: "Rename",
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
