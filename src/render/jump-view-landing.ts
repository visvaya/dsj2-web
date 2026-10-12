import { displayedWindMPerS } from "../game/wind-display";
import { landingSlope, type HillProfile } from "../sim/hill-profile";
import type { JumpSimState } from "../sim/jump-sim";
import type { FrameBuffer } from "./frame-buffer";
import {
  FAR_EDGE_PX,
  PIXELS_PER_M,
  SLOPE_HALF_WIDTH_M,
  fastSin,
  hash,
  surfaceY,
  toScreenX,
  toScreenY,
  treeColors,
  type Camera,
} from "./jump-view-camera";
import { drawFloodlights, drawInrun } from "./jump-view-inrun";
import { DEPTH_TO_X } from "./jumper-skeleton";
import { band, color, rampTable } from "./palette";

/** The near edge is also shifted left by the oblique projection. */
const NEAR_EDGE_SHIFT_PX = DEPTH_TO_X * SLOPE_HALF_WIDTH_M * PIXELS_PER_M;

const distanceCache = new WeakMap<HillProfile, Map<number, number>>();

/** x reached after `distanceM` of arc along the landing hill from the takeoff (display only). */
function xAtDistance(h: HillProfile, distanceM: number): number {
  let byDistance = distanceCache.get(h);
  if (byDistance === undefined) {
    byDistance = new Map();
    distanceCache.set(h, byDistance);
  }
  const cached = byDistance.get(distanceM);
  if (cached !== undefined) return cached;
  const step = 0.05;
  let x = h.takeoffXM;
  let length = 0;
  while (length < distanceM && x < h.outrunStartXM + 200) {
    const s = landingSlope(h, x + step / 2);
    length += Math.sqrt(s * s + 1) * step;
    x += step;
  }
  byDistance.set(distanceM, x);
  return x;
}

/** The landing hill's surface from its far edge down; returns the screen row of the jumper's line per column. */
export function drawSlope(fb: FrameBuffer, h: HillProfile, cam: Camera, bottom: number): Int32Array {
  const ground = new Int32Array(fb.width);
  const edge = color("snow3");
  const surface = rampTable("snow1", "snow3", 8);
  const outside = rampTable("snow3", "snow4", 4);
  const px = fb.pixels;
  for (let sx = 0; sx < fb.width; sx++) {
    const wx = cam.x + (sx - cam.cx) / PIXELS_PER_M;
    const gy = Math.round(toScreenY(cam, surfaceY(h, wx)));
    ground[sx] = gy;
    const top = Math.max(0, gy - FAR_EDGE_PX);
    for (let sy = top; sy < bottom; sy++) {
      px[sy * fb.width + sx] =
        sy < top + 3
          ? edge
          : sy > gy + FAR_EDGE_PX + 3
            ? band(outside, (sy - gy - FAR_EDGE_PX) / 60)
            : band(surface, (sy - gy + FAR_EDGE_PX) / 110);
    }
  }
  return ground;
}

/**
 * A pine behind the far fence. `above` gives, per screen column, the first row of the landing hill's surface;
 * the tree is cut there so it never covers the hill.
 */
function drawPine(fb: FrameBuffer, x: number, base: number, height: number, seed: number, above: Int32Array): void {
  const TREE = treeColors();
  const put = (px: number, py: number, c: number) => {
    if (px >= 0 && px < fb.width && py < (above[px] ?? 0)) fb.put(px, py, c);
  };
  for (let dx = -1; dx <= 1; dx++) for (let dy = 0; dy < 5; dy++) put(x + dx, base - 4 + dy, TREE.trunk);
  const tiers = Math.max(3, Math.floor(height / 9));
  for (let i = 0; i < tiers; i++) {
    const top = base - 4 - Math.floor(((i + 1) * (height - 4)) / tiers) - 3;
    const bottom = base - 3 - Math.floor((i * (height - 4)) / tiers);
    const halfBottom = Math.max(2, Math.floor(height * 0.32 * (1 - i / (tiers + 1))));
    for (let y = top; y <= bottom; y++) {
      const half = Math.round((halfBottom * (y - top)) / Math.max(1, bottom - top));
      for (let dx = -half; dx <= half; dx++) {
        // Texture from the tree's own coordinates, so it does not shimmer while the camera moves.
        const r = hash(seed + dx * 131 + (y - base) * 7919);
        if ((dx === -half || dx === half) && r % 100 < 45) continue;
        let c = dx > half / 3 ? TREE.dark : TREE.mid;
        if (dx < -half / 2 && r % 2 === 0) c = TREE.light;
        if (r % 100 < 15) c = TREE.dark;
        put(x + dx, y, c);
      }
    }
  }
}

export function drawHill(fb: FrameBuffer, h: HillProfile, cam: Camera, ground: Int32Array, lightsOn: boolean): void {
  const xAt = (sx: number) => cam.x + (sx - cam.cx) / PIXELS_PER_M;
  const farEdge = ground.map((gy) => gy - FAR_EDGE_PX);
  // Trees behind the fence, one candidate every 6 m.
  const firstCell = Math.floor(xAt(-40) / 6);
  const lastCell = Math.floor(xAt(fb.width + 40) / 6);
  for (let cell = firstCell; cell <= lastCell; cell++) {
    const r = hash(cell);
    if (r % 3 !== 0) continue;
    const wx = cell * 6 + ((r >>> 4) % 6);
    if (wx < h.takeoffXM + 4) continue;
    const sx = Math.round(toScreenX(cam, wx));
    const base = Math.round(toScreenY(cam, surfaceY(h, wx))) - FAR_EDGE_PX - 2;
    drawPine(fb, sx, base, 36 + ((r >>> 8) % 48), r, farEdge);
  }
  if (lightsOn) drawFloodlights(fb, h, cam);
  // Fence along the far edge of the landing hill.
  const fence = color("fence");
  const fenceDark = color("fenceDark");
  const post = color("post");
  for (let sx = 0; sx < fb.width; sx++) {
    const wx = xAt(sx);
    if (wx < h.takeoffXM + 1) continue;
    const fy = (ground[sx] ?? 0) - FAR_EDGE_PX - 1;
    fb.put(sx, fy, fence);
    fb.put(sx, fy + 1, fence);
    fb.put(sx, fy + 2, fenceDark);
    if (((wx % 3) + 3) % 3 < 1 / PIXELS_PER_M) fb.rect(sx, fy - 1, 2, 5, post);
  }
  drawInrun(fb, h, cam, ground, lightsOn);
}

