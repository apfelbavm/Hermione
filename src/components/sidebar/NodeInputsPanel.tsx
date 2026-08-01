"use client";

import { useState } from "react";
import { i18n } from "@i18n";
import { addNodeInputEntry, defaultValueFor, moveNodeInputEntry, nextId, removeNodeInputEntry, updateNodeInputEntry } from "../../graph/engine/graphMutations";
import type { NodeInstance } from "../../graph/engine/nodeInstance";
import type { PinSignatureEntry } from "../../graph/engine/types";
import { getLastVariableType, setLastVariableType } from "../../client/lastVariableType";
import { SCRIPT_IO_ENTRY_DRAG_MIME } from "../../graph/overlay/dragTypes";
import { openRowContextMenu } from "../../graph/overlay/rowContextMenu";
import { createContainerSelect, createTypeSelect, createTypedValueInput } from "../../graph/overlay/typedValueInput";
import { nextAvailableName } from "../../graph/overlay/uniqueName";
import type { Store } from "../../state/store";
import { useStoreRevision } from "../../state/useStore";
import { CollapsibleSection } from "./CollapsibleSection";
import { EditableNameInput, EditableNameLabel } from "./EditableName";
import { ImperativeMount } from "./ImperativeMount";
import { useRowDragReorder } from "./useRowDragReorder";

/** Sibling of NodeOutputsPanel for a node whose own editable INPUT signature lives directly on the
 * NodeInstance itself (see NodeDef.editableInputs, NodeInstance.inputEntries) — currently
 * flow.executeFlow's user-mapped params, sent to the target Flow's "On Execute" event fields by
 * name (see server/executeDeployedFlow.ts). */
export function NodeInputsPanel({ store, getSelectedNode }: { store: Store; getSelectedNode: () => NodeInstance | null }) {
  useStoreRevision(store);
  const [editingId, setEditingId] = useState<string | null>(null);
  const node = getSelectedNode();
  if (!node) return null;
  const disabled = store.state.simulating || store.state.readOnly;
  const entries = node.inputEntries ?? [];

  function commitRename(entry: PinSignatureEntry, rawNewName: string): void {
    const trimmed = rawNewName.trim();
    const isDuplicate = trimmed.length === 0 || entries.some((e) => e.id !== entry.id && e.name === trimmed);
    if (!isDuplicate) updateNodeInputEntry(store.state.rootGraph, node!, entry.id, { name: trimmed });
    setEditingId(null);
    store.notify();
  }

  const { rowDragHandlers, rowIndicatorClassName } = useRowDragReorder<string>(SCRIPT_IO_ENTRY_DRAG_MIME, (draggedId, targetId, position) => {
    moveNodeInputEntry(node!, draggedId, targetId, position);
    store.notify();
  });

  function handleAdd(): void {
    const name = nextAvailableName(
      entries.map((entry) => entry.name),
      "NewInput",
    );
    const { type, subType } = getLastVariableType();
    const entry: PinSignatureEntry = {
      id: nextId("io"),
      name,
      type,
      subType,
      defaultValue: defaultValueFor(type, undefined, subType),
    };
    addNodeInputEntry(node!, entry);
    setEditingId(entry.id);
    store.notify();
  }

  return (
    <CollapsibleSection id="node-inputs-section" title={i18n.components.details_panel.node_inputs_title} empty={entries.length === 0} onAdd={handleAdd} disabled={disabled}>
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
                      updateNodeInputEntry(store.state.rootGraph, node!, entry.id, {
                        type,
                        subType,
                      });
                      setLastVariableType(type, subType);
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
                    updateNodeInputEntry(store.state.rootGraph, node!, entry.id, {
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
                      updateNodeInputEntry(store.state.rootGraph, node!, entry.id, {
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
                  removeNodeInputEntry(store.state.rootGraph, node!, entry.id);
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
                      updateNodeInputEntry(store.state.rootGraph, node!, entry.id, {
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
