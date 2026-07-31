/** Client-only theme storage/detection for the plain pages around the Flow editor (see
 * style.css's `--pp-*` variables) — the editor itself never reads any of this, it stays fixed dark.
 * Kept in one place so the inline bootstrap script in app/layout.tsx (which must be a literal
 * string, not a module import, since it has to run before any JS module loads) and
 * components/ThemeToggle.tsx agree on the same storage key/logic. */

export type Theme = "light" | "dark";

const STORAGE_KEY = "hermione:theme";

export function getStoredTheme(): Theme | null {
  const value = localStorage.getItem(STORAGE_KEY);
  return value === "light" || value === "dark" ? value : null;
}

/** The OS/browser's own preference — `prefers-color-scheme` is the standard signal both surface,
 * there's no separate "browser vs OS" distinction to prioritize between in practice. Falls back to
 * "light" (this app's own stated default) if the media query API is unavailable for some reason. */
export function getPreferredTheme(): Theme {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Whatever's currently applied to <html> (set either by the inline bootstrap script on first
 * paint, or a later toggle) — falls back through stored/preferred if the attribute isn't set yet
 * for some reason. */
export function getCurrentTheme(): Theme {
  const applied = document.documentElement.dataset.theme;
  if (applied === "light" || applied === "dark") return applied;
  return getStoredTheme() ?? getPreferredTheme();
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(STORAGE_KEY, theme);
}

/** The exact same bootstrap logic as getCurrentTheme/getStoredTheme/getPreferredTheme above, but as
 * a plain string for app/layout.tsx's inline <script> — that one has to run standalone before
 * hydration, so it can't import this module. Keep the two in sync by hand; they're small and
 * unlikely to drift, and a real shared bundle isn't an option for pre-hydration inline code. */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var s=localStorage.getItem(${JSON.stringify(STORAGE_KEY)});var t=(s==="light"||s==="dark")?s:(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.dataset.theme=t;}catch(e){}})();`;
