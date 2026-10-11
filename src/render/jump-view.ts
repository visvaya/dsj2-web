import { inrunSlope, inrunYM, landingSlope, landingYM, type HillProfile } from "../sim/hill-profile";
import { PHASE, notesShownBy } from "../sim/jump-logic";
import type { JumpSimState } from "../sim/jump-sim";
import { FrameBuffer } from "./frame-buffer";
import { BONES, DEPTH_TO_X, DEPTH_TO_Y, skeletonPoints, type BodyPart, type Point3 } from "./jumper-skeleton";
import { band, color, ramp, rampTable, type ColorName } from "./palette";
import { drawText, textWidth } from "./pixel-font";

/** Logical height of the original; the width follows the screen's proportions (variant B). */
export const VIEW_HEIGHT_PX = 200;
export const VIEW_MIN_WIDTH_PX = 256;
export const VIEW_MAX_WIDTH_PX = 432;

/** Logical width for a display area, keeping square pixels and the original height. */
export function viewWidthFor(areaWidth: number, areaHeight: number): number {
  if (!(areaWidth > 0 && areaHeight > 0)) return 356;
  const w = Math.round((VIEW_HEIGHT_PX * areaWidth) / areaHeight);
  return Math.min(VIEW_MAX_WIDTH_PX, Math.max(VIEW_MIN_WIDTH_PX, w));
}
/** 14 px/m across and 14*200/240 down on the original's 4:3 screen: equal once pixels are square. */
export const PIXELS_PER_M = (14 * 200) / 240;
/** Half width of the landing hill; its edges carry the fences. */
const SLOPE_HALF_WIDTH_M = 4.5;
/** The far edge of the landing hill sits this much above the line the jumper lands on, the near edge as much below. */
const FAR_EDGE_PX = Math.round(DEPTH_TO_Y * SLOPE_HALF_WIDTH_M * PIXELS_PER_M);
/** The near edge is also shifted left by the oblique projection. */
const NEAR_EDGE_SHIFT_PX = DEPTH_TO_X * SLOPE_HALF_WIDTH_M * PIXELS_PER_M;
const BAR_HEIGHT_PX = 11;
const MS_TO_KMH = 3.6;
/** Frames per blink phase of the prompts (half a second). */
const BLINK_FRAMES = 35;

/** How the player steers: the prompts name the matching controls. */
export type ControlScheme = "mouse" | "touch" | "tilt";

export interface JumpViewModel {
  profile: HillProfile;
  kPointM: number;
  hillName: string;
  playerName: string;
  state: JumpSimState;
  controls: ControlScheme;
  /**
   * Presentation clock in simulation frames; keeps running after the simulation stops,
   * so the judges' notes still appear one by one.
   */
  frame: number;
  /** The simulation has stopped (the jumper stands still). */
  over: boolean;
  /** Hill record distance, drawn as a line on the landing hill. */
  recordM?: number;
  /** This jump set a new hill record. */
  newRecord?: boolean;
}

const distanceCache = new WeakMap<HillProfile, Map<number, number>>();

