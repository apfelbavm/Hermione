import { allGraphs, resolveNodeLabel, setPinLiteralValue, updateVariable } from "../engine/graphMutations";
import { getNodeDef } from "../engine/registry";
import type { CommentBox, NodeInstance, PinDef } from "../engine/types";
import { DEFAULT_COMMENT_COLOR } from "../render/commentGeometry";
import { getEditingGraph, getVisibleVariablesForState, type Store } from "../state/store";
import { createTypeSelect, createTypedValueInput } from "./typedValueInput";

export interface DetailsPanelElements {
  /** The whole Details section, including its divider/header — hidden entirely when nothing is selected. */
  section: HTMLElement;
  /** Variable sub-view: name label + a container the type/value row gets rendered into. */
  variableContent: HTMLElement;
  variableNameLabel: HTMLElement;
  variableFieldsContainer: HTMLElement;
  /** Node sub-view: a selected canvas node's own detailProperties (e.g. On Interval's interval
   * duration) — name label + a container the property rows get rendered into. */
  nodeContent: HTMLElement;
  nodeNameLabel: HTMLElement;
  nodeFieldsContainer: HTMLElement;
  /** Comment sub-view: a selected comment box's color (its title stays inline-editable on the
   * canvas itself — see commentOverlay.ts). */
  commentContent: HTMLElement;
  commentFieldsContainer: HTMLElement;
  /** Function sub-view: just a visibility toggle — the actual Inputs/Outputs content lives in the
   * pre-existing functionIoPanel instances, relocated into this wrapper in index.html. They
   * already self-hide when their own accessor resolves to null, so nothing else to render here. */
  functionContent: HTMLElement;
}

/** The Unreal-style "Details" section pinned to the bottom of the sidebar: shows whichever
 * Functions/Variables row was last clicked (see state/store.ts's sidebarSelection) — a variable's
 * type/value fields, or a function's Inputs/Outputs (rendered by the existing io panels elsewhere,
 * this just owns the shared show/hide and the variable fields) — or, if neither is set, a selected
 * canvas node's own detailProperties (see NodeDef.detailProperties and pointerHandlers.ts, which
 * clears sidebarSelection whenever a fresh node selection is made so this always reflects whichever
 * was clicked last). */
export function createDetailsPanel(elements: DetailsPanelElements, store: Store): { render: () => void } {
  function renderNodeProperties(node: NodeInstance, properties: PinDef[]): void {
    const def = getNodeDef(node.type);
    elements.nodeNameLabel.textContent = resolveNodeLabel(node, def, getVisibleVariablesForState(store.state), store.state.rootGraph.functions);
    // Don't wipe the fields while the user is actively editing one of them.
    if (elements.nodeFieldsContainer.contains(document.activeElement)) return;

    elements.nodeFieldsContainer.innerHTML = "";
    for (const prop of properties) {
      const row = document.createElement("div");
      row.className = "variable-row";

      const label = document.createElement("span");
      label.className = "variable-name";
      label.textContent = prop.label;

      const value = createTypedValueInput(prop.type, node.pins[prop.id]?.value, (newValue) => {
        setPinLiteralValue(getEditingGraph(store.state), node.id, prop.id, newValue);
        store.notify();
      });

      row.append(label, value);
      elements.nodeFieldsContainer.appendChild(row);
    }
  }

  function renderCommentColor(box: CommentBox): void {
    if (elements.commentFieldsContainer.contains(document.activeElement)) return;

    elements.commentFieldsContainer.innerHTML = "";
    const row = document.createElement("div");
    row.className = "variable-row";

    const label = document.createElement("span");
    label.className = "variable-name";
    label.textContent = "Color";

    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.className = "comment-color-swatch";
    colorInput.value = box.color ?? DEFAULT_COMMENT_COLOR;
    colorInput.addEventListener("input", () => {
      box.color = colorInput.value;
      store.notify();
    });

    row.append(label, colorInput);
    elements.commentFieldsContainer.appendChild(row);
  }

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

    // A canvas node's own properties only take over when nothing in the sidebar is selected —
    // pointerHandlers.ts clears sidebarSelection on every fresh node click precisely so this falls
    // through correctly the instant the user selects a node.
    let selectedNode: NodeInstance | undefined;
    let nodeProperties: PinDef[] | undefined;
    if (!variable && !validFunction && store.state.selectedNodeIds.size === 1) {
      const graph = getEditingGraph(store.state);
      const [onlyId] = store.state.selectedNodeIds;
      const node = graph.nodes.find((n) => n.id === onlyId);
      const properties = node ? getNodeDef(node.type).detailProperties : undefined;
      if (node && properties && properties.length > 0) {
        selectedNode = node;
        nodeProperties = properties;
      }
    }

    // Same fallthrough rule as selectedNode above — a comment box only takes over once nothing
    // else claims the panel. selectedNodeIds/selectedCommentId are already mutually exclusive (see
    // pointerHandlers.ts), so this mainly guards against a stale sidebarSelection.
    let selectedComment: CommentBox | undefined;
    if (!variable && !validFunction && !selectedNode && store.state.selectedCommentId) {
      selectedComment = getEditingGraph(store.state).commentBoxes.find((b) => b.id === store.state.selectedCommentId);
    }

    elements.section.style.display = variable || validFunction || selectedNode || selectedComment ? "" : "none";
    elements.variableContent.style.display = variable ? "" : "none";
    elements.functionContent.style.display = validFunction ? "" : "none";
    elements.nodeContent.style.display = selectedNode ? "" : "none";
    elements.commentContent.style.display = selectedComment ? "" : "none";

    if (selectedNode && nodeProperties) renderNodeProperties(selectedNode, nodeProperties);
    if (selectedComment) renderCommentColor(selectedComment);

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
