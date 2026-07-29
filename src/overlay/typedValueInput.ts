import { Colors } from "../engine/color";
import { DEFAULT_VALUE_BY_TYPE } from "../engine/graphMutations";
import type { PinContainer, PinType } from "../engine/types";
import { guardAgainstMultilinePaste, openMultilineTextEditor } from "./multilineTextEditor";

const PIN_TYPE_OPTIONS: readonly PinType[] = ["number", "boolean", "string", "object"];
const PIN_CONTAINER_OPTIONS: readonly PinContainer[] = ["single", "array", "set", "map"];
const CONTAINER_LABELS: Record<PinContainer, string> = {
  single: "Single",
  array: "Array",
  set: "Set",
  map: "Map",
};

/** Small DOM icon matching the container's canvas pin shape (see drawNodes.ts's drawPinShape) —
 * a 3x3 grid of quads for Array, the same grid with its middle row's first two quads merged into
 * one wide quad for Map, and a "{ }" brace pair for Set. "single" has no icon (a plain value has
 * no container to distinguish). */
export function createContainerIcon(container: PinContainer): HTMLElement | null {
  if (container === "single") return null;

  if (container === "set") {
    const braces = document.createElement("span");
    braces.className = "container-icon-braces";
    braces.textContent = "{}";
    return braces;
  }

  const grid = document.createElement("span");
  grid.className = "container-icon";
  const cellCount = container === "map" ? 8 : 9;
  for (let i = 0; i < cellCount; i++) {
    const cell = document.createElement("span");
    cell.className = "container-icon-cell";
    // The 4th cell appended is the middle row's first cell — merge it into a wide quad for Map.
    if (container === "map" && i === 3) cell.classList.add("container-icon-cell-wide");
    grid.appendChild(cell);
  }
  return grid;
}

interface MapEntry {
  key: unknown;
  value: unknown;
}

function isMapEntry(value: unknown): value is MapEntry {
  return typeof value === "object" && value !== null && "key" in value && "value" in value;
}

function createTypeDot(type: PinType): HTMLSpanElement {
  const dot = document.createElement("span");
  dot.className = "variable-type-dot";
  dot.style.backgroundColor = Colors.PIN_COLORS[type];
  return dot;
}

/** Builds the single-value editor for one scalar of `type` — exactly what createTypedValueInput
 * used to be in full before container support existed. Reused both for a "single" container value
 * and for each row's own per-element/per-key/per-value editor inside a list (see
 * createContainerListInput). */
function createScalarInput(type: PinType, value: unknown, onChange: (value: unknown) => void): HTMLElement {
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

  if (type !== "string") return input;

  // A plain <input> silently collapses real newlines to spaces the instant ANYTHING assigns a
  // multi-line string to its .value — not just on user typing/paste, but even programmatically (a
  // fresh render seeding it from the stored value hits the exact same browser behavior). So the
  // expand button below tracks the real current value in this closure variable instead of ever
  // reading it back off `input.value`, which is lossy for multi-line content the moment it's set.
  let liveValue = value == null ? "" : String(value);

  // Pasting multi-line content here (e.g. a whole CSV file's text, to feed a conversion node via a
  // variable) would otherwise lose every line break with no visible error. The "⤢" button opens the
  // same floating textarea editor the canvas's own per-node pin widgets use (see
  // widgetSync.ts/multilineTextEditor.ts) as the reliable path for that content; the plain input
  // stays editable for short values.
  const commitFullValue = (newValue: string) => {
    liveValue = newValue;
    input.value = newValue;
    onChange(newValue);
  };

  guardAgainstMultilinePaste(input, commitFullValue);

  const wrapper = document.createElement("span");
  wrapper.className = "typed-value-input-wrapper";
  const expandButton = document.createElement("button");
  expandButton.type = "button";
  expandButton.className = "pin-widget-expand typed-value-expand";
  expandButton.textContent = "⤢";
  expandButton.title = "Edit full text";
  expandButton.addEventListener("click", (e) => {
    e.stopPropagation();
    const rect = expandButton.getBoundingClientRect();
    openMultilineTextEditor({ x: rect.left, y: rect.bottom + 4 }, liveValue, commitFullValue);
  });
  wrapper.append(input, expandButton);
  return wrapper;
}