const SOCK_SPACING_M = 25;
const SOCK_FIRST_AFTER_TAKEOFF_M = 15;
const SOCK_POLE_PX = 14;
const SOCK_LENGTH_PX = 8;
/** Wind at which a sock flies straight out. */
const SOCK_FULL_WIND_M_PER_S = 4.5;

/**
 * Screen direction (unit vector, y down) a wind sock points in: along the displayed wind, the same vector the
 * indicator box shows, blended with hanging straight down as the wind drops towards calm.
 */
export function windSockDirection(s: JumpSimState): [number, number] {
  const w = displayedWindMPerS(s.wind);
  const speed = Math.hypot(w.x, w.y);
  if (!(speed > 0)) return [0, 1];
  const k = Math.min(1, speed / SOCK_FULL_WIND_M_PER_S);
  const dirX = (w.x / speed) * k;
  const dirY = (-w.y / speed) * k + (1 - k);
  const len = Math.hypot(dirX, dirY) || 1;
  return [dirX / len, dirY / len];
}

/**
 * Wind socks on poles behind the far fence, every 25 m along the landing hill. They stream along the game's
 * wind in the side view (along the hill and vertical) and hang down in a calm; the flutter is only for show.
 */
export function drawWindSocks(fb: FrameBuffer, h: HillProfile, cam: Camera, s: JumpSimState, frame: number): void {
  const pole = color("post");
  const red = color("sockRed");
  const white = color("sockWhite");
  const [ux0, uy0] = windSockDirection(s);
  const k = Math.min(1, s.wind.speedMPerS / SOCK_FULL_WIND_M_PER_S);
  // The first sock stands clear of the takeoff table, so its pole does not show under the lip.
  const first = h.takeoffXM + SOCK_FIRST_AFTER_TAKEOFF_M;
  const viewFrom = cam.x - (cam.cx + 20) / PIXELS_PER_M;
  const viewTo = cam.x + (fb.width - cam.cx + 20) / PIXELS_PER_M;
  const start = first + Math.max(0, Math.ceil((viewFrom - first) / SOCK_SPACING_M)) * SOCK_SPACING_M;
  for (let x = start; x <= Math.min(viewTo, h.outrunStartXM); x += SOCK_SPACING_M) {
    const sx = Math.round(toScreenX(cam, x));
    const base = Math.round(toScreenY(cam, surfaceY(h, x))) - FAR_EDGE_PX - 1;
    const top = base - SOCK_POLE_PX;
    fb.rect(sx, top, 1, SOCK_POLE_PX, pole);
    const flutter = 0.12 * k * fastSin(frame / 4 + x);
    const ux = ux0 - flutter * uy0;
    const uy = uy0 + flutter * ux0;
    for (let i = 0; i < SOCK_LENGTH_PX; i++) {
      const c = Math.floor(i / 2) % 2 === 0 ? red : white;
      const px = sx + 0.5 + ux * i;
      const py = top + uy * i;
      fb.put(px, py, c);
      // Wider at the mouth, thinning to the tail.
      if (i < SOCK_LENGTH_PX - 3) fb.put(px - uy, py + ux, c);
    }
  }
}

/** A line across the landing hill at a distance from the takeoff, slanted by the oblique projection. */
export function drawDistanceLine(
  fb: FrameBuffer,
  h: HillProfile,
  cam: Camera,
  distanceM: number,
  c: number,
  offsetPx: number,
): void {
  const x = xAtDistance(h, distanceM);
  const sx = toScreenX(cam, x) + offsetPx;
  const sy = toScreenY(cam, surfaceY(h, x));
  if (sx < -NEAR_EDGE_SHIFT_PX - 2 || sx > fb.width + NEAR_EDGE_SHIFT_PX + 2) return;
  fb.line(sx + NEAR_EDGE_SHIFT_PX, sy - FAR_EDGE_PX, sx - NEAR_EDGE_SHIFT_PX, sy + FAR_EDGE_PX, c);
}

const NEAR_FENCE_PX = 5;

/** The near fence, in front of the jumper's line (thick, as in the original). */
export function drawNearFence(fb: FrameBuffer, h: HillProfile, cam: Camera, bottom: number): void {
  const rail = rampTable("nearFence", "nearFenceDark", 3);
  const post = color("post");
  for (let sx = 0; sx < fb.width; sx++) {
    const wx = cam.x + (sx + NEAR_EDGE_SHIFT_PX - cam.cx) / PIXELS_PER_M;
    if (wx < h.takeoffXM + 1) continue;
    const top = Math.round(toScreenY(cam, surfaceY(h, wx))) + FAR_EDGE_PX - NEAR_FENCE_PX;
    const isPost = ((wx % 6) + 6) % 6 < 2 / PIXELS_PER_M;
    for (let i = 0; i < NEAR_FENCE_PX; i++) {
      if (top + i >= bottom) break;
      fb.put(sx, top + i, isPost ? post : band(rail, i / (NEAR_FENCE_PX - 1)));
    }
  }
}
