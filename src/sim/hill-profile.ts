import { detAtan, detExp } from "./deterministic-math";
import { f32 } from "./physics-constants";

/**
 * Hill geometry in metres (x forward, y up), as set up by the original
 * routines 1eee:051f (inrun) and 1eee:06e1 (landing hill). All values are
 * Singles in the original.
 */
export interface HillProfile {
  startXM: number;
  /** Inrun: flat up to flatEndXM, straight line up to lineEndXM, then a parabola. */
  inrunFlatEndXM: number;
  inrunLineEndXM: number;
  takeoffXM: number;
  inrunLineSlope: number;
  inrunLineInterceptM: number;
  inrunCurveA: number;
  inrunCurveB: number;
  inrunCurveCM: number;
  inrunFrictionCoef: number;
  /** Landing hill: y = centerY - amplitude * tanh((x - centerX) * invWidth) up to outrunStartXM. */
  landingCenterXM: number;
  landingCenterYM: number;
  landingAmplitudeM: number;
  landingInvWidthPerM: number;
  outrunStartXM: number;
  outrunCurveA: number;
  outrunCurveB: number;
  outrunCurveCM: number;
  landingFrictionCoef: number;
  /** Weight of the inrun shape blended into the landing hill below the takeoff. */
  knollBlend: number;
}

/** 1eee:0000: inrun height. */
export function inrunYM(h: HillProfile, x: number): number {
  let y = 0;
  if (x < h.inrunFlatEndXM) {
    y = f32(h.inrunLineSlope * h.inrunFlatEndXM + h.inrunLineInterceptM);
  }
  if (x <= h.inrunLineEndXM && x >= h.inrunFlatEndXM) {
    y = f32(h.inrunLineSlope * x + h.inrunLineInterceptM);
  }
  if (x > h.inrunLineEndXM) {
    y = f32(h.inrunCurveA * x * x + h.inrunCurveB * x + h.inrunCurveCM);
  }
  return y;
}

/** 1eee:00c1: inrun slope dy/dx. */
export function inrunSlope(h: HillProfile, x: number): number {
  let s = 0;
  if (x < h.inrunFlatEndXM) {
    s = 0;
  }
  if (x <= h.inrunLineEndXM && x >= h.inrunFlatEndXM) {
    s = f32(h.inrunLineSlope);
  }
  if (x > h.inrunLineEndXM) {
    s = f32(2 * h.inrunCurveA * x + h.inrunCurveB);
  }
  return s;
}

function inrunCurveYM(h: HillProfile, x: number): number {
  return h.inrunCurveA * x * x + h.inrunCurveB * x + h.inrunCurveCM;
}

/** 1eee:015e: landing hill height (the original caches the last x; results are identical). */
export function landingYM(h: HillProfile, x: number): number {
  let y: number;
  if (x > h.outrunStartXM) {
    y = f32(h.outrunCurveA * x * x + h.outrunCurveB * x + h.outrunCurveCM);
  } else {
    const t = x - h.landingCenterXM;
    const ePos = detExp(t * h.landingInvWidthPerM);
    const eNeg = detExp(-t * h.landingInvWidthPerM);
    y = f32(((eNeg - ePos) * h.landingAmplitudeM) / (ePos + eNeg) + h.landingCenterYM);
  }
  if (x <= h.takeoffXM) {
    y = f32(y - inrunCurveYM(h, h.takeoffXM) * h.knollBlend);
    if (x <= h.inrunLineEndXM) {
      y = f32((h.inrunLineSlope * x + h.inrunLineInterceptM) * h.knollBlend + y);
    } else {
      y = f32(inrunCurveYM(h, x) * h.knollBlend + y);
    }
  }
  return y;
}

/** 1eee:0312: landing hill slope dy/dx. */
export function landingSlope(h: HillProfile, x: number): number {
  let s: number;
  if (x > h.outrunStartXM) {
    s = f32(2 * h.outrunCurveA * x + h.outrunCurveB);
  } else {
    const t = x - h.landingCenterXM;
    const sum = detExp(t * h.landingInvWidthPerM) + detExp(-t * h.landingInvWidthPerM);
    s = f32((-4 * h.landingAmplitudeM * h.landingInvWidthPerM) / (sum * sum));
  }
  if (x <= h.takeoffXM) {
    s = f32(s - (2 * h.inrunCurveA * h.takeoffXM + h.inrunCurveB) * h.knollBlend);
    if (x <= h.inrunLineEndXM) {
      s = f32(h.inrunLineSlope * h.knollBlend + s);
    } else {
      s = f32((2 * h.inrunCurveA * x + h.inrunCurveB) * h.knollBlend + s);
    }
  }
  return s;
}

/** 1eee:0627: terrain height used when landing. Note the strict `<`. */
export function terrainYM(h: HillProfile, x: number): number {
  return x < h.takeoffXM ? inrunYM(h, x) : landingYM(h, x);
}

/** 1eee:0676: terrain slope angle in radians (negative when descending). */
export function terrainSlopeRad(h: HillProfile, x: number): number {
  return x > h.takeoffXM ? f32(detAtan(landingSlope(h, x))) : f32(detAtan(inrunSlope(h, x)));
}

/**
 * 1eee:0830: arc length of the landing hill between two x positions,
 * integrated with the midpoint rule and the given step.
 */
export function landingArcLengthM(h: HillProfile, fromXM: number, toXM: number, stepM: number): number {
  let x = f32(fromXM);
  let step = f32(stepM);
  let length = 0;
  for (;;) {
    if (x + step > toXM) {
      step = f32(toXM - x);
    }
    const slope = landingSlope(h, f32(step / 2 + x));
    length = f32(Math.sqrt(slope * slope + 1) * step + length);
    x = f32(x + step);
    if (x === toXM) {
      return length;
    }
  }
}
