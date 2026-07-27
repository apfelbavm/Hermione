export interface ContextMenuItem {
  label: string;
  onClick: () => void;
}

/** A tiny floating context menu — e.g. "Edit" for a sidebar row, or "Get"/"Set" when a variable is
 * dropped onto the canvas. Positioned in viewport (fixed) coordinates so it works the same
 * whether triggered from the canvas or the scrollable sidebar. Dismissed by clicking outside,
 * pressing Escape, or picking an item. */
export function openRowContextMenu(screenPos: { x: number; y: number }, items: ContextMenuItem[]): void {
  const menu = document.createElement("div");
  menu.className = "row-context-menu";
  menu.style.left = `${screenPos.x}px`;
  menu.style.top = `${screenPos.y}px`;

  for (const item of items) {
    const el = document.createElement("div");
    el.className = "row-context-menu-item";
    el.textContent = item.label;
    el.addEventListener("click", () => {
      close();
      item.onClick();
    });
    menu.appendChild(el);
  }

  function close(): void {
    menu.remove();
    document.removeEventListener("mousedown", onOutside, true);
    document.removeEventListener("keydown", onKeydown, true);
  }
  function onOutside(e: MouseEvent): void {
    if (!menu.contains(e.target as Node)) close();
  }
  function onKeydown(e: KeyboardEvent): void {
    if (e.key === "Escape") close();
  }

  document.body.appendChild(menu);
  // Defer the outside-click closer so the right-click/mousedown/drop that opened this menu
  // doesn't immediately close it — same pattern as the node-search menu.
  setTimeout(() => {
    document.addEventListener("mousedown", onOutside, true);
    document.addEventListener("keydown", onKeydown, true);
  }, 0);
}
