import {
  addScriptInput,
  addScriptOutput,
  DEFAULT_VALUE_BY_TYPE,
  moveScriptInput,
  moveScriptOutput,
  nextId,
  removeScriptInput,
  removeScriptOutput,
  updateScriptInput,
  updateScriptOutput,
} from "../engine/graphMutations";
import type { CodeScriptDef, PinSignatureEntry, PinType } from "../engine/types";
import type { Store } from "../state/store";
import { setSectionEmpty, setupCollapsibleSection } from "./collapsibleSection";
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

/** Shared factory for a script's Inputs and Outputs sections — both are a list of typed signature
 * entries (name/type/default value) on the currently-selected script, closely mirroring
 * functionIoPanel.ts's own Inputs/Outputs factory. Inputs are passed into `run()` as a name-keyed
 * object; Outputs are populated from whatever object `run()` returns, keyed the same way — see
 * code.ts's namedInputsFor/pinOutputsFor for the exact (inverse) mapping each direction uses. */
export function createScriptIoPanel(
  elements: ScriptIoPanelElements,
  store: Store,
  kind: "input" | "output",
  getSelectedScript: () => CodeScriptDef | null,
): { render: () => void } {
  setupCollapsibleSection(elements.header, elements.section);

  let editingId: string | null = null;
  let dropIndicatorRow: HTMLElement | null = null;

  function clearDropIndicator(): void {
    dropIndicatorRow?.classList.remove("variable-row-drop-above", "variable-row-drop-below");
    dropIndicatorRow = null;
  }

  function entriesOf(script: CodeScriptDef): PinSignatureEntry[] {
    return kind === "input" ? script.inputs : script.outputs;
  }

  function commitRename(script: CodeScriptDef, entry: PinSignatureEntry, rawNewName: string): void {
    const trimmed = rawNewName.trim();
    const isDuplicate =
      trimmed.length === 0 || entriesOf(script).some((e) => e.id !== entry.id && e.name === trimmed);
    if (!isDuplicate) {
      const update = kind === "input" ? updateScriptInput : updateScriptOutput;
      update(store.state.rootGraph, script, entry.id, { name: trimmed });
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
    const entries = entriesOf(script);
    setSectionEmpty(elements.section, entries.length === 0);
    const update = kind === "input" ? updateScriptInput : updateScriptOutput;
    const removeEntry = kind === "input" ? removeScriptInput : removeScriptOutput;
    const moveEntry = kind === "input" ? moveScriptInput : moveScriptOutput;

    for (const entry of entries) {
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
        moveEntry(script, draggedId, entry.id, position);
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
        update(store.state.rootGraph, script, entry.id, { type });
        store.notify();
      });

      const container = createContainerSelect(entry.container ?? "single", (container) => {
        update(store.state.rootGraph, script, entry.id, { container });
        store.notify();
      });

      const delBtn = document.createElement("button");
      delBtn.textContent = "✕";
      delBtn.addEventListener("click", () => {
        removeEntry(store.state.rootGraph, script, entry.id);
        store.notify();
      });

      row.append(nameEl, type, container);
      if (entry.container === "map") {
        const keyType = createTypeSelect(entry.keyType ?? "string", (keyType) => {
          update(store.state.rootGraph, script, entry.id, { keyType });
          store.notify();
        });
        row.append(keyType);
      }
      row.append(delBtn);
      elements.list.appendChild(row);

      // A container's default-value editor is a whole vertical list, not a single inline input —
      // gets its own row underneath the name/type/container line instead of squeezing in beside it.
      // For an OUTPUT entry this default value is only ever the fallback used when the script's own
      // `run()` doesn't return a value under this name (see code.ts's pinOutputsFor) — there's no
      // separate "always show this" concept the way an unconnected INPUT pin's default is what a
      // literal widget would show.
      const valueRow = document.createElement("div");
      valueRow.className = "variable-row";
      const value = createTypedValueInput(
        entry.type,
        entry.defaultValue,
        (defaultValue) => {
          update(store.state.rootGraph, script, entry.id, { defaultValue });
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
    const name = nextAvailableName(entriesOf(script).map((entry) => entry.name), kind === "input" ? "NewInput" : "NewOutput");
    const type: PinType = "number";
    const entry: PinSignatureEntry = { id: nextId("io"), name, type, defaultValue: DEFAULT_VALUE_BY_TYPE[type] };
    if (kind === "input") addScriptInput(script, entry);
    else addScriptOutput(script, entry);
    editingId = entry.id;
    store.notify();
  });

  return { render };
}
