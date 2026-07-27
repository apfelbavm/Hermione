import { COMMENT_HEADER_HEIGHT, computeCommentScreenRect, DEFAULT_COMMENT_COLOR } from "../render/commentGeometry";
import { CHAR_WIDTH } from "../render/layout";
import { getEditingGraph, type Store } from "../state/store";

interface CommentEntry {
  titleEl: HTMLInputElement;
  colorEl: HTMLInputElement;
}

export interface CommentOverlay {
  sync: () => void;
}

/** Keeps one editable title <input> and one color swatch per comment box, pinned to its header. */
export function createCommentOverlay(overlay: HTMLElement, store: Store): CommentOverlay {
  const entries = new Map<string, CommentEntry>();

  function sync(): void {
    const graph = getEditingGraph(store.state);
    const { camera } = store.state;
    const seen = new Set<string>();

    for (const box of graph.commentBoxes) {
      seen.add(box.id);
      let entry = entries.get(box.id);
      if (!entry) {
        entry = createCommentEntry(box.id, store);
        entries.set(box.id, entry);
        overlay.appendChild(entry.titleEl);
        overlay.appendChild(entry.colorEl);
      }

      // Everything scales together with zoom — like the rest of the graph.
      const rect = computeCommentScreenRect(box, camera);
      const headerHeightPx = COMMENT_HEADER_HEIGHT * camera.zoom;
      const swatchMargin = 6 * camera.zoom;
      const swatchSize = Math.max(10, Math.min(16 * camera.zoom, headerHeightPx - 4 * camera.zoom));

      entry.colorEl.style.position = "absolute";
      entry.colorEl.style.left = `${rect.screenX + rect.width - swatchSize - swatchMargin}px`;
      entry.colorEl.style.top = `${rect.screenY + (headerHeightPx - swatchSize) / 2}px`;
      entry.colorEl.style.width = `${swatchSize}px`;
      entry.colorEl.style.height = `${swatchSize}px`;
      if (document.activeElement !== entry.colorEl) {
        entry.colorEl.value = box.color ?? DEFAULT_COMMENT_COLOR;
      }

      const titleLeft = rect.screenX + 6 * camera.zoom;
      const titleMaxWidth = Math.max(
        0,
        rect.screenX + rect.width - swatchSize - swatchMargin * 2 - titleLeft,
      );
      const widthPx = Math.min(
        Math.max(60, box.text.length * CHAR_WIDTH + 16) * camera.zoom,
        titleMaxWidth,
      );
      entry.titleEl.style.position = "absolute";
      entry.titleEl.style.left = `${titleLeft}px`;
      entry.titleEl.style.top = `${rect.screenY}px`;
      entry.titleEl.style.width = `${widthPx}px`;
      entry.titleEl.style.height = `${headerHeightPx}px`;
      entry.titleEl.style.fontSize = `${12 * camera.zoom}px`;

      if (document.activeElement !== entry.titleEl) {
        entry.titleEl.value = box.text;
      }
    }

    for (const [id, entry] of entries) {
      if (!seen.has(id)) {
        entry.titleEl.remove();
        entry.colorEl.remove();
        entries.delete(id);
      }
    }
  }

  return { sync };
}

function createCommentEntry(commentId: string, store: Store): CommentEntry {
  const titleEl = document.createElement("input");
  titleEl.type = "text";
  titleEl.className = "comment-title";
  titleEl.autocomplete = "off";
  titleEl.addEventListener("input", () => {
    const box = getEditingGraph(store.state).commentBoxes.find((b) => b.id === commentId);
    if (box) box.text = titleEl.value;
    store.notify();
  });
  titleEl.addEventListener("mousedown", (e) => e.stopPropagation());

  const colorEl = document.createElement("input");
  colorEl.type = "color";
  colorEl.className = "comment-color-swatch";
  colorEl.title = "Comment box color";
  colorEl.addEventListener("input", () => {
    const box = getEditingGraph(store.state).commentBoxes.find((b) => b.id === commentId);
    if (box) box.color = colorEl.value;
    store.notify();
  });
  colorEl.addEventListener("mousedown", (e) => e.stopPropagation());

  return { titleEl, colorEl };
}