/** x reached after `distanceM` of arc along the landing hill from the takeoff (display only). */
export function xAtDistance(h: HillProfile, distanceM: number): number {
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

/** Deterministic hash for scenery placement (no flicker between frames). */
function hash(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

interface Camera {
  x: number;
  y: number;
  cx: number;
  cy: number;
}

const toScreenX = (cam: Camera, x: number) => cam.cx + (x - cam.x) * PIXELS_PER_M;
const toScreenY = (cam: Camera, y: number) => cam.cy + (cam.y - y) * PIXELS_PER_M;

/** Where a shadow falls: the inrun track up to the takeoff, the landing hill after it. */
function groundUnder(h: HillProfile, x: number): number {
  return x < h.takeoffXM && x >= h.startXM - TOWER_BACK_M ? inrunYM(h, x) : surfaceY(h, x);
}

function surfaceY(h: HillProfile, x: number): number {
  const clamped = Math.min(Math.max(x, -40), h.outrunStartXM + 120);
  return landingYM(h, clamped);
}

/** The backdrop (a snowy hillside with forest) moves at this fraction of the camera's speed. */
const BACKDROP_PARALLAX = 0.4;
const FAR_RIDGE_PARALLAX = 0.15;
/** Height of the backdrop's skyline below the top of the screen when the camera is at the start gate. */
const SKYLINE_AT_GATE_PX = 22;

interface Backdrop {
  /** Backdrop coordinate of screen column 0 (scrolls with parallax). */
  originX: number;
  /** Screen row of the backdrop's mean skyline; negative once the camera is far down the hill. */
  lift: number;
}

function backdropFor(h: HillProfile, cam: Camera): Backdrop {
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

const SINE_STEPS = 4096;
const SINE = Float32Array.from({ length: SINE_STEPS }, (_, i) => Math.sin((2 * Math.PI * i) / SINE_STEPS));

/** Table sine for per-pixel shading (display only; the simulation never uses it). */
function fastSin(v: number): number {
  return SINE[Math.floor((v * SINE_STEPS) / (2 * Math.PI)) & (SINE_STEPS - 1)] ?? 0;
}

/** Sky, distant snowy ridges and the forested hillside behind the jump; no column is left without snow below the skyline. */
function drawBackdrop(fb: FrameBuffer, b: Backdrop, cam: Camera, bottom: number): void {
  const farOrigin = cam.x * PIXELS_PER_M * FAR_RIDGE_PARALLAX;
  const sky = rampTable("sky1", "sky2", 5);
  const hillside = rampTable("backdropLight", "backdropDark", 10);
  const farSnow = color("farSnow");
  const farShade = color("farSnowShade");
  const px = fb.pixels;
  for (let sx = 0; sx < fb.width; sx++) {
    const skyline = Math.min(bottom, skylineAt(b, sx));
    const fx = sx + farOrigin;
    const peak = Math.abs(Math.sin(fx / 37));
    const farTop = Math.min(skyline, Math.round(skyline - 5 - 9 * peak - 3 * Math.sin(fx / 11)));
    const farShaded = Math.cos(fx / 37) * Math.sin(fx / 37) > 0;
    const x = sx + b.originX;
    let sy = 0;
    for (; sy < farTop; sy++) px[sy * fb.width + sx] = band(sky, sy / Math.max(8, farTop));
    for (; sy < skyline; sy++) px[sy * fb.width + sx] = farShaded && sy > farTop + 1 ? farShade : farSnow;
    for (; sy < bottom; sy++) {
      const depth = sy - b.lift;
      const t = depth / 190 + 0.06 * fastSin((x * 0.7 + depth) / 29) + 0.04 * fastSin((x - depth * 1.3) / 13);
      px[sy * fb.width + sx] = band(hillside, t);
    }
  }
  drawBackdropForest(fb, b, bottom);
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
  fb.put(x, base, TREE.trunk);
  for (let i = 1; i <= height; i++) {
    const half = Math.floor((height - i) * 0.32 + (i % 3 === 0 ? 0 : 0.5));
    for (let dx = -half; dx <= half; dx++) {
      fb.put(x + dx, base - i, dx > 0 || hash(seed + i * 31 + dx) % 4 === 0 ? TREE.dark : TREE.mid);
    }
  }
}

/** A few birds crossing the backdrop, flapping every few frames. */
function drawBirds(fb: FrameBuffer, b: Backdrop, frame: number): void {
  const span = fb.width + 60;
  for (let i = 0; i < 3; i++) {
    const worldX = frame * (0.12 + i * 0.03) + i * 157;
    const sx = Math.round((((worldX - b.originX) % span) + span) % span) - 30;
    const sy = Math.round(b.lift + 14 + i * 9 + 3 * Math.sin(frame / 23 + i));
    if (sy < 2) continue;
    const up = Math.floor(frame / 9 + i) % 2 === 0;
    const c = color("bird");
    fb.put(sx, sy, c);
    fb.put(sx - 1, sy - (up ? 1 : 0), c);
    fb.put(sx + 1, sy - (up ? 1 : 0), c);
    fb.put(sx - 2, sy - (up ? 2 : 0), c);
    fb.put(sx + 2, sy - (up ? 2 : 0), c);
  }
}

/** The landing hill's surface from its far edge down; returns the screen row of the jumper's line per column. */
function drawSlope(fb: FrameBuffer, h: HillProfile, cam: Camera, bottom: number): Int32Array {
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

/** Packed tree colours, looked up once instead of per pixel. */
const TREE = { dark: color("tree1"), mid: color("tree2"), light: color("tree3"), trunk: color("trunk") };

function drawPine(fb: FrameBuffer, x: number, base: number, height: number, seed: number): void {
  fb.rect(x - 1, base - 4, 3, 5, TREE.trunk);
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
        fb.put(x + dx, y, c);
      }
    }
  }
}

/** Inrun trough seen in the figure's oblique projection: 3 m wide, walls 0.55 m, 1.4 m deep below the near rim. */
const TROUGH_HALF_WIDTH_M = 1.5;
const TROUGH_WALL_M = 0.55;
const TROUGH_DEPTH_M = 1.4;
const TOWER_BACK_M = 6;
const TOWER_FRONT_M = 2;
const PILLAR_SPACING_M = 12;
const PILLAR_WIDTH_M = 2.2;

function inBand(v: number, from: number, width: number): number | null {
  const t = (v - from) / width;
  return t >= 0 && t <= 1 ? t : null;
}

function drawInrun(fb: FrameBuffer, h: HillProfile, cam: Camera, ground: Int32Array): void {
  const xAt = (sx: number) => cam.x + (sx - cam.cx) / PIXELS_PER_M;
  const Y = (y: number) => Math.round(toScreenY(cam, y));
  const farLift = DEPTH_TO_Y * TROUGH_HALF_WIDTH_M;
  const from = h.startXM - TOWER_BACK_M;
  for (let sx = 0; sx < fb.width; sx++) {
    const wx = xAt(sx);
    if (wx < from || wx > h.takeoffXM) continue;
    const yc = inrunYM(h, Math.max(wx, h.startXM - TOWER_BACK_M));
    const rimTop = Y(yc + farLift + TROUGH_WALL_M);
    const farEdge = Y(yc + farLift);
    const nearTop = Y(yc - farLift + TROUGH_WALL_M);
    const bottom = Y(yc - farLift + TROUGH_WALL_M - TROUGH_DEPTH_M);
    const gy = ground[sx] ?? fb.height;
    // Supports first: the start tower and pillars, shaded in vertical bands.
    const tower = inBand(wx, h.startXM - TOWER_BACK_M, TOWER_BACK_M + TOWER_FRONT_M);
    const k = Math.round((wx - h.startXM - 10) / PILLAR_SPACING_M);
    const pillarFrom = h.startXM + 10 + k * PILLAR_SPACING_M - PILLAR_WIDTH_M / 2;
    const pillar = wx < h.takeoffXM - 6 && k >= 0 ? inBand(wx, pillarFrom, PILLAR_WIDTH_M) : null;
    const support = tower ?? pillar;
    if (support !== null && gy > bottom) {
      fb.rect(sx, bottom, 1, gy - bottom, ramp("towerLight", "towerDark", support, 4));
    }
    // Far wall rim, far inner wall, track, near rim, near outer wall.
    fb.rect(sx, rimTop, 1, 2, color("inrunRim"));
    if (farEdge > rimTop + 2) fb.rect(sx, rimTop + 2, 1, farEdge - rimTop - 2, color("inrunInner"));
    for (let y = farEdge; y < nearTop; y++) {
      fb.put(sx, y, ramp("trackFar", "trackNear", (y - farEdge) / Math.max(1, nearTop - farEdge), 3));
    }
    fb.rect(sx, nearTop, 1, 1, color("inrunHighlight"));
    for (let y = nearTop + 1; y < bottom; y++) {
      fb.put(sx, y, ramp("wallLight", "wallDark", (y - nearTop) / Math.max(1, bottom - nearTop), 5));
    }
  }
  // Front face of the takeoff table: the trough's cross-section, a parallelogram in the oblique view.
  const yc = inrunYM(h, h.takeoffXM);
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const z = -TROUGH_HALF_WIDTH_M + (2 * TROUGH_HALF_WIDTH_M * i) / steps;
    const x = Math.round(toScreenX(cam, h.takeoffXM - DEPTH_TO_X * z));
    const top = Y(yc + TROUGH_WALL_M - DEPTH_TO_Y * z);
    const bottom = Y(yc + TROUGH_WALL_M - TROUGH_DEPTH_M - DEPTH_TO_Y * z);
    for (let y = top; y <= bottom; y++) {
      fb.put(x, y, ramp("endLight", "endDark", (y - top) / Math.max(1, bottom - top), 3));
    }
  }
}

