export class Vector3d {
  x: number = 0.0;
  y: number = 0.0;
  z: number = 0.0;

  constructor(x: number = 0.0, y: number = 0.0, z: number = 0.0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  add(other: Vector3d): Vector3d {
    return new Vector3d(this.x + other.x, this.y + other.y, this.z + other.z);
  }

  subtract(other: Vector3d): Vector3d {
    return new Vector3d(this.x - other.x, this.y - other.y, this.z - other.z);
  }

  multiply(other: Vector3d): Vector3d {
    return new Vector3d(this.x * other.x, this.y * other.y, this.z * other.z);
  }

  divide(other: Vector3d): Vector3d {
    return new Vector3d(this.x / other.x, this.y / other.y, this.z / other.z);
  }

  length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }

  normalize(): Vector3d {
    const len = this.length();
    if (len === 0) {
      return new Vector3d(0, 0, 0);
    }
    return new Vector3d(this.x / len, this.y / len, this.z / len);
  }

  scale(scalar: number): Vector3d {
    return new Vector3d(this.x * scalar, this.y * scalar, this.z * scalar);
  }

  toString(): string {
    return `X=(${this.x}, Y=${this.y}, Z=${this.z})`;
  }
}
