import { NodeColorCategory } from "./types";
import type { PinType } from "./types";

function currentGraphTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

interface SurfacePalette {
  canvasBg: string;
  gridLineMinor: string;
  gridLineMajor: string;
  nodeBodyBg: string;
  nodeBorder: string;
  textPrimary: string;
  textMuted: string;
  nodeTopHighlightRgb: string;
  nodeTopHighlightAlpha: number;
  headerShadeRgb: string;
}

const DARK_SURFACE: SurfacePalette = {
  canvasBg: "#1e2126",
  gridLineMinor: "#2a2e35",
  gridLineMajor: "#333842",
  nodeBodyBg: "#121314",
  nodeBorder: "#3d4148",
  textPrimary: "#e8e8e8",
  textMuted: "#9aa0a8",
  nodeTopHighlightRgb: "255, 255, 255",
  nodeTopHighlightAlpha: 0.3,
  headerShadeRgb: "0, 0, 0",
};

const LIGHT_SURFACE: SurfacePalette = {
  canvasBg: "#ffffff",
  gridLineMinor: "#edf0f5",
  gridLineMajor: "#e7ebf1",
  nodeBodyBg: "#edeff5",
  nodeBorder: "#c9ced4",
  textPrimary: "#1b1e22",
  textMuted: "#5b6169",
  nodeTopHighlightRgb: "0, 0, 0",
  nodeTopHighlightAlpha: 0.06,
  headerShadeRgb: "255, 255, 255",
};

function surface(): SurfacePalette {
  return currentGraphTheme() === "light" ? LIGHT_SURFACE : DARK_SURFACE;
}

export const Colors = {
  get PIN_COLORS(): Record<PinType, string> {
    return {
      exec: surface().textPrimary,
      boolean: "#a5322f",
      number: "#67c556",
      string: "#c542a0",
      object: "#4f9bd6",
      date: "#d6a23b",
      enum: "#1c5f3e",
      struct: "#142f9c",
    };
  },

  AXIS_LINE: "#111111",

  NODE_HEADER_DEFAULT: "#78818b",
  NODE_BORDER_SELECTED: "#e8b339",

  get NODE_CATEGORY_COLORS(): string[] {
    const colors: string[] = [];
    colors[NodeColorCategory.Default] = this.NODE_HEADER_DEFAULT;
    colors[NodeColorCategory.Events] = "#8a3b3b";
    colors[NodeColorCategory.Integration] = "#3b6b8a";
    colors[NodeColorCategory.Math] = this.PIN_COLORS.number;
    colors[NodeColorCategory.Date] = this.PIN_COLORS.date;
    colors[NodeColorCategory.Boolean] = this.PIN_COLORS.boolean;
    colors[NodeColorCategory.Debug] = "#6b6b3b";
    colors[NodeColorCategory.Variables] = "#7a4f9b";
    colors[NodeColorCategory.String] = this.PIN_COLORS.string;
    colors[NodeColorCategory.Collections] = "#5a4a8a";
    return colors;
  },

  get WIRE_COLOR_EXEC(): string {
    return this.PIN_COLORS.exec;
  },

  // --- Surface colors — these DO follow the light/dark toggle (see SurfacePalette above). ---
  get CANVAS_BG(): string {
    return surface().canvasBg;
  },
  get GRID_LINE_MINOR(): string {
    return surface().gridLineMinor;
  },
  get GRID_LINE_MAJOR(): string {
    return surface().gridLineMajor;
  },
  get NODE_BODY_BG(): string {
    return surface().nodeBodyBg;
  },
  get NODE_BORDER(): string {
    return surface().nodeBorder;
  },
  get TEXT_PRIMARY(): string {
    return surface().textPrimary;
  },
  get TEXT_MUTED(): string {
    return surface().textMuted;
  },
  get NODE_TOP_HIGHLIGHT_RGB(): string {
    return surface().nodeTopHighlightRgb;
  },
  get NODE_TOP_HIGHLIGHT_ALPHA(): number {
    return surface().nodeTopHighlightAlpha;
  },
  get HEADER_SHADE_RGB(): string {
    return surface().headerShadeRgb;
  },
  get IS_LIGHT_THEME(): boolean {
    return currentGraphTheme() === "light";
  },

  /** Converts a "#rrggbb" hex color (e.g. from a native color picker) into an rgba() string at the given alpha. */
  hexToRgba(hex: string, alpha: number): string {
    const clean = hex.replace("#", "");
    const bigint = Number.parseInt(clean, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  },
};
