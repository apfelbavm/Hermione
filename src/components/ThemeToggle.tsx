"use client";

import { useEffect, useState } from "react";
import { i18n } from "@i18n";
import { applyTheme, getCurrentTheme, type Theme } from "../client/theme";
import { IconManager } from "../shared/iconManager";

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
    <button type="button" className="theme-toggle-button" onClick={toggle} title={i18n.components.theme_toggle.title}>
      {mounted && (theme === "dark" ? <IconManager.ThemeDarkIcon /> : <IconManager.ThemeLightIcon />)}
      {mounted ? (theme === "dark" ? i18n.components.theme_toggle.dark : i18n.components.theme_toggle.light) : i18n.components.theme_toggle.loading}
    </button>
  );
}
