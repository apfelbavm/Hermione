import {
  allGraphs,
  setPinLiteralValue,
  updateVariable,
} from "../engine/graphMutations";
import { NodeInstance } from "../engine/nodeInstance";
import { getNodeDef } from "../engine/registry";
import type { CommentBox, FunctionDef, PinDef } from "../engine/types";
import { DEFAULT_COMMENT_COLOR } from "../render/commentGeometry";
import {
  getEditingGraph,
  getVisibleVariablesForState,
  type Store,
} from "../state/store";
import {
  createContainerSelect,
  createTypeSelect,
  createTypedValueInput,
} from "./typedValueInput";

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
  /** Function sub-view: an editable description field (see renderFunctionDescription) above the
   * Inputs/Outputs content, which lives in the pre-existing functionIoPanel instances, relocated
   * into this wrapper in index.html — they already self-hide when their own accessor resolves to
   * null, so there's nothing else to render for those here. */
  functionContent: HTMLElement;
  functionFieldsContainer: HTMLElement;
  /** Script sub-view: same "just a visibility toggle" idea as functionContent — the actual Inputs
   * content lives in the pre-existing scriptIoPanel instance, relocated here in index.html. */
  scriptContent: HTMLElement;
}

/** The Unreal-style "Details" section pinned to the bottom of the sidebar: shows whichever
 * Functions/Variables row was last clicked (see state/store.ts's sidebarSelection) — a variable's
 * type/value fields, or a function's Inputs/Outputs (rendered by the existing io panels elsewhere,
 * this just owns the shared show/hide and the variable fields) — or, if neither is set, a selected
 * canvas node's own detailProperties (see NodeDef.detailProperties and pointerHandlers.ts, which
 * clears sidebarSelection whenever a fresh node selection is made so this always reflects whichever
 * was clicked last). */
