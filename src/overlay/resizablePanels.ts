/** Wires a thin drag handle to resize an adjacent flex sibling (the sidebar's width, the log
 * panel's height) by adjusting its flex-basis — persisted to localStorage so a resize survives a
 * reload, restored (clamped to the CURRENT viewport, in case the window shrank since) on setup.
 * The handle always sits on the side of `target` that's closer to the OTHER flex content, so
 * dragging it toward that content always grows `target` and away from it always shrinks it —
 * true for both the sidebar (handle on its left, growing means dragging left) and the log panel
 * (handle on its top, growing means dragging up), which is why one formula covers both. */
function wireResizeHandle(opts: {
  handle: HTMLElement;
  target: HTMLElement;
  storageKey: string;
  min: number;
  max: () => number;
  getPointerPos: (e: PointerEvent) => number;
  getSize: (rect: DOMRect) => number;
}): void {
  const { handle, target, storageKey, min, max, getPointerPos, getSize } = opts;

  const stored = Number(localStorage.getItem(storageKey));
  if (stored > 0) target.style.flexBasis = `${clamp(stored, min, max())}px`;

  handle.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    document.body.classList.add("resizing");
    const startPos = getPointerPos(e);
    const startSize = getSize(target.getBoundingClientRect());

    function onMove(moveEvent: PointerEvent): void {
      const delta = getPointerPos(moveEvent) - startPos;
      target.style.flexBasis = `${clamp(startSize - delta, min, max())}px`;
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
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Sidebar (width) and log panel (height) both get a drag-to-resize handle — see index.html for
 * the #sidebar-resizer/#log-resizer elements this binds to. */
export function setupResizablePanels(): void {
  wireResizeHandle({
    handle: document.getElementById("sidebar-resizer")!,
    target: document.getElementById("sidebar")!,
    storageKey: "hermione:sidebar-width",
    min: 200,
    max: () => window.innerWidth * 0.7,
    getPointerPos: (e) => e.clientX,
    getSize: (r) => r.width,
  });

  wireResizeHandle({
    handle: document.getElementById("log-resizer")!,
    target: document.getElementById("log-container")!,
    storageKey: "hermione:log-height",
    min: 60,
    max: () => window.innerHeight * 0.7,
    getPointerPos: (e) => e.clientY,
    getSize: (r) => r.height,
  });
}
