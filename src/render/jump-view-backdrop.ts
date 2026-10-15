import { inrunYM, type HillProfile } from "../sim/hill-profile";
import type { FrameBuffer } from "./frame-buffer";
import { CAMERA_BELOW_JUMPER_M, PIXELS_PER_M, fastSin, hash, treeColors, type Camera } from "./jump-view-camera";
import { band, color, rampTable } from "./palette";

/** The backdrop (a snowy hillside with forest) moves at this fraction of the camera's speed. */
const BACKDROP_PARALLAX = 0.4;
const FAR_RIDGE_PARALLAX = 0.15;
/** Height of the backdrop's skyline below the top of the screen when the camera is at the start gate. */
const SKYLINE_AT_GATE_PX = 38;

export interface Backdrop {
  /** Backdrop coordinate of screen column 0 (scrolls with parallax). */
  originX: number;
  /** Screen row of the backdrop's mean skyline; negative once the camera is far down the hill. */
  lift: number;
}

export function backdropFor(h: HillProfile, cam: Camera): Backdrop {
  const gateY = inrunYM(h, h.startXM) - CAMERA_BELOW_JUMPER_M;
  return {
    originX: cam.x * PIXELS_PER_M * BACKDROP_PARALLAX,
    lift: SKYLINE_AT_GATE_PX - (gateY - cam.y) * PIXELS_PER_M * BACKDROP_PARALLAX,
  };
}

function skylineAt(b: Backdrop, sx: number): number {
  const x = sx + b.originX;
  return Math.round(b.lift + 6 * Math.sin(x / 53) + 3 * Math.sin(x / 17 + 1) + 5 * Math.sin(x / 131 + 2));
}

/** Sky, distant snowy ridges and the forested hillside behind the jump; no column is left without snow below the skyline. */
export function drawBackdrop(
  fb: FrameBuffer,
  b: Backdrop,
  cam: Camera,
  bottom: number,
  night: boolean,
  frame: number,
): void {
  const farOrigin = cam.x * PIXELS_PER_M * FAR_RIDGE_PARALLAX;
  const sky = rampTable("sky1", "sky2", 5);
  const hillside = rampTable("backdropLight", "backdropDark", 10);
  const range = {
    snow: color("farSnow"),
    snowShade: color("farSnowShade"),
    rock: color("farRock"),
    rockShade: color("farRockShade"),
  };
  const star = color("star");
  const px = fb.pixels;
  const farTops = new Int32Array(fb.width);
  for (let sx = 0; sx < fb.width; sx++) {
    const skyline = Math.min(bottom, skylineAt(b, sx));
    const fx = sx + farOrigin;
    const ridge = mountainsAt(fx);
    const farTop = Math.min(skyline, skyline - ridge.heightPx);
    farTops[sx] = farTop;
    const x = sx + b.originX;
    let sy = 0;
    for (; sy < farTop; sy++) px[sy * fb.width + sx] = band(sky, sy / Math.max(8, farTop));
    if (night) {
      // Stars fixed to the far ridges, a few of them twinkling.
      const column = Math.round(fx);
      for (let y = 0; y < farTop - 2; y++) {
        const r = hash(column * 977 + y * 131);
        if (r % 53 === 0 && ((r >>> 9) + Math.floor(frame / 20)) % 7 !== 0) px[y * fb.width + sx] = star;
      }
    }
    // Snow on the upper part of each peak, bare rock lower down; the face turned away from the light is darker.
    const snowline = skyline - ridge.snowlinePx;
    for (; sy < skyline; sy++) {
      const snow = sy < snowline;
      px[sy * fb.width + sx] = ridge.shaded
        ? snow
          ? range.snowShade
          : range.rockShade
        : snow
          ? range.snow
          : range.rock;
    }
    for (; sy < bottom; sy++) {
      const depth = sy - b.lift;
      const t = depth / 190 + 0.06 * fastSin((x * 0.7 + depth) / 29) + 0.04 * fastSin((x - depth * 1.3) / 13);
      px[sy * fb.width + sx] = band(hillside, t);
    }
  }
  if (night) drawMoon(fb, b, cam, farTops);
  drawBackdropForest(fb, b, bottom);
}

const MOON_RADIUS_PX = 4;

