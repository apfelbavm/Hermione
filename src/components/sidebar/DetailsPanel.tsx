"use client";

import { useEffect, useState } from "react";
import { allGraphs, setPinLiteralValue, updateVariable } from "../../graph/engine/graphMutations";
import { i18n } from "@i18n";
import type { NodeInstance } from "../../graph/engine/nodeInstance";
import { getNodeDef } from "../../graph/engine/registry";
import type { CommentBox, FunctionDef, PinDef, Variable } from "../../graph/engine/types";
import { setLastVariableType } from "../../client/lastVariableType";
import { listDeployedScripts, listProjects } from "../../client/api";
import type { ProjectSummary } from "../../server/models";
import { createContainerSelect, createEntityPicker, createStructTypeSelect, createTypeSelect, createTypedValueInput } from "../../graph/overlay/typedValueInput";
import { DEFAULT_COMMENT_COLOR } from "../../graph/render/commentGeometry";
import { getEditingGraph, getVisibleVariablesForState, type Store } from "../../state/store";
import { useStoreRevision } from "../../state/useStore";
import { FunctionIoPanel } from "./FunctionIoPanel";
import { ImperativeMount } from "./ImperativeMount";
import { NodeOutputsPanel } from "./NodeOutputsPanel";
import { ScriptIoPanel } from "./ScriptIoPanel";

/** Only rendered for a "flow.executeFlow" node (see NodeDef.editableOutputs/nodes/flow.ts) — the
 * searchable Project/Flow dropdowns requirement #2/#3 asked for. Stores the picked PROJECT/FLOW
 * ID on the node (NodeInstance.targetProjectId/targetFlowId), the same id-not-name convention every
 * other cross-entity reference in this codebase already uses (Variable.id, FunctionDef.id, etc.),
 * while the dropdown itself shows names — fetched fresh from the server each time it's opened (see
 * createEntityPicker), never cached stale in component state, since a Flow can be renamed elsewhere
 * at any time. Only "Deployed" scripts are offered for Flow (see requirement #4: only an already-
 * compiled Flow can actually be triggered), never every Flow in the project. */
function ExecuteFlowFields({ store, node }: { store: Store; node: NodeInstance }) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const disabled = store.state.simulating || store.state.readOnly;

  useEffect(() => {
    void listProjects().then(setProjects);
  }, []);

  const projectName = projects.find((p) => p.id === node.targetProjectId)?.name ?? "";

  return (
    <>
      <div className="variable-row">
        <span className="variable-name">{i18n.components.details_panel.target_project}</span>
        <ImperativeMount
          build={() =>
            createEntityPicker(
              node.targetProjectId,
              projectName,
              () => projects.map((p) => ({ id: p.id, label: p.name })),
              i18n.components.details_panel.no_project_selected,
              (id) => {
                node.targetProjectId = id;
                node.targetFlowId = undefined; // a Flow id only ever means something within its own Project
                store.notify();
              },
            )
          }
          deps={[node.id, node.targetProjectId, projects]}
          disabled={disabled}
        />
      </div>
      {node.targetProjectId && <FlowField store={store} node={node} projectId={node.targetProjectId} />}
    </>
  );
}

function FlowField({ store, node, projectId }: { store: Store; node: NodeInstance; projectId: string }) {
  const [flows, setFlows] = useState<{ id: string; label: string }[]>([]);
  const disabled = store.state.simulating || store.state.readOnly;

  useEffect(() => {
    void listDeployedScripts(projectId).then((scripts) => setFlows(scripts.map((s) => ({ id: s.flowId, label: s.flowName }))));
  }, [projectId]);

  const flowName = flows.find((f) => f.id === node.targetFlowId)?.label ?? "";

  return (
    <div className="variable-row">
      <span className="variable-name">{i18n.components.details_panel.target_flow}</span>
      <ImperativeMount
        build={() =>
          createEntityPicker(
            node.targetFlowId,
            flowName,
            () => flows,
            i18n.components.details_panel.no_flow_selected,
            (id) => {
              node.targetFlowId = id;
              store.notify();
            },
          )
        }
        deps={[node.id, node.targetFlowId, flows]}
        disabled={disabled}
      />
    </div>
  );
}

function VariableDetails({ store, variable }: { store: Store; variable: Variable }) {
  const disabled = store.state.simulating || store.state.readOnly;
  return (
    <div className="details-content">
      <div className="details-item-name">{variable.name}</div>
      <div id="variable-details-fields">
        <div className="variable-row">
          <ImperativeMount
            build={() =>
              createTypeSelect(
                variable.type,
                (type, subType) => {
                  updateVariable(store.state.rootGraph, variable.id, {
                    type,
                    subType,
                  });
                  setLastVariableType(type, subType);
                  store.notify();
                },
                variable.subType,
                true,
              )
            }
            deps={[variable.id, variable.type, variable.subType]}
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
                variable.subType,
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

        {def.configurableSubType?.kind === "struct" && (
          <div className="variable-row">
            <span className="variable-name">{i18n.components.details_panel.struct_type}</span>
            <ImperativeMount
              build={() =>
                createStructTypeSelect(node.subType ?? "", (subType) => {
                  getEditingGraph(store.state).changeNodeSubType(getVisibleVariablesForState(store.state), store.state.rootGraph.functions, node.id, subType);
                  store.notify();
                })
              }
              deps={[node.id, node.subType]}
              disabled={disabled}
            />
          </div>
        )}

        {node.type === "flow.executeFlow" && <ExecuteFlowFields store={store} node={node} />}

        {properties.map((prop) => (
          <div className="variable-row" key={prop.id}>
            <span className="variable-name">{prop.label}</span>
            <ImperativeMount
              build={() =>
                createTypedValueInput(
                  prop.type,
                  node.pins[prop.id]?.value,
                  (newValue) => {
                    setPinLiteralValue(getEditingGraph(store.state), node.id, prop.id, newValue);
                    store.notify();
                  },
                  "single",
                  "string",
                  prop.subType,
                )
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
      {selectedNode && getNodeDef(selectedNode.type).editableOutputs && <NodeOutputsPanel store={store} getSelectedNode={() => selectedNode!} />}
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
