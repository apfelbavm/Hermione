import { COMMENT_HEADER_HEIGHT, computeCommentScreenRect } from "../render/commentGeometry";
import { getEditingGraph, type Store } from "../../state/store";

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
 * Since the title now covers almost the entire header, it also has to double as the header's
 * drag/select handle — a plain click on it can't just always start editing, or the box would
 * become nearly impossible to drag by its header. So mousedown here waits to see whether the
 * pointer actually MOVES before releasing: no movement is treated as a click, focusing the title
 * with the caret placed exactly where the pointer landed; real movement is treated as a drag and
 * forwarded to the canvas as a synthetic mousedown at the original position instead, so its own
 * existing header hit-test selects/drags the box exactly as if the click had landed there directly. */
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

      // Left/top only (no explicit width/height) so the box shrink-wraps its actual text instead of
      // claiming the whole header — max-width still caps it from overflowing the comment box on a
      // long title, and max-height still caps runaway wrapping, but an empty/short title now reads
      // (and hover-highlights) as just its own small box rather than a big invisible click target.
      entry.titleEl.style.position = "absolute";
      entry.titleEl.style.left = `${rect.screenX + padding}px`;
      entry.titleEl.style.top = `${rect.screenY + padding}px`;
      entry.titleEl.style.maxWidth = `${rect.width - padding * 2}px`;
      entry.titleEl.style.maxHeight = `${headerHeightPx - padding * 2}px`;
      entry.titleEl.style.fontSize = `${12 * camera.zoom}px`;

      if (document.activeElement !== entry.titleEl) {
        entry.titleEl.textContent = box.text;
      }
      // Not reached by the canvas's own mousedown-based "locked while simulating" guard (see
      // pointerHandlers.ts) — contentEditable is toggled directly here instead, every sync pass, so
      // a running simulation can't have comment titles edited out from under it.
      entry.titleEl.contentEditable = store.state.simulating ? "false" : "true";
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

  const DRAG_THRESHOLD_PX = 4;

  titleEl.addEventListener("mousedown", (e) => {
    if (document.activeElement === titleEl) {
      // Already editing — let the browser's own caret placement/selection run normally. This also
      // covers the second mousedown of a double-click (the first already focused it below), so
      // word-select-on-double-click still works natively without any extra handling here.
      return;
    }

    // We decide ourselves (below) whether this becomes an edit or a drag, instead of the browser's
    // default mousedown behavior (which would focus + start a native text-selection drag).
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    const button = e.button;
    let settled = false;

    function onMove(moveEvent: MouseEvent): void {
      if (settled) return;
      if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) <= DRAG_THRESHOLD_PX) return;
      settled = true;
      cleanup();
      canvas.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window, clientX: startX, clientY: startY, button }));
    }

    function onUp(): void {
      if (settled) return;
      settled = true;
      cleanup();
      // A plain click, no drag — enter edit mode with the caret placed exactly where clicked
      // (falls back to whatever focus() defaults to if the browser doesn't support this API).
      titleEl.focus();
      const range = document.caretRangeFromPoint?.(startX, startY);
      if (range) {
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }

    function cleanup(): void {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });

  return { titleEl };
}
