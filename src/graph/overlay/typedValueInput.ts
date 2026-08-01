import { Colors } from "../engine/color";
import { DEFAULT_VALUE_BY_TYPE } from "../engine/graphMutations";
import { allEnumTypeDefs, tryGetEnumTypeDef } from "../engine/enumRegistry";
import { allStructTypeDefs, tryGetStructTypeDef } from "../engine/structRegistry";
import type { PinContainer, PinType } from "../engine/types";
import { chevronSvg } from "./chevronIcon";
import { guardAgainstMultilinePaste, openMultilineTextEditor } from "./multilineTextEditor";
import { buildMenuTree, flattenVisible, type MenuNode, type VisibleRow } from "./nodeMenuTree";

const PIN_TYPE_OPTIONS: readonly PinType[] = ["number", "boolean", "string", "object", "date"];
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
  if (type === "object" || type === "exec" || type === "struct") {
    const span = document.createElement("span");
    span.className = "typed-value-placeholder";
    span.textContent = "—";
    return span;
  }

  const input = document.createElement("input");
  input.className = "typed-value-input";
  input.type = type === "boolean" ? "checkbox" : type === "number" ? "number" : type === "date" ? "datetime-local" : "text";
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
function createContainerListInput(type: PinType, value: unknown, onChange: (value: unknown) => void, container: PinContainer, keyType: PinType): HTMLElement {
  const list = document.createElement("div");
  list.className = "typed-value-list";
  const entries: unknown[] = Array.isArray(value) ? value.slice() : [];

  function commit(): void {
    onChange(entries.slice());
  }

  function dedupeInPlace(): void {
    const seen = new Set<string>();
    for (let i = 0; i < entries.length;) {
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
          : {
              key: DEFAULT_VALUE_BY_TYPE[keyType],
              value: DEFAULT_VALUE_BY_TYPE[type],
            };
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
      removeBtn.className = "typed-value-list-remove btn btn-gray btn-sm";
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
    addBtn.className = "typed-value-list-add btn btn-blue btn-sm";
    addBtn.textContent = "+ Add";
    addBtn.addEventListener("click", () => {
      entries.push(
        container === "map"
          ? {
              key: DEFAULT_VALUE_BY_TYPE[keyType],
              value: DEFAULT_VALUE_BY_TYPE[type],
            }
          : DEFAULT_VALUE_BY_TYPE[type],
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
export function createTypedValueInput(type: PinType, value: unknown, onChange: (value: unknown) => void, container: PinContainer = "single", keyType: PinType = "string"): HTMLElement {
  if (container !== "single") {
    return createContainerListInput(type, value, onChange, container, keyType);
  }
  return createScalarInput(type, value, onChange);
}

/** A tiny floating menu of `options`, each row built by `renderItem` — shared open/close/outside-
 * click/Escape plumbing for both the base-type menu and the container-kind menu below, so neither
 * has to re-implement rowContextMenu.ts-style flyout wiring (that one only supports a plain string
 * label, hence this separate — but now-shared — implementation). */
function openPickList<T>(screenPos: { x: number; y: number }, options: readonly T[], renderItem: (item: T) => Node[], onPick: (item: T) => void): void {
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

/** Everything openTypeMenu needs to render and pick one option — either one of the flat "simple"
 * PIN_TYPE_OPTIONS (no subType, no group) or one registered struct/enum CLASS (type is always
 * "struct"/"enum", subType is that class's id, label is that class's own label instead of the bare
 * type name, group nests it under "Struct.<category>"/"Enum.<category>" — see buildMenuTree). */
interface TypeMenuEntry {
  type: PinType;
  subType?: string;
  label: string;
  group: string;
}

/** Builds the flyout's full entry list: the "simple" types first (ungrouped — an empty `group`
 * attaches a leaf directly to the tree's root instead of nesting it), then every registered struct
 * type nested under "Struct.<category>" and every registered enum type under "Enum.<category>"
 * (falling back to "Other" for a class with no category — see structRegistry.ts/enumRegistry.ts).
 * `includeStructsAndEnums` is false for selectors that only ever apply to one non-struct value
 * (e.g. a Map's key type, an Array's element type) — struct/enum classes aren't wireable as those
 * today. */
function typeMenuEntries(includeStructsAndEnums: boolean): TypeMenuEntry[] {
  const entries: TypeMenuEntry[] = PIN_TYPE_OPTIONS.map((type) => ({
    type,
    label: type,
    group: "",
  }));
  if (!includeStructsAndEnums) return entries;

  for (const def of allStructTypeDefs()) {
    entries.push({
      type: "struct",
      subType: def.id,
      label: def.label,
      group: `Struct.${def.category ?? "Other"}`,
    });
  }
  for (const def of allEnumTypeDefs()) {
    entries.push({
      type: "enum",
      subType: def.id,
      label: def.label,
      group: `Enum.${def.category ?? "Other"}`,
    });
  }
  return entries;
}

/** Shared flyout body for both openTypeMenu and createStructTypeSelect's picker — a nested,
 * collapsed-by-default group tree (see nodeMenuTree.ts/nodeSearchMenu.ts, the same pattern used
 * for the node-creation search menu) with a search box that flattens matching entries into a plain
 * sorted-by-label list (matched against label or group path) once a query is typed. */
function openGroupedPicker<T>(screenPos: { x: number; y: number }, entries: T[], getGroup: (item: T) => string, getLabel: (item: T) => string, renderIcon: (item: T) => HTMLElement | null, onPick: (item: T) => void): void {
  const menu = document.createElement("div");
  menu.className = "row-context-menu type-menu";
  menu.style.left = `${screenPos.x}px`;
  menu.style.top = `${screenPos.y}px`;

  const search = document.createElement("input");
  search.type = "text";
  search.placeholder = "Search…";
  search.className = "type-menu-search-input";
  menu.appendChild(search);

  const list = document.createElement("div");
  list.className = "type-menu-list";
  menu.appendChild(list);

  const tree = buildMenuTree(entries, getGroup, getLabel);
  const expanded = new Set<string>();
  let treeRows: VisibleRow<T>[] = flattenVisible(tree, expanded);
  let flatEntries: T[] = [];
  let query = "";
  let highlighted = 0;

  function currentRowCount(): number {
    return query ? flatEntries.length : treeRows.length;
  }

  function renderEmpty(): void {
    const empty = document.createElement("div");
    empty.className = "row-context-menu-item pick-list-empty";
    empty.textContent = "No matching types";
    list.appendChild(empty);
  }

  function render(): void {
    list.innerHTML = "";

    if (query) {
      if (flatEntries.length === 0) return renderEmpty();
      flatEntries.forEach((item, i) => {
        const el = document.createElement("div");
        el.className = "row-context-menu-item pick-list-item node-search-result";
        if (i === highlighted) el.classList.add("highlighted");

        const icon = renderIcon(item);
        const labelEl = document.createElement("span");
        labelEl.className = "node-search-result-label";
        labelEl.textContent = getLabel(item);
        const groupEl = document.createElement("span");
        groupEl.className = "node-search-result-group";
        groupEl.textContent = getGroup(item);

        el.append(...(icon ? [icon] : []), labelEl, groupEl);
        el.addEventListener("mousedown", (e) => {
          e.preventDefault();
          pick(item);
        });
        list.appendChild(el);
      });
      return;
    }

    if (treeRows.length === 0) return renderEmpty();

    treeRows.forEach((row, i) => {
      const el = document.createElement("div");
      el.className = "row-context-menu-item pick-list-item node-search-tree-row";
      el.style.paddingLeft = `${8 + row.depth * 14}px`;
      if (i === highlighted) el.classList.add("highlighted");

      const iconSlot = document.createElement("span");
      iconSlot.className = "node-search-row-icon";
      const labelEl = document.createElement("span");
      labelEl.className = "node-search-row-label";

      if (row.node.kind === "group") {
        el.classList.add("node-search-group");
        iconSlot.innerHTML = chevronSvg(expanded.has(row.node.path) ? "down" : "right");
        labelEl.textContent = row.node.name;
        el.append(iconSlot, labelEl);
        el.addEventListener("mousedown", (e) => {
          e.preventDefault();
          toggleGroup(row.node as Extract<MenuNode<T>, { kind: "group" }>);
        });
      } else {
        const item = row.node.item;
        const icon = renderIcon(item);
        labelEl.textContent = getLabel(item);
        el.append(iconSlot, ...(icon ? [icon] : []), labelEl);
        el.addEventListener("mousedown", (e) => {
          e.preventDefault();
          pick(item);
        });
      }

      list.appendChild(el);
    });
  }

  function toggleGroup(group: Extract<MenuNode<T>, { kind: "group" }>): void {
    if (expanded.has(group.path)) expanded.delete(group.path);
    else expanded.add(group.path);
    treeRows = flattenVisible(tree, expanded);
    highlighted = Math.min(highlighted, Math.max(0, treeRows.length - 1));
    render();
  }

  function applyFilter(): void {
    query = search.value.trim().toLowerCase();
    if (query) {
      const matches = (item: T) => getLabel(item).toLowerCase().includes(query) || getGroup(item).toLowerCase().includes(query);
      flatEntries = entries.filter(matches).sort((a, b) => getLabel(a).localeCompare(getLabel(b)));
    }
    highlighted = 0;
    render();
  }

  function pick(item: T): void {
    close();
    onPick(item);
  }

  function close(): void {
    menu.remove();
    document.removeEventListener("mousedown", onOutside, true);
  }
  function onOutside(e: MouseEvent): void {
    if (!menu.contains(e.target as Node)) close();
  }

  search.addEventListener("input", applyFilter);
  search.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      highlighted = Math.min(highlighted + 1, currentRowCount() - 1);
      render();
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      highlighted = Math.max(highlighted - 1, 0);
      render();
      e.preventDefault();
    } else if (e.key === "Enter") {
      if (query) {
        if (flatEntries[highlighted]) pick(flatEntries[highlighted]);
      } else {
        const row = treeRows[highlighted];
        if (row?.node.kind === "leaf") pick(row.node.item);
        else if (row?.node.kind === "group") toggleGroup(row.node);
      }
      e.preventDefault();
    } else if (e.key === "Escape") {
      close();
      e.preventDefault();
    }
  });

  document.body.appendChild(menu);
  render();
  search.focus();
  setTimeout(() => document.addEventListener("mousedown", onOutside, true), 0);
}

/** Same collapsed-by-default group tree as the node-creation search menu (nodeSearchMenu.ts), just
 * over typeMenuEntries' plain/struct/enum entries instead of NodeDefs — see openGroupedPicker. */
function openTypeMenu(screenPos: { x: number; y: number }, onPick: (type: PinType, subType?: string) => void, includeStructsAndEnums: boolean): void {
  openGroupedPicker(
    screenPos,
    typeMenuEntries(includeStructsAndEnums),
    (entry) => entry.group,
    (entry) => entry.label,
    (entry) => createTypeDot(entry.type),
    (entry) => onPick(entry.type, entry.subType),
  );
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
/** Sibling of createTypeSelect for picking a configurableSubType node instance's struct CLASS (see
 * NodeDef.configurableSubType/structRegistry.ts) — same searchable, collapsed-by-default grouping
 * as createTypeSelect's variable-type flyout (see openGroupedPicker), just grouped directly by
 * category (e.g. "Azure") instead of nesting everything under an outer "Struct" group, since every
 * entry here is already known to be a struct. */
function openStructTypeMenu(screenPos: { x: number; y: number }, onPick: (subType: string) => void): void {
  const entries = allStructTypeDefs().map((def) => ({
    id: def.id,
    label: def.label,
    category: def.category ?? "Other",
  }));
  openGroupedPicker(
    screenPos,
    entries,
    (entry) => entry.category,
    (entry) => entry.label,
    () => null,
    (entry) => onPick(entry.id),
  );
}

export function createStructTypeSelect(current: string, onChange: (subType: string) => void): HTMLElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "typed-value-type-select";

  function labelFor(subType: string): string {
    return tryGetStructTypeDef(subType)?.label ?? subType;
  }

  function renderButton(subType: string): void {
    button.innerHTML = "";
    const caret = document.createElement("span");
    caret.className = "typed-value-type-caret";
    caret.textContent = "▾";
    button.append(document.createTextNode(labelFor(subType)), caret);
  }
  renderButton(current);

  button.addEventListener("mousedown", (e) => e.stopPropagation());
  button.addEventListener("click", () => {
    const rect = button.getBoundingClientRect();
    openStructTypeMenu({ x: rect.left, y: rect.bottom }, (subType) => {
      renderButton(subType);
      onChange(subType);
      button.blur(); // see createTypeSelect's identical fix for why this is necessary
    });
  });

  return button;
}

/** A custom dropdown (not a native <select> — those can't show arbitrary markup per option) for
 * editing a variable's or a function I/O entry's type. Each option, and the closed button itself,
 * shows the same colored dot used everywhere else a variable's type is indicated (see the
 * Variables list in variablePanel.ts and canvas node headers in drawNodes.ts). `currentSubType`/
 * `includeStructsAndEnums` opt this selector into also offering registered struct/enum classes,
 * grouped after the plain types (see typeMenuGroups) — omit both for a selector that should only
 * ever show the plain types (e.g. a Map's key type, an Array's element type). */
export function createTypeSelect(current: PinType, onChange: (type: PinType, subType?: string) => void, currentSubType?: string, includeStructsAndEnums = false): HTMLElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "typed-value-type-select";

  function labelFor(type: PinType, subType?: string): string {
    if (type === "struct") return (subType && tryGetStructTypeDef(subType)?.label) ?? type;
    if (type === "enum") return (subType && tryGetEnumTypeDef(subType)?.label) ?? type;
    return type;
  }

  function renderButton(type: PinType, subType?: string): void {
    button.innerHTML = "";
    const caret = document.createElement("span");
    caret.className = "typed-value-type-caret";
    caret.textContent = "▾";
    button.append(createTypeDot(type), document.createTextNode(labelFor(type, subType)), caret);
  }
  renderButton(current, currentSubType);

  button.addEventListener("mousedown", (e) => e.stopPropagation());
  button.addEventListener("click", () => {
    const rect = button.getBoundingClientRect();
    openTypeMenu(
      { x: rect.left, y: rect.bottom },
      (type, subType) => {
        renderButton(type, subType);
        onChange(type, subType);
        // A native <button> keeps focus after being clicked — left focused, it would permanently
        // block whatever re-render onChange triggers (e.g. detailsPanel.ts's "don't wipe fields
        // mid-edit" guard checks document.activeElement), since nothing else ever moves focus away.
        button.blur();
      },
      includeStructsAndEnums,
    );
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
