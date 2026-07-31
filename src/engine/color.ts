import { HermioneMath } from "./hermioneMath";
import type { PinType } from "./types";

export class Color {
  private r: number = 0;
  private g: number = 0;
  private b: number = 0;
  private a: number = 255;

  constructor(r: number, g: number, b: number, a: number = 255) {
    this.r = HermioneMath.clamp(r, 0, 255);
    this.g = HermioneMath.clamp(g, 0, 255);
    this.b = HermioneMath.clamp(b, 0, 255);
    this.a = HermioneMath.clamp(a, 0, 255);
  }

  getR() {
    return this.r;
  }
  getG() {
    return this.g;
  }
  getB() {
    return this.b;
  }
  getA() {
    return this.a;
  }

  setR(r: number) {
    this.r = HermioneMath.clamp(r, 0, 255);
  }
  setG(g: number) {
    this.g = HermioneMath.clamp(g, 0, 255);
  }
  setB(b: number) {
    this.b = HermioneMath.clamp(b, 0, 255);
  }
  setA(a: number) {
    this.a = HermioneMath.clamp(a, 0, 255);
  }

  static fromHex(hex: string): Color {
    const color = new Color(0, 0, 0, 255);

    const clean = hex.replace("#", "");

    if (clean.length === 6) {
      const bigint = Number.parseInt(clean, 16);
      color.r = (bigint >> 16) & 255;
      color.g = (bigint >> 8) & 255;
      color.b = bigint & 255;
    } else if (clean.length === 8) {
      const bigint = Number.parseInt(clean, 16);
      color.r = (bigint >> 24) & 255;
      color.g = (bigint >> 16) & 255;
      color.b = (bigint >> 8) & 255;
      color.a = bigint & 255;
    }
    return color;
  }

  toHex(): string {
    const value = (((this.r & 255) << 24) | ((this.g & 255) << 16) | ((this.b & 255) << 8) | (this.a & 255)) >>> 0;

    return `#${value.toString(16).padStart(8, "0").toUpperCase()}`;
  }

  toString(): string {
    return `R: ${this.r}, G: ${this.g}, B: ${this.b}, A: ${this.a})`;
  }
}

/** Which theme the canvas renderer should currently draw in — mirrors the `data-theme` attribute
 * ThemeToggle/the inline bootstrap script (see client/theme.ts) set on <html> for the plain pages
 * around the editor, so a single global toggle covers both the DOM chrome (styled via style.css's
 * `--pp-*` variables) and this canvas-drawn content (which CSS variables can't reach — a 2D canvas
 * context has no notion of them). Defaults to "dark" outside a browser (never actually hit — this
 * only ever runs client-side — but keeps the function total). */
function currentGraphTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/** Surface colors (background/grid/node body/border/text) that DO follow the theme toggle — kept
 * separate from the type/category/status colors below them, which deliberately do NOT (see each
 * group's own comment). */
interface SurfacePalette {
  canvasBg: string;
  gridLineMinor: string;
  gridLineMajor: string;
  nodeBodyBg: string;
  nodeBorder: string;
  textPrimary: string;
  textMuted: string;
  /** The node's own top-edge sheen (see drawNodes.ts's drawTopHighlight) — a light-from-above
   * highlight reads as a lightening in dark mode, but would be invisible painted the same way over
   * a light node body, so light mode gets a faint darkening (a subtle inset shadow) instead. Split
   * into channel/alpha rather than one rgba() string so drawTopHighlight can build both its opaque
   * and fully-transparent gradient stops from the same color, whichever theme picked it. */
  nodeTopHighlightRgb: string;
  nodeTopHighlightAlpha: number;
  /** The node header's own left-to-right falloff (see drawNodes.ts's headerShade gradient) — a
   * dark falloff reads as a sheen over a dark-mode header, but the same black wash looks muddy
   * once the rest of the chrome has gone light, so light mode ramps toward white instead. */
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
  canvasBg: "#eef0f3",
  gridLineMinor: "#dfe2e6",
  gridLineMajor: "#cdd2d8",
  nodeBodyBg: "#ffffff",
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

/** Every color constant used by the canvas renderer/overlay (was src/engine/color.ts) — plain hex
 * strings (or, for the handful that follow the light/dark toggle, getters resolving to one), not
 * Color instances, so every existing `ctx.fillStyle = Colors.NODE_BORDER`-style call site keeps
 * working unchanged regardless of which category a given constant falls into. */
export const Colors = {
  /** Per-pin-TYPE colors — deliberately theme-independent, EXCEPT exec: an exec wire/arrow is
   * meant to read as "the flow of control," the same visual role as body text, so it tracks
   * TEXT_PRIMARY (near-white on dark, near-black on light) instead of a fixed hue like every other
   * pin type below it. */
  get PIN_COLORS(): Record<PinType, string> {
    return {
      exec: surface().textPrimary,
      boolean: "#a5322f",
      number: "#3b8a5c",
      string: "#c542a0",
      object: "#4f9bd6",
      date: "#d6a23b",
      // Dark olive green — distinct from "number"'s own teal-green above — matching Unreal's enum
      // pin color convention (see PinType's own doc comment for why it's a separate type at all).
      enum: "#1f6b45",
    };
  },

  // The world-space x=0/y=0 origin axes (see drawGrid.ts) — deliberately plain black regardless of
  // theme, heavier than even the major grid lines, so the true origin always reads as a fixed
  // landmark on the canvas (reads fine against either a light or dark canvas background).
  AXIS_LINE: "#000000",

  // Node category header colors, and the state/accent colors below them (selection, execution,
  // breakpoint, latent) — same "stays fixed so it reads consistently at a glance" reasoning as
  // PIN_COLORS above, just for categories/status instead of pin type.
  NODE_HEADER_DEFAULT: "#78818b",
  NODE_BORDER_SELECTED: "#e8b339",

  get NODE_HEADER_BG(): Record<string, string> {
    const flowControlBg = "#3b6b8a";
    return {
      Events: "#8a3b3b",
      "Flow Control": this.NODE_HEADER_DEFAULT,
      Math: this.PIN_COLORS.number,
      // Same color as a "date" pin/wire, tying the whole node category to that type visually.
      Date: this.PIN_COLORS.date,
      // Same color as a "boolean" pin/wire, tying the whole node category to that type visually.
      Boolean: this.PIN_COLORS.boolean,
      Debug: "#6b6b3b",
      Variables: "#7a4f9b",
      // Neither has a separate color of its own anymore — both read as the same category as Flow
      // Control (Branch, Delay, Sequence, etc.).
      Actions: flowControlBg,
      Auth: flowControlBg,
      // Same color as a "string" pin/wire, tying the whole node category to that type visually.
      String: this.PIN_COLORS.string,
      Collections: "#5a4a8a",
      // Entry/Return/Call (see function.ts) — function-flow related, but a distinct concept from
      // Flow Control itself, so a neutral grey (matching the generic fallback) rather than its own hue.
      Functions: flowControlBg,
    };
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
