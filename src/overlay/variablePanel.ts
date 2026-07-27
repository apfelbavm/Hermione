import { addVariable, DEFAULT_VALUE_BY_TYPE, getVisibleVariables, nextId, removeVariable, updateVariable } from "../engine/graphMutations";
import type { Graph, PinType, Variable } from "../engine/types";
import { PIN_COLORS } from "../render/palette";
import type { Store } from "../state/store";
import { setupCollapsibleSection } from "./collapsibleSection";
import { VARIABLE_DRAG_MIME } from "./dragTypes";
import { createEditableNameInput, createEditableNameLabel, focusAndSelect, isRenamingWithinList } from "./editableNameCell";
import { openRowContextMenu } from "./rowContextMenu";
import { nextAvailableName } from "./uniqueName";

export interface VariablePanelElements {
  section: HTMLElement;
  header: HTMLElement;
  list: HTMLElement;
  addButton: HTMLButtonElement;
}

/** Wires up a Variables-style side panel: collapsible, "+" creates a variable with an unused
 * default name and immediately enters rename mode, right-click > Edit renames an existing one.
 * Clicking a row's name selects it (highlighted here, and its type/value shown in the shared
 * Details section — see detailsPanel.ts). Rows are also drag-and-drop sources — dropping one onto
 * the canvas (see main.ts) pops up a Get/Set choice at the drop point. Generalized over `getGraph`
 * so the same factory drives both the always-visible global Variables panel (bound to the root
 * graph) and the Local Variables panel (bound to whichever function's body is currently open). */
export function createVariablePanel(
  elements: VariablePanelElements,
  store: Store,
  getGraph: () => Graph,
): { render: () => void } {
  setupCollapsibleSection(elements.header, elements.section);

  let editingId: string | null = null;

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
    // Skip rebuilding while the user is actively mid-rename — otherwise any unrelated
    // store.notify() (e.g. dragging a node on canvas) would wipe the DOM mid-keystroke.
    if (isRenamingWithinList(elements.list)) return;

    elements.list.innerHTML = "";
    for (const variable of getGraph().variables) {
      const isEditing = editingId === variable.id;
      const isSelected =
        store.state.sidebarSelection?.kind === "variable" && store.state.sidebarSelection.variableId === variable.id;

      const row = document.createElement("div");
      row.className = "variable-row" + (isSelected ? " variable-row-selected" : "");
      row.draggable = !isEditing;
      row.addEventListener("dragstart", (e) => {
        e.dataTransfer?.setData(VARIABLE_DRAG_MIME, variable.id);
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "copy";
      });

      // Same color its pin/node header would use on the canvas — a quick visual cue for the type.
      const typeDot = document.createElement("span");
      typeDot.className = "variable-type-dot";
      typeDot.style.backgroundColor = PIN_COLORS[variable.type];
      typeDot.title = variable.type;

      let nameInputToFocus: HTMLInputElement | null = null;
      const nameEl = isEditing
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
        : (() => {
            const label = createEditableNameLabel(variable.name, (screenPos) => {
              openRowContextMenu(screenPos, [
                {
                  label: "Edit",
                  onClick: () => {
                    editingId = variable.id;
                    store.notify();
                  },
                },
              ]);
            });
            label.addEventListener("click", () => {
              store.state.sidebarSelection = { kind: "variable", variableId: variable.id };
              store.notify();
            });
            return label;
          })();

      const delBtn = document.createElement("button");
      delBtn.textContent = "✕";
      delBtn.addEventListener("click", () => {
        const graph = getGraph();
        removeVariable(graph, getVisibleVariables(store.state.rootGraph, graph), store.state.rootGraph.functions, variable.id);
        if (store.state.sidebarSelection?.kind === "variable" && store.state.sidebarSelection.variableId === variable.id) {
          store.state.sidebarSelection = null;
        }
        store.notify();
      });

      row.append(typeDot, nameEl, delBtn);
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
