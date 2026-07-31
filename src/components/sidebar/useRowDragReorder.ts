"use client";

import { useState } from "react";

export type DropPosition = "before" | "after";

/** Shared drag-to-reorder wiring for a sidebar row list (Variables/Functions/Scripts/function or
 * script I/O entries) — every one of those lists reorders the same way: drag a row, hover another
 * row to see a before/after indicator, drop to reorder. The indicator lives in React state here
 * (unlike the old vanilla overlay code, which toggled classList directly to avoid a full
 * innerHTML rebuild mid-drag — with React owning the DOM via stable per-row `key`s, a state update
 * only patches the affected row's className, so that workaround is no longer needed). */
export function useRowDragReorder<T extends string>(mime: string, onReorder: (draggedId: string, targetId: T, position: DropPosition) => void) {
  const [indicator, setIndicator] = useState<{ id: T; position: DropPosition } | null>(null);

  function positionFor(e: React.DragEvent): DropPosition {
    const rect = e.currentTarget.getBoundingClientRect();
    return e.clientY < rect.top + rect.height / 2 ? "before" : "after";
  }

  function rowDragHandlers(id: T) {
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes(mime)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const position = positionFor(e);
        setIndicator((prev) => (prev?.id === id && prev.position === position ? prev : { id, position }));
      },
      onDragLeave: () => {
        setIndicator((prev) => (prev?.id === id ? null : prev));
      },
      onDrop: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes(mime)) return;
        e.preventDefault();
        e.stopPropagation(); // don't also let this bubble to the canvas's own drop handler
        const draggedId = e.dataTransfer.getData(mime);
        const position = positionFor(e);
        setIndicator(null);
        if (draggedId) onReorder(draggedId, id, position);
      },
    };
  }

  function rowIndicatorClassName(id: T): string {
    if (indicator?.id !== id) return "";
    return indicator.position === "before" ? " variable-row-drop-above" : " variable-row-drop-below";
  }

  return { rowDragHandlers, rowIndicatorClassName };
}
