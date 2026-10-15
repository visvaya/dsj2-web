import type { FrameBuffer } from "./frame-buffer";
import { PIXELS_PER_M, fastSin, hash, type Camera } from "./jump-view-camera";
import { color } from "./palette";

/** Snowflake layers: parallax (1 = moves with the hill), flakes per 100 px of width, fall speed in px per frame. */
const SNOW_LAYERS = [
  { parallax: 0.45, per100Px: 12, fallPx: 0.35, size: 1, color: "flakeFar" },
  { parallax: 0.7, per100Px: 9, fallPx: 0.6, size: 1, color: "flake" },
  { parallax: 1, per100Px: 5, fallPx: 0.9, size: 2, color: "flake" },
] as const;

/** Falling snow, carried by the displayed wind (along the hill and vertically) and moving with the camera. */
export function drawSnowfall(
  fb: FrameBuffer,
  drift: { x: number; y: number },
  cam: Camera,
  frame: number,
  bottom: number,
): void {
  const w = fb.width + 4;
  SNOW_LAYERS.forEach((layer, li) => {
    const c = color(layer.color);
    const count = Math.round((fb.width * layer.per100Px) / 100);
    for (let i = 0; i < count; i++) {
      const r = hash(i * 7919 + li * 104729);
      const sway = 1.5 * fastSin(frame / 30 + (r % 628) / 100);
      const x = (r % 4096) + (drift.x - cam.x) * PIXELS_PER_M * layer.parallax + sway;
      const y = ((r >>> 12) % 4096) + frame * layer.fallPx + (cam.y - drift.y) * PIXELS_PER_M * layer.parallax;
      const sx = Math.floor(((x % w) + w) % w) - 2;
      const sy = Math.floor(((y % bottom) + bottom) % bottom);
      fb.rect(sx, sy, layer.size, Math.min(layer.size, bottom - sy), c);
    }
  });
}
