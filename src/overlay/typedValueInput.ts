import type { PinType } from "../engine/types";
import { PIN_COLORS } from "../render/palette";

const PIN_TYPE_OPTIONS: readonly PinType[] = ["number", "boolean", "string", "object"];

function createTypeDot(type: PinType): HTMLSpanElement {
  const dot = document.createElement("span");
  dot.className = "variable-type-dot";
  dot.style.backgroundColor = PIN_COLORS[type];
  return dot;
}

/** Builds a small inline editor for a typed default value, matching the per-type widget shapes
 * used for in-canvas pin literals (see widgetSync.ts) — object has no literal editor anywhere in
 * this app (wiring-only there too), so it just shows a placeholder. Commits on change (blur/Enter),
 * not per-keystroke, so a live re-render triggered elsewhere never yanks focus mid-edit. */
export function createTypedValueInput(
  type: PinType,
  value: unknown,
  onChange: (value: unknown) => void,
): HTMLElement {
  if (type === "object" || type === "exec") {
    const span = document.createElement("span");
    span.className = "typed-value-placeholder";
    span.textContent = "—";
    return span;
  }

  const input = document.createElement("input");
  input.className = "typed-value-input";
  input.type = type === "boolean" ? "checkbox" : type === "number" ? "number" : "text";
  input.autocomplete = "off";
  if (type === "boolean") input.checked = Boolean(value);
  else input.value = value == null ? "" : String(value);

  input.addEventListener("change", () => {
    onChange(type === "boolean" ? input.checked : type === "number" ? Number(input.value) : input.value);
  });
  if (type !== "boolean") {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") input.blur();
    });
  }

  return input;
}

/** A custom dropdown (not a native <select> — those can't show arbitrary markup per option) for
 * editing a variable's or a function I/O entry's type. Each option, and the closed button itself,
 * shows the same colored dot used everywhere else a variable's type is indicated (see the
 * Variables list in variablePanel.ts and canvas node headers in drawNodes.ts). */
export function createTypeSelect(current: PinType, onChange: (type: PinType) => void): HTMLElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "typed-value-type-select";

  function renderButton(type: PinType): void {
    button.innerHTML = "";
    const caret = document.createElement("span");
    caret.className = "typed-value-type-caret";
    caret.textContent = "▾";
    button.append(createTypeDot(type), document.createTextNode(type), caret);
  }
  renderButton(current);

  button.addEventListener("mousedown", (e) => e.stopPropagation());
  button.addEventListener("click", () => {
    const rect = button.getBoundingClientRect();
    openTypeMenu({ x: rect.left, y: rect.bottom }, (type) => {
      renderButton(type);
      onChange(type);
    });
  });

  return button;
}

/** A tiny floating menu of every PinType, each row showing the same colored dot as the closed
 * button — mirrors rowContextMenu.ts's own open/close-on-outside-click/Escape plumbing, just with
 * dot+label rows instead of plain text (ContextMenuItem there only supports a plain string label). */
function openTypeMenu(screenPos: { x: number; y: number }, onPick: (type: PinType) => void): void {
  const menu = document.createElement("div");
  menu.className = "row-context-menu";
  menu.style.left = `${screenPos.x}px`;
  menu.style.top = `${screenPos.y}px`;

  for (const type of PIN_TYPE_OPTIONS) {
    const item = document.createElement("div");
    item.className = "row-context-menu-item type-menu-item";
    item.append(createTypeDot(type), document.createTextNode(type));
    item.addEventListener("mousedown", (e) => {
      e.preventDefault();
      close();
      onPick(type);
    });
    menu.appendChild(item);
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
  // Defer the outside-click closer so the click that opened this menu doesn't immediately close it.
  setTimeout(() => {
    document.addEventListener("mousedown", onOutside, true);
    document.addEventListener("keydown", onKeydown, true);
  }, 0);
}
