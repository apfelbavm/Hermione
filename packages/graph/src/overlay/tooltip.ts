const HOVER_DELAY_MS = 500;
const VIEWPORT_MARGIN = 8;
// Gap kept between the cursor tip and the tooltip's top-left corner, so it sits at the mouse's
// bottom-right rather than directly under the pointer (which would otherwise sit right under/on
// top of the cursor itself and immediately trigger a "moved off the hovered thing" mouseleave).
const CURSOR_GAP_X = 14;
const CURSOR_GAP_Y = 18;

let tooltipEl: HTMLDivElement | null = null;

function ensureTooltipEl(): HTMLDivElement {
  if (!tooltipEl) {
    tooltipEl = document.createElement("div");
    tooltipEl.className = "hover-tooltip";
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}

/** `screenPos` (viewport coordinates, e.g. straight off a MouseEvent's clientX/clientY) placed at
 * the tooltip's top-left corner, clamped to stay fully inside the viewport rather than running off
 * the right/bottom edge. Shared by showTooltip (first appearance) and moveTooltip (following the
 * cursor afterward) so both position it identically. */
function positionAt(screenPos: { x: number; y: number }): void {
  const el = ensureTooltipEl();
  const rect = el.getBoundingClientRect();
  const x = Math.max(VIEWPORT_MARGIN, Math.min(screenPos.x, window.innerWidth - rect.width - VIEWPORT_MARGIN));
  const y = Math.max(VIEWPORT_MARGIN, Math.min(screenPos.y, window.innerHeight - rect.height - VIEWPORT_MARGIN));
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}

/** Offsets a MouseEvent's viewport position by the cursor gap above — the position every caller
 * below should pass to showTooltip/moveTooltip, so the gap stays identical everywhere. */
export function cursorOffset(e: MouseEvent): { x: number; y: number } {
  return { x: e.clientX + CURSOR_GAP_X, y: e.clientY + CURSOR_GAP_Y };
}

/** Shows the shared hover-tooltip element at `screenPos` with `text` — used by both the canvas node
 * hover (nodeTooltip.ts) and the create-node menu's row hover (attachHoverTooltip below), so the
 * two look identical. */
export function showTooltip(screenPos: { x: number; y: number }, text: string): void {
  const el = ensureTooltipEl();
  el.textContent = text;
  el.style.display = "block";
  positionAt(screenPos);
}

/** Repositions an already-visible tooltip to follow the cursor while the same thing is still being
 * hovered — a no-op if nothing is currently showing (e.g. still waiting out the hover delay), so
 * every mousemove handler below can call this unconditionally without tracking visibility itself. */
export function moveTooltip(screenPos: { x: number; y: number }): void {
  if (!tooltipEl || tooltipEl.style.display !== "block") return;
  positionAt(screenPos);
}

export function hideTooltip(): void {
  if (tooltipEl) tooltipEl.style.display = "none";
}

/** Generic "hover this real DOM element for HOVER_DELAY_MS, then show a tooltip that follows the
 * cursor for as long as it keeps hovering" wiring — used for the create-node menu's rows (see
 * nodeSearchMenu.ts) and the Functions sidebar list's rows (see functionsPanel.ts). Canvas nodes
 * have no DOM element of their own (they're canvas-drawn) so they drive their own mousemove-based
 * timer instead — see nodeTooltip.ts — but both render through the same showTooltip/moveTooltip/
 * hideTooltip trio above so they look and behave identically. `getText` is called only once the
 * delay has elapsed (not at mouseenter time), so it always sees whatever's current by then;
 * returning a falsy value shows nothing. */
export function attachHoverTooltip(el: HTMLElement, getText: () => string | undefined | null): void {
  let timer: number | null = null;
  // Read by the pending timeout at fire time (not the position captured back at mouseenter) so the
  // tooltip appears wherever the cursor actually is once the delay elapses, not where it entered.
  let lastPos = { x: 0, y: 0 };

  function clear(): void {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  }

  el.addEventListener("mouseenter", (e) => {
    clear();
    lastPos = cursorOffset(e);
    timer = window.setTimeout(() => {
      const text = getText();
      if (text) showTooltip(lastPos, text);
    }, HOVER_DELAY_MS);
  });
  el.addEventListener("mousemove", (e) => {
    lastPos = cursorOffset(e);
    moveTooltip(lastPos);
  });
  el.addEventListener("mouseleave", () => {
    clear();
    hideTooltip();
  });
  el.addEventListener("mousedown", () => {
    clear();
    hideTooltip();
  });
}
