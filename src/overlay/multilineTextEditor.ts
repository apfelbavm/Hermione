/** A floating textarea for editing a pin's full literal value — reachable via the "expand" button
 * next to a multiline string pin's normal single-line canvas widget (see widgetSync.ts). Exists
 * because a plain <input> silently collapses real newlines to spaces, so it's not a safe way to
 * enter multi-row CSV/multi-line XML; this is the reliable path for that content. Positioned in
 * viewport (fixed) coordinates, same convention as rowContextMenu.ts — dismissed via Escape (cancel,
 * discarding edits) or the Save button; clicking outside also cancels, matching the other floating
 * panels in this app. */
export function openMultilineTextEditor(
  screenPos: { x: number; y: number },
  currentValue: string,
  onCommit: (value: string) => void,
): void {
  const panel = document.createElement("div");
  panel.className = "multiline-text-editor";
  panel.style.left = `${screenPos.x}px`;
  panel.style.top = `${screenPos.y}px`;

  const textarea = document.createElement("textarea");
  textarea.className = "multiline-text-editor-textarea";
  textarea.value = currentValue;
  textarea.spellcheck = false;

  const buttons = document.createElement("div");
  buttons.className = "multiline-text-editor-buttons";
  const saveButton = document.createElement("button");
  saveButton.textContent = "Save";
  saveButton.className = "multiline-text-editor-save";
  const cancelButton = document.createElement("button");
  cancelButton.textContent = "Cancel";

  buttons.append(saveButton, cancelButton);
  panel.append(textarea, buttons);

  function close(): void {
    panel.remove();
    document.removeEventListener("mousedown", onOutside, true);
    document.removeEventListener("keydown", onKeydown, true);
  }
  function onOutside(e: MouseEvent): void {
    if (!panel.contains(e.target as Node)) close();
  }
  function onKeydown(e: KeyboardEvent): void {
    if (e.key === "Escape") close();
    // Ctrl/Cmd+Enter commits without leaving the keyboard — Enter alone stays a plain newline,
    // since that's the whole point of this editor.
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      commit();
    }
  }
  function commit(): void {
    onCommit(textarea.value);
    close();
  }

  saveButton.addEventListener("click", commit);
  cancelButton.addEventListener("click", close);
  panel.addEventListener("mousedown", (e) => e.stopPropagation());

  document.body.appendChild(panel);
  // Clamp into the viewport now that the panel has a real rendered size — opened from a button near
  // the bottom/right of the screen (e.g. the Details panel, pinned to the sidebar's bottom edge)
  // would otherwise render partly or fully off-screen, exactly like any other rect.bottom/rect.left
  // positioned popup can.
  const margin = 8;
  const rect = panel.getBoundingClientRect();
  if (rect.right > window.innerWidth - margin) {
    panel.style.left = `${Math.max(margin, window.innerWidth - rect.width - margin)}px`;
  }
  if (rect.bottom > window.innerHeight - margin) {
    panel.style.top = `${Math.max(margin, window.innerHeight - rect.height - margin)}px`;
  }
  textarea.focus();
  textarea.select();
  // Defer the outside-click closer so the click that opened this editor doesn't immediately close
  // it — same pattern as the node-search menu / row context menu.
  setTimeout(() => {
    document.addEventListener("mousedown", onOutside, true);
    document.addEventListener("keydown", onKeydown, true);
  }, 0);
}

/** Wires a single-line <input> so a paste containing a real newline never reaches it — the "⤢"
 * expand button (see widgetSync.ts/typedValueInput.ts) is only a safe alternative PATH; it doesn't
 * stop someone from pasting straight into the compact input out of habit, which is exactly how a
 * large multi-row CSV silently loses every line break (verified directly: pasting a real 1.2MB CSV
 * file this way turned every "\n" into a literal space, character-for-character, with no error at
 * all — the browser's own <input> value sanitization, not something JS code even gets a chance to
 * intervene in AFTER the fact). Intercepting the "paste" event itself is the only point before that
 * sanitization happens, so this redirects a multi-line paste into the same floating textarea editor
 * instead, merged at the input's current selection like a normal paste would land. */
export function guardAgainstMultilinePaste(input: HTMLInputElement, onCommit: (value: string) => void): void {
  input.addEventListener("paste", (e) => {
    const pasted = e.clipboardData?.getData("text");
    if (!pasted || !pasted.includes("\n")) return;
    e.preventDefault();
    const before = input.value;
    const selStart = input.selectionStart ?? before.length;
    const selEnd = input.selectionEnd ?? before.length;
    const merged = before.slice(0, selStart) + pasted + before.slice(selEnd);
    const rect = input.getBoundingClientRect();
    openMultilineTextEditor({ x: rect.left, y: rect.bottom + 4 }, merged, onCommit);
  });
}
