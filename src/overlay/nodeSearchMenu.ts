import type { NodeDef } from "../engine/types";
import { chevronSvg } from "./chevronIcon";
import { buildMenuTree, flattenVisible, type MenuNode, type VisibleRow } from "./nodeMenuTree";
import { attachHoverTooltip } from "./tooltip";

type NodeMenuNode = MenuNode<NodeDef>;
type NodeVisibleRow = VisibleRow<NodeDef>;

export interface NodeSearchMenuOptions {
  screenPos: { x: number; y: number };
  candidates: NodeDef[];
  /** Rendered as plain, ungrouped rows pinned above the rest of the list — e.g. "Return" when
   * right-clicking inside a function body, so it doesn't need digging out of a nested group. Still
   * participates in search filtering like any other candidate, just never nested under its group. */
  pinned?: NodeDef[];
  onPick: (def: NodeDef) => void;
  onCancel: () => void;
}

/** A filtered, keyboard-navigable node-creation popup — the "drag off a pin, get compatible nodes" menu.
 * With no search text, shows the full group tree (sorted, all groups/subgroups collapsed by default);
 * typing a query flattens to a plain sorted-by-label list matched against label or group path, with
 * each result's group shown alongside it. */
// Kept clear of the canvas's own edge when the menu is opened near it (see the clamp below) —
// otherwise a right-click/wire-drop close to the border could open a menu that's partly (or
// entirely) unreachable outside the graph area.
const MENU_EDGE_PADDING = 16;