function drawHill(fb: FrameBuffer, h: HillProfile, cam: Camera, ground: Int32Array): void {
  const xAt = (sx: number) => cam.x + (sx - cam.cx) / PIXELS_PER_M;
  // Trees behind the fence, one candidate every 6 m.
  const firstCell = Math.floor(xAt(-40) / 6);
  const lastCell = Math.floor(xAt(fb.width + 40) / 6);
  for (let cell = firstCell; cell <= lastCell; cell++) {
    const r = hash(cell);
    if (r % 3 !== 0) continue;
    const wx = cell * 6 + (r >>> 4) % 6;
    if (wx < h.takeoffXM + 4) continue;
    const sx = Math.round(toScreenX(cam, wx));
    const base = Math.round(toScreenY(cam, surfaceY(h, wx))) - FAR_EDGE_PX - 2;
    drawPine(fb, sx, base, 36 + ((r >>> 8) % 48), r);
  }
  // Fence along the far edge of the landing hill.
  for (let sx = 0; sx < fb.width; sx++) {
    const wx = xAt(sx);
    if (wx < h.takeoffXM + 1) continue;
    const fy = (ground[sx] ?? 0) - FAR_EDGE_PX - 1;
    fb.put(sx, fy, color("fence"));
    fb.put(sx, fy + 1, color("fence"));
    fb.put(sx, fy + 2, color("fenceDark"));
    if (((wx % 3) + 3) % 3 < 1 / PIXELS_PER_M) fb.rect(sx, fy - 1, 2, 5, color("post"));
  }
  drawInrun(fb, h, cam, ground);
}

