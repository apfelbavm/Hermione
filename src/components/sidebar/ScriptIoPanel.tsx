"use client";

import { useState } from "react";
import { i18n } from "@i18n";
import { addScriptInput, addScriptOutput, DEFAULT_VALUE_BY_TYPE, moveScriptInput, moveScriptOutput, nextId, removeScriptInput, removeScriptOutput, updateScriptInput, updateScriptOutput } from "../../engine/graphMutations";
import type { CodeScriptDef, PinSignatureEntry } from "../../engine/types";
import { getLastVariableType, setLastVariableType } from "../../client/lastVariableType";
import { SCRIPT_IO_ENTRY_DRAG_MIME } from "../../overlay/dragTypes";
import { openRowContextMenu } from "../../overlay/rowContextMenu";
import { createContainerSelect, createTypeSelect, createTypedValueInput } from "../../overlay/typedValueInput";
import { nextAvailableName } from "../../overlay/uniqueName";
import type { Store } from "../../state/store";
import { useStoreRevision } from "../../state/useStore";
import { CollapsibleSection } from "./CollapsibleSection";
import { EditableNameInput, EditableNameLabel } from "./EditableName";
import { ImperativeMount } from "./ImperativeMount";
import { useRowDragReorder } from "./useRowDragReorder";

export function ScriptIoPanel({ store, kind, getSelectedScript }: { store: Store; kind: "input" | "output"; getSelectedScript: () => CodeScriptDef | null }) {
  useStoreRevision(store);
  const [editingId, setEditingId] = useState<string | null>(null);
  const script = getSelectedScript();
  if (!script) return null;
  const disabled = store.state.simulating || store.state.readOnly;

  const entries = kind === "input" ? script.inputs : script.outputs;
  const update = kind === "input" ? updateScriptInput : updateScriptOutput;
  const removeEntry = kind === "input" ? removeScriptInput : removeScriptOutput;
  const moveEntry = kind === "input" ? moveScriptInput : moveScriptOutput;

  function commitRename(entry: PinSignatureEntry, rawNewName: string): void {
    const trimmed = rawNewName.trim();
    const isDuplicate = trimmed.length === 0 || entries.some((e) => e.id !== entry.id && e.name === trimmed);
    if (!isDuplicate) update(store.state.rootGraph, script!, entry.id, { name: trimmed });
    setEditingId(null);
    store.notify();
  }

  const { rowDragHandlers, rowIndicatorClassName } = useRowDragReorder<string>(SCRIPT_IO_ENTRY_DRAG_MIME, (draggedId, targetId, position) => {
    moveEntry(script!, draggedId, targetId, position);
    store.notify();
  });

  function handleAdd(): void {
    const name = nextAvailableName(
      entries.map((entry) => entry.name),
      kind === "input" ? "NewInput" : "NewOutput",
    );
    const type = getLastVariableType();
    const entry: PinSignatureEntry = {
      id: nextId("io"),
      name,
      type,
      defaultValue: DEFAULT_VALUE_BY_TYPE[type],
    };
    if (kind === "input") addScriptInput(script!, entry);
    else addScriptOutput(script!, entry);
    setEditingId(entry.id);
    store.notify();
  }

  return (
    <CollapsibleSection id={kind === "input" ? "script-inputs-section" : "script-outputs-section"} title={kind === "input" ? "Inputs" : "Outputs"} empty={entries.length === 0} onAdd={handleAdd} disabled={disabled}>
      {entries.map((entry) => {
        const isEditing = editingId === entry.id;

        return (
          <div key={entry.id}>
            <div
              className={"variable-row" + rowIndicatorClassName(entry.id)}
              draggable={!isEditing && !disabled}
              onDragStart={(e) => {
                e.dataTransfer.setData(SCRIPT_IO_ENTRY_DRAG_MIME, entry.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              {...rowDragHandlers(entry.id)}
            >
              {isEditing ? (
                <EditableNameInput
                  name={entry.name}
                  onCommit={(newName) => commitRename(entry, newName)}
                  onCancel={() => {
                    setEditingId(null);
                    store.notify();
                  }}
                />
              ) : (
                <EditableNameLabel
                  name={entry.name}
                  disabled={disabled}
                  onContextMenu={(screenPos) => {
                    openRowContextMenu(screenPos, [
                      {
                        label: i18n.components.context_menu.edit,
                        onClick: () => setEditingId(entry.id),
                      },
                    ]);
                  }}
                />
              )}

              <ImperativeMount
                build={() =>
                  createTypeSelect(
                    entry.type,
                    (type, subType) => {
                      update(store.state.rootGraph, script!, entry.id, {
                        type,
                        subType,
                      });
                      setLastVariableType(type);
                      store.notify();
                    },
                    entry.subType,
                    true,
                  )
                }
                deps={[entry.id, entry.type, entry.subType]}
                disabled={disabled}
              />

              <ImperativeMount
                build={() =>
                  createContainerSelect(entry.container ?? "single", (container) => {
                    update(store.state.rootGraph, script!, entry.id, {
                      container,
                    });
                    store.notify();
                  })
                }
                deps={[entry.id, entry.container]}
                disabled={disabled}
              />

              {entry.container === "map" && (
                <ImperativeMount
                  build={() =>
                    createTypeSelect(entry.keyType ?? "string", (keyType) => {
                      update(store.state.rootGraph, script!, entry.id, {
                        keyType,
                      });
                      store.notify();
                    })
                  }
                  deps={[entry.id, entry.keyType]}
                  disabled={disabled}
                />
              )}

              <button
                type="button"
                className="btn btn-gray btn-sm"
                disabled={disabled}
                onClick={() => {
                  removeEntry(store.state.rootGraph, script!, entry.id);
                  store.notify();
                }}
              >
                ✕
              </button>
            </div>

            <div className="variable-row">
              <ImperativeMount
                build={() =>
                  createTypedValueInput(
                    entry.type,
                    entry.defaultValue,
                    (defaultValue) => {
                      update(store.state.rootGraph, script!, entry.id, {
                        defaultValue,
                      });
                      store.notify();
                    },
                    entry.container ?? "single",
                    entry.keyType ?? "string",
                  )
                }
                deps={[entry.id, entry.type, entry.container, entry.keyType, entry.defaultValue]}
                disabled={disabled}
              />
            </div>
          </div>
        );
      })}
    </CollapsibleSection>
  );
}
