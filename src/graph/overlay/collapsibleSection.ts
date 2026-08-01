/** Wires a sidebar section's header to toggle a `.collapsed` class on its section wrapper —
 * collapsed state lives purely as a DOM class (no store state needed), since render() never
 * touches the header/section wrapper elements, only rebuilds the list inside them. */
export function setupCollapsibleSection(headerEl: HTMLElement, sectionEl: HTMLElement): void {
  headerEl.addEventListener("click", () => {
    sectionEl.classList.toggle("collapsed");
  });
}

/** Toggles the `.panel-section-empty` class (see style.css) that hides the header's ▾/▸ expand
 * arrow while the section's own list has nothing in it — there's nothing to expand/collapse, so
 * the arrow would just be a dead affordance. Called from each panel's own render() with whether
 * its particular list (functions/variables/scripts/io entries) is currently empty. */
export function setSectionEmpty(sectionEl: HTMLElement, empty: boolean): void {
  sectionEl.classList.toggle("panel-section-empty", empty);
}
