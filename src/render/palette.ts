import type { PinType } from "../engine/types";

export const PIN_COLORS: Record<PinType, string> = {
  exec: "#f2f2f2",
  boolean: "#a5322f",
  number: "#3b8a5c",
  string: "#c542a0",
  object: "#4f9bd6",
};

export const CANVAS_BG = "#1e2126";
export const GRID_LINE_MINOR = "#2a2e35";
export const GRID_LINE_MAJOR = "#333842";
export const NODE_HEADER_BG: Record<string, string> = {
  Events: "#8a3b3b",
  "Flow Control": "#3b6b8a",
  Math: "#3b8a5c",
  Debug: "#6b6b3b",
  Variables: "#7a4f9b",
  Actions: "#9b6b2f",
  // Same color as a "string" pin/wire, tying the whole node category to that type visually.
  String: PIN_COLORS.string,
  Collections: "#5a4a8a",
};
export const NODE_HEADER_DEFAULT = "#44494f";
export const NODE_BODY_BG = "#2b2f36";
export const NODE_BORDER = "#3d4148";
export const NODE_BORDER_SELECTED = "#e8b339";
export const WIRE_COLOR_EXEC = "#f2f2f2";
export const TEXT_PRIMARY = "#e8e8e8";
export const TEXT_MUTED = "#9aa0a8";

/** Converts a "#rrggbb" hex color (e.g. from a native color picker) into an rgba() string at the given alpha. */
export function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const bigint = Number.parseInt(clean, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
