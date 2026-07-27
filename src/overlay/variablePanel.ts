import { addNode, addVariable, nextId, removeVariable } from "../engine/graphMutations";
import { getNodeDef } from "../engine/registry";
import type { PinType, Variable } from "../engine/types";
import { screenToWorld } from "../render/camera";
import type { Store } from "../state/store";

const DEFAULT_VALUE_BY_TYPE: Record<PinType, unknown> = {
  exec: undefined,
  number: 0,
  boolean: false,
  string: "",
  object: null,
};

export interface VariablePanelElements {
  list: HTMLElement;
  nameInput: HTMLInputElement;
  typeSelect: HTMLSelectElement;
  addButton: HTMLButtonElement;
}

/** Wires up the Variables side panel: create/delete variables, and spawn Get/Set nodes bound to one. */
export function createVariablePanel(
  elements: VariablePanelElements,
  store: Store,
  canvas: HTMLCanvasElement,
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
    addNode(store.state.graph, node);
    store.notify();
  }

  function render(): void {
    elements.list.innerHTML = "";
    for (const variable of store.state.graph.variables) {
      const row = document.createElement("div");
      row.className = "variable-row";

      const name = document.createElement("span");
      name.className = "variable-name";
      name.textContent = variable.name;
      name.title = variable.name;

      const type = document.createElement("span");
      type.className = "variable-type";
      type.textContent = variable.type;

      const getBtn = document.createElement("button");
      getBtn.textContent = "Get";
      getBtn.addEventListener("click", () => spawnBoundNode("variable.get", variable));

      const setBtn = document.createElement("button");
      setBtn.textContent = "Set";
      setBtn.addEventListener("click", () => spawnBoundNode("variable.set", variable));

      const delBtn = document.createElement("button");
      delBtn.textContent = "✕";
      delBtn.addEventListener("click", () => {
        removeVariable(store.state.graph, variable.id);
        store.notify();
      });

      row.append(name, type, getBtn, setBtn, delBtn);
      elements.list.appendChild(row);
    }
  }

  elements.addButton.addEventListener("click", () => {
    const name = elements.nameInput.value.trim() || `Var${store.state.graph.variables.length + 1}`;
    const type = elements.typeSelect.value as PinType;
    const variable: Variable = {
      id: nextId("var"),
      name,
      type,
      defaultValue: DEFAULT_VALUE_BY_TYPE[type],
    };
    addVariable(store.state.graph, variable);
    elements.nameInput.value = "";
    store.notify();
  });

  return { render };
}
