import { addNode, addVariable, DEFAULT_VALUE_BY_TYPE, nextId, removeVariable, updateVariable } from "../engine/graphMutations";
import { getNodeDef } from "../engine/registry";
import type { Graph, PinType, Variable } from "../engine/types";
import { screenToWorld } from "../render/camera";
import type { Store } from "../state/store";
import { createNameInput, createTypeSelect, createTypedValueInput } from "./typedValueInput";

export interface VariablePanelElements {
  list: HTMLElement;
  nameInput: HTMLInputElement;
  typeSelect: HTMLSelectElement;
  addButton: HTMLButtonElement;
}

/** Wires up a Variables-style side panel: create/delete variables, edit name/type/default value
 * in place, and spawn Get/Set nodes bound to one. Generalized over `getGraph` so the same factory
 * drives both the always-visible global Variables panel (bound to the root graph) and the Local
 * Variables panel (bound to whichever function's body is currently open). */
export function createVariablePanel(
  elements: VariablePanelElements,
  store: Store,
  canvas: HTMLCanvasElement,
  getGraph: () => Graph,
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

  function spawnBoundNode(type: "variable.get" | "variable.set", variable: Variable): void {
    const def = getNodeDef(type);
    const pinDefs = def.derivePins!(variable);
    const node = { id: nextId("node"), type, position: centerWorldPos(), pins: {} as Record<string, { value?: unknown; connectionId?: string }>, variableId: variable.id };
    for (const pinDef of pinDefs) {
      node.pins[pinDef.id] = pinDef.direction === "input" ? { value: pinDef.defaultValue } : {};
    }
    addNode(getGraph(), node);
    store.notify();
  }

  function render(): void {
    // Skip rebuilding while the user is actively editing a field in this list — otherwise any
    // unrelated store.notify() (e.g. dragging a node on canvas) would wipe the DOM mid-keystroke.
    if (elements.list.contains(document.activeElement)) return;

    elements.list.innerHTML = "";
    for (const variable of getGraph().variables) {
      const row = document.createElement("div");
      row.className = "variable-row";

      const name = createNameInput(variable.name, (name) => {
        updateVariable(store.state.rootGraph, variable.id, { name });
        store.notify();
      });
      name.title = variable.name;

      const type = createTypeSelect(variable.type, (type) => {
        updateVariable(store.state.rootGraph, variable.id, { type });
        store.notify();
      });

      const value = createTypedValueInput(variable.type, variable.defaultValue, (defaultValue) => {
        updateVariable(store.state.rootGraph, variable.id, { defaultValue });
        store.notify();
      });

      const getBtn = document.createElement("button");
      getBtn.textContent = "Get";
      getBtn.addEventListener("click", () => spawnBoundNode("variable.get", variable));

      const setBtn = document.createElement("button");
      setBtn.textContent = "Set";
      setBtn.addEventListener("click", () => spawnBoundNode("variable.set", variable));

      const delBtn = document.createElement("button");
      delBtn.textContent = "✕";
      delBtn.addEventListener("click", () => {
        removeVariable(getGraph(), variable.id);
        store.notify();
      });

      row.append(name, type, value, getBtn, setBtn, delBtn);
      elements.list.appendChild(row);
    }
  }

  elements.addButton.addEventListener("click", () => {
    const name = elements.nameInput.value.trim() || `Var${getGraph().variables.length + 1}`;
    const type = elements.typeSelect.value as PinType;
    const variable: Variable = {
      id: nextId("var"),
      name,
      type,
      defaultValue: DEFAULT_VALUE_BY_TYPE[type],
    };
    addVariable(getGraph(), variable);
    elements.nameInput.value = "";
    store.notify();
  });

  return { render };
}
