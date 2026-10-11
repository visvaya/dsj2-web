import { inrunSlope, inrunYM, landingSlope, landingYM, type HillProfile } from "../sim/hill-profile";
import { PHASE, notesShownBy } from "../sim/jump-logic";
import type { JumpSimState } from "../sim/jump-sim";
import { FrameBuffer } from "./frame-buffer";
import { BONES, DEPTH_TO_X, DEPTH_TO_Y, skeletonPoints, type BodyPart, type Point3 } from "./jumper-skeleton";
import { DEFAULT_OUTFIT, type Outfit, type OutfitPart } from "../game/outfit";
import { displayedWindMPerS } from "../game/wind-display";
import { band, color, rampTable, swatchRampTable, withLook, type Lighting } from "./palette";
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

/** Look of the scene; purely visual, the simulation never sees it. */
export interface Scenery {
  lighting: Lighting;
  snowfall: boolean;
  fog: boolean;
}

export const DAY_SCENERY: Scenery = { lighting: "day", snowfall: false, fog: false };

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
  /** Time of day and weather; a clear day when absent. */
  scenery?: Scenery;
  /** The jumper's colours; the original's player 1 when absent. */
  outfit?: Outfit;
  /** Accumulated drift of the displayed wind, in metres, for the falling snow. */
  windDriftM?: { x: number; y: number };
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
const SKYLINE_AT_GATE_PX = 38;

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
function drawBackdrop(fb: FrameBuffer, b: Backdrop, cam: Camera, bottom: number, night: boolean, frame: number): void {
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
      px[sy * fb.width + sx] = ridge.shaded ? (snow ? range.snowShade : range.rockShade) : snow ? range.snow : range.rock;
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
      fb.pixels[y * fb.width + x] = color(crater ? "moonShade" : "moon");
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

/** Tree colours under the current lighting, looked up once per tree instead of per pixel. */
function treeColors() {
  return { dark: color("tree1"), mid: color("tree2"), light: color("tree3"), trunk: color("trunk") };
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

/** Half width of the inrun trough, which the drawn figure stays within. */
const TROUGH_HALF_WIDTH_M = 1.5;
const TOWER_BACK_M = 6;
const TOWER_FRONT_M = 2;
const TOWER_INSET_M = 1.2;
/** The inrun's far rail appears this many pixels right of the near wall (the original's scenery depth). */
const INRUN_FAR_SHIFT_PX = 32;
/** Far rail and near wall thickness in pixels, measured on the original's screen. */
const INRUN_RAIL_PX = 8;
const INRUN_WALL_PX = 24;
const PILLAR_SPACING_M = 12;
const PILLAR_WIDTH_M = 2.2;
const INRUN_LAMP_SPACING_M = 8;
/** Share of a support's width that is its front face; the rest is the shaded side. */
const SUPPORT_SIDE_FROM = 0.8;
const MAST_SPACING_M = 30;
const MAST_HEIGHT_PX = 78;
const LAMP_GLOW_PX = 7;

function inBand(v: number, from: number, width: number): number | null {
  const t = (v - from) / width;
  return t >= 0 && t <= 1 ? t : null;
}

/**
 * The inrun as the original draws its scenery: the far rail is the near wall's top line moved right and up
 * (depth recedes up and to the right), so the platform behind the gate shows as a block with a slanted back
 * edge, the track as a light band between the rail and the near wall, and the takeoff ends in a slanted face.
 * Pixel sizes and shades measured on the original's screen.
 */
function drawInrun(fb: FrameBuffer, h: HillProfile, cam: Camera, ground: Int32Array, lightsOn: boolean): void {
  const xAt = (sx: number) => cam.x + (sx - cam.cx) / PIXELS_PER_M;
  const Y = (y: number) => Math.round(toScreenY(cam, y));
  const from = h.startXM - TOWER_BACK_M;
  const to = h.takeoffXM;
  const inRange = (x: number) => x >= from && x <= to;
  /** Top of the near wall (the jumper's skis run along it) at world x. */
  const nearTopAt = (x: number) => Y(inrunYM(h, Math.max(x, from))) - 1;
  const support = rampTable("towerDark", "towerLight", 6);
  const side = color("towerSide");
  const track = rampTable("trackFar", "trackNear", 3);
  const wall = rampTable("wallLight", "wallDark", 4);
  const rail = rampTable("inrunRim", "inrunInner", 2);
  const face = rampTable("endLight", "endDark", 3);
  /** Rail shade by row counted from its bottom: 2 darkest rows, 3 middle, 3 light, as in the original. */
  const railShade = (fromBottom: number) => band(rail, fromBottom < 2 ? 1 : fromBottom < 5 ? 0.5 : 0);
  const sxBack = Math.round(toScreenX(cam, from));
  const sxTakeoff = Math.round(toScreenX(cam, to));
  for (let sx = 0; sx < fb.width; sx++) {
    const wx = xAt(sx);
    const wf = xAt(sx - INRUN_FAR_SHIFT_PX);
    const near = inRange(wx);
    const far = inRange(wf);
    if (!near && !far && !(sx > sxTakeoff && sx <= sxTakeoff + INRUN_FAR_SHIFT_PX)) continue;
    const gy = ground[sx] ?? fb.height;
    // Supports first: the start tower (set back from the platform's edge) and pillars, lit from the right.
    if (near) {
      const nearBottom = nearTopAt(wx) + INRUN_WALL_PX;
      const tower = inBand(wx, from + TOWER_INSET_M, TOWER_BACK_M - TOWER_INSET_M + TOWER_FRONT_M);
      const k = Math.round((wx - h.startXM - 10) / PILLAR_SPACING_M);
      const pillarFrom = h.startXM + 10 + k * PILLAR_SPACING_M - PILLAR_WIDTH_M / 2;
      const pillar = wx < to - 6 && k >= 0 ? inBand(wx, pillarFrom, PILLAR_WIDTH_M) : null;
      const shade = tower ?? pillar;
      if (shade !== null && gy > nearBottom) {
        fb.rect(sx, nearBottom, 1, gy - nearBottom, shade > SUPPORT_SIDE_FROM ? side : band(support, shade / SUPPORT_SIDE_FROM));
      }
    }
    // Far rail: where the back edge has not reached it yet, a slanted top face of the platform instead.
    let railBottom: number | null = null;
    if (far) {
      const top = nearTopAt(wf) - INRUN_RAIL_PX;
      for (let i = 0; i < INRUN_RAIL_PX; i++) fb.put(sx, top + i, railShade(INRUN_RAIL_PX - 1 - i));
      railBottom = top + INRUN_RAIL_PX;
    } else if (near) {
      // Every column the far rail has not reached yet belongs to the slanted back edge (no gap where they meet).
      const rows = Math.min(INRUN_RAIL_PX, Math.floor((INRUN_RAIL_PX * (sx - sxBack)) / INRUN_FAR_SHIFT_PX));
      const top = nearTopAt(wx) - rows;
      for (let i = 0; i < rows; i++) fb.put(sx, top + i, railShade(rows - 1 - i));
    }
    if (near) {
      const nearTop = nearTopAt(wx);
      // Track: the light band between the far rail and the near wall (none on the flat platform).
      if (railBottom !== null) {
        for (let y = railBottom; y < nearTop; y++) fb.put(sx, y, band(track, (y - railBottom) / Math.max(1, nearTop - railBottom)));
      }
      for (let i = 0; i < INRUN_WALL_PX; i++) fb.put(sx, nearTop + i, band(wall, i / (INRUN_WALL_PX - 1)));
    } else if (sx > sxTakeoff) {
      // Front face of the takeoff table, from the near wall's end up to the far rail's end.
      const t = (sx - sxTakeoff) / INRUN_FAR_SHIFT_PX;
      const nearTop = nearTopAt(to);
      const farTop = nearTop - INRUN_RAIL_PX;
      // Its top edge rises to the far rail's top, its bottom edge to the rail's bottom.
      const top = Math.round(nearTop + (farTop - nearTop) * t);
      const bottom = Math.round(nearTop + INRUN_WALL_PX + (nearTop - (nearTop + INRUN_WALL_PX)) * t);
      for (let y = Math.max(top, railBottom ?? top); y < bottom; y++) fb.put(sx, y, band(face, (y - top) / Math.max(1, bottom - top)));
    }
  }
  if (lightsOn) {
    // Lamps on the far rail.
    const lamp = color("lampLight");
    for (let x = h.startXM; x < to; x += INRUN_LAMP_SPACING_M) {
      const sx = Math.round(toScreenX(cam, x)) + INRUN_FAR_SHIFT_PX;
      fb.rect(sx, nearTopAt(x) - INRUN_RAIL_PX - 2, 2, 2, lamp);
    }
  }
}

function drawHill(fb: FrameBuffer, h: HillProfile, cam: Camera, ground: Int32Array, lightsOn: boolean): void {
  const xAt = (sx: number) => cam.x + (sx - cam.cx) / PIXELS_PER_M;
  const farEdge = ground.map((gy) => gy - FAR_EDGE_PX);
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

/** Floodlight masts behind the far fence, every 30 m from the takeoff; their lamps glow in a dithered halo. */
function drawFloodlights(fb: FrameBuffer, h: HillProfile, cam: Camera): void {
  const pole = color("post");
  const lamp = color("lampLight");
  const glow = color("lampGlow");
  const first = h.takeoffXM + 12;
  const from = Math.max(first, first + Math.floor((cam.x - fb.width / PIXELS_PER_M - first) / MAST_SPACING_M) * MAST_SPACING_M);
  for (let x = from; x < cam.x + fb.width / PIXELS_PER_M; x += MAST_SPACING_M) {
    const sx = Math.round(toScreenX(cam, x));
    if (sx < -LAMP_GLOW_PX - 4 || sx > fb.width + LAMP_GLOW_PX + 4) continue;
    const base = Math.round(toScreenY(cam, surfaceY(h, x))) - FAR_EDGE_PX - 1;
    const top = base - MAST_HEIGHT_PX;
    fb.rect(sx, top, 2, MAST_HEIGHT_PX, pole);
    for (let dy = -LAMP_GLOW_PX; dy <= LAMP_GLOW_PX; dy++) {
      for (let dx = -LAMP_GLOW_PX - 2; dx <= LAMP_GLOW_PX + 3; dx++) {
        if ((dx + dy) % 2 !== 0 || dx * dx + dy * dy > (LAMP_GLOW_PX + 1) * (LAMP_GLOW_PX + 1)) continue;
        fb.put(sx + dx, top + dy, glow);
      }
    }
    fb.rect(sx - 3, top - 2, 8, 3, lamp);
  }
}

const SOCK_SPACING_M = 25;
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
function drawWindSocks(fb: FrameBuffer, h: HillProfile, cam: Camera, s: JumpSimState, frame: number): void {
  const pole = color("post");
  const red = color("sockRed");
  const white = color("sockWhite");
  const [ux0, uy0] = windSockDirection(s);
  const k = Math.min(1, s.wind.speedMPerS / SOCK_FULL_WIND_M_PER_S);
  const first = h.takeoffXM + 5;
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

/** Which outfit colour each body part wears; the suit is the "Spodnie" colour, as in the original. */
const PART_COLOUR: Readonly<Record<BodyPart, OutfitPart>> = {
  suit: "pants",
  pants: "pants",
  sleeves: "sleeves",
  gloves: "gloves",
  helmet: "helmet",
  skis: "skis",
};
/** How far inside the landing hill's edges the figure stays. */
const FIGURE_EDGE_MARGIN_M = 0.4;
/** Shade 0 (far side) to 5 (near side) within a part's ramp. */
const SHADES = 5;

/** Plane of the terrain under the jumper: height at an offset `dx` from the jumper, in metres. */
function terrainPlane(h: HillProfile, xM: number): (dx: number) => number {
  const groundY = groundUnder(h, xM);
  const slope = xM < h.takeoffXM ? inrunSlope(h, xM) : landingSlope(h, xM);
  return (dx) => groundY + slope * dx;
}

/** Half width the figure has to stay within: the inrun trough, or the landing hill less a margin. */
export function figureHalfWidthM(h: HillProfile, xM: number): number {
  return xM < h.takeoffXM ? TROUGH_HALF_WIDTH_M : SLOPE_HALF_WIDTH_M - FIGURE_EDGE_MARGIN_M;
}

/**
 * Skeleton points as drawn, relative to the jumper. Display only: in a fall the original's pose can push a ski
 * into the snow or out past the fence, so points are kept on or above the terrain plane and within the width
 * of the trough or the landing hill.
 */
export function figurePoints(h: HillProfile, s: JumpSimState): Point3[] {
  const j = s.jumper;
  const ground = terrainPlane(h, j.xM);
  const halfWidth = figureHalfWidthM(h, j.xM);
  return skeletonPoints(s.pose, s.logic.frontLeg).map((p) => ({
    x: p.x,
    z: Math.max(-halfWidth, Math.min(halfWidth, p.z)),
    y: Math.max(p.y, ground(p.x) - j.yM),
  }));
}

function drawJumper(fb: FrameBuffer, h: HillProfile, s: JumpSimState, cam: Camera, outfit: Outfit): void {
  const j = s.jumper;
  const S = PIXELS_PER_M;
  const onGround = (p: Point3) => terrainPlane(h, j.xM)(p.x);
  const pts = figurePoints(h, s);
  const sx = (p: Point3) => cam.cx + (j.xM + p.x - cam.x - DEPTH_TO_X * p.z) * S;
  const sy = (p: Point3, y: number) => cam.cy - (y - cam.y - DEPTH_TO_Y * p.z) * S;
  const at = (i: number): Point3 => pts[i] ?? { z: 0, x: 0, y: 0 };
  // Shadow (1cb6:1d2a): the figure dropped onto the plane of the terrain under the jumper.
  const shadow = color("shadow");
  for (const b of BONES) {
    const a = at(b.from);
    const e = at(b.to);
    brushLine(fb, sx(a), sy(a, onGround(a)), sx(e), sy(e, onGround(e)), shadow, b.thick);
  }
  for (const b of BONES) {
    const a = at(b.from);
    const e = at(b.to);
    const shades = swatchRampTable(outfit[PART_COLOUR[b.part]], SHADES);
    brushLine(fb, sx(a), sy(a, j.yM + a.y), sx(e), sy(e, j.yM + e.y), band(shades, b.shade / SHADES), b.thick);
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

/** Snowflake layers: parallax (1 = moves with the hill), flakes per 100 px of width, fall speed in px per frame. */
const SNOW_LAYERS = [
  { parallax: 0.45, per100Px: 12, fallPx: 0.35, size: 1, color: "flakeFar" },
  { parallax: 0.7, per100Px: 9, fallPx: 0.6, size: 1, color: "flake" },
  { parallax: 1, per100Px: 5, fallPx: 0.9, size: 2, color: "flake" },
] as const;

/** Falling snow, carried by the displayed wind (along the hill and vertically) and moving with the camera. */
function drawSnowfall(fb: FrameBuffer, drift: { x: number; y: number }, cam: Camera, frame: number, bottom: number): void {
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

const CAMERA_AHEAD_M = 4;
const CAMERA_BELOW_JUMPER_M = 2;

/** The jumper on the hill without the interface, the camera on the jumper (outfit preview). */
export function drawJumperPreview(fb: FrameBuffer, m: { profile: HillProfile; state: JumpSimState; outfit: Outfit }): void {
  withLook({ lighting: "day", fog: false }, () => {
    const s = m.state;
    const cam: Camera = { x: s.jumper.xM, y: s.jumper.yM, cx: Math.round(fb.width / 2), cy: Math.round(fb.height * 0.55) };
    const backdrop = backdropFor(m.profile, cam);
    drawBackdrop(fb, backdrop, cam, fb.height, false, 0);
    const ground = drawSlope(fb, m.profile, cam, fb.height);
    drawHill(fb, m.profile, cam, ground, false);
    drawJumper(fb, m.profile, s, cam, m.outfit);
    drawNearFence(fb, m.profile, cam, fb.height);
  });
}

/** Draws one frame of the jump at the logical resolution. */
export function drawJumpView(fb: FrameBuffer, m: JumpViewModel): void {
  const scenery = m.scenery ?? DAY_SCENERY;
  withLook({ lighting: scenery.lighting, fog: scenery.fog }, () => drawScene(fb, m, scenery));
}

function drawScene(fb: FrameBuffer, m: JumpViewModel, scenery: Scenery): void {
  const night = scenery.lighting === "night";
  // Fog hides the stars and the moon.
  const clearNight = night && !scenery.fog;
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
  drawBackdrop(fb, backdrop, cam, groundBottom, clearNight, m.frame);
  if (!night) drawBirds(fb, backdrop, m.frame);
  const ground = drawSlope(fb, h, cam, groundBottom);
  // Lamps are on from dusk.
  drawHill(fb, h, cam, ground, scenery.lighting !== "day");
  drawWindSocks(fb, h, cam, s, m.frame);
  drawDistanceLine(fb, h, cam, m.kPointM, color("kLine"), 0);
  if (m.recordM !== undefined && m.recordM > 0) drawDistanceLine(fb, h, cam, m.recordM, color("recordLine"), 0);
  drawJumper(fb, h, s, cam, m.outfit ?? DEFAULT_OUTFIT);
  drawNearFence(fb, h, cam, groundBottom);
  if (scenery.snowfall) drawSnowfall(fb, m.windDriftM ?? { x: 0, y: 0 }, cam, m.frame, groundBottom);
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
