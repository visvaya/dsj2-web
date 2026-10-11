import { landingSlope, landingYM, type HillProfile } from "./hill-profile";
import { f32 } from "./physics-constants";

/** Inrun parameters as passed to 1eee:051f. */
export interface InrunSpec {
  startXM: number;
  flatEndXM: number;
  lineEndXM: number;
  takeoffXM: number;
  lineSlope: number;
  lineInterceptM: number;
  /** Quadratic coefficient of the curve between the straight part and the takeoff. */
  curveA: number;
}

/** Landing hill parameters as passed to 1eee:06e1. */
export interface LandingSpec {
  centerXM: number;
  centerYM: number;
  amplitudeM: number;
  widthM: number;
  outrunStartXM: number;
  /** Quadratic coefficient of the outrun. */
  outrunCurveA: number;
  knollBlend: number;
}

export const INRUN_FRICTION_COEF = f32(0.02);
export const LANDING_FRICTION_COEF = f32(0.05);

/**
 * 1eee:051f followed by 1eee:06e1: stores the parameters as Singles and
 * derives the coefficients that keep the inrun curve and the outrun
 * continuous with a matching slope.
 */
export function buildHillProfile(inrun: InrunSpec, landing: LandingSpec): HillProfile {
  const lineEnd = f32(inrun.lineEndXM);
  const lineSlope = f32(inrun.lineSlope);
  const intercept = f32(inrun.lineInterceptM);
  const curveA = f32(inrun.curveA);
  const curveB = f32(lineSlope - 2 * curveA * lineEnd);
  const curveC = f32(lineSlope * lineEnd + intercept - curveA * lineEnd * lineEnd - curveB * lineEnd);
  const partial: HillProfile = {
    startXM: f32(inrun.startXM),
    inrunFlatEndXM: f32(inrun.flatEndXM),
    inrunLineEndXM: lineEnd,
    takeoffXM: f32(inrun.takeoffXM),
    inrunLineSlope: lineSlope,
    inrunLineInterceptM: intercept,
    inrunCurveA: curveA,
    inrunCurveB: curveB,
    inrunCurveCM: curveC,
    inrunFrictionCoef: INRUN_FRICTION_COEF,
    landingCenterXM: f32(landing.centerXM),
    landingCenterYM: f32(landing.centerYM),
    landingAmplitudeM: f32(landing.amplitudeM),
    landingInvWidthPerM: f32(1 / f32(landing.widthM)),
    outrunStartXM: f32(landing.outrunStartXM),
    outrunCurveA: f32(landing.outrunCurveA),
    outrunCurveB: 0,
    outrunCurveCM: 0,
    landingFrictionCoef: LANDING_FRICTION_COEF,
    // Set last in the original; below the takeoff only, so it does not affect the outrun join.
    knollBlend: 0,
  };
  const x0 = partial.outrunStartXM;
  const a = partial.outrunCurveA;
  const outrunB = f32(landingSlope(partial, x0) - 2 * a * x0);
  const outrunC = f32(landingYM(partial, x0) - a * x0 * x0 - outrunB * x0);
  return { ...partial, outrunCurveB: outrunB, outrunCurveCM: outrunC, knollBlend: f32(landing.knollBlend) };
}
