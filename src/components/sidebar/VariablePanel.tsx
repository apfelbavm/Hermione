"use client";

import { useState } from "react";
import { i18n } from "@i18n";
import { Colors } from "../../engine/color";
import type { Graph } from "../../engine/graph";
import {
  addVariable,
  DEFAULT_VALUE_BY_TYPE,
  moveVariable,
  nextId,
  removeVariable,
  updateVariable,
} from "../../engine/graphMutations";
import type { PinContainer, PinType, Variable } from "../../engine/types";
import { VARIABLE_DRAG_MIME } from "../../overlay/dragTypes";
import { openRowContextMenu } from "../../overlay/rowContextMenu";
import { nextAvailableName } from "../../overlay/uniqueName";
import type { Store } from "../../state/store";
import { useStoreRevision } from "../../state/useStore";
import { CollapsibleSection } from "./CollapsibleSection";
import { EditableNameInput, EditableNameLabel } from "./EditableName";
import { useRowDragReorder } from "./useRowDragReorder";

/** Small icon matching a pin's canvas shape (see render/drawNodes.ts's drawPinShape) — a 3x3 grid
 * of quads for Array, the same grid with its middle row's first two quads merged for Map, a "{ }"
 * brace pair for Set, or nothing for "single" (a plain value has no container to distinguish). */
function ContainerIcon({
  container,
  color,
  title,
}: {
  container: PinContainer;
  color: string;
  title: string;
}) {
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
        <span
          key={i}
          className={
            "container-icon-cell" +
            (container === "map" && i === 3 ? " container-icon-cell-wide" : "")
          }
        />
      ))}
    </span>
  );
}

/** A Variables-style side panel: collapsible, "+" creates a variable with an unused default name
 * and immediately enters rename mode, right-click > Rename renames an existing one. Clicking a
 * row's name selects it (highlighted here, and its type/value shown in the Details section — see
 * DetailsPanel). Rows are also drag-and-drop sources — dropping one onto the canvas pops up a
 * Get/Set choice at the drop point (see AppShell.tsx's canvas drop handler). Generalized over
 * `getGraph` so the same component drives both the always-visible global Variables panel (bound to
 * the root graph) and the Local Variables panel (bound to whichever function's body is open). */
export function VariablePanel({
  id,
  title,
  store,
  getGraph,
}: {
  id?: string;
  title: string;
  store: Store;
  getGraph: () => Graph;
}) {
  useStoreRevision(store);
  const [editingId, setEditingId] = useState<string | null>(null);
  const graph = getGraph();
  const disabled = store.state.simulating;

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
    setEditingId(null);
    store.notify();
  }

  const { rowDragHandlers, rowIndicatorClassName } = useRowDragReorder<string>(
    VARIABLE_DRAG_MIME,
    (draggedId, targetId, position) => {
      moveVariable(getGraph(), draggedId, targetId, position);
      store.notify();
    },
  );

  function handleAdd(): void {
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
    setEditingId(variable.id);
    store.notify();
  }

  return (
    <CollapsibleSection
      id={id}
      title={title}
      empty={graph.variables.length === 0}
      onAdd={handleAdd}
      disabled={disabled}
    >
      {graph.variables.map((variable) => {
        const isEditing = editingId === variable.id;
        const isSelected =
          store.state.sidebarSelection?.kind === "variable" &&
          store.state.sidebarSelection.variableId === variable.id;

        return (
          <div
            key={variable.id}
            className={
              "variable-row" +
              (isSelected ? " variable-row-selected" : "") +
              rowIndicatorClassName(variable.id)
            }
            draggable={!isEditing && !disabled}
            onDragStart={(e) => {
              e.dataTransfer.setData(VARIABLE_DRAG_MIME, variable.id);
              // "copyMove" (not just "copy") — this one drag gesture serves two drop targets:
              // dropping on the canvas spawns a Get/Set node (copy), dropping on another row here
              // reorders in place (move). A dropEffect effectAllowed doesn't include gets silently
              // refused by real browsers.
              e.dataTransfer.effectAllowed = "copyMove";
            }}
            {...rowDragHandlers(variable.id)}
          >
            {variable.container && variable.container !== "single" ? (
              <ContainerIcon
                container={variable.container}
                color={Colors.PIN_COLORS[variable.type]}
                title={`${variable.container} of ${variable.type}`}
              />
            ) : (
              <span
                className="variable-type-dot"
                style={{ backgroundColor: Colors.PIN_COLORS[variable.type] }}
                title={variable.type}
              />
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
                disabled={disabled}
                onContextMenu={(screenPos) => {
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
              disabled={disabled}
              onClick={() => {
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
