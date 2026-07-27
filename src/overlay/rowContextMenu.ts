/** A tiny floating context menu for a sidebar row — currently just "Edit". Positioned in viewport
 * (fixed) coordinates so it works the same whether the row is in the canvas overlay or the
 * scrollable sidebar. Dismissed by clicking outside, pressing Escape, or picking the item. */
export function openRowContextMenu(screenPos: { x: number; y: number }, onEdit: () => void): void {
  const menu = document.createElement("div");
  menu.className = "row-context-menu";
  menu.style.left = `${screenPos.x}px`;
  menu.style.top = `${screenPos.y}px`;

  const editItem = document.createElement("div");
  editItem.className = "row-context-menu-item";
  editItem.textContent = "Edit";
  editItem.addEventListener("click", () => {
    close();
    onEdit();
  });
  menu.appendChild(editItem);

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
  // Defer the outside-click closer so the right-click/mousedown that opened this menu doesn't
  // immediately close it — same pattern as the node-search menu.
  setTimeout(() => {
    document.addEventListener("mousedown", onOutside, true);
    document.addEventListener("keydown", onKeydown, true);
  }, 0);
}
