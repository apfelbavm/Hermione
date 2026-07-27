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
import type { FunctionDef, PinType } from "../engine/types";
import { screenToWorld } from "../render/camera";
import type { Store } from "../state/store";
import { createNameInput, createTypeSelect, createTypedValueInput } from "./typedValueInput";

export interface FunctionIoPanelElements {
  /** The whole section wrapper — hidden entirely while no function is open for editing. */
  section: HTMLElement;
  list: HTMLElement;
  nameInput: HTMLInputElement;
  typeSelect: HTMLSelectElement;
  addButton: HTMLButtonElement;
  /** Outputs-only: spawns a new function.return node into the open function's body. */
  spawnReturnButton?: HTMLButtonElement;
}

/** Shared factory for the Inputs and Outputs sections — both are a list of typed signature
 * entries (name/type/default value) on the currently-open function, editable in place. The
 * Outputs panel additionally spawns Return node instances onto the function's body graph — a
 * function's body has exactly one auto-placed Entry but can have several placed Return nodes. */
export function createFunctionIoPanel(
  elements: FunctionIoPanelElements,
  store: Store,
  canvas: HTMLCanvasElement,
  kind: "input" | "output",
  getActiveFunction: () => FunctionDef | null,
): { render: () => void } {
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

  elements.spawnReturnButton?.addEventListener("click", () => {
    const fn = getActiveFunction();
    if (!fn) return;
    const def = getNodeDef("function.return");
    const pinDefs = def.deriveFunctionPins!(fn);
    const node = createNodeInstance("function.return", centerWorldPos(), pinDefs, nextId("node"), undefined, fn.id);
    addNode(fn.body, node);
    store.notify();
  });

  function render(): void {
    const fn = getActiveFunction();
    elements.section.style.display = fn ? "" : "none";
    if (!fn) return;
    if (elements.list.contains(document.activeElement)) return;

    elements.list.innerHTML = "";
    const entries = kind === "input" ? fn.inputs : fn.outputs;
    const update = kind === "input" ? updateFunctionInput : updateFunctionOutput;
    const removeEntry = kind === "input" ? removeFunctionInput : removeFunctionOutput;

    for (const entry of entries) {
      const row = document.createElement("div");
      row.className = "variable-row";

      const name = createNameInput(entry.name, (name) => {
        update(store.state.rootGraph, fn, entry.id, { name });
        store.notify();
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

      row.append(name, type, value, delBtn);
      elements.list.appendChild(row);
    }
  }

  elements.addButton.addEventListener("click", () => {
    const fn = getActiveFunction();
    if (!fn) return;
    const name = elements.nameInput.value.trim() || (kind === "input" ? "Input" : "Output");
    const type = elements.typeSelect.value as PinType;
    const entry = { id: nextId("io"), name, type, defaultValue: DEFAULT_VALUE_BY_TYPE[type] };
    if (kind === "input") addFunctionInput(fn, entry);
    else addFunctionOutput(fn, entry);
    elements.nameInput.value = "";
    store.notify();
  });

  return { render };
}
