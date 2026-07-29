import {
  addScriptInput,
  DEFAULT_VALUE_BY_TYPE,
  moveScriptInput,
  nextId,
  removeScriptInput,
  updateScriptInput,
} from "../engine/graphMutations";
import type { CodeScriptDef, PinSignatureEntry, PinType } from "../engine/types";
import type { Store } from "../state/store";
import { setupCollapsibleSection } from "./collapsibleSection";
import { SCRIPT_IO_ENTRY_DRAG_MIME } from "./dragTypes";
import { createEditableNameInput, createEditableNameLabel, focusAndSelect, isRenamingWithinList } from "./editableNameCell";
import { openRowContextMenu } from "./rowContextMenu";
import { createContainerSelect, createTypeSelect, createTypedValueInput } from "./typedValueInput";
import { nextAvailableName } from "./uniqueName";

export interface ScriptIoPanelElements {
  /** The whole section wrapper — hidden entirely while no script is selected. */
  section: HTMLElement;
  header: HTMLElement;
  list: HTMLElement;
  addButton: HTMLButtonElement;
}

/** A script's Inputs section — a list of typed signature entries (name/type/default value), the
 * same shape as a function's Inputs (see functionIoPanel.ts, which this closely mirrors) but with
 * no Outputs counterpart: a script reports results via the logger it's called with, not a return
 * pin (see nodes/code.ts). Every code.run node bound to this script shares this one signature —
 * same relationship a FunctionDef's inputs have to every Entry/Call node bound to it. */
export function createScriptIoPanel(
  elements: ScriptIoPanelElements,
  store: Store,
  getSelectedScript: () => CodeScriptDef | null,
): { render: () => void } {
  setupCollapsibleSection(elements.header, elements.section);

  let editingId: string | null = null;
  let dropIndicatorRow: HTMLElement | null = null;

  function clearDropIndicator(): void {
    dropIndicatorRow?.classList.remove("variable-row-drop-above", "variable-row-drop-below");
    dropIndicatorRow = null;
  }

  function commitRename(script: CodeScriptDef, entry: PinSignatureEntry, rawNewName: string): void {
    const trimmed = rawNewName.trim();
    const isDuplicate = trimmed.length === 0 || script.inputs.some((e) => e.id !== entry.id && e.name === trimmed);
    if (!isDuplicate) {
      updateScriptInput(store.state.rootGraph, script, entry.id, { name: trimmed });
    }
    editingId = null;
    store.notify();
  }

  function render(): void {
    const script = getSelectedScript();
    elements.section.style.display = script ? "" : "none";
    if (!script) return;
    if (isRenamingWithinList(elements.list)) return;

    elements.list.innerHTML = "";

    for (const entry of script.inputs) {
      const isEditing = editingId === entry.id;
      const row = document.createElement("div");
      row.className = "variable-row";
      row.draggable = !isEditing;
      row.addEventListener("dragstart", (e) => {
        e.dataTransfer?.setData(SCRIPT_IO_ENTRY_DRAG_MIME, entry.id);
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
      });
      row.addEventListener("dragover", (e) => {
        if (!e.dataTransfer?.types.includes(SCRIPT_IO_ENTRY_DRAG_MIME)) return;
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
        if (!e.dataTransfer?.types.includes(SCRIPT_IO_ENTRY_DRAG_MIME)) return;
        e.preventDefault();
        const draggedId = e.dataTransfer.getData(SCRIPT_IO_ENTRY_DRAG_MIME);
        clearDropIndicator();
        if (!draggedId) return;
        const rect = row.getBoundingClientRect();
        const position = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
        moveScriptInput(script, draggedId, entry.id, position);
        store.notify();
      });

      let nameInputToFocus: HTMLInputElement | null = null;
      const nameEl =
        editingId === entry.id
          ? (() => {
              const input = createEditableNameInput(
                entry.name,
                (newName) => commitRename(script, entry, newName),
                () => {
                  editingId = null;
                  store.notify();
                },
              );
              nameInputToFocus = input;
              return input;
            })()
          : createEditableNameLabel(entry.name, (screenPos) => {
              openRowContextMenu(screenPos, [
                {
                  label: "Edit",
                  onClick: () => {
                    editingId = entry.id;
                    store.notify();
                  },
                },
              ]);
            });

      const type = createTypeSelect(entry.type, (type) => {
        updateScriptInput(store.state.rootGraph, script, entry.id, { type });
        store.notify();
      });

      const container = createContainerSelect(entry.container ?? "single", (container) => {
        updateScriptInput(store.state.rootGraph, script, entry.id, { container });
        store.notify();
      });

      const delBtn = document.createElement("button");
      delBtn.textContent = "✕";
      delBtn.addEventListener("click", () => {
        removeScriptInput(store.state.rootGraph, script, entry.id);
        store.notify();
      });

      row.append(nameEl, type, container);
      if (entry.container === "map") {
        const keyType = createTypeSelect(entry.keyType ?? "string", (keyType) => {
          updateScriptInput(store.state.rootGraph, script, entry.id, { keyType });
          store.notify();
        });
        row.append(keyType);
      }
      row.append(delBtn);
      elements.list.appendChild(row);

      const valueRow = document.createElement("div");
      valueRow.className = "variable-row";
      const value = createTypedValueInput(
        entry.type,
        entry.defaultValue,
        (defaultValue) => {
          updateScriptInput(store.state.rootGraph, script, entry.id, { defaultValue });
          store.notify();
        },
        entry.container ?? "single",
        entry.keyType ?? "string",
      );
      valueRow.append(value);
      elements.list.appendChild(valueRow);

      if (nameInputToFocus) focusAndSelect(nameInputToFocus);
    }
  }

  elements.addButton.addEventListener("click", (e) => {
    e.stopPropagation();
    elements.section.classList.remove("collapsed");
    const script = getSelectedScript();
    if (!script) return;
    const name = nextAvailableName(script.inputs.map((entry) => entry.name), "NewInput");
    const type: PinType = "number";
    const entry: PinSignatureEntry = { id: nextId("io"), name, type, defaultValue: DEFAULT_VALUE_BY_TYPE[type] };
    addScriptInput(script, entry);
    editingId = entry.id;
    store.notify();
  });

  return { render };
}
