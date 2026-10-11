import { inrunSlope, inrunYM, landingSlope, landingYM, type HillProfile } from "../sim/hill-profile";
import { PHASE } from "../sim/jump-logic";
import type { JumpSimState } from "../sim/jump-sim";
import { FrameBuffer } from "./frame-buffer";
import { BONES, DEPTH_TO_X, DEPTH_TO_Y, skeletonPoints, type BodyPart, type Point3 } from "./jumper-skeleton";
import { color, ramp, type ColorName } from "./palette";
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
/** The far edge of the landing hill (with the fence) is drawn this much above the line the jumper lands on. */
const FAR_EDGE_PX = 26;
const BAR_HEIGHT_PX = 11;
const MS_TO_KMH = 3.6;

export interface JumpViewModel {
  profile: HillProfile;
  kPointM: number;
  hillName: string;
  playerName: string;
  state: JumpSimState;
}

const kPointCache = new WeakMap<HillProfile, number>();

/** x of the K point: arc length along the landing hill from the takeoff (display only). */
export function kPointX(h: HillProfile, kPointM: number): number {
  const cached = kPointCache.get(h);
  if (cached !== undefined) return cached;
  const step = 0.05;
  let x = h.takeoffXM;
  let length = 0;
  while (length < kPointM && x < h.outrunStartXM + 200) {
    const s = landingSlope(h, x + step / 2);
    length += Math.sqrt(s * s + 1) * step;
    x += step;
  }
  kPointCache.set(h, x);
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

function drawBackground(fb: FrameBuffer, h: HillProfile, cam: Camera, groundBottom: number): Int32Array {
  const ground = new Int32Array(fb.width);
  for (let sx = 0; sx < fb.width; sx++) {
    const wx = cam.x + (sx - cam.cx) / PIXELS_PER_M;
    const gy = Math.round(toScreenY(cam, surfaceY(h, wx)));
    ground[sx] = gy;
    const p = sx + cam.x * PIXELS_PER_M * 0.15;
    const ridge = Math.round(30 + 7 * Math.sin(p / 41) + 4 * Math.sin(p / 13 + 1));
    for (let sy = 0; sy < groundBottom; sy++) {
      let c: number;
      if (sy < ridge - 6) c = ramp("sky1", "sky2", sy / Math.max(1, ridge - 6), 6);
      else if (sy < ridge) c = ramp("sky2", "haze1", (sy - ridge + 6) / 6, 3);
      else if (sy < gy - FAR_EDGE_PX) c = ramp("haze1", "snow4", (sy - ridge) / Math.max(1, gy - FAR_EDGE_PX - ridge), 10);
      else if (sy < gy - FAR_EDGE_PX + 3) c = color("snow3");
      else c = ramp("snow1", "snow3", (sy - gy + FAR_EDGE_PX) / 110, 8);
      fb.pixels[sy * fb.width + sx] = c;
    }
  }
  return ground;
}

function drawPine(fb: FrameBuffer, x: number, base: number, height: number, seed: number): void {
  fb.rect(x - 1, base - 4, 3, 5, color("trunk"));
  const tiers = Math.max(3, Math.floor(height / 9));
  for (let i = 0; i < tiers; i++) {
    const top = base - 4 - Math.floor(((i + 1) * (height - 4)) / tiers) - 3;
    const bottom = base - 3 - Math.floor((i * (height - 4)) / tiers);
    const halfBottom = Math.max(2, Math.floor(height * 0.32 * (1 - i / (tiers + 1))));
    for (let y = top; y <= bottom; y++) {
      const half = Math.round((halfBottom * (y - top)) / Math.max(1, bottom - top));
      for (let xx = x - half; xx <= x + half; xx++) {
        const r = hash(seed + xx * 131 + y * 7919);
        if ((xx === x - half || xx === x + half) && r % 100 < 45) continue;
        let c = color(xx > x + half / 3 ? "tree1" : "tree2");
        if (xx < x - half / 2 && r % 2 === 0) c = color("tree3");
        if (r % 100 < 15) c = color("tree1");
        fb.put(xx, y, c);
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

function drawHill(fb: FrameBuffer, h: HillProfile, cam: Camera, ground: Int32Array, kX: number): void {
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
  // Fence along the landing hill.
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
  // K point marker.
  const ksx = Math.round(toScreenX(cam, kX));
  const ksy = Math.round(toScreenY(cam, surfaceY(h, kX)));
  fb.line(ksx, ksy - FAR_EDGE_PX, ksx + 4, ksy, color("green"));
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

/** Wind along the hill shown like in modern ski jumping: positive helps (head wind). */
function windLabel(s: JumpSimState): string {
  const v = -s.wind.xMPerS;
  return `WIATR ${v >= 0 ? "+" : "-"}${Math.abs(v).toFixed(1)}`;
}

function prompt(s: JumpSimState): string | null {
  const phase = s.logic.phase;
  if (s.logic.finished && !s.jumper.airborne && s.jumper.speedMPerS < 0.01) return "R: JESZCZE RAZ   ESC: SKOCZNIE";
  if (phase === PHASE.gate) return "LEWY PRZYCISK: START";
  if (phase === PHASE.inrun || phase === PHASE.crouch) return "OBA PRZYCISKI NA PROGU";
  if (phase === PHASE.flight) return "MYSZ: POCHYLENIE   PRZYCISK: LĄDOWANIE";
  return null;
}

function drawResult(fb: FrameBuffer, s: JumpSimState): void {
  const L = s.logic;
  const w = 184;
  const x = Math.round((fb.width - w) / 2);
  const y = fb.height - BAR_HEIGHT_PX - 56;
  fb.rect(x, y, w, 48, color("black"));
  fb.rect(x, y, w, 1, color("yellow"));
  fb.rect(x, y + 47, w, 1, color("yellow"));
  const dist = `${L.distanceM.toFixed(2)} M`;
  drawText(fb, x + 6, y + 6, "ODLEGŁOŚĆ", color("white"));
  drawText(fb, x + w - 6 - textWidth(dist), y + 6, dist, color("yellow"));
  const pts = `${L.points.toFixed(1)} PKT`;
  drawText(fb, x + 6, y + 18, "PUNKTY", color("white"));
  drawText(fb, x + w - 6 - textWidth(pts), y + 18, pts, color("yellow"));
  const notes = L.judges.map((j) => j.note.toFixed(1)).join(" ");
  drawText(fb, x + 6, y + 32, notes, L.fallType !== 0 ? color("red") : color("white"));
}

/** Draws one frame of the jump at the logical resolution. */
export function drawJumpView(fb: FrameBuffer, m: JumpViewModel): void {
  const s = m.state;
  const groundBottom = fb.height - BAR_HEIGHT_PX;
  const cam: Camera = {
    x: s.jumper.xM + 4,
    y: s.jumper.yM - 2,
    cx: Math.round(fb.width * 0.45),
    cy: Math.round(groundBottom * 0.45),
  };
  const ground = drawBackground(fb, m.profile, cam, groundBottom);
  drawHill(fb, m.profile, cam, ground, kPointX(m.profile, m.kPointM));
  drawJumper(fb, m.profile, s, cam);
  // HUD
  drawText(fb, 4, 4, `${m.hillName} K${m.kPointM}`, color("yellow"), color("black"));
  drawText(fb, 4, 13, windLabel(s), color("white"), color("black"));
  drawWindBox(fb, s);
  const p = prompt(s);
  if (p !== null && Math.floor(s.logic.frame / 35) % 2 === 0) {
    drawText(fb, Math.round((fb.width - textWidth(p)) / 2), 34, p, color("white"), color("black"));
  }
  if (s.logic.finished && s.logic.distanceM > 0) drawResult(fb, s);
  fb.rect(0, groundBottom, fb.width, BAR_HEIGHT_PX, color("black"));
  fb.rect(0, groundBottom, fb.width, 1, color("grey"));
  const nameEnd = drawText(fb, 4, groundBottom + 2, m.playerName, color("yellow"));
  drawText(fb, nameEnd + 10, groundBottom + 2, phaseLabel(s), s.logic.phase === PHASE.crash ? color("red") : color("green"));
  // The simulation keeps `speedMPerS` for the ground; in the air the velocity vector is shown.
  const v = s.jumper.airborne ? Math.hypot(s.jumper.vxMPerS, s.jumper.vyMPerS) : s.jumper.speedMPerS;
  const speed = `${(v * MS_TO_KMH).toFixed(1)} KM/H`;
  drawText(fb, fb.width - 4 - textWidth(speed), groundBottom + 2, speed, color("white"));
}

