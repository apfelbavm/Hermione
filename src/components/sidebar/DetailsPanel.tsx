"use client";

import { allGraphs, setPinLiteralValue, updateVariable } from "../../engine/graphMutations";
import type { NodeInstance } from "../../engine/nodeInstance";
import { getNodeDef } from "../../engine/registry";
import type { CommentBox, FunctionDef, PinDef, Variable } from "../../engine/types";
import { createContainerSelect, createTypeSelect, createTypedValueInput } from "../../overlay/typedValueInput";
import { DEFAULT_COMMENT_COLOR } from "../../render/commentGeometry";
import { getEditingGraph, getVisibleVariablesForState, type Store } from "../../state/store";
import { useStoreRevision } from "../../state/useStore";
import { FunctionIoPanel } from "./FunctionIoPanel";
import { ImperativeMount } from "./ImperativeMount";
import { ScriptIoPanel } from "./ScriptIoPanel";

function VariableDetails({ store, variable }: { store: Store; variable: Variable }) {
  return (
    <div className="details-content">
      <div className="details-item-name">{variable.name}</div>
      <div id="variable-details-fields">
        <div className="variable-row">
          <ImperativeMount
            build={() =>
              createTypeSelect(variable.type, (type) => {
                updateVariable(store.state.rootGraph, variable.id, { type });
                store.notify();
              })
            }
            deps={[variable.id, variable.type]}
          />
          <ImperativeMount
            build={() =>
              createContainerSelect(variable.container ?? "single", (container) => {
                updateVariable(store.state.rootGraph, variable.id, { container });
                store.notify();
              })
            }
            deps={[variable.id, variable.container]}
          />
          {variable.container === "map" && (
            <ImperativeMount
              build={() =>
                createTypeSelect(variable.keyType ?? "string", (keyType) => {
                  updateVariable(store.state.rootGraph, variable.id, { keyType });
                  store.notify();
                })
              }
              deps={[variable.id, variable.keyType]}
            />
          )}
        </div>
        {/* A container's default-value editor is a whole vertical list, not a single inline input —
            its own row underneath the type/container selectors. */}
        <div className="variable-row">
          <ImperativeMount
            build={() =>
              createTypedValueInput(
                variable.type,
                variable.defaultValue,
                (defaultValue) => {
                  updateVariable(store.state.rootGraph, variable.id, { defaultValue });
                  store.notify();
                },
                variable.container ?? "single",
                variable.keyType ?? "string",
              )
            }
            deps={[variable.id, variable.type, variable.container, variable.keyType, variable.defaultValue]}
          />
        </div>
      </div>
    </div>
  );
}