/** Builds the expandable list editor for an Array/Set/Map default value — one row per entry (a
 * single scalar editor for Array/Set, a key+value pair of scalar editors for Map) plus a trailing
 * "+ Add" row. Backing storage is always a plain array (Array<T> -> T[], Set<T> -> T[] deduped on
 * every edit, Map<K,V> -> {key,value}[]) — see the plan's rationale for why real Map/Set instances
 * are never used (they don't survive JSON.stringify, breaking save/load). */
function createContainerListInput(
  type: PinType,
  value: unknown,
  onChange: (value: unknown) => void,
  container: PinContainer,
  keyType: PinType,
): HTMLElement {
  const list = document.createElement("div");
  list.className = "typed-value-list";
  const entries: unknown[] = Array.isArray(value) ? value.slice() : [];

  function commit(): void {
    onChange(entries.slice());
  }

  function dedupeInPlace(): void {
    const seen = new Set<string>();
    for (let i = 0; i < entries.length; ) {
      const key = JSON.stringify(entries[i]);
      if (seen.has(key)) entries.splice(i, 1);
      else {
        seen.add(key);
        i++;
      }
    }
  }

  function renderRows(): void {
    list.innerHTML = "";

    entries.forEach((entry, index) => {
      const row = document.createElement("div");
      row.className = "typed-value-list-row";

      if (container === "map") {
        const entryObj: MapEntry = isMapEntry(entry)
          ? entry
          : { key: DEFAULT_VALUE_BY_TYPE[keyType], value: DEFAULT_VALUE_BY_TYPE[type] };
        // Reads entries[index] fresh at commit time (not the entryObj snapshot captured above) —
        // editing this row's key then its value never re-renders in between (only Set dedupes
        // trigger a re-render on edit), so committing off the stale entryObj would silently
        // discard whichever field was edited first, resetting it back to its pre-edit value.
        const currentEntry = (): MapEntry => (isMapEntry(entries[index]) ? entries[index] : entryObj);
        const keyInput = createScalarInput(keyType, entryObj.key, (k) => {
          entries[index] = { key: k, value: currentEntry().value };
          commit();
        });
        const valueInput = createScalarInput(type, entryObj.value, (v) => {
          entries[index] = { key: currentEntry().key, value: v };
          commit();
        });
        // Value field first, then Key field — matches the Details panel's own header row order
        // for a map variable (Type/value-type select, then Container, then Key Type select last),
        // so the entry list reads left-to-right consistently with the controls above it.
        row.append(valueInput, keyInput);
      } else {
        const elInput = createScalarInput(type, entry, (v) => {
          entries[index] = v;
          commit();
          if (container === "set") {
            dedupeInPlace();
            renderRows();
          }
        });
        row.append(elInput);
      }

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "typed-value-list-remove";
      removeBtn.textContent = "✕";
      removeBtn.addEventListener("click", () => {
        entries.splice(index, 1);
        commit();
        renderRows();
      });
      row.appendChild(removeBtn);

      list.appendChild(row);
    });

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "typed-value-list-add";
    addBtn.textContent = "+ Add";
    addBtn.addEventListener("click", () => {
      entries.push(
        container === "map" ? { key: DEFAULT_VALUE_BY_TYPE[keyType], value: DEFAULT_VALUE_BY_TYPE[type] } : DEFAULT_VALUE_BY_TYPE[type],
      );
      if (container === "set") dedupeInPlace();
      commit();
      renderRows();
    });
    list.appendChild(addBtn);
  }

  renderRows();
  return list;
}

