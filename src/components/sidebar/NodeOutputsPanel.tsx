"use client";

import { useState } from "react";
import { i18n } from "@i18n";
import { addNodeOutputEntry, defaultValueFor, moveNodeOutputEntry, nextId, removeNodeOutputEntry, updateNodeOutputEntry } from "@hermione/graph/engine/graphMutations";
import type { NodeInstance } from "@hermione/graph/engine/nodeInstance";
import type { PinSignatureEntry } from "@hermione/graph/engine/types";
import { getLastVariableType, setLastVariableType } from "../../client/lastVariableType";
import { SCRIPT_IO_ENTRY_DRAG_MIME } from "@hermione/graph/overlay/dragTypes";
import { openRowContextMenu } from "@hermione/graph/overlay/rowContextMenu";
import { createContainerSelect, createTypeSelect, createTypedValueInput } from "@hermione/graph/overlay/typedValueInput";
import { nextAvailableName } from "@hermione/graph/overlay/uniqueName";
import type { Store } from "@hermione/graph/state/store";
import { useStoreRevision } from "@hermione/graph/state/useStore";
import { CollapsibleSection } from "./CollapsibleSection";
import { EditableNameInput, EditableNameLabel } from "./EditableName";
import { ImperativeMount } from "./ImperativeMount";
import { useRowDragReorder } from "./useRowDragReorder";

/** Sibling of ScriptIoPanel/FunctionIoPanel for a node whose own editable output signature lives
 * directly on the NodeInstance itself (see NodeDef.editableOutputs, NodeInstance.outputEntries) —
 * currently flow.executeFlow's user-mapped outputs and flow.return's declared flow return values
 * (see nodes/flow.ts). */
export function NodeOutputsPanel({ store, getSelectedNode }: { store: Store; getSelectedNode: () => NodeInstance | null }) {
  useStoreRevision(store);
  const [editingId, setEditingId] = useState<string | null>(null);
  const node = getSelectedNode();
  if (!node) return null;
  const disabled = store.state.simulating || store.state.readOnly;
  const entries = node.outputEntries ?? [];

  function commitRename(entry: PinSignatureEntry, rawNewName: string): void {
    const trimmed = rawNewName.trim();
    const isDuplicate = trimmed.length === 0 || entries.some((e) => e.id !== entry.id && e.name === trimmed);
    if (!isDuplicate) updateNodeOutputEntry(store.state.rootGraph, node!, entry.id, { name: trimmed });
    setEditingId(null);
    store.notify();
  }

  const { rowDragHandlers, rowIndicatorClassName } = useRowDragReorder<string>(SCRIPT_IO_ENTRY_DRAG_MIME, (draggedId, targetId, position) => {
    moveNodeOutputEntry(node!, draggedId, targetId, position);
    store.notify();
  });

  function handleAdd(): void {
    const name = nextAvailableName(
      entries.map((entry) => entry.name),
      "NewOutput",
    );
    const { type, subType, container, keyType } = getLastVariableType();
    const entry: PinSignatureEntry = {
      id: nextId("io"),
      name,
      type,
      subType,
      container,
      keyType,
      defaultValue: defaultValueFor(type, container, subType),
    };
    addNodeOutputEntry(node!, entry);
    setEditingId(entry.id);
    store.notify();
  }

  return (
    <CollapsibleSection id="node-outputs-section" title={i18n.components.details_panel.node_outputs_title} empty={entries.length === 0} onAdd={handleAdd} disabled={disabled}>
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
                        label: i18n.components.context_menu.rename,
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
                      updateNodeOutputEntry(store.state.rootGraph, node!, entry.id, {
                        type,
                        subType,
                      });
                      setLastVariableType(entry);
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
                    updateNodeOutputEntry(store.state.rootGraph, node!, entry.id, {
                      container,
                    });
                    setLastVariableType(entry);
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
                      updateNodeOutputEntry(store.state.rootGraph, node!, entry.id, {
                        keyType,
                      });
                      setLastVariableType(entry);
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
                  removeNodeOutputEntry(store.state.rootGraph, node!, entry.id);
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
                      updateNodeOutputEntry(store.state.rootGraph, node!, entry.id, {
                        defaultValue,
                      });
                      store.notify();
                    },
                    entry.container ?? "single",
                    entry.keyType ?? "string",
                    entry.subType,
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
