/** Wires a sidebar section's header to toggle a `.collapsed` class on its section wrapper —
 * collapsed state lives purely as a DOM class (no store state needed), since render() never
 * touches the header/section wrapper elements, only rebuilds the list inside them. */
export function setupCollapsibleSection(headerEl: HTMLElement, sectionEl: HTMLElement): void {
  headerEl.addEventListener("click", () => {
    sectionEl.classList.toggle("collapsed");
  });
}
