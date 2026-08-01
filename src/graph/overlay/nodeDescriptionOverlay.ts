import type { Camera } from "../render/camera";
import type { NodeScreenGeometry } from "../render/nodeGeometry";
import { getEditingGraph, type Store } from "../../state/store";

/** World-space gap kept between the bubble's bottom tip and the node's own top edge — scaled by
 * zoom below, same as every other screen-space measurement derived from a world constant. */
const GAP_WORLD = 10;

interface BubbleEntry {
  el: HTMLDivElement;
}

export interface NodeDescriptionOverlay {
  sync: (geometries: ReadonlyMap<string, NodeScreenGeometry>) => void;
}

/** Keeps one speech-bubble <div> alive per node that has a non-empty NodeInstance.description (see
 * detailsPanel.ts's own Description field), positioned just above and left-aligned with that node,
 * re-synced every frame — same "persistent per-id DOM entry, create/update/prune each pass" shape
 * as commentOverlay.ts/widgetSync.ts, just simpler (read-only display, no editing or drag handling
 * of its own). Anchored via `top`/`left` + `transform: translateY(-100%)` (see .node-description-
 * bubble in style.css) rather than measuring the bubble's rendered size first — that CSS trick pins
 * the element's own BOTTOM edge to the given y regardless of how tall the wrapped text turns out to
 * be, so no layout read is needed; the x coordinate is left untransformed so the bubble's own left
 * edge lines up with the node's, instead of being centered over it. */
export function createNodeDescriptionOverlay(overlay: HTMLElement, store: Store): NodeDescriptionOverlay {
  const entries = new Map<string, BubbleEntry>();

  function sync(geometries: ReadonlyMap<string, NodeScreenGeometry>): void {
    const graph = getEditingGraph(store.state);
    const camera: Camera = store.state.camera;
    const seen = new Set<string>();

    for (const node of graph.nodes) {
      const text = node.description?.trim();
      if (!text) continue;
      const geo = geometries.get(node.id);
      if (!geo) continue;

      seen.add(node.id);
      let entry = entries.get(node.id);
      if (!entry) {
        const el = document.createElement("div");
        el.className = "node-description-bubble";
        entry = { el };
        entries.set(node.id, entry);
        overlay.appendChild(el);
      }

      entry.el.textContent = text;
      entry.el.style.left = `${geo.screenX}px`;
      entry.el.style.top = `${geo.screenY - GAP_WORLD * camera.zoom}px`;
      entry.el.style.fontSize = `${12 * camera.zoom}px`;
      entry.el.style.maxWidth = `${220 * camera.zoom}px`;
      // Drives every other zoom-scaled measurement in style.css's .node-description-bubble rules
      // (padding, border, the tail's offset/size) via calc(Npx * var(--zoom)) — padding in
      // particular has to scale in lockstep with max-width/font-size above, or its FIXED size would
      // eat a zoom-invariant chunk out of a shrinking max-width, leaving disproportionately less
      // room for text at low zoom and wrapping lines that fit fine at zoom 1.
      entry.el.style.setProperty("--zoom", String(camera.zoom));
    }

    for (const [id, entry] of entries) {
      if (!seen.has(id)) {
        entry.el.remove();
        entries.delete(id);
      }
    }
  }

  return { sync };
}
