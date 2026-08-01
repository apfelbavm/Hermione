// Vanilla-DOM equivalent of IconManager.ChevronDownIcon/ChevronRightIcon — used by menus built
// with raw DOM calls rather than React, so they can't render the shared component directly.
export function chevronSvg(direction: "down" | "right"): string {
  const d = direction === "down" ? "M3 6 8 11l5-5" : "M6 3 11 8l-5 5";
  return `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}" /></svg>`;
}
