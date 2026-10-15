import type { FrameBuffer } from "./frame-buffer";

/**
 * Where the scene is drawn: the picture, the palette index of each of its pixels (the original's ski tracks
 * darken the indices already drawn), and the last row of the scene above the bar.
 */
export interface SceneCanvas {
  fb: FrameBuffer;
  indices: Uint8Array;
  lastRow: number;
}

let indexBuffer = new Uint8Array(0);

/** A canvas over `fb`; the index buffer is shared between frames. */
export function sceneCanvas(fb: FrameBuffer, lastRow: number): SceneCanvas {
  const size = fb.width * fb.height;
  if (indexBuffer.length !== size) indexBuffer = new Uint8Array(size);
  return { fb, indices: indexBuffer, lastRow: Math.min(lastRow, fb.height - 1) };
}

/** One pixel of palette index `index`, within the scene. */
export function putIndex(c: SceneCanvas, pal: Uint32Array, x: number, y: number, index: number): void {
  if (x < 0 || x >= c.fb.width || y < 0 || y > c.lastRow) return;
  const { indices, fb } = c;
  const pixels = fb.pixels;
  const i = y * fb.width + x;
  indices[i] = index;
  pixels[i] = pal[index] ?? 0;
}

/**
 * One column of the scene from row `top` to row `bottom` (both included), its palette index going from `fromColour`
 * to `toColour` in steps of 1/256 (the original's 0baf:2f7f with 0baf:2eea): the step is the difference divided
 * by the number of rows, truncated, and the first row already gets one step. Rows outside the scene are cut off
 * without changing the gradient.
 */
export function colourSpan(
  c: SceneCanvas,
  pal: Uint32Array,
  column: number,
  top: number,
  bottom: number,
  fromColour: number,
  toColour: number,
): void {
  const { fb, indices } = c;
  const pixels = fb.pixels;
  if (top > bottom || column < 0 || column >= fb.width) return;
  const rows = bottom - top + 1;
  const step = Math.trunc((toColour - fromColour) / rows);
  let value = fromColour;
  let row = top;
  if (row < 0) {
    value += step * -row;
    row = 0;
  }
  const end = Math.min(bottom, c.lastRow);
  for (; row <= end; row++) {
    value = (value + step) & 0xffff;
    const index = value >>> 8;
    const i = row * fb.width + column;
    indices[i] = index;
    pixels[i] = pal[index] ?? 0;
  }
}

/** Darkens a pixel of the snow (palette index `limit` or below) by `by` indices, as the original's ski tracks do. */
export function darkenSnow(c: SceneCanvas, pal: Uint32Array, x: number, y: number, by: number, limit: number): void {
  if (x < 0 || x >= c.fb.width || y < 0 || y > c.lastRow) return;
  const index = c.indices[y * c.fb.width + x] ?? 0;
  if (index <= limit) putIndex(c, pal, x, y, Math.max(0, index - by));
}
