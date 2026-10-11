import { inrunYM, landingSlope, landingYM, type HillProfile } from "../sim/hill-profile";
import { PHASE } from "../sim/jump-logic";
import type { JumpSimState } from "../sim/jump-sim";
import { SKI_JOINT, UPPER_SEGMENT } from "../sim/pose";
import { FrameBuffer } from "./frame-buffer";
import { color, ramp } from "./palette";
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
export const PIXELS_PER_M = 11;
/** The far edge of the landing hill (with the fence) is drawn this much above the line the jumper lands on. */
const FAR_EDGE_PX = 26;
const BAR_HEIGHT_PX = 11;
const SKI_LENGTH_M = 2.4;
const TORSO_LENGTH_M = 0.9;
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
  // Inrun on pillars.
  for (let sx = 0; sx < fb.width; sx++) {
    const wx = xAt(sx);
    if (wx < h.startXM - 8 || wx > h.takeoffXM) continue;
    const iy = Math.round(toScreenY(cam, inrunYM(h, wx)));
    fb.rect(sx, iy, 1, 3, color("steel1"));
    fb.rect(sx, iy + 3, 1, 3, color("steel2"));
    const pillar = ((wx % 10) + 10) % 10 < 3 / PIXELS_PER_M;
    if (pillar || wx < h.startXM + 2) fb.rect(sx, iy + 6, 1, (ground[sx] ?? 0) - FAR_EDGE_PX - iy - 6, color("steel3"));
  }
  // K point marker.
  const ksx = Math.round(toScreenX(cam, kX));
  const ksy = Math.round(toScreenY(cam, surfaceY(h, kX)));
  fb.line(ksx, ksy - FAR_EDGE_PX, ksx + 4, ksy, color("green"));
}

function drawJumper(fb: FrameBuffer, s: JumpSimState, cam: Camera, ground: number): void {
  const j = s.jumper;
  const fx = toScreenX(cam, j.xM);
  const fy = toScreenY(cam, j.yM);
  // Shadow on the landing hill.
  if (j.airborne) {
    fb.rect(fx - 6, ground + 1, 13, 1, color("shadow"));
    fb.rect(fx - 4, ground + 2, 9, 1, color("shadow"));
  }
  const ski = s.pose.legs[0].joints.current[SKI_JOINT] ?? 0;
  const knee = s.pose.legs[0].segments.current[UPPER_SEGMENT] ?? 1;
  const phase = s.logic.phase;
  // Simplified silhouette until the original skeleton drawing is ported.
  let legAngle: number;
  let torsoAngle: number;
  if (phase === PHASE.crash) {
    legAngle = ski + 0.1;
    torsoAngle = ski;
  } else if (j.airborne || (phase >= PHASE.takeoff && phase <= PHASE.landingPrep)) {
    legAngle = ski + 0.35;
    torsoAngle = ski + 0.15 + s.logic.bodyAngleRad * 0.2;
  } else if (phase >= PHASE.landing) {
    legAngle = ski + Math.PI / 2 - 0.25;
    torsoAngle = ski + Math.PI / 2 - 0.15;
  } else {
    legAngle = ski + Math.PI / 2 - 0.9 + (knee - 0.54);
    torsoAngle = ski + 0.3;
  }
  const S = PIXELS_PER_M;
  const half = (SKI_LENGTH_M / 2) * S;
  const dx = Math.cos(ski);
  const dy = -Math.sin(ski);
  fb.line(fx - dx * half, fy - dy * half, fx + dx * half, fy + dy * half, color("red"));
  fb.line(fx - dx * half + 1, fy - dy * half + 1, fx + dx * half + 1, fy + dy * half + 1, color("redDark"));
  const hx = fx + Math.cos(legAngle) * knee * 0.9 * S;
  const hy = fy - Math.sin(legAngle) * knee * 0.9 * S;
  fb.line(fx, fy - 1, hx, hy, color("blue"));
  fb.line(fx + 1, fy - 1, hx + 1, hy, color("blue"));
  const tx = hx + Math.cos(torsoAngle) * TORSO_LENGTH_M * S;
  const ty = hy - Math.sin(torsoAngle) * TORSO_LENGTH_M * S;
  fb.line(hx, hy, tx, ty, color("blue"));
  fb.line(hx, hy - 1, tx, ty - 1, color("white"));
  fb.rect(tx - 1, ty - 2, 3, 3, color("yellow"));
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
  const y = 40;
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
  const jsx = Math.round(toScreenX(cam, s.jumper.xM));
  drawJumper(fb, s, cam, ground[Math.min(fb.width - 1, Math.max(0, jsx))] ?? groundBottom);
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

