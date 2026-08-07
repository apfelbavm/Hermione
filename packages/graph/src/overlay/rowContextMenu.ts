export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  /** Shown greyed out and unclickable — e.g. "Disable" when the node has a connected data output. */
  disabled?: boolean;
}

// Kept clear of the window's own edge when the menu is opened near it (see the clamp below) —
// otherwise a right-click/drop close to the border could open a menu that's partly (or entirely)
// off-screen and unreachable.
const MENU_EDGE_PADDING = 16;

/** A tiny floating context menu — e.g. "Edit" for a sidebar row, or "Get"/"Set" when a variable is
 * dropped onto the canvas. Positioned in viewport (fixed) coordinates so it works the same
 * whether triggered from the canvas or the scrollable sidebar. Dismissed by clicking outside,
 * pressing Escape, or picking an item. */
export function openRowContextMenu(screenPos: { x: number; y: number }, items: ContextMenuItem[]): void {
  const menu = document.createElement("div");
  menu.className = "row-context-menu";

  for (const item of items) {
    const el = document.createElement("div");
    el.className = "row-context-menu-item" + (item.disabled ? " row-context-menu-item-disabled" : "");
    el.textContent = item.label;
    if (!item.disabled) {
      el.addEventListener("click", () => {
        close();
        item.onClick();
      });
    }
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

  // Clamp into the browser window now that the menu has a real, laid-out size to measure — only
  // pulls it inward from whichever edge(s) it would overflow, never repositions it otherwise.
  const menuRect = menu.getBoundingClientRect();
  const maxLeft = Math.max(MENU_EDGE_PADDING, window.innerWidth - menuRect.width - MENU_EDGE_PADDING);
  const maxTop = Math.max(MENU_EDGE_PADDING, window.innerHeight - menuRect.height - MENU_EDGE_PADDING);
  menu.style.left = `${Math.min(Math.max(screenPos.x, MENU_EDGE_PADDING), maxLeft)}px`;
  menu.style.top = `${Math.min(Math.max(screenPos.y, MENU_EDGE_PADDING), maxTop)}px`;

  // Defer the outside-click closer so the right-click/mousedown/drop that opened this menu
  // doesn't immediately close it — same pattern as the node-search menu.
  setTimeout(() => {
    document.addEventListener("mousedown", onOutside, true);
    document.addEventListener("keydown", onKeydown, true);
  }, 0);
}
