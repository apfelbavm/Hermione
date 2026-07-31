"use client";

import { useEffect, useRef } from "react";
import { attachHoverTooltip } from "../../overlay/tooltip";

export function EditableNameInput({ name, onCommit, onCancel }: { name: string; onCommit: (newName: string) => void; onCancel: () => void }) {
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

export function EditableNameLabel({
  name,
  className,
  title,
  hoverTooltip,
  disabled = false,
  onContextMenu,
  onClick,
}: {
  name: string;
  className?: string;
  title?: string;

  hoverTooltip?: () => string | undefined | null;

  disabled?: boolean;
  onContextMenu: (screenPos: { x: number; y: number }) => void;
  onClick?: () => void;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  const hoverTooltipRef = useRef(hoverTooltip);
  hoverTooltipRef.current = hoverTooltip;
  useEffect(() => {
    if (ref.current) attachHoverTooltip(ref.current, () => hoverTooltipRef.current?.());
  }, []);

  return (
    <span
      ref={ref}
      className={"variable-name editable-name-label" + (className ? ` ${className}` : "") + (disabled ? " editable-name-label-disabled" : "")}
      title={title}
      onContextMenu={(e) => {
        e.preventDefault();
        if (!disabled) onContextMenu({ x: e.clientX, y: e.clientY });
      }}
      onClick={disabled ? undefined : onClick}
    >
      {name}
    </span>
  );
}
