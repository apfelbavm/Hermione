/** Client-only collapse-state storage for the plain-page nav rail (see components/Sidebar.tsx) —
 * same shape as client/theme.ts's own light/dark storage, minus a change-event: unlike the theme
 * toggle (which the canvas also needs to react to), the collapse state only ever needs to affect
 * plain CSS (`:root[data-sidebar="collapsed"]` — see style.css), so no other module needs to know it
 * changed. */

export type SidebarState = "expanded" | "collapsed";

const STORAGE_KEY = "hermione:sidebar";

export function getStoredSidebarState(): SidebarState | null {
  const value = localStorage.getItem(STORAGE_KEY);
  return value === "expanded" || value === "collapsed" ? value : null;
}

/** Whatever's currently applied to <html> (set either by the inline bootstrap script on first
 * paint, or a later toggle) — falls back to "expanded" (this app's own stated default) if the
 * attribute isn't set yet for some reason. */
export function getCurrentSidebarState(): SidebarState {
  const applied = document.documentElement.dataset.sidebar;
  return applied === "collapsed" ? "collapsed" : "expanded";
}

function applySidebarState(state: SidebarState): void {
  document.documentElement.dataset.sidebar = state;
  localStorage.setItem(STORAGE_KEY, state);
}

export function toggleSidebar(): void {
  applySidebarState(getCurrentSidebarState() === "collapsed" ? "expanded" : "collapsed");
}

/** The exact same bootstrap logic as getCurrentSidebarState/getStoredSidebarState above, but as a
 * plain string for app/layout.tsx's inline <script> (see THEME_BOOTSTRAP_SCRIPT's identical
 * reasoning) — "expanded" needs no attribute at all (style.css's default), so this only ever needs
 * to set the attribute when collapsed. */
export const SIDEBAR_BOOTSTRAP_SCRIPT = `(function(){try{if(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})==="collapsed")document.documentElement.dataset.sidebar="collapsed";}catch(e){}})();`;
