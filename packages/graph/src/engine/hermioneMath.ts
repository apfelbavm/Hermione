export namespace HermioneMath {
  export function lerpNumber(a: number, b: number, alpha: number): number {
    return a + (b - a) * HermioneMath.clamp(alpha);
  }

  export function clamp(a: number, min: number = 0.0, max: number = 1.0): number {
    if (a < min) return min;
    if (a > max) return max;
    return a;
  }
}