/** A line across the landing hill at a distance from the takeoff, slanted by the oblique projection. */
function drawDistanceLine(fb: FrameBuffer, h: HillProfile, cam: Camera, distanceM: number, c: number, offsetPx: number): void {
  const x = xAtDistance(h, distanceM);
  const sx = toScreenX(cam, x) + offsetPx;
  const sy = toScreenY(cam, surfaceY(h, x));
  if (sx < -NEAR_EDGE_SHIFT_PX - 2 || sx > fb.width + NEAR_EDGE_SHIFT_PX + 2) return;
  fb.line(sx + NEAR_EDGE_SHIFT_PX, sy - FAR_EDGE_PX, sx - NEAR_EDGE_SHIFT_PX, sy + FAR_EDGE_PX, c);
}

const NEAR_FENCE_PX = 5;

/** The near fence, in front of the jumper's line (thick, as in the original). */
function drawNearFence(fb: FrameBuffer, h: HillProfile, cam: Camera, bottom: number): void {
  for (let sx = 0; sx < fb.width; sx++) {
    const wx = cam.x + (sx + NEAR_EDGE_SHIFT_PX - cam.cx) / PIXELS_PER_M;
    if (wx < h.takeoffXM + 1) continue;
    const top = Math.round(toScreenY(cam, surfaceY(h, wx))) + FAR_EDGE_PX - NEAR_FENCE_PX;
    const post = ((wx % 6) + 6) % 6 < 2 / PIXELS_PER_M;
    for (let i = 0; i < NEAR_FENCE_PX; i++) {
      if (top + i >= bottom) break;
      fb.put(sx, top + i, post ? color("post") : ramp("nearFence", "nearFenceDark", i / (NEAR_FENCE_PX - 1), 3));
    }
  }
}

