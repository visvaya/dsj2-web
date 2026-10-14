import type { Outfit, OutfitPart } from "../game/outfit";
import { inrunSlope, inrunYM, landingSlope, type HillProfile } from "../sim/hill-profile";
import type { JumpSimState } from "../sim/jump-sim";
import type { FrameBuffer } from "./frame-buffer";
import { PIXELS_PER_M, SLOPE_HALF_WIDTH_M, surfaceY, type Camera } from "./jump-view-camera";
import { TOWER_BACK_M } from "./jump-view-inrun";
import { BONES, DEPTH_TO_X, DEPTH_TO_Y, skeletonPoints, type BodyPart, type Point3 } from "./jumper-skeleton";
import { band, color, swatchRampTable } from "./palette";

/** Where a shadow falls: the inrun track up to the takeoff, the landing hill after it. */
function groundUnder(h: HillProfile, x: number): number {
  return x < h.takeoffXM && x >= h.startXM - TOWER_BACK_M ? inrunYM(h, x) : surfaceY(h, x);
}

/** Half width of the inrun trough, which the drawn figure stays within. */
const TROUGH_HALF_WIDTH_M = 1.5;

/** Pixels a brush covers around its anchor: 2x2, or a 4x4 disc for thick bones (1f8b:00dc). */
const THIN_BRUSH: readonly (readonly [number, number])[] = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
];
const THICK_BRUSH: readonly (readonly [number, number])[] = [
  ...THIN_BRUSH,
  [2, 0],
  [-1, 0],
  [0, -1],
  [1, -1],
  [-1, 1],
  [2, 1],
  [0, 2],
  [1, 2],
];

/** Where a brush puts a pixel: into the picture, or into a mask that is blended into it later. */
export type Plot = (x: number, y: number) => void;

/** A line drawn with the brush of the original's figure: every pixel of it goes to `plot`. */
export function brushLine(plot: Plot, xa: number, ya: number, xb: number, yb: number, thick: boolean): void {
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
    for (const [bx, by] of brush) plot(x0 + bx, y0 + by);
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
/** How high above the snow any part of a jumper lying after a fall may be drawn. */
export const FALLEN_MAX_HEIGHT_M = 0.8;
/** How far inside the landing hill's edges the figure stays. */
const FIGURE_EDGE_MARGIN_M = 0.4;
/** Shade 0 (far side) to 5 (near side) within a part's ramp. */
export const BONE_SHADES = 5;

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
  // A fallen jumper lying on the snow (or in the inrun) keeps everything low, so a ski cannot stand up past
  // the inrun's walls or the fences in the side view.
  const lying = s.logic.fallType !== 0 && !j.airborne;
  return skeletonPoints(s.pose, s.logic.frontLeg).map((p) => {
    const floor = ground(p.x) - j.yM;
    const y = Math.max(p.y, floor);
    return {
      x: p.x,
      z: Math.max(-halfWidth, Math.min(halfWidth, p.z)),
      y: lying ? Math.min(y, floor + FALLEN_MAX_HEIGHT_M) : y,
    };
  });
}

export function drawJumper(fb: FrameBuffer, h: HillProfile, s: JumpSimState, cam: Camera, outfit: Outfit): void {
  const j = s.jumper;
  const S = PIXELS_PER_M;
  const onGround = (p: Point3) => terrainPlane(h, j.xM)(p.x);
  const pts = figurePoints(h, s);
  const sx = (p: Point3) => cam.cx + (j.xM + p.x - cam.x - DEPTH_TO_X * p.z) * S;
  const sy = (p: Point3, y: number) => cam.cy - (y - cam.y - DEPTH_TO_Y * p.z) * S;
  const at = (i: number): Point3 => pts[i] ?? { z: 0, x: 0, y: 0 };
  // Shadow (1cb6:1d2a): the figure dropped onto the plane of the terrain under the jumper.
  const shadow = color("shadow");
  const putShadow: Plot = (x, y) => fb.put(x, y, shadow);
  for (const b of BONES) {
    const a = at(b.from);
    const e = at(b.to);
    brushLine(putShadow, sx(a), sy(a, onGround(a)), sx(e), sy(e, onGround(e)), b.thick);
  }
  for (const b of BONES) {
    const a = at(b.from);
    const e = at(b.to);
    const c = band(swatchRampTable(outfit[PART_COLOUR[b.part]], BONE_SHADES), b.shade / BONE_SHADES);
    brushLine((x, y) => fb.put(x, y, c), sx(a), sy(a, j.yM + a.y), sx(e), sy(e, j.yM + e.y), b.thick);
  }
}
