/** An indexed-colour-free RGBA buffer at the game's logical resolution. */
export type Rgb = readonly [number, number, number];

export class FrameBuffer {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint32Array;
  readonly bytes: Uint8ClampedArray<ArrayBuffer>;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.bytes = new Uint8ClampedArray(new ArrayBuffer(width * height * 4));
    this.pixels = new Uint32Array(this.bytes.buffer);
  }

  static pack([r, g, b]: Rgb): number {
    // ImageData is RGBA in memory; Uint32 views are little-endian on every supported platform.
    return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
  }

  put(x: number, y: number, color: number): void {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi >= 0 && xi < this.width && yi >= 0 && yi < this.height) {
      this.pixels[yi * this.width + xi] = color;
    }
  }

  rect(x: number, y: number, w: number, h: number, color: number): void {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.width, Math.round(x + w));
    const y1 = Math.min(this.height, Math.round(y + h));
    for (let yy = y0; yy < y1; yy++) {
      this.pixels.fill(color, yy * this.width + x0, yy * this.width + Math.max(x0, x1));
    }
  }

  /** Bresenham line between rounded end points. */
  line(xa: number, ya: number, xb: number, yb: number, color: number): void {
    let x0 = Math.round(xa);
    let y0 = Math.round(ya);
    const x1 = Math.round(xb);
    const y1 = Math.round(yb);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let guard = 0; guard < 4096; guard++) {
      this.put(x0, y0, color);
      if (x0 === x1 && y0 === y1) return;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }
}
