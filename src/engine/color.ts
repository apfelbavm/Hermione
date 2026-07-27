import { HermioneMath } from "./hermioneMath";

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
