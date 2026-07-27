import type { NodeDef } from "../engine/types";

export interface NodeSearchMenuOptions {
  screenPos: { x: number; y: number };
  candidates: NodeDef[];
  onPick: (def: NodeDef) => void;
  onCancel: () => void;
}

/** A filtered, keyboard-navigable node-creation popup — the "drag off a pin, get compatible nodes" menu. */
export function openNodeSearchMenu(overlay: HTMLElement, opts: NodeSearchMenuOptions): void {
  const menu = document.createElement("div");
  menu.className = "node-search-menu";
  menu.style.left = `${opts.screenPos.x}px`;
  menu.style.top = `${opts.screenPos.y}px`;

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Search nodes…";
  input.className = "node-search-input";
  menu.appendChild(input);

  const list = document.createElement("ul");
  list.className = "node-search-list";
  menu.appendChild(list);

  let filtered = opts.candidates;
  let highlighted = 0;
  let closed = false;

  function renderList(): void {
    list.innerHTML = "";
    if (filtered.length === 0) {
      const empty = document.createElement("li");
      empty.className = "node-search-empty";
      empty.textContent = "No matching nodes";
      list.appendChild(empty);
      return;
    }
    filtered.forEach((def, i) => {
      const li = document.createElement("li");
      li.textContent = def.label;
      li.title = def.category;
      if (i === highlighted) li.classList.add("highlighted");
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        pick(def);
      });
      list.appendChild(li);
    });
  }

  function applyFilter(): void {
    const q = input.value.trim().toLowerCase();
    filtered = q
      ? opts.candidates.filter(
          (d) => d.label.toLowerCase().includes(q) || d.category.toLowerCase().includes(q),
        )
      : opts.candidates;
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
      highlighted = Math.min(highlighted + 1, filtered.length - 1);
      renderList();
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      highlighted = Math.max(highlighted - 1, 0);
      renderList();
      e.preventDefault();
    } else if (e.key === "Enter") {
      if (filtered[highlighted]) pick(filtered[highlighted]);
      e.preventDefault();
    } else if (e.key === "Escape") {
      close();
      opts.onCancel();
      e.preventDefault();
    }
  });

  input.addEventListener("input", applyFilter);

  overlay.appendChild(menu);
  applyFilter();
  input.focus();

  // Defer the outside-click closer so the mouseup that triggered this menu doesn't immediately close it.
  setTimeout(() => document.addEventListener("mousedown", onDocMouseDown, true), 0);
}
