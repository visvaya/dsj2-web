import { readFileSync } from "node:fs";
import type { HillProfile } from "../hill-profile";
import type { JumperControls, JumperState } from "../jumper-step";
import type { FrameInput, JumpLogicState } from "../jump-logic";
import type { LegPose, PoseState } from "../pose";
import type { WindState } from "../wind";

/**
 * Reader for traces written by tools/re/trace_capture.py. A trace holds
 * data-segment snapshots of the original game; it is derived from the game
 * and stays outside the repository (golden-files.ts finds it).
 */
export const TRACE_POINT = { windUpdate: 0, jumperStep: 1, readInput: 2, frameLogic: 3, hillSetup: 4 } as const;

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

export function decodePose(v: DataView): PoseState {
  const leg = (l: number): LegPose => {
    const segs = [0, 1];
    const joints = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    return {
      segments: {
        current: segs.map((s) => f(v, 0x52f4 + 8 * (l + 1) + 4 * (s + 1))),
        target: segs.map((s) => f(v, 0x5364 + 8 * (l + 1) + 4 * (s + 1))),
        rate: segs.map((s) => f(v, 0x5404 + 8 * (l + 1) + 4 * (s + 1))),
      },
      joints: {
        current: joints.map((k) => f(v, 0x52e0 + 0x2c * (l + 1) + 4 * (k + 1))),
        target: joints.map((k) => f(v, 0x5358 + 0x24 * (l + 1) + 4 * (k + 1))),
        rate: joints.map((k) => f(v, 0x53a0 + 0x24 * (l + 1) + 4 * (k + 1))),
      },
    };
  };
  return { poseId: v.getInt16(0x52fa, true), poseTimeS: f(v, 0x52fc), legs: [leg(0), leg(1)] };
}

export function decodeLogic(v: DataView): JumpLogicState {
  const judges = [1, 2, 3, 4, 5].map((k) => {
    const base = 0x4c3f + 0x109 * k;
    return { showFrame: v.getInt32(base, true), counted: b(v, base + 4), note: f(v, base + 5) };
  });
  return {
    frame: v.getInt32(0x4ca0, true),
    phase: v.getUint8(0x4cbb),
    startCountdown: v.getInt16(0x4ca5, true),
    finished: b(v, 0x4ca8),
    inrunFrames: v.getInt32(0x5de0, true),
    bodyAngleRad: f(v, 0x4cbc),
    skiWobbleRad: [f(v, 0x4cc0), f(v, 0x4cc4)],
    armWobbleRad: [f(v, 0x4cc8), f(v, 0x4ccc)],
    takeoffForceNs: f(v, 0x4cd0),
    takeoffTimingS: f(v, 0x4cb7),
    flightStyle: f(v, 0x4caa),
    styleRampS: f(v, 0x4cb3),
    flightTimeS: f(v, 0x4caf),
    landingPrepS: f(v, 0x4cde),
    impact: [0x4ce2, 0x4ce6, 0x4cea, 0x4cee, 0x4cf2].map((a) => f(v, a)),
    impactMean: f(v, 0x4cf6),
    fallType: v.getUint8(0x4d04),
    fallSeverity: v.getInt16(0x4cfa, true),
    legSpreadRad: [f(v, 0x4cfc), f(v, 0x4d00)],
    frontLeg: v.getUint8(0x4cdc) - 1,
    backLeg: v.getUint8(0x4cdd) - 1,
    bounceCount: v.getUint8(0x4cae),
    liftFactor: f(v, 0x4d06),
    groundProximity: f(v, 0x2a0e),
    distanceM: f(v, 0x528e),
    distanceHalfM: f(v, 0x5292),
    points: f(v, 0x5286),
    judges,
    endFrame: v.getInt32(0x4d40, true),
    landedFrame: v.getInt32(0x4d44, true),
  };
}

export function decodeInput(v: DataView): FrameInput {
  return { left: b(v, 0x4666), right: b(v, 0x4667), dy: v.getInt16(0x4664, true) };
}

export const decodeKPoint = (v: DataView): number => v.getInt16(0x464c, true);

/** Flattens nested numbers and booleans into path/value pairs for comparisons. */
function flatten(value: unknown, path = "", out: [string, number | boolean][] = []): [string, number | boolean][] {
  if (typeof value === "number" || typeof value === "boolean") {
    out.push([path, value]);
  } else if (Array.isArray(value)) {
    value.forEach((item, i) => flatten(item, `${path}[${i}]`, out));
  } else if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      flatten(item, path ? `${path}.${key}` : key, out);
    }
  }
  return out;
}

/**
 * Lists differences beyond a relative tolerance; ignores the paths in `skip`. Whole numbers (the generator
 * seed, counters, phases) are compared exactly: a tolerance scaled by a value in the billions would let a seed
 * drift by thousands.
 */
export function diffStates(
  got: unknown,
  want: unknown,
  tolerance: number,
  skip: ReadonlySet<string> = new Set(),
): string[] {
  const g = new Map(flatten(got));
  const bad: string[] = [];
  for (const [path, w] of flatten(want)) {
    if (skip.has(path)) continue;
    const a = g.get(path);
    if (typeof w === "number" && typeof a === "number") {
      const allowed = Number.isInteger(a) && Number.isInteger(w) ? 0 : tolerance * Math.max(1, Math.abs(w));
      if (!(Math.abs(a - w) <= allowed)) bad.push(`${path}: ${a} != ${w}`);
    } else if (a !== w) {
      bad.push(`${path}: ${String(a)} != ${String(w)}`);
    }
  }
  return bad;
}
