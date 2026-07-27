import { COMMENT_HEADER_HEIGHT, computeCommentScreenRect } from "../render/commentGeometry";
import { CHAR_WIDTH } from "../render/layout";
import type { Store } from "../state/store";

interface TitleEntry {
  el: HTMLInputElement;
}

export interface CommentOverlay {
  sync: () => void;
}

/** Keeps one editable title <input> per comment box, sized to its text and pinned to the header. */
export function createCommentOverlay(overlay: HTMLElement, store: Store): CommentOverlay {
  const titles = new Map<string, TitleEntry>();

  function sync(): void {
    const { graph, camera } = store.state;
    const seen = new Set<string>();

    for (const box of graph.commentBoxes) {
      seen.add(box.id);
      let entry = titles.get(box.id);
      if (!entry) {
        entry = createTitleEntry(box.id, store);
        titles.set(box.id, entry);
        overlay.appendChild(entry.el);
      }

      const rect = computeCommentScreenRect(box, camera);
      const widthPx = Math.max(60, box.text.length * CHAR_WIDTH + 16) * camera.zoom;
      entry.el.style.position = "absolute";
      entry.el.style.left = `${rect.screenX + 6 * camera.zoom}px`;
      entry.el.style.top = `${rect.screenY}px`;
      entry.el.style.width = `${Math.min(widthPx, rect.width - 12 * camera.zoom)}px`;
      entry.el.style.height = `${COMMENT_HEADER_HEIGHT * camera.zoom}px`;
      entry.el.style.fontSize = `${12 * camera.zoom}px`;

      if (document.activeElement !== entry.el) {
        entry.el.value = box.text;
      }
    }

    for (const [id, entry] of titles) {
      if (!seen.has(id)) {
        entry.el.remove();
        titles.delete(id);
      }
    }
  }

  return { sync };
}

function createTitleEntry(commentId: string, store: Store): TitleEntry {
  const el = document.createElement("input");
  el.type = "text";
  el.className = "comment-title";
  el.autocomplete = "off";

  const commit = () => {
    const box = store.state.graph.commentBoxes.find((b) => b.id === commentId);
    if (box) box.text = el.value;
    store.notify();
  };
  el.addEventListener("input", commit);
  el.addEventListener("mousedown", (e) => e.stopPropagation());

  return { el };
}
