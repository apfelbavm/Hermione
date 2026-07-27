import { COMMENT_HEADER_HEIGHT, computeCommentScreenRect } from "../render/commentGeometry";
import { getEditingGraph, type Store } from "../state/store";

interface CommentEntry {
  titleEl: HTMLDivElement;
}

export interface CommentOverlay {
  sync: () => void;
}

/** Keeps one editable title per comment box, pinned to its header — a contenteditable div (not an
 * <input>, which never wraps) so a long title wraps at whitespace instead of scrolling out of
 * view, spanning the full header width now that the color swatch has moved to the Details panel
 * (see detailsPanel.ts) — select the box to edit its color there.
 *
 * Since the title now covers almost the entire header, a plain click on it would otherwise always
 * hit this element instead of the canvas underneath, making the header un-draggable/un-selectable
 * except in a thin margin. So a single click here (while not already editing) is forwarded to the
 * canvas as a synthetic mousedown at the same position instead of focusing — canvas's own existing
 * header hit-test then selects/drags the box exactly as if the click had landed there directly.
 * Only a double-click (or a click while already focused, to reposition the caret) edits the text —
 * the same single-click-selects/double-click-renames split used for names in the sidebar. */
export function createCommentOverlay(overlay: HTMLElement, canvas: HTMLCanvasElement, store: Store): CommentOverlay {
  const entries = new Map<string, CommentEntry>();

  function sync(): void {
    const graph = getEditingGraph(store.state);
    const { camera } = store.state;
    const seen = new Set<string>();

    for (const box of graph.commentBoxes) {
      seen.add(box.id);
      let entry = entries.get(box.id);
      if (!entry) {
        entry = createCommentEntry(box.id, store, canvas);
        entries.set(box.id, entry);
        overlay.appendChild(entry.titleEl);
      }

      // Everything scales together with zoom — like the rest of the graph.
      const rect = computeCommentScreenRect(box, camera);
      const headerHeightPx = COMMENT_HEADER_HEIGHT * camera.zoom;
      const padding = 6 * camera.zoom;

      entry.titleEl.style.position = "absolute";
      entry.titleEl.style.left = `${rect.screenX + padding}px`;
      entry.titleEl.style.top = `${rect.screenY}px`;
      entry.titleEl.style.width = `${rect.width - padding * 2}px`;
      entry.titleEl.style.height = `${headerHeightPx}px`;
      entry.titleEl.style.fontSize = `${12 * camera.zoom}px`;

      if (document.activeElement !== entry.titleEl) {
        entry.titleEl.textContent = box.text;
      }
    }

    for (const [id, entry] of entries) {
      if (!seen.has(id)) {
        entry.titleEl.remove();
        entries.delete(id);
      }
    }
  }

  return { sync };
}

function createCommentEntry(commentId: string, store: Store, canvas: HTMLCanvasElement): CommentEntry {
  const titleEl = document.createElement("div");
  titleEl.className = "comment-title";
  titleEl.contentEditable = "true";
  titleEl.spellcheck = false;
  titleEl.addEventListener("input", () => {
    const box = getEditingGraph(store.state).commentBoxes.find((b) => b.id === commentId);
    if (box) box.text = titleEl.textContent ?? "";
    store.notify();
  });

  titleEl.addEventListener("mousedown", (e) => {
    if (document.activeElement === titleEl || e.detail >= 2) {
      // Already editing (just reposition the caret) or this IS the click that starts editing
      // (double-click) — either way, let the browser's own contenteditable behavior run.
      e.stopPropagation();
      return;
    }
    // A single click while not editing selects/drags the box instead, same as clicking anywhere
    // else on the header — hand it to the canvas at the same screen position.
    e.preventDefault();
    canvas.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: e.clientX,
        clientY: e.clientY,
        button: e.button,
      }),
    );
  });

  return { titleEl };
}