export function createDetailsPanel(
  elements: DetailsPanelElements,
  store: Store,
): { render: () => void } {
  function renderNodeProperties(
    node: NodeInstance,
    properties: PinDef[],
  ): void {
    const def = getNodeDef(node.type);
    elements.nodeNameLabel.textContent = node.resolveNodeLabel(
      def,
      getVisibleVariablesForState(store.state),
      store.state.rootGraph.functions,
    );
    // Don't wipe the fields while the user is actively editing one of them.
    if (elements.nodeFieldsContainer.contains(document.activeElement)) return;

    elements.nodeFieldsContainer.innerHTML = "";

    const descRow = document.createElement("div");
    descRow.className = "details-description-row";
    const descLabel = document.createElement("span");
    descLabel.className = "variable-name";
    descLabel.textContent = "Description";
    const descTextarea = document.createElement("textarea");
    descTextarea.className = "details-description-input";
    descTextarea.placeholder = "Shown as a speech bubble above this node on the canvas";
    descTextarea.value = node.description ?? "";
    descTextarea.addEventListener("input", () => {
      node.description = descTextarea.value;
      store.notify();
    });
    descRow.append(descLabel, descTextarea);
    elements.nodeFieldsContainer.appendChild(descRow);

    if (def.configurableElementType) {
      const elementRow = document.createElement("div");
      elementRow.className = "variable-row";
      const elementLabel = document.createElement("span");
      elementLabel.className = "variable-name";
      elementLabel.textContent = "Element Type";
      const elementSelect = createTypeSelect(
        node.elementType ?? "number",
        (elementType) => {
          getEditingGraph(store.state).changeNodeElementType(
            getVisibleVariablesForState(store.state),
            store.state.rootGraph.functions,
            node.id,
            {
              elementType,
            },
          );
          store.notify();
        },
      );
      elementRow.append(elementLabel, elementSelect);
      elements.nodeFieldsContainer.appendChild(elementRow);

      if (def.configurableElementType.includeKeyType) {
        const keyRow = document.createElement("div");
        keyRow.className = "variable-row";
        const keyLabel = document.createElement("span");
        keyLabel.className = "variable-name";
        keyLabel.textContent = "Key Type";
        const keySelect = createTypeSelect(
          node.mapKeyType ?? "string",
          (mapKeyType) => {
            getEditingGraph(store.state).changeNodeElementType(
              getVisibleVariablesForState(store.state),
              store.state.rootGraph.functions,
              node.id,
              {
                mapKeyType,
              },
            );
            store.notify();
          },
        );
        keyRow.append(keyLabel, keySelect);
        elements.nodeFieldsContainer.appendChild(keyRow);
      }
    }

    for (const prop of properties) {
      const row = document.createElement("div");
      row.className = "variable-row";

      const label = document.createElement("span");
      label.className = "variable-name";
      label.textContent = prop.label;

      const value = createTypedValueInput(
        prop.type,
        node.pins[prop.id]?.value,
        (newValue) => {
          setPinLiteralValue(
            getEditingGraph(store.state),
            node.id,
            prop.id,
            newValue,
          );
          store.notify();
        },
      );

      row.append(label, value);
      elements.nodeFieldsContainer.appendChild(row);
    }
  }

  function renderCommentColor(box: CommentBox): void {
    if (elements.commentFieldsContainer.contains(document.activeElement))
      return;

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

  function renderFunctionDescription(fn: FunctionDef): void {
    // Don't wipe the field while the user is actively typing in it.
    if (elements.functionFieldsContainer.contains(document.activeElement))
      return;

    elements.functionFieldsContainer.innerHTML = "";
    const row = document.createElement("div");
    row.className = "details-description-row";

    const label = document.createElement("span");
    label.className = "variable-name";
    label.textContent = "Description";

    const textarea = document.createElement("textarea");
    textarea.className = "details-description-input";
    textarea.placeholder = "Shown as a tooltip when hovering this function";
    textarea.value = fn.description ?? "";
    textarea.addEventListener("input", () => {
      fn.description = textarea.value;
      store.notify();
    });

    row.append(label, textarea);
    elements.functionFieldsContainer.appendChild(row);
  }

  function render(): void {
    const selection = store.state.sidebarSelection;

    const fn =
      selection?.kind === "function"
        ? store.state.rootGraph.functions.find(
            (f) => f.id === selection.functionId,
          )
        : undefined;
    const validFunction = !!fn;
    const validScript =
      selection?.kind === "script" &&
      store.state.rootGraph.scripts.some((s) => s.id === selection.scriptId);
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
    if (
      !variable &&
      !validFunction &&
      !validScript &&
      store.state.selectedNodeIds.size === 1
    ) {
      const graph = getEditingGraph(store.state);
      const [onlyId] = store.state.selectedNodeIds;
      const node = graph.nodes.find((n) => n.id === onlyId);
      const def = node ? getNodeDef(node.type) : undefined;
      // Every node gets the panel now — at minimum for its own instance Description field (see
      // renderNodeProperties) — regardless of whether its type has any detailProperties/
      // configurableElementType of its own to show alongside it.
      if (node && def) {
        selectedNode = node;
        nodeProperties = def.detailProperties ?? [];
      }
    }

    // Same fallthrough rule as selectedNode above — a comment box only takes over once nothing
    // else claims the panel. Only shown for a single selected comment box, same reasoning as
    // selectedNode above requiring selectedNodeIds.size === 1 — there's only one set of color
    // fields to show, so a multi-comment selection (see pointerHandlers.ts) shows nothing here
    // rather than arbitrarily picking one of them.
    let selectedComment: CommentBox | undefined;
    if (
      !variable &&
      !validFunction &&
      !validScript &&
      !selectedNode &&
      store.state.selectedCommentIds.size === 1
    ) {
      const [onlyCommentId] = store.state.selectedCommentIds;
      selectedComment = getEditingGraph(store.state).commentBoxes.find(
        (b) => b.id === onlyCommentId,
      );
    }

    elements.section.style.display =
      variable ||
      validFunction ||
      validScript ||
      selectedNode ||
      selectedComment
        ? ""
        : "none";
    elements.variableContent.style.display = variable ? "" : "none";
    elements.functionContent.style.display = validFunction ? "" : "none";
    elements.scriptContent.style.display = validScript ? "" : "none";
    elements.nodeContent.style.display = selectedNode ? "" : "none";
    elements.commentContent.style.display = selectedComment ? "" : "none";

    if (selectedNode && nodeProperties)
      renderNodeProperties(selectedNode, nodeProperties);
    if (selectedComment) renderCommentColor(selectedComment);
    if (fn) renderFunctionDescription(fn);

    if (!variable) return;

    elements.variableNameLabel.textContent = variable.name;
    // Don't wipe the type/value fields while the user is actively editing one of them.
    if (elements.variableFieldsContainer.contains(document.activeElement))
      return;

    elements.variableFieldsContainer.innerHTML = "";
    const row = document.createElement("div");
    row.className = "variable-row";

    const type = createTypeSelect(variable.type, (type) => {
      updateVariable(store.state.rootGraph, variable.id, { type });
      store.notify();
    });
    const container = createContainerSelect(
      variable.container ?? "single",
      (container) => {
        updateVariable(store.state.rootGraph, variable.id, { container });
        store.notify();
      },
    );
    row.append(type, container);

    if (variable.container === "map") {
      const keyType = createTypeSelect(
        variable.keyType ?? "string",
        (keyType) => {
          updateVariable(store.state.rootGraph, variable.id, { keyType });
          store.notify();
        },
      );
      row.append(keyType);
    }

    elements.variableFieldsContainer.appendChild(row);

    // A container's default-value editor is a whole vertical list, not a single inline input —
    // gets its own row underneath the type/container selectors instead of squeezing in beside them.
    const valueRow = document.createElement("div");
    valueRow.className = "variable-row";
    const value = createTypedValueInput(
      variable.type,
      variable.defaultValue,
      (defaultValue) => {
        updateVariable(store.state.rootGraph, variable.id, { defaultValue });
        store.notify();
      },
      variable.container ?? "single",
      variable.keyType ?? "string",
    );
    valueRow.append(value);
    elements.variableFieldsContainer.appendChild(valueRow);
  }

  return { render };
}
