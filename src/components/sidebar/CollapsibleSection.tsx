"use client";

import { useState, type ReactNode } from "react";
import { IconManager } from "../../shared/iconManager";

/** A collapsible sidebar section (Functions/Variables/Scripts/Local Variables/Inputs/Outputs) —
 * click the header to toggle, "+" adds an entry (and always un-collapses first, so a freshly added
 * row is never hidden by an already-collapsed section). Mirrors overlay/collapsibleSection.ts;
 * collapsed state lives as local component state here instead of a DOM class, since there's no
 * separate "section wrapper never gets rebuilt" concern anymore — this whole section IS the
 * component. */
export function CollapsibleSection({
  id,
  title,
  empty,
  onAdd,
  addButtonTitle,
  disabled = false,
  children,
}: {
  id?: string;
  title: string;
  empty: boolean;
  onAdd: () => void;
  addButtonTitle?: string;
  /** Disables the "+" add button — e.g. while a Simulate run is in progress. Collapsing/expanding
   * the section itself is left alone, since it doesn't touch the graph. */
  disabled?: boolean;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div id={id} className={"panel-section" + (collapsed ? " collapsed" : "")}>
      <div className="panel-header" onClick={() => setCollapsed((c) => !c)}>
        <span className="panel-header-arrow">{!empty && (collapsed ? <IconManager.ChevronRightIcon /> : <IconManager.ChevronDownIcon />)}</span>
        <span className="panel-header-title">{title}</span>
        <button
          type="button"
          className="panel-header-add"
          title={addButtonTitle}
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation(); // don't also toggle the section's collapse state
            setCollapsed(false);
            onAdd();
          }}
        >
          +
        </button>
      </div>
      <div className="panel-body">
        <div className="panel-list">{children}</div>
      </div>
    </div>
  );
}