export function openNodeSearchMenu(overlay: HTMLElement, opts: NodeSearchMenuOptions): void {
  const menu = document.createElement("div");
  menu.className = "node-search-menu";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Search nodes…";
  input.className = "node-search-input";
  menu.appendChild(input);

  const list = document.createElement("ul");
  list.className = "node-search-list";
  menu.appendChild(list);

  const pinned = opts.pinned ?? [];
  const pinnedSet = new Set(pinned);
  // Excluded from the grouped tree so a pinned def doesn't also show up nested under its own group.
  const treeCandidates = opts.candidates.filter((d) => !pinnedSet.has(d));

  const tree = buildMenuTree(
    treeCandidates,
    (d) => d.group || "Other",
    (d) => d.label,
  );
  const expanded = new Set<string>();

  function computeTreeRows(): NodeVisibleRow[] {
    const pinnedRows: NodeVisibleRow[] = pinned.map((def) => ({
      depth: 0,
      node: { kind: "leaf", item: def },
    }));
    return [...pinnedRows, ...flattenVisible(tree, expanded)];
  }

  let treeRows: NodeVisibleRow[] = computeTreeRows();
  let flatDefs: NodeDef[] = [];
  let pinnedMatchCount = 0;
  let query = "";
  let highlighted = 0;
  let closed = false;

  function currentRowCount(): number {
    return query ? flatDefs.length : treeRows.length;
  }

  function renderList(): void {
    list.innerHTML = "";

    if (query) {
      if (flatDefs.length === 0) {
        const empty = document.createElement("li");
        empty.className = "node-search-empty";
        empty.textContent = "No matching nodes";
        list.appendChild(empty);
        return;
      }
      flatDefs.forEach((def, i) => {
        const li = document.createElement("li");
        li.className = "node-search-result";
        if (i === highlighted) li.classList.add("highlighted");
        if (i === pinnedMatchCount - 1 && pinnedMatchCount < flatDefs.length) {
          li.classList.add("node-search-pinned-divider");
        }

        const labelEl = document.createElement("span");
        labelEl.className = "node-search-result-label";
        labelEl.textContent = def.label;

        const groupEl = document.createElement("span");
        groupEl.className = "node-search-result-group";
        groupEl.textContent = def.group;

        li.append(labelEl, groupEl);
        li.addEventListener("mousedown", (e) => {
          e.preventDefault();
          pick(def);
        });
        attachHoverTooltip(li, () => def.description);
        list.appendChild(li);
      });
      return;
    }

    treeRows.forEach((row, i) => {
      const li = document.createElement("li");
      li.className = "node-search-tree-row";
      li.style.paddingLeft = `${8 + row.depth * 14}px`;
      if (i === highlighted) li.classList.add("highlighted");
      if (i === pinned.length - 1 && pinned.length < treeRows.length) {
        li.classList.add("node-search-pinned-divider");
      }

      // A fixed-width icon slot shared by every row — a group's chevron arrow sits here, and a
      // leaf row (no icon of its own) gets an empty same-width slot instead, so its label lines
      // up with a group's NAME text (which starts right after that arrow) rather than the arrow.
      const icon = document.createElement("span");
      icon.className = "node-search-row-icon";

      const labelEl = document.createElement("span");
      labelEl.className = "node-search-row-label";

      if (row.node.kind === "group") {
        li.classList.add("node-search-group");
        icon.innerHTML = chevronSvg(expanded.has(row.node.path) ? "down" : "right");
        labelEl.textContent = row.node.name;
        li.addEventListener("mousedown", (e) => {
          e.preventDefault();
          toggleGroup(row.node as MenuNode & { kind: "group" });
        });
      } else {
        const def = row.node.item;
        labelEl.textContent = def.label;
        li.title = def.group;
        li.addEventListener("mousedown", (e) => {
          e.preventDefault();
          pick(def);
        });
        attachHoverTooltip(li, () => def.description);
      }

      li.append(icon, labelEl);
      list.appendChild(li);
    });
  }

  function toggleGroup(group: Extract<NodeMenuNode, { kind: "group" }>): void {
    if (expanded.has(group.path)) expanded.delete(group.path);
    else expanded.add(group.path);
    treeRows = computeTreeRows();
    highlighted = Math.min(highlighted, Math.max(0, treeRows.length - 1));
    renderList();
  }

  function applyFilter(): void {
    query = input.value.trim().toLowerCase();
    if (query) {
      const matches = (d: NodeDef) => d.label.toLowerCase().includes(query) || d.group.toLowerCase().includes(query);
      const matchedPinned = pinned.filter(matches);
      const matchedOthers = treeCandidates.filter(matches).sort((a, b) => a.label.localeCompare(b.label));
      pinnedMatchCount = matchedPinned.length;
      flatDefs = [...matchedPinned, ...matchedOthers];
    }
    highlighted = 0;
    renderList();
  }

  function pick(def: NodeDef): void {
    close();
    opts.onPick(def);
  }

  function close(): void {
    if (closed) return;
    closed = true;
    document.removeEventListener("mousedown", onDocMouseDown, true);
    menu.remove();
  }

  function onDocMouseDown(e: MouseEvent): void {
    if (!menu.contains(e.target as Node)) {
      close();
      opts.onCancel();
    }
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      highlighted = Math.min(highlighted + 1, currentRowCount() - 1);
      renderList();
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      highlighted = Math.max(highlighted - 1, 0);
      renderList();
      e.preventDefault();
    } else if (e.key === "Enter") {
      if (query) {
        if (flatDefs[highlighted]) pick(flatDefs[highlighted]);
      } else {
        const row = treeRows[highlighted];
        if (row?.node.kind === "leaf") pick(row.node.item);
        else if (row?.node.kind === "group") toggleGroup(row.node);
      }
      e.preventDefault();
    } else if (e.key === "Escape") {
      close();
      opts.onCancel();
      e.preventDefault();
    }
  });

  input.addEventListener("input", applyFilter);

  overlay.appendChild(menu);
  renderList();
  input.focus();

  // Clamp into the graph area (== overlay's own bounds, see style.css's #overlay — screenPos is
  // already relative to that same origin) now that the menu has a real, laid-out size to measure —
  // its width is fixed but its height depends on how many rows rendered above. Only pulls the menu
  // INWARD from whichever edge(s) it would overflow; never repositions it away from the cursor
  // otherwise.
  const bounds = overlay.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const maxLeft = Math.max(MENU_EDGE_PADDING, bounds.width - menuRect.width - MENU_EDGE_PADDING);
  const maxTop = Math.max(MENU_EDGE_PADDING, bounds.height - menuRect.height - MENU_EDGE_PADDING);
  menu.style.left = `${Math.min(Math.max(opts.screenPos.x, MENU_EDGE_PADDING), maxLeft)}px`;
  menu.style.top = `${Math.min(Math.max(opts.screenPos.y, MENU_EDGE_PADDING), maxTop)}px`;

  // Defer the outside-click closer so the mouseup that triggered this menu doesn't immediately close it.
  setTimeout(() => document.addEventListener("mousedown", onDocMouseDown, true), 0);
}
