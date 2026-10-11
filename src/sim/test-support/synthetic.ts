import { detExp } from "../deterministic-math";
import { landingSlope, landingYM, terrainYM, type HillProfile } from "../hill-profile";
import { PHASE, type FrameInput } from "../jump-logic";
import type { JumpSimState } from "../jump-sim";
import { f32 } from "../physics-constants";
import type { WindState } from "../wind";

/**
 * A hill made up for tests (not taken from the original game), built the way
 * the original derives the dependent curve coefficients.
 */
export function syntheticHill(): HillProfile {
  const lineSlope = -0.9;
  const lineEnd = 32;
  const intercept = 230;
  const curveA = 0.0296;
  const curveB = lineSlope - 2 * curveA * lineEnd;
  const curveC = lineSlope * lineEnd + intercept - curveA * lineEnd * lineEnd - curveB * lineEnd;
  const takeoff = 44;
  const takeoffY = curveA * takeoff * takeoff + curveB * takeoff + curveC;
  const amplitude = 30;
  const invWidth = 1 / 40;
  const center = 95;
  const u = (center - takeoff) * invWidth;
  const tanhU = (detExp(u) - detExp(-u)) / (detExp(u) + detExp(-u));
  const centerY = takeoffY - 3 - amplitude * tanhU;
  const base: HillProfile = {
    startXM: f32(11.4),
    inrunFlatEndXM: f32(10),
    inrunLineEndXM: f32(lineEnd),
    takeoffXM: f32(takeoff),
    inrunLineSlope: f32(lineSlope),
    inrunLineInterceptM: f32(intercept),
    inrunCurveA: f32(curveA),
    inrunCurveB: f32(curveB),
    inrunCurveCM: f32(curveC),
    inrunFrictionCoef: f32(0.02),
    landingCenterXM: f32(center),
    landingCenterYM: f32(centerY),
    landingAmplitudeM: f32(amplitude),
    landingInvWidthPerM: f32(invWidth),
    outrunStartXM: f32(160),
    outrunCurveA: 0,
    outrunCurveB: 0,
    outrunCurveCM: 0,
    landingFrictionCoef: f32(0.05),
    knollBlend: 0,
  };
  const outrunA = 0.012;
  const slopeAtStart = landingSlope(base, base.outrunStartXM);
  const outrunB = slopeAtStart - 2 * outrunA * base.outrunStartXM;
  const outrunC = landingYM(base, base.outrunStartXM) - outrunA * base.outrunStartXM ** 2 - outrunB * base.outrunStartXM;
  return { ...base, outrunCurveA: f32(outrunA), outrunCurveB: f32(outrunB), outrunCurveCM: f32(outrunC) };
}

export function calmWind(seedOffset = 0): WindState {
  return {
    xMPerS: f32(-0.4 + seedOffset * 0.1),
    yMPerS: f32(0.3),
    variabilityMPerS: f32(0.2),
    speedMPerS: f32(0.5),
    directionRad: f32(2.5),
    indicatorDirectionRad: f32(2.5),
    indicatorTurnRateRad: 0,
    indicatorMaxTurnRateRad: f32(0.2),
  };
}

export interface BotOptions {
  startFrame: number;
  /** Metres before the edge at which both takeoff buttons go down. */
  takeoffLeadM: number;
  /** Height above the terrain at which the landing button is pressed; null never lands. */
  landingHeightM: number | null;
  /** Mouse motion pattern during flight. */
  leanPattern: (frame: number) => number;
}

/** Input that reacts to the current state, like a player would. */
export function makeBot(hill: HillProfile, opts: BotOptions, current: () => JumpSimState): (frame: number) => FrameInput {
  return (frame) => {
    const s = current();
    const { phase } = s.logic;
    const j = s.jumper;
    if (frame === opts.startFrame) return { left: true, right: false, dy: 0 };
    if (phase === PHASE.crouch && j.xM >= hill.takeoffXM - opts.takeoffLeadM) return { left: true, right: true, dy: 0 };
    if (phase === PHASE.takeoff && !j.airborne) return { left: true, right: true, dy: 0 };
    if (phase === PHASE.flight) {
      const height = j.yM - terrainYM(hill, j.xM);
      if (opts.landingHeightM !== null && height < opts.landingHeightM) return { left: false, right: true, dy: 0 };
      return { left: false, right: false, dy: opts.leanPattern(frame) };
    }
    return { left: false, right: false, dy: 0 };
  };
}

/** FNV-1a over the single-precision bits of the main state, frame by frame. */
export function stateHash(prev: number, s: JumpSimState): number {
  const view = new DataView(new ArrayBuffer(4));
  let h = prev >>> 0;
  const mix = (bits: number) => {
    h ^= bits;
    h = Math.imul(h, 0x01000193) >>> 0;
  };
  const values = [
    s.jumper.xM,
    s.jumper.yM,
    s.jumper.vxMPerS,
    s.jumper.vyMPerS,
    s.jumper.speedMPerS,
    s.logic.bodyAngleRad,
    s.pose.legs[0].joints.current[1] ?? 0,
    s.pose.legs[1].joints.current[1] ?? 0,
    s.pose.legs[0].segments.current[0] ?? 0,
  ];
  for (const v of values) {
    view.setFloat32(0, v, true);
    mix(view.getUint32(0, true));
  }
  mix(s.randomSeed);
  mix(s.logic.phase);
  return h;
}
