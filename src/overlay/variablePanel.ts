import { addVariable, DEFAULT_VALUE_BY_TYPE, nextId, removeVariable, updateVariable } from "../engine/graphMutations";
import { getNodeDef } from "../engine/registry";
import type { Graph, PinType, Variable } from "../engine/types";
import { screenToWorld } from "../render/camera";
import type { Store } from "../state/store";
import { setupCollapsibleSection } from "./collapsibleSection";
import { createEditableNameInput, createEditableNameLabel, focusAndSelect } from "./editableNameCell";
import { openRowContextMenu } from "./rowContextMenu";
import { createTypeSelect, createTypedValueInput } from "./typedValueInput";
import { nextAvailableName } from "./uniqueName";

export interface VariablePanelElements {
  section: HTMLElement;
  header: HTMLElement;
  list: HTMLElement;
  addButton: HTMLButtonElement;
}

/** Wires up a Variables-style side panel: collapsible, "+" creates a variable with an unused
 * default name and immediately enters rename mode, right-click > Edit renames an existing one,
 * and Get/Set spawn nodes bound to it. Generalized over `getGraph` so the same factory drives both
 * the always-visible global Variables panel (bound to the root graph) and the Local Variables
 * panel (bound to whichever function's body is currently open). */
export function createVariablePanel(
  elements: VariablePanelElements,
  store: Store,
  canvas: HTMLCanvasElement,
  getGraph: () => Graph,
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

  function spawnBoundNode(type: "variable.get" | "variable.set", variable: Variable): void {
    const def = getNodeDef(type);
    const pinDefs = def.derivePins!(variable);
    const node = { id: nextId("node"), type, position: centerWorldPos(), pins: {} as Record<string, { value?: unknown; connectionId?: string }>, variableId: variable.id };
    for (const pinDef of pinDefs) {
      node.pins[pinDef.id] = pinDef.direction === "input" ? { value: pinDef.defaultValue } : {};
    }
    getGraph().nodes.push(node);
    store.notify();
  }

  function commitRename(variable: Variable, rawNewName: string): void {
    const trimmed = rawNewName.trim();
    const isDuplicate =
      trimmed.length === 0 || getGraph().variables.some((v) => v.id !== variable.id && v.name === trimmed);
    if (!isDuplicate) {
      updateVariable(store.state.rootGraph, variable.id, { name: trimmed });
    }
    editingId = null;
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

      let nameInputToFocus: HTMLInputElement | null = null;
      const nameEl =
        editingId === variable.id
          ? (() => {
              const input = createEditableNameInput(
                variable.name,
                (newName) => commitRename(variable, newName),
                () => {
                  editingId = null;
                  store.notify();
                },
              );
              nameInputToFocus = input;
              return input;
            })()
          : createEditableNameLabel(variable.name, (screenPos) => {
              openRowContextMenu(screenPos, () => {
                editingId = variable.id;
                store.notify();
              });
            });

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

      row.append(nameEl, type, value, getBtn, setBtn, delBtn);
      elements.list.appendChild(row);
      if (nameInputToFocus) focusAndSelect(nameInputToFocus);
    }
  }

  elements.addButton.addEventListener("click", (e) => {
    e.stopPropagation(); // don't also toggle the section's collapse state
    elements.section.classList.remove("collapsed");
    const graph = getGraph();
    const name = nextAvailableName(graph.variables.map((v) => v.name), "NewVariable");
    const type: PinType = "number";
    const variable: Variable = { id: nextId("var"), name, type, defaultValue: DEFAULT_VALUE_BY_TYPE[type] };
    addVariable(graph, variable);
    editingId = variable.id;
    store.notify();
  });

  return { render };
}
