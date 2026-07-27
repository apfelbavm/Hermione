import {
  addFunctionInput,
  addFunctionOutput,
  DEFAULT_VALUE_BY_TYPE,
  nextId,
  removeFunctionInput,
  removeFunctionOutput,
  updateFunctionInput,
  updateFunctionOutput,
} from "../engine/graphMutations";
import type { FunctionDef, PinSignatureEntry, PinType } from "../engine/types";
import type { Store } from "../state/store";
import { setupCollapsibleSection } from "./collapsibleSection";
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
    const update = kind === "input" ? updateFunctionInput : updateFunctionOutput;
    const removeEntry = kind === "input" ? removeFunctionInput : removeFunctionOutput;

    for (const entry of entries) {
      const row = document.createElement("div");
      row.className = "variable-row";

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
                  label: "Edit",
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
