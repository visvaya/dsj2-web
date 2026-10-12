import { landingYM, type HillProfile } from "../sim/hill-profile";
import { DEPTH_TO_Y } from "./jumper-skeleton";
import { color } from "./palette";

/** 14 px/m across and 14*200/240 down on the original's 4:3 screen: equal once pixels are square. */
export const PIXELS_PER_M = (14 * 200) / 240;
/** Half width of the landing hill; its edges carry the fences. */
export const SLOPE_HALF_WIDTH_M = 4.5;
/** The far edge of the landing hill sits this much above the line the jumper lands on, the near edge as much below. */
export const FAR_EDGE_PX = Math.round(DEPTH_TO_Y * SLOPE_HALF_WIDTH_M * PIXELS_PER_M);

/** Deterministic hash for scenery placement (no flicker between frames). */
export function hash(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

export interface Camera {
  x: number;
  y: number;
  cx: number;
  cy: number;
}

export const toScreenX = (cam: Camera, x: number) => cam.cx + (x - cam.x) * PIXELS_PER_M;
export const toScreenY = (cam: Camera, y: number) => cam.cy + (cam.y - y) * PIXELS_PER_M;

export function surfaceY(h: HillProfile, x: number): number {
  const clamped = Math.min(Math.max(x, -40), h.outrunStartXM + 120);
  return landingYM(h, clamped);
}

const SINE_STEPS = 4096;
const SINE = Float32Array.from({ length: SINE_STEPS }, (_, i) => Math.sin((2 * Math.PI * i) / SINE_STEPS));

/** Table sine for per-pixel shading (display only; the simulation never uses it). */
export function fastSin(v: number): number {
  return SINE[Math.floor((v * SINE_STEPS) / (2 * Math.PI)) & (SINE_STEPS - 1)] ?? 0;
}

/** Tree colours under the current lighting, looked up once per tree instead of per pixel. */
export function treeColors() {
  return { dark: color("tree1"), mid: color("tree2"), light: color("tree3"), trunk: color("trunk") };
}

export const CAMERA_AHEAD_M = 4;
export const CAMERA_BELOW_JUMPER_M = 2;
