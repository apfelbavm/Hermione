"use client";

import { useState } from "react";
import { i18n } from "@i18n";
import { createTemplatedCodeScriptDef, moveScript, removeCodeScriptDef } from "../../engine/graphMutations";
import type { CodeScriptDef } from "../../engine/types";
import { SCRIPT_DRAG_MIME } from "../../overlay/dragTypes";
import { openRowContextMenu } from "../../overlay/rowContextMenu";
import { nextAvailableName } from "../../overlay/uniqueName";
import { closeScriptTab, openScriptTab, type Store } from "../../state/store";
import { useStoreRevision } from "../../state/useStore";
import { CollapsibleSection } from "./CollapsibleSection";
import { EditableNameInput, EditableNameLabel } from "./EditableName";
import { useRowDragReorder } from "./useRowDragReorder";

export function ScriptsPanel({ store }: { store: Store }) {
  useStoreRevision(store);
  const [editingId, setEditingId] = useState<string | null>(null);
  const scripts = store.state.rootGraph.scripts;
  // Opening a script (click / "Edit script") stays available in read-only mode for inspection —
  // only renaming/adding/removing/reordering (mutations) are blocked by it.
  const viewDisabled = store.state.simulating;
  const disabled = store.state.simulating || store.state.readOnly;

  function commitRename(script: CodeScriptDef, rawNewName: string): void {
    const trimmed = rawNewName.trim();
    const isDuplicate = trimmed.length === 0 || store.state.rootGraph.scripts.some((s) => s.id !== script.id && s.name === trimmed);
    if (!isDuplicate) script.name = trimmed;
    setEditingId(null);
    store.notify();
  }

  const { rowDragHandlers, rowIndicatorClassName } = useRowDragReorder<string>(SCRIPT_DRAG_MIME, (draggedId, targetId, position) => {
    moveScript(store.state.rootGraph, draggedId, targetId, position);
    store.notify();
  });

  function handleAdd(): void {
    const name = nextAvailableName(
      store.state.rootGraph.scripts.map((s) => s.name),
      "NewScript",
    );
    const script = createTemplatedCodeScriptDef(name);
    store.state.rootGraph.scripts.push(script);
    setEditingId(script.id);
    store.notify();
  }

  return (
    <CollapsibleSection id="scripts-section" title="Scripts" empty={scripts.length === 0} onAdd={handleAdd} disabled={disabled}>
      {scripts.map((script) => {
        const isEditing = editingId === script.id;
        const isSelected = store.state.sidebarSelection?.kind === "script" && store.state.sidebarSelection.scriptId === script.id;

        function editScript(): void {
          if (viewDisabled) return;
          openScriptTab(store.state, script.id);
          store.state.sidebarSelection = {
            kind: "script",
            scriptId: script.id,
          };
          store.notify();
        }

        return (
          <div
            key={script.id}
            className={"variable-row" + (isSelected ? " function-row-active" : "") + rowIndicatorClassName(script.id)}
            draggable={!isEditing && !disabled}
            onDragStart={(e) => {
              e.dataTransfer.setData(SCRIPT_DRAG_MIME, script.id);
              e.dataTransfer.effectAllowed = "copyMove";
            }}
            {...rowDragHandlers(script.id)}
          >
            {isEditing ? (
              <EditableNameInput
                name={script.name}
                onCommit={(newName) => commitRename(script, newName)}
                onCancel={() => {
                  setEditingId(null);
                  store.notify();
                }}
              />
            ) : (
              <EditableNameLabel
                name={script.name}
                className="function-name"
                title="Click to open this script in the lower panel"
                disabled={viewDisabled}
                onContextMenu={(screenPos) => {
                  openRowContextMenu(screenPos, [
                    {
                      label: i18n.components.context_menu.edit_script,
                      onClick: editScript,
                    },
                    ...(disabled
                      ? []
                      : [
                          {
                            label: i18n.components.context_menu.rename,
                            onClick: () => setEditingId(script.id),
                          },
                        ]),
                  ]);
                }}
                onClick={editScript}
              />
            )}
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                closeScriptTab(store.state, script.id);
                removeCodeScriptDef(store.state.rootGraph, script.id);
                if (store.state.sidebarSelection?.kind === "script" && store.state.sidebarSelection.scriptId === script.id) {
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
