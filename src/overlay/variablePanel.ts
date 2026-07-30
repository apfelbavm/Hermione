import { Colors } from "../engine/color";
import { Graph } from "../engine/graph";
import {
  addVariable,
  DEFAULT_VALUE_BY_TYPE,
  moveVariable,
  nextId,
  removeVariable,
  updateVariable,
} from "../engine/graphMutations";
import type { PinType, Variable } from "../engine/types";
import type { Store } from "../state/store";
import { setSectionEmpty, setupCollapsibleSection } from "./collapsibleSection";
import { VARIABLE_DRAG_MIME } from "./dragTypes";
import {
  createEditableNameInput,
  createEditableNameLabel,
  focusAndSelect,
  isRenamingWithinList,
} from "./editableNameCell";
import { openRowContextMenu } from "./rowContextMenu";
import { createContainerIcon } from "./typedValueInput";
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
  // Tracks the row currently showing the drop-position indicator during a manual reorder drag —
  // cleared/reassigned directly via classList (NOT store.notify()) so hovering across rows stays
  // purely cosmetic and never triggers a full re-render mid-drag, which would replace the very DOM
  // node the browser's native drag gesture is tracking.
  let dropIndicatorRow: HTMLElement | null = null;

  function clearDropIndicator(): void {
    dropIndicatorRow?.classList.remove(
      "variable-row-drop-above",
      "variable-row-drop-below",
    );
    dropIndicatorRow = null;
  }

  function commitRename(variable: Variable, rawNewName: string): void {
    const trimmed = rawNewName.trim();
    const isDuplicate =
      trimmed.length === 0 ||
      getGraph().variables.some(
        (v) => v.id !== variable.id && v.name === trimmed,
      );
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

    setSectionEmpty(elements.section, getGraph().variables.length === 0);
    elements.list.innerHTML = "";
    for (const variable of getGraph().variables) {
      const isEditing = editingId === variable.id;
      const isSelected =
        store.state.sidebarSelection?.kind === "variable" &&
        store.state.sidebarSelection.variableId === variable.id;

      const row = document.createElement("div");
      row.className =
        "variable-row" + (isSelected ? " variable-row-selected" : "");
      row.draggable = !isEditing;
      row.addEventListener("dragstart", (e) => {
        e.dataTransfer?.setData(VARIABLE_DRAG_MIME, variable.id);
        // "copyMove" (not just "copy") since this ONE drag gesture now serves two different drop
        // targets with two different effects: dropping on the canvas spawns a Get/Set node (copy,
        // set by main.ts's own canvas dragover), dropping on another row here reorders in place
        // (move, set below). A dropEffect the dragstart's effectAllowed doesn't include is exactly
        // the kind of mismatch real browsers silently refuse to complete the drop for — this bit
        // us for real (drop simply never fired), even though it's invisible to synthetic/automated
        // drag-and-drop testing that doesn't enforce it as strictly.
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "copyMove";
      });

      // Dropping this SAME drag gesture back onto another row in this list reorders variables
      // in place (see moveVariable) instead of spawning a Get/Set node — that only happens when
      // the drop lands on the canvas (see main.ts's own dragover/drop on the canvas element,
      // a completely different drop target, so the two behaviors never conflict).
      row.addEventListener("dragover", (e) => {
        if (!e.dataTransfer?.types.includes(VARIABLE_DRAG_MIME)) return;
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
        if (!e.dataTransfer?.types.includes(VARIABLE_DRAG_MIME)) return;
        e.preventDefault();
        e.stopPropagation(); // don't also let this bubble to the canvas's own drop handler
        const draggedId = e.dataTransfer.getData(VARIABLE_DRAG_MIME);
        clearDropIndicator();
        if (!draggedId) return;
        const rect = row.getBoundingClientRect();
        const position =
          e.clientY < rect.top + rect.height / 2 ? "before" : "after";
        moveVariable(getGraph(), draggedId, variable.id, position);
        store.notify();
      });

      // One icon per row, always colored by the variable's type (same color its pin/node header
      // would use on the canvas): a plain dot for a "single" variable, or the Array/Set/Map shape
      // for a container one (see typedValueInput.ts's createContainerIcon, drawNodes.ts's
      // drawPinShape) — the container icon REPLACES the dot rather than sitting alongside it, since
      // a variable only ever has one "kind" to show at a glance.
      const containerIcon =
        variable.container && variable.container !== "single"
          ? createContainerIcon(variable.container)
          : null;
      const typeIcon = containerIcon ?? document.createElement("span");
      if (!containerIcon) typeIcon.className = "variable-type-dot";
      typeIcon.style.color = Colors.PIN_COLORS[variable.type];
      typeIcon.style.backgroundColor = containerIcon
        ? ""
        : Colors.PIN_COLORS[variable.type];
      typeIcon.title =
        variable.container && variable.container !== "single"
          ? `${variable.container} of ${variable.type}`
          : variable.type;

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
            const label = createEditableNameLabel(
              variable.name,
              (screenPos) => {
                openRowContextMenu(screenPos, [
                  {
                    label: "Rename",
                    onClick: () => {
                      editingId = variable.id;
                      store.notify();
                    },
                  },
                ]);
              },
            );
            label.addEventListener("click", () => {
              store.state.sidebarSelection = {
                kind: "variable",
                variableId: variable.id,
              };
              store.notify();
            });
            return label;
          })();

      const delBtn = document.createElement("button");
      delBtn.textContent = "✕";
      delBtn.addEventListener("click", () => {
        const graph = getGraph();
        removeVariable(
          graph,
          store.state.rootGraph.getVisibleVariables(graph),
          store.state.rootGraph.functions,
          variable.id,
        );
        if (
          store.state.sidebarSelection?.kind === "variable" &&
          store.state.sidebarSelection.variableId === variable.id
        ) {
          store.state.sidebarSelection = null;
        }
        store.notify();
      });

      row.append(typeIcon, nameEl, delBtn);
      elements.list.appendChild(row);
      if (nameInputToFocus) focusAndSelect(nameInputToFocus);
    }
  }

  elements.addButton.addEventListener("click", (e) => {
    e.stopPropagation(); // don't also toggle the section's collapse state
    elements.section.classList.remove("collapsed");
    const graph = getGraph();
    const name = nextAvailableName(
      graph.variables.map((v) => v.name),
      "NewVariable",
    );
    const type: PinType = "number";
    const variable: Variable = {
      id: nextId("var"),
      name,
      type,
      defaultValue: DEFAULT_VALUE_BY_TYPE[type],
    };
    addVariable(graph, variable);
    editingId = variable.id;
    store.notify();
  });

  return { render };
}
