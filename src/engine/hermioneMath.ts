import { Color } from "./color";

export namespace HermioneMath {
  export function lerpNumber(a: number, b: number, alpha: number): number {
    return a + (b - a) * HermioneMath.clamp(alpha);
  }

  export function lerpColor(a: Color, b: Color, alpha: number): Color {
    return new Color(HermioneMath.lerpNumber(a.getR(), b.getR(), alpha), HermioneMath.lerpNumber(a.getG(), b.getG(), alpha), HermioneMath.lerpNumber(a.getB(), b.getB(), alpha), HermioneMath.lerpNumber(a.getA(), b.getA(), alpha));
  }

  export function clamp(a: number, min: number = 0.0, max: number = 1.0): number {
    if (a < min) return min;
    if (a > max) return max;
    return a;
  }
}