/** Builds a small inline editor for a typed default value, matching the per-type widget shapes
 * used for in-canvas pin literals (see widgetSync.ts) — object has no literal editor anywhere in
 * this app (wiring-only there too), so it just shows a placeholder. Commits on change (blur/Enter),
 * not per-keystroke, so a live re-render triggered elsewhere never yanks focus mid-edit. When
 * `container` is not "single", renders an expandable list editor instead (see
 * createContainerListInput) — `keyType` is only meaningful (and required in practice) for "map". */
export function createTypedValueInput(
  type: PinType,
  value: unknown,
  onChange: (value: unknown) => void,
  container: PinContainer = "single",
  keyType: PinType = "string",
): HTMLElement {
  if (container !== "single") {
    return createContainerListInput(type, value, onChange, container, keyType);
  }
  return createScalarInput(type, value, onChange);
}

/** A tiny floating menu of `options`, each row built by `renderItem` — shared open/close/outside-
 * click/Escape plumbing for both the base-type menu and the container-kind menu below, so neither
 * has to re-implement rowContextMenu.ts-style flyout wiring (that one only supports a plain string
 * label, hence this separate — but now-shared — implementation). */
function openPickList<T>(
  screenPos: { x: number; y: number },
  options: readonly T[],
  renderItem: (item: T) => Node[],
  onPick: (item: T) => void,
): void {
  const menu = document.createElement("div");
  menu.className = "row-context-menu";
  menu.style.left = `${screenPos.x}px`;
  menu.style.top = `${screenPos.y}px`;

  for (const item of options) {
    const el = document.createElement("div");
    el.className = "row-context-menu-item pick-list-item";
    el.append(...renderItem(item));
    el.addEventListener("mousedown", (e) => {
      e.preventDefault();
      close();
      onPick(item);
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
  // Defer the outside-click closer so the click that opened this menu doesn't immediately close it.
  setTimeout(() => {
    document.addEventListener("mousedown", onOutside, true);
    document.addEventListener("keydown", onKeydown, true);
  }, 0);
}

function openTypeMenu(screenPos: { x: number; y: number }, onPick: (type: PinType) => void): void {
  openPickList(screenPos, PIN_TYPE_OPTIONS, (type) => [createTypeDot(type), document.createTextNode(type)], onPick);
}

function openContainerMenu(screenPos: { x: number; y: number }, onPick: (container: PinContainer) => void): void {
  openPickList(
    screenPos,
    PIN_CONTAINER_OPTIONS,
    (c) => {
      const icon = createContainerIcon(c);
      return icon ? [icon, document.createTextNode(CONTAINER_LABELS[c])] : [document.createTextNode(CONTAINER_LABELS[c])];
    },
    onPick,
  );
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
      // A native <button> keeps focus after being clicked — left focused, it would permanently
      // block whatever re-render onChange triggers (e.g. detailsPanel.ts's "don't wipe fields
      // mid-edit" guard checks document.activeElement), since nothing else ever moves focus away.
      button.blur();
    });
  });

  return button;
}

/** Sibling of createTypeSelect for picking a variable's/pin's CONTAINER (Single/Array/Set/Map) —
 * same button+flyout shape. Each option (and the closed button itself) shows the container's icon
 * — see createContainerIcon — matching the shape drawn on its canvas pins (drawNodes.ts). */
export function createContainerSelect(current: PinContainer, onChange: (container: PinContainer) => void): HTMLElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "typed-value-type-select";

  function renderButton(container: PinContainer): void {
    button.innerHTML = "";
    const icon = createContainerIcon(container);
    const caret = document.createElement("span");
    caret.className = "typed-value-type-caret";
    caret.textContent = "▾";
    if (icon) button.append(icon);
    button.append(document.createTextNode(CONTAINER_LABELS[container]), caret);
  }
  renderButton(current);

  button.addEventListener("mousedown", (e) => e.stopPropagation());
  button.addEventListener("click", () => {
    const rect = button.getBoundingClientRect();
    openContainerMenu({ x: rect.left, y: rect.bottom }, (container) => {
      renderButton(container);
      onChange(container);
      button.blur(); // see createTypeSelect's identical fix for why this is necessary
    });
  });

  return button;
}
