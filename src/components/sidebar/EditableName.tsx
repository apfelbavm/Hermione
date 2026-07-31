"use client";

import { useEffect, useRef } from "react";
import { attachHoverTooltip } from "../../overlay/tooltip";

/** A row's name in edit mode — an autofocused, select-all text input. Commits on blur/Enter,
 * reverts (no rename applied) on Escape. Mirrors overlay/editableNameCell.ts's
 * createEditableNameInput; the settled-ref guard exists for the same reason it did there — Escape
 * calls .blur() itself to trigger commit-time cleanup, and the guard stops that from ALSO running
 * the commit path. */
export function EditableNameInput({
  name,
  onCommit,
  onCancel,
}: {
  name: string;
  onCommit: (newName: string) => void;
  onCancel: () => void;
}) {
  const settledRef = useRef(false);
  return (
    <input
      className="typed-value-input variable-name editable-name-input"
      type="text"
      defaultValue={name}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => {
        if (settledRef.current) return;
        settledRef.current = true;
        onCommit(e.currentTarget.value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          settledRef.current = true;
          e.currentTarget.blur();
          onCancel();
        }
      }}
    />
  );
}

/** A row's name in its normal, non-editing display state — a plain label. Right-click opens the
 * caller-provided context menu (its "Edit"/"Rename" entry is what actually enters edit mode). */
export function EditableNameLabel({
  name,
  className,
  title,
  hoverTooltip,
  onContextMenu,
  onClick,
}: {
  name: string;
  className?: string;
  title?: string;
  /** Wires overlay/tooltip.ts's custom delayed hover-tooltip (e.g. a function's description)
   * instead of a native `title` attribute — the two are mutually exclusive per row. */
  hoverTooltip?: () => string | undefined | null;
  onContextMenu: (screenPos: { x: number; y: number }) => void;
  onClick?: () => void;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  // Kept fresh every render (a plain ref write, not an effect) so the listener attached below —
  // only ever once, since re-attaching per render would leak a duplicate listener on every render —
  // still calls whatever the CURRENT hoverTooltip closure is when a hover eventually fires.
  const hoverTooltipRef = useRef(hoverTooltip);
  hoverTooltipRef.current = hoverTooltip;
  useEffect(() => {
    if (ref.current) attachHoverTooltip(ref.current, () => hoverTooltipRef.current?.());
  }, []);

  return (
    <span
      ref={ref}
      className={"variable-name editable-name-label" + (className ? ` ${className}` : "")}
      title={title}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu({ x: e.clientX, y: e.clientY });
      }}
      onClick={onClick}
    >
      {name}
    </span>
  );
}
