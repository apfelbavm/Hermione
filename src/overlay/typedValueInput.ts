import type { PinType } from "../engine/types";

const PIN_TYPE_OPTIONS: readonly PinType[] = ["number", "boolean", "string", "object"];

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

/** A `<select>` over the available pin types, for editing a variable's or a function I/O entry's type. */
export function createTypeSelect(current: PinType, onChange: (type: PinType) => void): HTMLSelectElement {
  const select = document.createElement("select");
  select.className = "typed-value-type-select";
  for (const type of PIN_TYPE_OPTIONS) {
    const option = document.createElement("option");
    option.value = type;
    option.textContent = type;
    if (type === current) option.selected = true;
    select.appendChild(option);
  }
  select.addEventListener("change", () => onChange(select.value as PinType));
  return select;
}

/** A plain text input for editing an entry's name, committing on change (blur/Enter). */
export function createNameInput(value: string, onChange: (value: string) => void): HTMLInputElement {
  const input = document.createElement("input");
  input.className = "typed-value-input variable-name";
  input.type = "text";
  input.value = value;
  input.addEventListener("change", () => onChange(input.value));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") input.blur();
  });
  return input;
}
