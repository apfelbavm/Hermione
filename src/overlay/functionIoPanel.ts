import {
  addFunctionInput,
  addFunctionOutput,
  addNode,
  createNodeInstance,
  DEFAULT_VALUE_BY_TYPE,
  nextId,
  removeFunctionInput,
  removeFunctionOutput,
  updateFunctionInput,
  updateFunctionOutput,
} from "../engine/graphMutations";
import { getNodeDef } from "../engine/registry";
import type { FunctionDef, PinSignatureEntry, PinType } from "../engine/types";
import { screenToWorld } from "../render/camera";
import type { Store } from "../state/store";
import { setupCollapsibleSection } from "./collapsibleSection";
import { createEditableNameInput, createEditableNameLabel, focusAndSelect } from "./editableNameCell";
import { openRowContextMenu } from "./rowContextMenu";
import { createTypeSelect, createTypedValueInput } from "./typedValueInput";
import { nextAvailableName } from "./uniqueName";

export interface FunctionIoPanelElements {
  /** The whole section wrapper — hidden entirely while no function is open for editing. */
  section: HTMLElement;
  header: HTMLElement;
  list: HTMLElement;
  addButton: HTMLButtonElement;
  /** Outputs-only: spawns a new function.return node into the open function's body. */
  spawnReturnButton?: HTMLButtonElement;
}

/** Shared factory for the Inputs and Outputs sections — both are a list of typed signature
 * entries (name/type/default value) on the currently-open function. Collapsible; "+" creates an
 * entry with an unused default name and immediately enters rename mode; right-click > Edit renames
 * an existing one. The Outputs panel additionally spawns Return node instances onto the function's
 * body graph — a function's body has exactly one auto-placed Entry but can have several Returns. */
export function createFunctionIoPanel(
  elements: FunctionIoPanelElements,
  store: Store,
  canvas: HTMLCanvasElement,
  kind: "input" | "output",
  getActiveFunction: () => FunctionDef | null,
): { render: () => void } {
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

  elements.spawnReturnButton?.addEventListener("click", () => {
    const fn = getActiveFunction();
    if (!fn) return;
    const def = getNodeDef("function.return");
    const pinDefs = def.deriveFunctionPins!(fn);
    const node = createNodeInstance("function.return", centerWorldPos(), pinDefs, nextId("node"), undefined, fn.id);
    addNode(fn.body, node);
    store.notify();
  });

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
    if (elements.list.contains(document.activeElement)) return;

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
              openRowContextMenu(screenPos, () => {
                editingId = entry.id;
                store.notify();
              });
            });

      const type = createTypeSelect(entry.type, (type) => {
        update(store.state.rootGraph, fn, entry.id, { type });
        store.notify();
      });

      const value = createTypedValueInput(entry.type, entry.defaultValue, (defaultValue) => {
        update(store.state.rootGraph, fn, entry.id, { defaultValue });
        store.notify();
      });

      const delBtn = document.createElement("button");
      delBtn.textContent = "✕";
      delBtn.addEventListener("click", () => {
        removeEntry(store.state.rootGraph, fn, entry.id);
        store.notify();
      });

      row.append(nameEl, type, value, delBtn);
      elements.list.appendChild(row);
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
