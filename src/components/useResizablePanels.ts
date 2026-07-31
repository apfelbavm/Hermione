"use client";

import { useEffect } from "react";

function wireResizeHandle(opts: { handle: HTMLElement; target: HTMLElement; storageKey: string; min: number; max: () => number; getPointerPos: (e: PointerEvent) => number; getSize: (rect: DOMRect) => number; growSign?: 1 | -1 }): () => void {
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
