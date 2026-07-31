"use client";

import { useState } from "react";
import { createFunctionDef, moveFunction, removeFunctionDef } from "../../engine/graphMutations";
import type { FunctionDef } from "../../engine/types";
import { FUNCTION_DRAG_MIME } from "../../overlay/dragTypes";
import { openRowContextMenu } from "../../overlay/rowContextMenu";
import { nextAvailableName } from "../../overlay/uniqueName";
import { closeFunctionTab, openFunctionTab, type Store } from "../../state/store";
import { useStoreRevision } from "../../state/useStore";
import { CollapsibleSection } from "./CollapsibleSection";
import { EditableNameInput, EditableNameLabel } from "./EditableName";
import { useRowDragReorder } from "./useRowDragReorder";

/** Lists every user-defined function: collapsible, "+" creates one with an unused default name and
 * immediately enters rename mode, right-click > Rename renames an existing one, click its name
 * opens its body in a tab. Rows are drag-and-drop sources — dropping one onto the canvas creates a
 * function.call node bound to it at the drop position (see AppShell.tsx's canvas drop handler). */
export function FunctionsPanel({ store }: { store: Store }) {
  useStoreRevision(store);
  const [editingId, setEditingId] = useState<string | null>(null);
  const functions = store.state.rootGraph.functions;
  const disabled = store.state.simulating;

  function commitRename(fn: FunctionDef, rawNewName: string): void {
    const trimmed = rawNewName.trim();
    const isDuplicate = trimmed.length === 0 || store.state.rootGraph.functions.some((f) => f.id !== fn.id && f.name === trimmed);
    if (!isDuplicate) fn.name = trimmed;
    setEditingId(null);
    store.notify();
  }

  const { rowDragHandlers, rowIndicatorClassName } = useRowDragReorder<string>(FUNCTION_DRAG_MIME, (draggedId, targetId, position) => {
    moveFunction(store.state.rootGraph, draggedId, targetId, position);
    store.notify();
  });

  function handleAdd(): void {
    const name = nextAvailableName(
      store.state.rootGraph.functions.map((f) => f.name),
      "NewFunction",
    );
    const fn = createFunctionDef(name);
    store.state.rootGraph.functions.push(fn);
    setEditingId(fn.id);
    store.notify();
  }

  return (
    <CollapsibleSection id="functions-section" title="Functions" empty={functions.length === 0} onAdd={handleAdd} disabled={disabled}>
      {functions.map((fn) => {
        const isEditing = editingId === fn.id;
        const isSelected = store.state.sidebarSelection?.kind === "function" && store.state.sidebarSelection.functionId === fn.id;

        return (
          <div
            key={fn.id}
            className={"variable-row" + (isSelected ? " function-row-active" : "") + rowIndicatorClassName(fn.id)}
            draggable={!isEditing && !disabled}
            onDragStart={(e) => {
              e.dataTransfer.setData(FUNCTION_DRAG_MIME, fn.id);
              e.dataTransfer.effectAllowed = "copyMove";
            }}
            {...rowDragHandlers(fn.id)}
          >
            {isEditing ? (
              <EditableNameInput
                name={fn.name}
                onCommit={(newName) => commitRename(fn, newName)}
                onCancel={() => {
                  setEditingId(null);
                  store.notify();
                }}
              />
            ) : (
              <EditableNameLabel
                name={fn.name}
                className="function-name"
                hoverTooltip={() => fn.description || "Click to open this function's graph in a tab"}
                disabled={disabled}
                onContextMenu={(screenPos) => {
                  openRowContextMenu(screenPos, [{ label: "Rename", onClick: () => setEditingId(fn.id) }]);
                }}
                onClick={() => {
                  openFunctionTab(store.state, fn.id);
                  store.state.sidebarSelection = { kind: "function", functionId: fn.id };
                  store.notify();
                }}
              />
            )}
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                closeFunctionTab(store.state, fn.id);
                removeFunctionDef(store.state.rootGraph, fn.id);
                if (store.state.sidebarSelection?.kind === "function" && store.state.sidebarSelection.functionId === fn.id) {
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
