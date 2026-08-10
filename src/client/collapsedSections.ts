/** Per-browser persistence for sidebar section collapse state (see CollapsibleSection.tsx and
 * LibraryPanel.tsx) — keyed by each section's DOM id, same `hermione:` localStorage convention as
 * client/sidebar.ts and useResizablePanels.ts. */

const COLLAPSED_PREFIX = "hermione:section-collapsed:";
const LIBRARY_EXPANDED_GROUPS_KEY = "hermione:library-expanded-groups";

export function getStoredCollapsed(id: string): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(COLLAPSED_PREFIX + id) === "1";
}

export function setStoredCollapsed(id: string, collapsed: boolean): void {
  localStorage.setItem(COLLAPSED_PREFIX + id, collapsed ? "1" : "0");
}

export function getStoredExpandedGroups(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(LIBRARY_EXPANDED_GROUPS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function setStoredExpandedGroups(expanded: Set<string>): void {
  localStorage.setItem(LIBRARY_EXPANDED_GROUPS_KEY, JSON.stringify([...expanded]));
}
