"use client";

import { useState } from "react";
import { i18n } from "@i18n";
import { Colors } from "@hermione/graph/engine/color";
import type { Graph } from "@hermione/graph/engine/graph";
import { addVariable, defaultValueFor, moveVariable, nextId, removeVariable, updateVariable } from "@hermione/graph/engine/graphMutations";
import type { PinContainer, Variable } from "@hermione/graph/engine/types";
import { getLastVariableType } from "../../client/lastVariableType";
import { VARIABLE_DRAG_MIME } from "@hermione/graph/overlay/dragTypes";
import { openRowContextMenu } from "@hermione/graph/overlay/rowContextMenu";
import { nextAvailableName } from "@hermione/graph/overlay/uniqueName";
import type { Store } from "@hermione/graph/state/store";
import { useStoreRevision } from "@hermione/graph/state/useStore";
import { CollapsibleSection } from "./CollapsibleSection";
import { EditableNameInput, EditableNameLabel } from "./EditableName";
import { useRowDragReorder } from "./useRowDragReorder";

function ContainerIcon({ container, color, title }: { container: PinContainer; color: string; title: string }) {
  if (container === "single") return null;
  if (container === "set") {
    return (
      <span className="container-icon-braces" style={{ color }} title={title}>
        {"{}"}
      </span>
    );
  }
  const cellCount = container === "map" ? 8 : 9;
  return (
    <span className="container-icon" style={{ color }} title={title}>
      {Array.from({ length: cellCount }, (_, i) => (
        <span key={i} className={"container-icon-cell" + (container === "map" && i === 3 ? " container-icon-cell-wide" : "")} />
      ))}
    </span>
  );
}

export function VariablePanel({ id, title, store, getGraph }: { id?: string; title: string; store: Store; getGraph: () => Graph }) {
  useStoreRevision(store);
  const [editingId, setEditingId] = useState<string | null>(null);
  const graph = getGraph();
  // Selecting a variable (click, for the Details panel) stays available in read-only mode — only
  // renaming/adding/removing/reordering (mutations) are blocked by it.
  const viewDisabled = store.state.simulating;
  const disabled = store.state.simulating || store.state.readOnly;

  function commitRename(variable: Variable, rawNewName: string): void {
    const trimmed = rawNewName.trim();
    const isDuplicate = trimmed.length === 0 || getGraph().variables.some((v) => v.id !== variable.id && v.name === trimmed);
    if (!isDuplicate) {
      updateVariable(store.state.rootGraph, variable.id, { name: trimmed });
    }
    setEditingId(null);
    store.notify();
  }

  const { rowDragHandlers, rowIndicatorClassName } = useRowDragReorder<string>(VARIABLE_DRAG_MIME, (draggedId, targetId, position) => {
    moveVariable(getGraph(), draggedId, targetId, position);
    store.notify();
  });

  function handleAdd(): void {
    const name = nextAvailableName(
      graph.variables.map((v) => v.name),
      "NewVariable",
    );
    const { type, subType, container, keyType } = getLastVariableType();
    const variable: Variable = {
      id: nextId("var"),
      name,
      type,
      subType,
      container,
      keyType,
      defaultValue: defaultValueFor(type, container, subType),
    };
    addVariable(graph, variable);
    setEditingId(variable.id);
    store.notify();
  }

  return (
    <CollapsibleSection id={id} title={title} empty={graph.variables.length === 0} onAdd={handleAdd} disabled={disabled}>
      {graph.variables.map((variable) => {
        const isEditing = editingId === variable.id;
        const isSelected = store.state.sidebarSelection?.kind === "variable" && store.state.sidebarSelection.variableId === variable.id;

        return (
          <div
            key={variable.id}
            className={"variable-row" + (isSelected ? " variable-row-selected" : "") + rowIndicatorClassName(variable.id)}
            draggable={!isEditing && !disabled}
            onDragStart={(e) => {
              e.dataTransfer.setData(VARIABLE_DRAG_MIME, variable.id);
              e.dataTransfer.effectAllowed = "copyMove";
            }}
            {...rowDragHandlers(variable.id)}
          >
            {variable.container && variable.container !== "single" ? (
              <ContainerIcon container={variable.container} color={Colors.PIN_COLORS[variable.type]} title={`${variable.container} of ${variable.type}`} />
            ) : (
              <span className="variable-type-dot" style={{ backgroundColor: Colors.PIN_COLORS[variable.type] }} title={variable.type} />
            )}
            {isEditing ? (
              <EditableNameInput
                name={variable.name}
                onCommit={(newName) => commitRename(variable, newName)}
                onCancel={() => {
                  setEditingId(null);
                  store.notify();
                }}
              />
            ) : (
              <EditableNameLabel
                name={variable.name}
                title={variable.name}
                disabled={viewDisabled}
                onContextMenu={(screenPos) => {
                  if (disabled) return; // renaming is the only action here — nothing to offer
                  openRowContextMenu(screenPos, [
                    {
                      label: i18n.components.context_menu.rename,
                      onClick: () => setEditingId(variable.id),
                    },
                  ]);
                }}
                onClick={() => {
                  store.state.sidebarSelection = {
                    kind: "variable",
                    variableId: variable.id,
                  };
                  store.notify();
                }}
              />
            )}
            <button
              type="button"
              className="btn btn-gray btn-sm"
              disabled={disabled}
              onClick={() => {
                removeVariable(graph, store.state.rootGraph.getVisibleVariables(graph), store.state.rootGraph.functions, variable.id);
                if (store.state.sidebarSelection?.kind === "variable" && store.state.sidebarSelection.variableId === variable.id) {
                  store.state.sidebarSelection = null;
                }
                store.notify();
              }}
            >
              ✕
            </button>
          </div>
        );
      })}
    </CollapsibleSection>
  );
}
