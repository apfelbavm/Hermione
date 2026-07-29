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
    const value =
      (((this.r & 255) << 24) |
        ((this.g & 255) << 16) |
        ((this.b & 255) << 8) |
        (this.a & 255)) >>>
      0;

    return `#${value.toString(16).padStart(8, "0").toUpperCase()}`;
  }

  toString(): string {
    return `R: ${this.r}, G: ${this.g}, B: ${this.b}, A: ${this.a})`;
  }
}

/** Every color constant used by the canvas renderer/overlay (was src/engine/color.ts) — plain
 * hex strings, not Color instances, so every existing `ctx.fillStyle = Colors.NODE_BORDER`-style
 * call site keeps working unchanged. */
export namespace Colors {
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
  // The world-space x=0/y=0 origin axes (see drawGrid.ts) — deliberately plain black, heavier than
  // even the major grid lines, so the true origin always reads as a fixed landmark on the canvas.
  export const AXIS_LINE = "#000000";
  export const NODE_HEADER_DEFAULT = "#78818b";
  // Referenced by more than one NODE_HEADER_BG entry below — a plain local so those entries can
  // never drift apart from each other.
  const FLOW_CONTROL_BG = "#3b6b8a";
  export const NODE_HEADER_BG: Record<string, string> = {
    Events: "#8a3b3b",
    "Flow Control": NODE_HEADER_DEFAULT,
    Math: PIN_COLORS.number,
    Debug: "#6b6b3b",
    Variables: "#7a4f9b",
    // Neither has a separate color of its own anymore — both read as the same category as Flow
    // Control (Branch, Delay, Sequence, etc.).
    Actions: FLOW_CONTROL_BG,
    Auth: FLOW_CONTROL_BG,
    // Same color as a "string" pin/wire, tying the whole node category to that type visually.
    String: PIN_COLORS.string,
    Collections: "#5a4a8a",
    // Entry/Return/Call (see function.ts) — function-flow related, but a distinct concept from
    // Flow Control itself, so a neutral grey (matching the generic fallback) rather than its own hue.
    Functions: FLOW_CONTROL_BG,
  };
  export const NODE_BODY_BG = "#121314";
  export const NODE_BORDER = "#3d4148";
  export const NODE_BORDER_SELECTED = "#e8b339";
  export const WIRE_COLOR_EXEC = PIN_COLORS.exec;
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
}
