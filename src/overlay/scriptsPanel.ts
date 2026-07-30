import { createTemplatedCodeScriptDef, moveScript, removeCodeScriptDef } from "../engine/graphMutations";
import type { CodeScriptDef } from "../engine/types";
import { closeScriptTab, openScriptTab, type Store } from "../state/store";
import { setupCollapsibleSection } from "./collapsibleSection";
import { SCRIPT_DRAG_MIME } from "./dragTypes";
import { createEditableNameInput, createEditableNameLabel, focusAndSelect, isRenamingWithinList } from "./editableNameCell";
import { openRowContextMenu } from "./rowContextMenu";
import { nextAvailableName } from "./uniqueName";

export interface ScriptsPanelElements {
  section: HTMLElement;
  header: HTMLElement;
  list: HTMLElement;
  addButton: HTMLButtonElement;
}

/** Lists every user-defined script: collapsible, "+" creates one with an unused default name and
 * immediately enters rename mode, right-click > Edit renames an existing one, click its name opens
 * its Monaco tab in the lower panel (see scriptEditor.ts). Rows are drag sources — dropping one onto
 * the canvas (see main.ts) creates a code.run node bound to it at the drop position. Mirrors
 * functionsPanel.ts almost exactly; a script has no body graph to open, just source text, so
 * "click a row" opens a lower-panel tab instead of a canvas tab. */
export function createScriptsPanel(elements: ScriptsPanelElements, store: Store): { render: () => void } {
  setupCollapsibleSection(elements.header, elements.section);

  let editingId: string | null = null;
  let dropIndicatorRow: HTMLElement | null = null;

  function clearDropIndicator(): void {
    dropIndicatorRow?.classList.remove("variable-row-drop-above", "variable-row-drop-below");
    dropIndicatorRow = null;
  }

  function commitRename(script: CodeScriptDef, rawNewName: string): void {
    const trimmed = rawNewName.trim();
    const isDuplicate =
      trimmed.length === 0 || store.state.rootGraph.scripts.some((s) => s.id !== script.id && s.name === trimmed);
    if (!isDuplicate) {
      script.name = trimmed;
    }
    editingId = null;
    store.notify();
  }

  function render(): void {
    if (isRenamingWithinList(elements.list)) return;

    elements.list.innerHTML = "";
    for (const script of store.state.rootGraph.scripts) {
      const isEditing = editingId === script.id;

      const isSelected =
        store.state.sidebarSelection?.kind === "script" && store.state.sidebarSelection.scriptId === script.id;
      const row = document.createElement("div");
      row.className = "variable-row" + (isSelected ? " function-row-active" : "");
      row.draggable = !isEditing;
      row.addEventListener("dragstart", (e) => {
        e.dataTransfer?.setData(SCRIPT_DRAG_MIME, script.id);
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "copyMove";
      });

      row.addEventListener("dragover", (e) => {
        if (!e.dataTransfer?.types.includes(SCRIPT_DRAG_MIME)) return;
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
        if (!e.dataTransfer?.types.includes(SCRIPT_DRAG_MIME)) return;
        e.preventDefault();
        e.stopPropagation();
        const draggedId = e.dataTransfer.getData(SCRIPT_DRAG_MIME);
        clearDropIndicator();
        if (!draggedId) return;
        const rect = row.getBoundingClientRect();
        const position = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
        moveScript(store.state.rootGraph, draggedId, script.id, position);
        store.notify();
      });

      function editScript(): void {
        openScriptTab(store.state, script.id);
        store.state.sidebarSelection = { kind: "script", scriptId: script.id };
        store.notify();
      }

      let nameInputToFocus: HTMLInputElement | null = null;
      const nameEl = isEditing
        ? (() => {
            const input = createEditableNameInput(
              script.name,
              (newName) => commitRename(script, newName),
              () => {
                editingId = null;
                store.notify();
              },
            );
            nameInputToFocus = input;
            return input;
          })()
        : (() => {
            const label = createEditableNameLabel(script.name, (screenPos) => {
              openRowContextMenu(screenPos, [
                {
                  label: "Edit Script",
                  onClick: editScript,
                },
                {
                  label: "Rename",
                  onClick: () => {
                    editingId = script.id;
                    store.notify();
                  },
                },
              ]);
            });
            label.classList.add("function-name");
            label.title = "Click to open this script in the lower panel";
            label.addEventListener("click", editScript);
            return label;
          })();

      const delBtn = document.createElement("button");
      delBtn.textContent = "✕";
      delBtn.addEventListener("click", () => {
        closeScriptTab(store.state, script.id);
        removeCodeScriptDef(store.state.rootGraph, script.id);
        if (store.state.sidebarSelection?.kind === "script" && store.state.sidebarSelection.scriptId === script.id) {
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
    const name = nextAvailableName(store.state.rootGraph.scripts.map((s) => s.name), "NewScript");
    const script = createTemplatedCodeScriptDef(name);
    store.state.rootGraph.scripts.push(script);
    editingId = script.id;
    store.notify();
  });

  return { render };
}
