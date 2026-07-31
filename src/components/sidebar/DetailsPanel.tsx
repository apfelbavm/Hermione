"use client";

import { allGraphs, setPinLiteralValue, updateVariable } from "../../engine/graphMutations";
import { i18n } from "@i18n";
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
  const disabled = store.state.simulating || store.state.readOnly;
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
            disabled={disabled}
          />
          <ImperativeMount
            build={() =>
              createContainerSelect(variable.container ?? "single", (container) => {
                updateVariable(store.state.rootGraph, variable.id, {
                  container,
                });
                store.notify();
              })
            }
            deps={[variable.id, variable.container]}
            disabled={disabled}
          />
          {variable.container === "map" && (
            <ImperativeMount
              build={() =>
                createTypeSelect(variable.keyType ?? "string", (keyType) => {
                  updateVariable(store.state.rootGraph, variable.id, {
                    keyType,
                  });
                  store.notify();
                })
              }
              deps={[variable.id, variable.keyType]}
              disabled={disabled}
            />
          )}
        </div>
        <div className="variable-row">
          <ImperativeMount
            build={() =>
              createTypedValueInput(
                variable.type,
                variable.defaultValue,
                (defaultValue) => {
                  updateVariable(store.state.rootGraph, variable.id, {
                    defaultValue,
                  });
                  store.notify();
                },
                variable.container ?? "single",
                variable.keyType ?? "string",
              )
            }
            deps={[variable.id, variable.type, variable.container, variable.keyType, variable.defaultValue]}
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
}

function NodeDetails({ store, node, properties }: { store: Store; node: NodeInstance; properties: PinDef[] }) {
  const def = getNodeDef(node.type);
  const label = node.resolveNodeLabel(def, getVisibleVariablesForState(store.state), store.state.rootGraph.functions);
  const disabled = store.state.simulating || store.state.readOnly;

  return (
    <div className="details-content">
      <div className="details-item-name">{label}</div>
      <div>
        <div className="details-description-row">
          <span className="variable-name">{i18n.components.details_panel.description}</span>
          <textarea
            key={node.id}
            className="details-description-input"
            placeholder={i18n.components.details_panel.node_description_placeholder}
            defaultValue={node.description ?? ""}
            disabled={disabled}
            onInput={(e) => {
              node.description = e.currentTarget.value;
              store.notify();
            }}
          />
        </div>

        {def.configurableElementType && (
          <div className="variable-row">
            <span className="variable-name">{i18n.components.details_panel.element_type}</span>
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
              disabled={disabled}
            />
          </div>
        )}

        {def.configurableElementType?.includeKeyType && (
          <div className="variable-row">
            <span className="variable-name">{i18n.components.details_panel.key_type}</span>
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
              disabled={disabled}
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
              disabled={disabled}
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
      <div className="details-item-name">{i18n.components.details_panel.comment}</div>
      <div>
        <div className="variable-row">
          <span className="variable-name">{i18n.components.details_panel.color}</span>
          <input
            key={comment.id}
            type="color"
            className="comment-color-swatch"
            defaultValue={comment.color ?? DEFAULT_COMMENT_COLOR}
            disabled={store.state.simulating || store.state.readOnly}
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
      <span className="variable-name">{i18n.components.details_panel.description}</span>
      <textarea
        key={fn.id}
        className="details-description-input"
        placeholder={i18n.components.details_panel.function_description_placeholder}
        defaultValue={fn.description ?? ""}
        disabled={store.state.simulating || store.state.readOnly}
        onInput={(e) => {
          fn.description = e.currentTarget.value;
          store.notify();
        }}
      />
    </div>
  );
}

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

  let selectedComment: CommentBox | undefined;
  if (!variable && !fn && !script && !selectedNode && store.state.selectedCommentIds.size === 1) {
    const [onlyCommentId] = store.state.selectedCommentIds;
    selectedComment = getEditingGraph(store.state).commentBoxes.find((b) => b.id === onlyCommentId);
  }

  if (!variable && !fn && !script && !selectedNode && !selectedComment) return null;

  return (
    <div id="details-section">
      <div className="details-header">{i18n.components.details_panel.header}</div>
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
