"use client";

import { useState } from "react";
import {
  addFunctionInput,
  addFunctionOutput,
  DEFAULT_VALUE_BY_TYPE,
  moveFunctionEntry,
  nextId,
  removeFunctionInput,
  removeFunctionOutput,
  updateFunctionInput,
  updateFunctionOutput,
} from "../../engine/graphMutations";
import type { FunctionDef, PinSignatureEntry, PinType } from "../../engine/types";
import { FUNCTION_IO_ENTRY_DRAG_MIME } from "../../overlay/dragTypes";
import { openRowContextMenu } from "../../overlay/rowContextMenu";
import { createContainerSelect, createTypeSelect, createTypedValueInput } from "../../overlay/typedValueInput";
import { nextAvailableName } from "../../overlay/uniqueName";
import type { Store } from "../../state/store";
import { useStoreRevision } from "../../state/useStore";
import { CollapsibleSection } from "./CollapsibleSection";
import { EditableNameInput, EditableNameLabel } from "./EditableName";
import { ImperativeMount } from "./ImperativeMount";
import { useRowDragReorder } from "./useRowDragReorder";

/** Shared component for the Inputs and Outputs sections — both are a list of typed signature
 * entries (name/type/default value) on the currently-open function. Collapsible; "+" creates an
 * entry with an unused default name and immediately enters rename mode; right-click > Rename an
 * existing one. (A Return node instance is placed by right-clicking inside the function's body
 * graph, not from here — a function body can hold several.) Hidden entirely while no function is
 * open for editing. */
export function FunctionIoPanel({
  store,
  kind,
  getActiveFunction,
}: {
  store: Store;
  kind: "input" | "output";
  getActiveFunction: () => FunctionDef | null;
}) {
  useStoreRevision(store);
  const [editingId, setEditingId] = useState<string | null>(null);
  const fn = getActiveFunction();
  if (!fn) return null;

  const entries = kind === "input" ? fn.inputs : fn.outputs;
  const update = kind === "input" ? updateFunctionInput : updateFunctionOutput;
  const removeEntry = kind === "input" ? removeFunctionInput : removeFunctionOutput;

  function commitRename(entry: PinSignatureEntry, rawNewName: string): void {
    const trimmed = rawNewName.trim();
    const isDuplicate = trimmed.length === 0 || entries.some((e) => e.id !== entry.id && e.name === trimmed);
    if (!isDuplicate) update(store.state.rootGraph, fn!, entry.id, { name: trimmed });
    setEditingId(null);
    store.notify();
  }

  const { rowDragHandlers, rowIndicatorClassName } = useRowDragReorder<string>(FUNCTION_IO_ENTRY_DRAG_MIME, (draggedId, targetId, position) => {
    moveFunctionEntry(fn!, kind, draggedId, targetId, position);
    store.notify();
  });

  function handleAdd(): void {
    const name = nextAvailableName(
      entries.map((entry) => entry.name),
      kind === "input" ? "NewInput" : "NewOutput",
    );
    const type: PinType = "number";
    const entry: PinSignatureEntry = { id: nextId("io"), name, type, defaultValue: DEFAULT_VALUE_BY_TYPE[type] };
    if (kind === "input") addFunctionInput(fn!, entry);
    else addFunctionOutput(fn!, entry);
    setEditingId(entry.id);
    store.notify();
  }

  return (
    <CollapsibleSection
      id={kind === "input" ? "inputs-section" : "outputs-section"}
      title={kind === "input" ? "Inputs" : "Outputs"}
      empty={entries.length === 0}
      onAdd={handleAdd}
    >
      {entries.map((entry) => {
        const isEditing = editingId === entry.id;

        return (
          <div key={entry.id}>
            <div
              className={"variable-row" + rowIndicatorClassName(entry.id)}
              draggable={!isEditing}
              onDragStart={(e) => {
                e.dataTransfer.setData(FUNCTION_IO_ENTRY_DRAG_MIME, entry.id);
                // Just "move" (not "copyMove" like Variables/Functions rows) — this drag gesture
                // only ever reorders within this same list, never drops onto the canvas.
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
                  title={entry.name}
                  onContextMenu={(screenPos) => {
                    openRowContextMenu(screenPos, [{ label: "Rename", onClick: () => setEditingId(entry.id) }]);
                  }}
                />
              )}

              <ImperativeMount
                build={() =>
                  createTypeSelect(entry.type, (type) => {
                    update(store.state.rootGraph, fn!, entry.id, { type });
                    store.notify();
                  })
                }
                deps={[entry.id, entry.type]}
              />

              <ImperativeMount
                build={() =>
                  createContainerSelect(entry.container ?? "single", (container) => {
                    update(store.state.rootGraph, fn!, entry.id, { container });
                    store.notify();
                  })
                }
                deps={[entry.id, entry.container]}
              />

              {entry.container === "map" && (
                <ImperativeMount
                  build={() =>
                    createTypeSelect(entry.keyType ?? "string", (keyType) => {
                      update(store.state.rootGraph, fn!, entry.id, { keyType });
                      store.notify();
                    })
                  }
                  deps={[entry.id, entry.keyType]}
                />
              )}

              <button
                type="button"
                onClick={() => {
                  removeEntry(store.state.rootGraph, fn!, entry.id);
                  store.notify();
                }}
              >
                ✕
              </button>
            </div>

            {/* A container's default-value editor is a whole vertical list, not a single inline
                input — its own row underneath the name/type/container line. */}
            <div className="variable-row">
              <ImperativeMount
                build={() =>
                  createTypedValueInput(
                    entry.type,
                    entry.defaultValue,
                    (defaultValue) => {
                      update(store.state.rootGraph, fn!, entry.id, { defaultValue });
                      store.notify();
                    },
                    entry.container ?? "single",
                    entry.keyType ?? "string",
                  )
                }
                deps={[entry.id, entry.type, entry.container, entry.keyType, entry.defaultValue]}
              />
            </div>
          </div>
        );
      })}
    </CollapsibleSection>
  );
}