/** Pixels a brush covers around its anchor: 2x2, or a 4x4 disc for thick bones (1f8b:00dc). */
const THIN_BRUSH: readonly (readonly [number, number])[] = [[0, 0], [1, 0], [0, 1], [1, 1]];
const THICK_BRUSH: readonly (readonly [number, number])[] = [
  ...THIN_BRUSH,
  [2, 0], [-1, 0], [0, -1], [1, -1], [-1, 1], [2, 1], [0, 2], [1, 2],
];

function brushLine(fb: FrameBuffer, xa: number, ya: number, xb: number, yb: number, c: number, thick: boolean): void {
  const brush = thick ? THICK_BRUSH : THIN_BRUSH;
  let x0 = Math.round(xa);
  let y0 = Math.round(ya);
  const x1 = Math.round(xb);
  const y1 = Math.round(yb);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let guard = 0; guard < 2048; guard++) {
    for (const [bx, by] of brush) fb.put(x0 + bx, y0 + by, c);
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

/** Colours of the jumper's outfit: a ramp per part, shade 0 (far side) to 5 (near side). */
const OUTFIT: Readonly<Record<BodyPart, readonly [ColorName, ColorName]>> = {
  suit: ["suitDark", "suitLight"],
  pants: ["suitDark", "suitLight"],
  sleeves: ["sleeveDark", "sleeveLight"],
  gloves: ["gloveDark", "gloveLight"],
  helmet: ["helmetDark", "helmetLight"],
  skis: ["redDark", "red"],
};
const SHADES = 5;

function drawJumper(fb: FrameBuffer, h: HillProfile, s: JumpSimState, cam: Camera): void {
  const j = s.jumper;
  const pts = skeletonPoints(s.pose, s.logic.frontLeg);
  const S = PIXELS_PER_M;
  const sx = (p: Point3) => cam.cx + (j.xM + p.x - cam.x - DEPTH_TO_X * p.z) * S;
  const sy = (p: Point3, y: number) => cam.cy - (y - cam.y - DEPTH_TO_Y * p.z) * S;
  const at = (i: number): Point3 => pts[i] ?? { z: 0, x: 0, y: 0 };
  // Shadow (1cb6:1d2a): the figure dropped onto the plane of the terrain under the jumper.
  const shadow = color("shadow");
  const groundY = groundUnder(h, j.xM);
  const slope = j.xM < h.takeoffXM ? inrunSlope(h, j.xM) : landingSlope(h, j.xM);
  const onGround = (p: Point3) => groundY + slope * p.x;
  for (const b of BONES) {
    const a = at(b.from);
    const e = at(b.to);
    brushLine(fb, sx(a), sy(a, onGround(a)), sx(e), sy(e, onGround(e)), shadow, b.thick);
  }
  for (const b of BONES) {
    const a = at(b.from);
    const e = at(b.to);
    const [dark, light] = OUTFIT[b.part];
    brushLine(fb, sx(a), sy(a, j.yM + a.y), sx(e), sy(e, j.yM + e.y), ramp(dark, light, b.shade / SHADES, SHADES), b.thick);
  }
}

function drawWindBox(fb: FrameBuffer, s: JumpSimState): void {
  const x = fb.width - 30;
  const y = 4;
  fb.rect(x, y, 26, 24, color("black"));
  fb.rect(x, y, 26, 1, color("grey"));
  fb.rect(x, y + 23, 26, 1, color("grey"));
  fb.rect(x, y, 1, 24, color("grey"));
  fb.rect(x + 25, y, 1, 24, color("grey"));
  const d = s.wind.indicatorDirectionRad;
  const cx = x + 13;
  const cy = y + 9;
  const ex = cx + Math.cos(d) * 6;
  const ey = cy - Math.sin(d) * 6;
  fb.line(cx - Math.cos(d) * 6, cy + Math.sin(d) * 6, ex, ey, color("red"));
  fb.line(ex, ey, ex - Math.cos(d - 0.6) * 4, ey + Math.sin(d - 0.6) * 4, color("red"));
  fb.line(ex, ey, ex - Math.cos(d + 0.6) * 4, ey + Math.sin(d + 0.6) * 4, color("red"));
  const label = s.wind.speedMPerS.toFixed(1);
  drawText(fb, x + 13 - Math.floor(textWidth(label) / 2), y + 15, label, color("yellow"));
}

/** Judges' notes in a column under the wind box, each from its own frame; the two discarded ones are dimmed. */
function drawNotes(fb: FrameBuffer, s: JumpSimState, frame: number): void {
  const x = fb.width - 31;
  let y = 32;
  for (const judge of s.logic.judges) {
    if (frame < judge.showFrame) continue;
    fb.rect(x, y, 27, 11, color("noteBorder"));
    fb.rect(x + 1, y + 1, 25, 9, color("noteBox"));
    const label = judge.note.toFixed(1);
    drawText(fb, x + 14 - Math.ceil(textWidth(label) / 2), y + 2, label, color(judge.counted ? "yellow" : "noteDropped"));
    y += 12;
  }
}

function phaseLabel(s: JumpSimState): string {
  const phase = s.logic.phase;
  if (phase === PHASE.crash) return "UPADEK";
  if (phase === PHASE.gate) return "BELKA";
  if (phase <= PHASE.crouch) return "NAJAZD";
  if (phase <= PHASE.afterTakeoff) return "WYBICIE";
  if (phase <= PHASE.flight) return "LOT";
  if (phase <= PHASE.landing) return "LĄDOWANIE";
  return "WYBIEG";
}

const LEAN_PROMPT: Readonly<Record<ControlScheme, string>> = {
  mouse: "MYSZ: POCHYLENIE",
  touch: "PRZECIĄGAJ W POLU L: POCHYLENIE",
  tilt: "PRZECHYLAJ TELEFON: POCHYLENIE",
};

function prompt(m: JumpViewModel, notesShown: boolean): readonly string[] {
  const s = m.state;
  const phase = s.logic.phase;
  const touch = m.controls !== "mouse";
  if (m.over && notesShown) return touch ? ["L: JESZCZE RAZ"] : ["KLIKNIJ: JESZCZE RAZ   ESC: SKOCZNIE"];
  if (phase === PHASE.gate) return [touch ? "L: START" : "LEWY PRZYCISK: START"];
  if (phase === PHASE.inrun || phase === PHASE.crouch) return [touch ? "L+P NA PROGU: WYBICIE" : "OBA PRZYCISKI NA PROGU"];
  // The original starts the landing (telemark) on a button press; about 0.4 s before touching down scores best.
  if (phase === PHASE.flightHold || phase === PHASE.flight) {
    return [LEAN_PROMPT[m.controls], touch ? "L LUB P TUŻ NAD ZIEMIĄ: TELEMARK" : "PRZYCISK TUŻ NAD ZIEMIĄ: TELEMARK"];
  }
  return [];
}

/** Bottom bar: player, then the phase and speed; after the jump the distance (half metres) and points, as in the original. */
function drawBar(fb: FrameBuffer, m: JumpViewModel, top: number, notesShown: boolean): void {
  const s = m.state;
  const L = s.logic;
  fb.rect(0, top, fb.width, BAR_HEIGHT_PX, color("bar"));
  fb.rect(0, top, fb.width, 1, color("grey"));
  const nameEnd = drawText(fb, 4, top + 2, m.playerName, color("yellow"));
  const middle = Math.round(fb.width * 0.47);
  if (L.finished && L.distanceM === 0) {
    drawText(fb, middle, top + 2, "DYSKWALIFIKACJA", color("red"));
    return;
  }
  if (L.finished) {
    drawText(fb, middle, top + 2, `${L.distanceHalfM.toFixed(1)} M`, color("yellow"));
    if (notesShown) {
      const points = L.points.toFixed(1);
      drawText(fb, fb.width - 4 - textWidth(points), top + 2, points, color("yellow"));
    }
    return;
  }
  drawText(fb, nameEnd + 10, top + 2, phaseLabel(s), L.phase === PHASE.crash ? color("red") : color("green"));
  // The simulation keeps `speedMPerS` for the ground; in the air the velocity vector is shown.
  const v = s.jumper.airborne ? Math.hypot(s.jumper.vxMPerS, s.jumper.vyMPerS) : s.jumper.speedMPerS;
  const speed = `${(v * MS_TO_KMH).toFixed(1)} KM/H`;
  drawText(fb, fb.width - 4 - textWidth(speed), top + 2, speed, color("white"));
}

const CAMERA_AHEAD_M = 4;
const CAMERA_BELOW_JUMPER_M = 2;

/** Draws one frame of the jump at the logical resolution. */
export function drawJumpView(fb: FrameBuffer, m: JumpViewModel): void {
  const s = m.state;
  const h = m.profile;
  const groundBottom = fb.height - BAR_HEIGHT_PX;
  const cam: Camera = {
    x: s.jumper.xM + CAMERA_AHEAD_M,
    y: s.jumper.yM - CAMERA_BELOW_JUMPER_M,
    cx: Math.round(fb.width * 0.45),
    cy: Math.round(groundBottom * 0.45),
  };
  const backdrop = backdropFor(h, cam);
  drawBackdrop(fb, backdrop, cam, groundBottom);
  drawBirds(fb, backdrop, m.frame);
  const ground = drawSlope(fb, h, cam, groundBottom);
  drawHill(fb, h, cam, ground);
  drawDistanceLine(fb, h, cam, m.kPointM, color("kLine"), 0);
  if (m.recordM !== undefined && m.recordM > 0) drawDistanceLine(fb, h, cam, m.recordM, color("recordLine"), 0);
  drawJumper(fb, h, s, cam);
  drawNearFence(fb, h, cam, groundBottom);
  // HUD: the hill, the wind box (the only wind reading, as in the original), prompts, notes.
  drawText(fb, 4, 4, `${m.hillName} K${m.kPointM}`, color("yellow"), color("black"));
  drawWindBox(fb, s);
  const finished = s.logic.finished;
  const notesShown = notesShownBy(s.logic, m.frame);
  const lines = prompt(m, notesShown);
  const steady = s.logic.phase === PHASE.flight || s.logic.phase === PHASE.flightHold;
  if (steady || Math.floor(m.frame / BLINK_FRAMES) % 2 === 0) {
    lines.forEach((line, i) => {
      drawText(fb, Math.round((fb.width - textWidth(line)) / 2), 34 + i * 10, line, color("white"), color("black"));
    });
  }
  // A disqualified jump (no takeoff) is never scored, so there are no notes to show.
  if (finished && s.logic.distanceM > 0) drawNotes(fb, s, m.frame);
  if (m.newRecord === true && notesShown && Math.floor(m.frame / BLINK_FRAMES) % 2 === 0) {
    const text = "NOWY REKORD SKOCZNI!";
    drawText(fb, Math.round((fb.width - textWidth(text)) / 2), 22, text, color("yellow"), color("black"));
  }
  drawBar(fb, m, groundBottom, notesShown);
}
