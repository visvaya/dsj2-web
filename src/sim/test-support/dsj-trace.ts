import { readFileSync } from "node:fs";
import type { HillProfile } from "../hill-profile";
import type { JumperControls, JumperState } from "../jumper-step";
import type { WindState } from "../wind";

/**
 * Reader for traces written by tools/re/trace_capture.py. A trace holds
 * data-segment snapshots of the original game; it is derived from the game
 * and stays outside the repository (pass its path in DSJ2_TRACE).
 */
export const TRACE_POINT = { windUpdate: 0, jumperStep: 1, readInput: 2, frameLogic: 3 } as const;

export interface TraceSnapshot {
  frame: number;
  point: number;
  view: DataView;
}

export function readTrace(path: string): TraceSnapshot[] {
  const buf = readFileSync(path);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const magic = buf.subarray(0, 8).toString("latin1");
  if (magic !== "DSJTRACE") {
    throw new Error(`not a DSJ trace: ${path}`);
  }
  const snapshotBytes = view.getUint32(12, true);
  const count = view.getUint32(16, true);
  const out: TraceSnapshot[] = [];
  let pos = 20;
  for (let i = 0; i < count; i++) {
    const frame = view.getUint32(pos, true);
    const point = view.getUint8(pos + 4);
    out.push({ frame, point, view: new DataView(buf.buffer, buf.byteOffset + pos + 5, snapshotBytes) });
    pos += 5 + snapshotBytes;
  }
  return out;
}

const f = (v: DataView, a: number) => v.getFloat32(a, true);
const b = (v: DataView, a: number) => v.getUint8(a) !== 0;

/** Data-segment addresses of v2.10P (see tools/re/dsj_symbols.py). */
export function decodeJumperState(v: DataView): JumperState {
  return {
    xM: f(v, 0x5298),
    yM: f(v, 0x52a0),
    vxMPerS: f(v, 0x52a4),
    vyMPerS: f(v, 0x52a8),
    speedMPerS: f(v, 0x52ac),
    trackAngleRad: f(v, 0x52b0),
    prevXM: f(v, 0x52b4),
    prevYM: f(v, 0x52b8),
    xBeforeMoveM: f(v, 0x529c),
    airborne: b(v, 0x5296),
    contactEvent: b(v, 0x5297),
    landed: b(v, 0x52e8),
    refYM: f(v, 0x52d8),
    refSpeedMPerS: f(v, 0x52dc),
    energyLostJ: f(v, 0x52e4),
    massKg: f(v, 0x52e0),
    slopeAngleRad: f(v, 0x52f2),
    impulseXNs: f(v, 0x4cd4),
    impulseYNs: f(v, 0x4cd8),
    flowAngleRad: f(v, 0x42ba),
    relativeSpeedMPerS: f(v, 0x42be),
    forceBodyN: f(v, 0x52c4),
    forceSki1N: f(v, 0x52c8),
    forceSki2N: f(v, 0x52cc),
    forceYN: f(v, 0x52d0),
    forceXN: f(v, 0x52d4),
    impactAngleRad: f(v, 0x52ed),
    impactSpeedMPerS: f(v, 0x52e9),
  };
}

export function decodeJumperControls(v: DataView): JumperControls {
  return {
    dtS: f(v, 0x14ee),
    windSpeedMPerS: f(v, 0x4d1c),
    windDirectionRad: f(v, 0x4d20),
    bodyAngleRad: f(v, 0x4cbc),
    ski1AngleRad: f(v, 0x5314),
    ski2AngleRad: f(v, 0x5340),
    liftFactor: f(v, 0x4d06),
    poseId: v.getInt16(0x52fa, true),
  };
}

export function decodeHill(v: DataView): HillProfile {
  return {
    startXM: f(v, 0x45b2),
    inrunFlatEndXM: f(v, 0x45c6),
    inrunLineEndXM: f(v, 0x45ca),
    takeoffXM: f(v, 0x45ce),
    inrunLineSlope: f(v, 0x45ba),
    inrunLineInterceptM: f(v, 0x45be),
    inrunCurveA: f(v, 0x45d2),
    inrunCurveB: f(v, 0x45d6),
    inrunCurveCM: f(v, 0x45da),
    inrunFrictionCoef: f(v, 0x45b6),
    landingCenterXM: f(v, 0x4628),
    landingCenterYM: f(v, 0x462c),
    landingAmplitudeM: f(v, 0x4630),
    landingInvWidthPerM: f(v, 0x4634),
    outrunStartXM: f(v, 0x4638),
    outrunCurveA: f(v, 0x463c),
    outrunCurveB: f(v, 0x4640),
    outrunCurveCM: f(v, 0x4644),
    landingFrictionCoef: f(v, 0x4624),
    knollBlend: f(v, 0x4655),
  };
}

export function decodeWind(v: DataView): WindState {
  return {
    xMPerS: f(v, 0x4d10),
    yMPerS: f(v, 0x4d14),
    variabilityMPerS: f(v, 0x4d18),
    speedMPerS: f(v, 0x4d1c),
    directionRad: f(v, 0x4d20),
    indicatorDirectionRad: f(v, 0x4d24),
    indicatorTurnRateRad: f(v, 0x4d28),
    indicatorMaxTurnRateRad: f(v, 0x4d2c),
  };
}

export const decodeRandSeed = (v: DataView): number => v.getUint32(0x1942, true);
export const decodeFrame = (v: DataView): number => v.getUint32(0x4ca0, true);
