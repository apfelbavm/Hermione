export class Vector2d {
  x: number = 0.0;
  y: number = 0.0;

  constructor(x: number = 0.0, y: number = 0.0) {
    this.x = x;
    this.y = y;
  }

  add(other: Vector2d): Vector2d {
    return new Vector2d(this.x + other.x, this.y + other.y);
  }

  subtract(other: Vector2d): Vector2d {
    return new Vector2d(this.x - other.x, this.y - other.y);
  }

  multiply(other: Vector2d): Vector2d {
    return new Vector2d(this.x * other.x, this.y * other.y);
  }

  divide(other: Vector2d): Vector2d {
    return new Vector2d(this.x / other.x, this.y / other.y);
  }

  length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  normalize(): Vector2d {
    const len = this.length();
    if (len === 0) {
      return new Vector2d(0, 0);
    }
    return new Vector2d(this.x / len, this.y / len);
  }

  scale(scalar: number): Vector2d {
    return new Vector2d(this.x * scalar, this.y * scalar);
  }

  toString(): string {
    return `X=(${this.x}, Y=${this.y}`;
  }
}