/** The moon in the sky band; drawn only where the sky is visible, so ridges pass in front of it. */
function drawMoon(fb: FrameBuffer, b: Backdrop, cam: Camera, farTops: Int32Array): void {
  const cx = Math.round(fb.width * 0.74 - cam.x * PIXELS_PER_M * 0.02);
  // Just above the ridge in its column, as if rising behind it, so it shows whenever any sky does.
  const cy = Math.min(Math.round(b.lift - 15), (farTops[Math.min(fb.width - 1, Math.max(0, cx))] ?? 0) - 2);
  const r2 = MOON_RADIUS_PX * MOON_RADIUS_PX;
  for (let dy = -MOON_RADIUS_PX; dy <= MOON_RADIUS_PX; dy++) {
    for (let dx = -MOON_RADIUS_PX; dx <= MOON_RADIUS_PX; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || x >= fb.width || y < 0 || y >= (farTops[x] ?? 0)) continue;
      const crater = (dx === -1 && dy === -1) || (dx === 1 && dy === 1) || dx + dy > 4;
      fb.put(x, y, color(crater ? "moonShade" : "moon"));
    }
  }
}

/** Distant peaks: one candidate per cell of the far layer, each a triangle with its own height and steepness. */
const PEAK_CELL_PX = 46;
const PEAK_MIN_PX = 7;
const PEAK_SPAN_PX = 20;
/** Height of the range between the peaks. */
const RANGE_BASE_PX = 4;

interface Ridge {
  heightPx: number;
  /** Height above the skyline where the snow ends (lower is rock). */
  snowlinePx: number;
  /** On the right-hand face of its peak, away from the light. */
  shaded: boolean;
}

/** The far mountain range at far-layer coordinate `fx`: the highest of the nearby triangular peaks. */
function mountainsAt(fx: number): Ridge {
  const cell = Math.floor(fx / PEAK_CELL_PX);
  let best: Ridge = { heightPx: RANGE_BASE_PX, snowlinePx: RANGE_BASE_PX, shaded: false };
  for (let k = cell - 2; k <= cell + 2; k++) {
    const r = hash(k * 2654435761 + 17);
    const centre = k * PEAK_CELL_PX + (r % PEAK_CELL_PX);
    const peak = PEAK_MIN_PX + ((r >>> 8) % PEAK_SPAN_PX);
    const steepness = 0.5 + ((r >>> 16) % 40) / 100;
    const height = Math.round(peak - Math.abs(fx - centre) * steepness);
    if (height > best.heightPx) {
      // Ragged snowline at about 55 % of the peak's height.
      const jag = (hash(Math.round(fx) * 31 + k) % 3) - 1;
      best = { heightPx: height, snowlinePx: Math.round(peak * 0.45) + jag, shaded: fx > centre };
    }
  }
  return best;
}

const FOREST_CELL_W = 9;
const FOREST_CELL_H = 7;

/** Small pines on the backdrop, in clumps, larger lower down (closer). */
function drawBackdropForest(fb: FrameBuffer, b: Backdrop, bottom: number): void {
  const firstCol = Math.floor((b.originX - 8) / FOREST_CELL_W);
  const lastCol = Math.floor((b.originX + fb.width + 8) / FOREST_CELL_W);
  const firstRow = Math.max(0, Math.floor(-b.lift / FOREST_CELL_H));
  const lastRow = Math.floor((bottom + 20 - b.lift) / FOREST_CELL_H);
  for (let row = firstRow; row <= lastRow; row++) {
    for (let col = firstCol; col <= lastCol; col++) {
      const clump = Math.sin(col / 5.3 + row / 3.1) * Math.sin(col / 2.9 - row / 4.7);
      if (clump < 0.35) continue;
      const r = hash(col * 7349 + row * 1931);
      if (r % 3 !== 0) continue;
      const depth = row * FOREST_CELL_H + ((r >>> 3) % FOREST_CELL_H);
      const sx = Math.round(col * FOREST_CELL_W + ((r >>> 6) % FOREST_CELL_W) - b.originX);
      const base = Math.round(b.lift + depth);
      const height = 3 + Math.min(12, Math.floor(depth / 10)) + ((r >>> 9) % 3);
      if (base - height < skylineAt(b, sx) + 1 || base - height >= bottom) continue;
      drawSmallPine(fb, sx, base, height, r);
    }
  }
}

function drawSmallPine(fb: FrameBuffer, x: number, base: number, height: number, seed: number): void {
  const TREE = treeColors();
  fb.put(x, base, TREE.trunk);
  for (let i = 1; i <= height; i++) {
    const half = Math.floor((height - i) * 0.32 + (i % 3 === 0 ? 0 : 0.5));
    for (let dx = -half; dx <= half; dx++) {
      fb.put(x + dx, base - i, dx > 0 || hash(seed + i * 31 + dx) % 4 === 0 ? TREE.dark : TREE.mid);
    }
  }
}

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
