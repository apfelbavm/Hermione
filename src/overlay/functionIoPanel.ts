import {
  addFunctionInput,
  addFunctionOutput,
  DEFAULT_VALUE_BY_TYPE,
  moveFunctionEntry,
  nextId,
  removeFunctionInput,
  removeFunctionOutput,
  updateFunctionInput,
  updateFunctionOutput,
} from "../engine/graphMutations";
import type { FunctionDef, PinSignatureEntry, PinType } from "../engine/types";
import type { Store } from "../state/store";
import { setSectionEmpty, setupCollapsibleSection } from "./collapsibleSection";
import { FUNCTION_IO_ENTRY_DRAG_MIME } from "./dragTypes";
import { createEditableNameInput, createEditableNameLabel, focusAndSelect, isRenamingWithinList } from "./editableNameCell";
import { openRowContextMenu } from "./rowContextMenu";
import { createContainerSelect, createTypeSelect, createTypedValueInput } from "./typedValueInput";
import { nextAvailableName } from "./uniqueName";

export interface FunctionIoPanelElements {
  /** The whole section wrapper — hidden entirely while no function is open for editing. */
  section: HTMLElement;
  header: HTMLElement;
  list: HTMLElement;
  addButton: HTMLButtonElement;
}

/** Shared factory for the Inputs and Outputs sections — both are a list of typed signature
 * entries (name/type/default value) on the currently-open function. Collapsible; "+" creates an
 * entry with an unused default name and immediately enters rename mode; right-click > Edit renames
 * an existing one. (A Return node instance is placed by right-clicking inside the function's body
 * graph — see main.ts's contextmenu handler — not from here; a function body can hold several.) */
export function createFunctionIoPanel(
  elements: FunctionIoPanelElements,
  store: Store,
  kind: "input" | "output",
  getActiveFunction: () => FunctionDef | null,
): { render: () => void } {
  setupCollapsibleSection(elements.header, elements.section);

  let editingId: string | null = null;
  // Same direct-classList (not store.notify()) hover-indicator approach as variablePanel.ts's own
  // drag-to-reorder — see its comment for why a full re-render mid-drag would be actively harmful.
  let dropIndicatorRow: HTMLElement | null = null;

  function clearDropIndicator(): void {
    dropIndicatorRow?.classList.remove("variable-row-drop-above", "variable-row-drop-below");
    dropIndicatorRow = null;
  }

  function entriesOf(fn: FunctionDef): PinSignatureEntry[] {
    return kind === "input" ? fn.inputs : fn.outputs;
  }

  function commitRename(fn: FunctionDef, entry: PinSignatureEntry, rawNewName: string): void {
    const trimmed = rawNewName.trim();
    const isDuplicate =
      trimmed.length === 0 || entriesOf(fn).some((e) => e.id !== entry.id && e.name === trimmed);
    if (!isDuplicate) {
      const update = kind === "input" ? updateFunctionInput : updateFunctionOutput;
      update(store.state.rootGraph, fn, entry.id, { name: trimmed });
    }
    editingId = null;
    store.notify();
  }

  function render(): void {
    const fn = getActiveFunction();
    elements.section.style.display = fn ? "" : "none";
    if (!fn) return;
    if (isRenamingWithinList(elements.list)) return;

    elements.list.innerHTML = "";
    const entries = entriesOf(fn);
    setSectionEmpty(elements.section, entries.length === 0);
    const update = kind === "input" ? updateFunctionInput : updateFunctionOutput;
    const removeEntry = kind === "input" ? removeFunctionInput : removeFunctionOutput;

    for (const entry of entries) {
      const isEditing = editingId === entry.id;
      const row = document.createElement("div");
      row.className = "variable-row";
      row.draggable = !isEditing;
      row.addEventListener("dragstart", (e) => {
        e.dataTransfer?.setData(FUNCTION_IO_ENTRY_DRAG_MIME, entry.id);
        // Just "move" (not "copyMove" like the Variables/Functions rows) — this drag gesture has
        // only ever one destination, reordering within this same list, never a canvas drop.
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
      });
      row.addEventListener("dragover", (e) => {
        if (!e.dataTransfer?.types.includes(FUNCTION_IO_ENTRY_DRAG_MIME)) return;
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
        if (!e.dataTransfer?.types.includes(FUNCTION_IO_ENTRY_DRAG_MIME)) return;
        e.preventDefault();
        const draggedId = e.dataTransfer.getData(FUNCTION_IO_ENTRY_DRAG_MIME);
        clearDropIndicator();
        if (!draggedId) return;
        const rect = row.getBoundingClientRect();
        const position = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
        moveFunctionEntry(fn, kind, draggedId, entry.id, position);
        store.notify();
      });

      let nameInputToFocus: HTMLInputElement | null = null;
      const nameEl =
        editingId === entry.id
          ? (() => {
              const input = createEditableNameInput(
                entry.name,
                (newName) => commitRename(fn, entry, newName),
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
                  label: "Rename",
                  onClick: () => {
                    editingId = entry.id;
                    store.notify();
                  },
                },
              ]);
            });

      const type = createTypeSelect(entry.type, (type) => {
        update(store.state.rootGraph, fn, entry.id, { type });
        store.notify();
      });

      const container = createContainerSelect(entry.container ?? "single", (container) => {
        update(store.state.rootGraph, fn, entry.id, { container });
        store.notify();
      });

      const delBtn = document.createElement("button");
      delBtn.textContent = "✕";
      delBtn.addEventListener("click", () => {
        removeEntry(store.state.rootGraph, fn, entry.id);
        store.notify();
      });

      row.append(nameEl, type, container);
      if (entry.container === "map") {
        const keyType = createTypeSelect(entry.keyType ?? "string", (keyType) => {
          update(store.state.rootGraph, fn, entry.id, { keyType });
          store.notify();
        });
        row.append(keyType);
      }
      row.append(delBtn);
      elements.list.appendChild(row);

      // A container's default-value editor is a whole vertical list, not a single inline input —
      // gets its own row underneath the name/type/container line instead of squeezing in beside it.
      const valueRow = document.createElement("div");
      valueRow.className = "variable-row";
      const value = createTypedValueInput(
        entry.type,
        entry.defaultValue,
        (defaultValue) => {
          update(store.state.rootGraph, fn, entry.id, { defaultValue });
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
    const fn = getActiveFunction();
    if (!fn) return;
    const name = nextAvailableName(entriesOf(fn).map((entry) => entry.name), kind === "input" ? "NewInput" : "NewOutput");
    const type: PinType = "number";
    const entry: PinSignatureEntry = { id: nextId("io"), name, type, defaultValue: DEFAULT_VALUE_BY_TYPE[type] };
    if (kind === "input") addFunctionInput(fn, entry);
    else addFunctionOutput(fn, entry);
    editingId = entry.id;
    store.notify();
  });

  return { render };
}
