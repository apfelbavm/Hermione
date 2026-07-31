"use client";

import { useEffect } from "react";

/** Wires a thin drag handle to resize an adjacent flex sibling (a sidebar's width, the log panel's
 * height) by adjusting its flex-basis — persisted to localStorage so a resize survives a reload,
 * restored (clamped to the CURRENT viewport, in case the window shrank since) on setup. Returns a
 * cleanup function removing the one listener it attaches (pointerdown); the pointermove/pointerup
 * pair added per-drag already remove themselves in onUp, so there's nothing else to unwind.
 * `growSign` says which pointer direction grows `target`: -1 (the default) when the handle sits on
 * the side of `target` closer to the OTHER flex content — so dragging TOWARD that content grows
 * `target` — true for the right sidebar (handle on its left, growing means dragging left) and the
 * log panel (handle on its top, growing means dragging up); +1 when target sits on the SAME side
 * the pointer coordinate increases toward, e.g. the left sidebar (handle on its right, growing
 * means dragging right, away from it). */
function wireResizeHandle(opts: {
  handle: HTMLElement;
  target: HTMLElement;
  storageKey: string;
  min: number;
  max: () => number;
  getPointerPos: (e: PointerEvent) => number;
  getSize: (rect: DOMRect) => number;
  growSign?: 1 | -1;
}): () => void {
  const { handle, target, storageKey, min, max, getPointerPos, getSize, growSign = -1 } = opts;

  const stored = Number(localStorage.getItem(storageKey));
  if (stored > 0) target.style.flexBasis = `${clamp(stored, min, max())}px`;

  function onPointerDown(e: PointerEvent): void {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    document.body.classList.add("resizing");
    const startPos = getPointerPos(e);
    const startSize = getSize(target.getBoundingClientRect());

    function onMove(moveEvent: PointerEvent): void {
      const delta = getPointerPos(moveEvent) - startPos;
      target.style.flexBasis = `${clamp(startSize + growSign * delta, min, max())}px`;
    }
    function onUp(upEvent: PointerEvent): void {
      handle.releasePointerCapture(upEvent.pointerId);
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      document.body.classList.remove("resizing");
      localStorage.setItem(storageKey, String(getSize(target.getBoundingClientRect())));
    }
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  }

  handle.addEventListener("pointerdown", onPointerDown);
  return () => handle.removeEventListener("pointerdown", onPointerDown);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Both sidebars (width) and the log panel (height) each get a drag-to-resize handle — see
 * AppShellMarkup.tsx for the #left-sidebar-resizer/#right-sidebar-resizer/#log-resizer elements
 * this binds to. Call once from AppShell's top level (not conditionally). */
export function useResizablePanels(): void {
  useEffect(() => {
    const teardowns = [
      wireResizeHandle({
        handle: document.getElementById("left-sidebar-resizer")!,
        target: document.getElementById("left-sidebar")!,
        storageKey: "hermione:left-sidebar-width",
        min: 200,
        max: () => window.innerWidth * 0.35,
        getPointerPos: (e) => e.clientX,
        getSize: (r) => r.width,
        growSign: 1,
      }),
      wireResizeHandle({
        handle: document.getElementById("right-sidebar-resizer")!,
        target: document.getElementById("right-sidebar")!,
        storageKey: "hermione:right-sidebar-width",
        min: 200,
        max: () => window.innerWidth * 0.35,
        getPointerPos: (e) => e.clientX,
        getSize: (r) => r.width,
      }),
      wireResizeHandle({
        handle: document.getElementById("log-resizer")!,
        target: document.getElementById("log-container")!,
        storageKey: "hermione:log-height",
        min: 60,
        max: () => window.innerHeight * 0.7,
        getPointerPos: (e) => e.clientY,
        getSize: (r) => r.height,
      }),
    ];
    return () => teardowns.forEach((teardown) => teardown());
  }, []);
}
