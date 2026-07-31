/** A row's name in its normal, non-editing display state — a plain label. Right-click opens the
 * caller-provided context menu (its "Edit" entry is what actually enters edit mode). */
export function createEditableNameLabel(name: string, onContextMenu: (screenPos: { x: number; y: number }) => void): HTMLElement {
  const span = document.createElement("span");
  span.className = "variable-name editable-name-label";
  span.textContent = name;
  span.title = name;
  span.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    onContextMenu({ x: e.clientX, y: e.clientY });
  });
  return span;
}

/** A row's name in edit mode — an autofocused, select-all text input. Commits on blur/Enter,
 * reverts (no rename applied) on Escape. The caller decides what "commit" actually means (e.g.
 * silently keeping the old name on a duplicate) and is responsible for re-rendering afterward. */
export function createEditableNameInput(name: string, onCommit: (newName: string) => void, onCancel: () => void): HTMLInputElement {
  const input = document.createElement("input");
  input.className = "typed-value-input variable-name editable-name-input";
  input.type = "text";
  input.value = name;

  let settled = false;
  input.addEventListener("blur", () => {
    if (settled) return;
    settled = true;
    onCommit(input.value);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      input.blur(); // triggers the commit above
    } else if (e.key === "Escape") {
      settled = true;
      // Blur BEFORE onCancel (which re-renders in display mode) — otherwise the panel's own
      // "skip re-render while this list has focus" guard would block that re-render, leaving the
      // stale input on screen until focus happens to move elsewhere for an unrelated reason.
      input.blur();
      onCancel();
    }
  });

  return input;
}

/** Focuses and selects all text in a freshly-attached editable name input — call after appending
 * it to the DOM (focusing a detached element is a no-op). */
export function focusAndSelect(input: HTMLInputElement): void {
  input.focus();
  input.select();
}

/** True only while an editable-name-input within `list` is actually focused — i.e. a rename is
 * genuinely in progress. Deliberately narrower than "does this list contain the focused element
 * at all": clicking a delete button, a type <select>, or a value input also moves focus into the
 * list, and none of those should block the list from rebuilding afterward (only a live rename
 * should — losing keystrokes mid-edit is the failure this guards against). */
export function isRenamingWithinList(list: HTMLElement): boolean {
  const active = document.activeElement;
  return active instanceof HTMLElement && active.classList.contains("editable-name-input") && list.contains(active);
}