function NodeDetails({ store, node, properties }: { store: Store; node: NodeInstance; properties: PinDef[] }) {
  const def = getNodeDef(node.type);
  const label = node.resolveNodeLabel(def, getVisibleVariablesForState(store.state), store.state.rootGraph.functions);

  return (
    <div className="details-content">
      <div className="details-item-name">{label}</div>
      <div>
        <div className="details-description-row">
          <span className="variable-name">Description</span>
          <textarea
            key={node.id}
            className="details-description-input"
            placeholder="Shown as a speech bubble above this node on the canvas"
            defaultValue={node.description ?? ""}
            onInput={(e) => {
              node.description = e.currentTarget.value;
              store.notify();
            }}
          />
        </div>

        {def.configurableElementType && (
          <div className="variable-row">
            <span className="variable-name">Element Type</span>
            <ImperativeMount
              build={() =>
                createTypeSelect(node.elementType ?? "number", (elementType) => {
                  getEditingGraph(store.state).changeNodeElementType(getVisibleVariablesForState(store.state), store.state.rootGraph.functions, node.id, {
                    elementType,
                  });
                  store.notify();
                })
              }
              deps={[node.id, node.elementType]}
            />
          </div>
        )}

        {def.configurableElementType?.includeKeyType && (
          <div className="variable-row">
            <span className="variable-name">Key Type</span>
            <ImperativeMount
              build={() =>
                createTypeSelect(node.mapKeyType ?? "string", (mapKeyType) => {
                  getEditingGraph(store.state).changeNodeElementType(getVisibleVariablesForState(store.state), store.state.rootGraph.functions, node.id, {
                    mapKeyType,
                  });
                  store.notify();
                })
              }
              deps={[node.id, node.mapKeyType]}
            />
          </div>
        )}

        {properties.map((prop) => (
          <div className="variable-row" key={prop.id}>
            <span className="variable-name">{prop.label}</span>
            <ImperativeMount
              build={() =>
                createTypedValueInput(prop.type, node.pins[prop.id]?.value, (newValue) => {
                  setPinLiteralValue(getEditingGraph(store.state), node.id, prop.id, newValue);
                  store.notify();
                })
              }
              deps={[node.id, prop.id, node.pins[prop.id]?.value]}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function CommentDetails({ store, comment }: { store: Store; comment: CommentBox }) {
  return (
    <div className="details-content">
      <div className="details-item-name">Comment</div>
      <div>
        <div className="variable-row">
          <span className="variable-name">Color</span>
          <input
            key={comment.id}
            type="color"
            className="comment-color-swatch"
            defaultValue={comment.color ?? DEFAULT_COMMENT_COLOR}
            onInput={(e) => {
              comment.color = e.currentTarget.value;
              store.notify();
            }}
          />
        </div>
      </div>
    </div>
  );
}

function FunctionDescription({ store, fn }: { store: Store; fn: FunctionDef }) {
  return (
    <div className="details-description-row">
      <span className="variable-name">Description</span>
      <textarea
        key={fn.id}
        className="details-description-input"
        placeholder="Shown as a tooltip when hovering this function"
        defaultValue={fn.description ?? ""}
        onInput={(e) => {
          fn.description = e.currentTarget.value;
          store.notify();
        }}
      />
    </div>
  );
}

/** The Unreal-style "Details" section pinned to the bottom of the sidebar: shows whichever
 * Functions/Variables row was last clicked (see state/store.ts's sidebarSelection) — a variable's
 * type/value fields, or a function's/script's Inputs/Outputs (via FunctionIoPanel/ScriptIoPanel) —
 * or, if neither is set, a selected canvas node's own detailProperties (see NodeDef.detailProperties
 * and interaction/pointerHandlers.ts, which clears sidebarSelection on every fresh node selection so
 * this always reflects whichever was clicked last), or a selected comment box's color. Hidden
 * entirely when nothing is selected. Each sub-view keys its uncontrolled inputs by the selected
 * entity's id, so switching WHAT's selected remounts them (fresh field) while an unrelated
 * store.notify() while the same thing stays selected does not (no "don't wipe mid-edit" guard
 * needed, unlike the old imperative version this replaces — React just doesn't touch an uncontrolled
 * input's value after its first mount). */
export function DetailsPanel({ store }: { store: Store }) {
  useStoreRevision(store);
  const selection = store.state.sidebarSelection;

  const fn = selection?.kind === "function" ? store.state.rootGraph.functions.find((f) => f.id === selection.functionId) : undefined;
  const script = selection?.kind === "script" ? store.state.rootGraph.scripts.find((s) => s.id === selection.scriptId) : undefined;
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
  if (!variable && !fn && !script && store.state.selectedNodeIds.size === 1) {
    const graph = getEditingGraph(store.state);
    const [onlyId] = store.state.selectedNodeIds;
    const node = graph.nodes.find((n) => n.id === onlyId);
    const def = node ? getNodeDef(node.type) : undefined;
    if (node && def) {
      selectedNode = node;
      nodeProperties = def.detailProperties ?? [];
    }
  }

  // Same fallthrough rule as selectedNode above — only shown for a single selected comment box (a
  // multi-comment selection shows nothing here rather than arbitrarily picking one of them).
  let selectedComment: CommentBox | undefined;
  if (!variable && !fn && !script && !selectedNode && store.state.selectedCommentIds.size === 1) {
    const [onlyCommentId] = store.state.selectedCommentIds;
    selectedComment = getEditingGraph(store.state).commentBoxes.find((b) => b.id === onlyCommentId);
  }

  if (!variable && !fn && !script && !selectedNode && !selectedComment) return null;

  return (
    <div id="details-section">
      <div className="details-header">Details</div>
      {variable && <VariableDetails store={store} variable={variable} />}
      {selectedNode && <NodeDetails store={store} node={selectedNode} properties={nodeProperties ?? []} />}
      {selectedComment && <CommentDetails store={store} comment={selectedComment} />}
      {fn && (
        <div className="details-content">
          <FunctionDescription store={store} fn={fn} />
          <FunctionIoPanel store={store} kind="input" getActiveFunction={() => fn} />
          <FunctionIoPanel store={store} kind="output" getActiveFunction={() => fn} />
        </div>
      )}
      {script && (
        <div className="details-content">
          <ScriptIoPanel store={store} kind="input" getSelectedScript={() => script} />
          <ScriptIoPanel store={store} kind="output" getSelectedScript={() => script} />
        </div>
      )}
    </div>
  );
}
