import { landingSlope, type HillProfile } from "../sim/hill-profile";
import { f32 } from "../sim/physics-constants";

/** Most steps the arc length walk takes; the original stops on an exact match, which may never come in doubles. */
const MAX_ARC_STEPS = 4096;

/**
 * 1eee:08fb: the x reached after `lengthM` of arc along the landing hill from `fromXM`, walked in steps of
 * `stepM` with the slope at the middle of each step; the last step is shortened to land on the length.
 */
export function landingXAtArcLength(h: HillProfile, fromXM: number, lengthM: number, stepM: number): number {
  const target = f32(lengthM);
  let walked = 0;
  let x = f32(fromXM);
  let step = f32(stepM);
  for (let i = 0; i < MAX_ARC_STEPS; i++) {
    const slope = landingSlope(h, f32(step / 2 + x));
    const stretch = f32(Math.sqrt(slope * slope + 1));
    if (step * stretch + walked > target) step = f32((target - walked) / stretch);
    walked = f32(step * stretch + walked);
    x = f32(x + step);
    if (walked >= target) break;
  }
  return x;
}

/**
 * A line drawn row by row as the original's 1f8b:0000 does: each row gets a run of pixels long enough to reach the
 * next row's start, so the line has no gaps however flat it is and two rows share one column where they meet.
 * Coordinates are whole pixels; `put` receives every pixel.
 */
export function rowRunLine(x0: number, y0: number, x1: number, y1: number, put: (x: number, y: number) => void): void {
  if (y0 === y1) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) put(x, y0);
    return;
  }
  // Draw downwards.
  const [ax, ay, bx, by] = y0 < y1 ? [x0, y0, x1, y1] : [x1, y1, x0, y0];
  const rows = by - ay + 1;
  const dir = bx >= ax ? 1 : -1;
  const advance = Math.floor(((Math.abs(bx - ax) & 0xff) << 8) / rows) + 1;
  let frac = 0;
  let x = ax;
  for (let y = ay; y <= by; y++) {
    frac += advance;
    const run = (frac >> 8) + 1;
    x -= dir;
    for (let i = 0; i < run; i++) {
      x += dir;
      put(x, y);
    }
    frac &= 0xff;
  }
}
