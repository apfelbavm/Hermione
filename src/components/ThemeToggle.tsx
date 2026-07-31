"use client";

import { useEffect, useState } from "react";
import { i18n } from "@i18n";
import { applyTheme, getCurrentTheme, type Theme } from "../client/theme";

/** Server-rendered HTML knows nothing about localStorage/prefers-color-scheme, so this always
 * starts in a neutral "not yet mounted" state and only shows the real theme once an effect runs
 * client-side — avoids a hydration mismatch between what the server guessed and what's actually
 * applied (see app/layout.tsx's inline bootstrap script, which sets the real theme before this ever
 * mounts). */
export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(getCurrentTheme());
    setMounted(true);
  }, []);

  function toggle(): void {
    const next: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  }

  return (
    <button
      type="button"
      className="theme-toggle-button"
      onClick={toggle}
      title={i18n.components.theme_toggle.title}
    >
      {mounted
        ? theme === "dark"
          ? i18n.components.theme_toggle.dark
          : i18n.components.theme_toggle.light
        : i18n.components.theme_toggle.loading}
    </button>
  );
}
