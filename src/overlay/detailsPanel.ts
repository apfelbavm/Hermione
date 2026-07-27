import { allGraphs, updateVariable } from "../engine/graphMutations";
import type { Store } from "../state/store";
import { createTypeSelect, createTypedValueInput } from "./typedValueInput";

export interface DetailsPanelElements {
  /** The whole Details section, including its divider/header — hidden entirely when nothing is selected. */
  section: HTMLElement;
  /** Variable sub-view: name label + a container the type/value row gets rendered into. */
  variableContent: HTMLElement;
  variableNameLabel: HTMLElement;
  variableFieldsContainer: HTMLElement;
  /** Function sub-view: just a visibility toggle — the actual Inputs/Outputs content lives in the
   * pre-existing functionIoPanel instances, relocated into this wrapper in index.html. They
   * already self-hide when their own accessor resolves to null, so nothing else to render here. */
  functionContent: HTMLElement;
}

/** The Unreal-style "Details" section pinned to the bottom of the sidebar: shows whichever
 * Functions/Variables row was last clicked (see state/store.ts's sidebarSelection) — a variable's
 * type/value fields, or a function's Inputs/Outputs (rendered by the existing io panels elsewhere,
 * this just owns the shared show/hide and the variable fields). */
export function createDetailsPanel(elements: DetailsPanelElements, store: Store): { render: () => void } {
  function render(): void {
    const selection = store.state.sidebarSelection;

    const validFunction =
      selection?.kind === "function" && store.state.rootGraph.functions.some((f) => f.id === selection.functionId);
    const variable =
      selection?.kind === "variable"
        ? allGraphs(store.state.rootGraph)
            .flatMap((g) => g.variables)
            .find((v) => v.id === selection.variableId)
        : undefined;

    elements.section.style.display = variable || validFunction ? "" : "none";
    elements.variableContent.style.display = variable ? "" : "none";
    elements.functionContent.style.display = validFunction ? "" : "none";

    if (!variable) return;

    elements.variableNameLabel.textContent = variable.name;
    // Don't wipe the type/value fields while the user is actively editing one of them.
    if (elements.variableFieldsContainer.contains(document.activeElement)) return;

    elements.variableFieldsContainer.innerHTML = "";
    const row = document.createElement("div");
    row.className = "variable-row";

    const type = createTypeSelect(variable.type, (type) => {
      updateVariable(store.state.rootGraph, variable.id, { type });
      store.notify();
    });
    const value = createTypedValueInput(variable.type, variable.defaultValue, (defaultValue) => {
      updateVariable(store.state.rootGraph, variable.id, { defaultValue });
      store.notify();
    });

    row.append(type, value);
    elements.variableFieldsContainer.appendChild(row);
  }

  return { render };
}
