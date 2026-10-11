import type { BorlandRandom } from "./borland-random";
import { detCos } from "./deterministic-math";
import { roundHalfEven, toWord, truncToInt } from "./pascal-numeric";
import { f32 } from "./physics-constants";

/**
 * Skeleton of the jumper (module 1cb6 of the original): two legs, each with
 * two segment lengths (upper, lower) and nine joint angles. Every channel moves
 * towards its target at a constant rate; a pose sets targets and rates at once.
 * Joint k of the original (1..9) is stored at index k - 1.
 */
export const JOINT_COUNT = 9;
/** Joint 2: ski pitch, used by the flight physics. */
export const SKI_JOINT = 1;
export const UPPER_SEGMENT = 0;
export const LOWER_SEGMENT = 1;
/** Table value meaning "use the terrain slope angle". */
export const SLOPE_MARKER = -99;
export const UPPER_SEGMENT_MAX_M = 1.08;
export const LOWER_SEGMENT_MAX_M = 0.74;
/** Pose id written directly (not through the table) after a crash landing. */
export const CRASH_POSE_ID = 100;

export interface Channels {
  current: number[];
  target: number[];
  rate: number[];
}

export interface LegPose {
  segments: Channels;
  joints: Channels;
}

export interface PoseState {
  poseId: number;
  poseTimeS: number;
  legs: [LegPose, LegPose];
}

export interface PoseLegDefinition {
  upperLength: number;
  upperRate: number;
  lowerLength: number;
  lowerRate: number;
  jointTargets: readonly number[];
  jointRates: readonly number[];
}

export type PoseDefinition = readonly [PoseLegDefinition, PoseLegDefinition];

function zeros(count: number): number[] {
  return Array.from({ length: count }, () => 0);
}

function channels(count: number): Channels {
  return { current: zeros(count), target: zeros(count), rate: zeros(count) };
}

/** Leg by index (0 or 1); throws on anything else. */
export function legOf(p: PoseState, index: number): LegPose {
  const leg = p.legs[index];
  if (!leg) {
    throw new RangeError(`no leg ${index}`);
  }
  return leg;
}

export function emptyPose(): PoseState {
  return {
    poseId: 0,
    poseTimeS: 0,
    legs: [
      { segments: channels(2), joints: channels(JOINT_COUNT) },
      { segments: channels(2), joints: channels(JOINT_COUNT) },
    ],
  };
}

function cloneChannels(c: Channels): Channels {
  return { current: [...c.current], target: [...c.target], rate: [...c.rate] };
}

export function clonePose(p: PoseState): PoseState {
  return {
    poseId: p.poseId,
    poseTimeS: p.poseTimeS,
    legs: [
      { segments: cloneChannels(p.legs[0].segments), joints: cloneChannels(p.legs[0].joints) },
      { segments: cloneChannels(p.legs[1].segments), joints: cloneChannels(p.legs[1].joints) },
    ],
  };
}

/** 1cb6:0d15. Mutates `p`. Rate > 0 starts a move; rate 0 (or <= 0 for segments) snaps. */
export function setPose(
  p: PoseState,
  poseId: number,
  slopeAngleRad: number,
  table: ReadonlyMap<number, PoseDefinition>,
): void {
  const def = table.get(poseId);
  if (!def) {
    throw new RangeError(`unknown pose ${poseId}`);
  }
  p.poseId = poseId;
  for (let leg = 0; leg < 2; leg++) {
    const d = def[leg];
    if (!d) {
      throw new RangeError(`pose ${poseId} lacks leg ${leg}`);
    }
    const { segments: seg, joints } = legOf(p, leg);
    const upper = f32(UPPER_SEGMENT_MAX_M * f32(d.upperLength));
    if (f32(d.upperRate) > 0) {
      seg.target[UPPER_SEGMENT] = upper;
      seg.rate[UPPER_SEGMENT] = f32(d.upperRate);
    } else {
      seg.current[UPPER_SEGMENT] = upper;
      seg.rate[UPPER_SEGMENT] = 0;
    }
    const lower = f32(LOWER_SEGMENT_MAX_M * f32(d.lowerLength));
    if (f32(d.lowerRate) > 0) {
      seg.target[LOWER_SEGMENT] = lower;
      seg.rate[LOWER_SEGMENT] = f32(d.lowerRate);
    } else {
      seg.current[LOWER_SEGMENT] = lower;
      seg.rate[LOWER_SEGMENT] = 0;
    }
    for (let k = 0; k < JOINT_COUNT; k++) {
      const rate = f32(d.jointRates[k] ?? 0);
      const raw = f32(d.jointTargets[k] ?? 0);
      const value = raw === SLOPE_MARKER ? slopeAngleRad : raw;
      if (rate > 0) {
        joints.target[k] = value;
        joints.rate[k] = rate;
      }
      if (rate === 0) {
        joints.current[k] = value;
        joints.rate[k] = 0;
      }
    }
  }
}

function approach(c: Channels, i: number, dtS: number): void {
  const cur = c.current[i] ?? 0;
  const tgt = c.target[i] ?? 0;
  if (cur === tgt) {
    return;
  }
  const rate = c.rate[i] ?? 0;
  if (!(Math.abs(rate * dtS) <= Math.abs(tgt - cur))) {
    c.current[i] = tgt;
  } else if (tgt > cur) {
    c.current[i] = f32(rate * dtS + cur);
  } else {
    c.current[i] = f32(cur - rate * dtS);
  }
}

/** 1cb6:107d, once per frame. Mutates `p`. */
export function animatePose(p: PoseState, dtS: number): void {
  p.poseTimeS = f32(p.poseTimeS + dtS);
  for (const leg of p.legs) {
    approach(leg.segments, UPPER_SEGMENT, dtS);
    approach(leg.segments, LOWER_SEGMENT, dtS);
  }
  for (let k = 0; k < JOINT_COUNT; k++) {
    for (const leg of p.legs) {
      approach(leg.joints, k, dtS);
    }
  }
}

function setJoint(p: PoseState, leg: number, k: number, target: number, rate: number): void {
  const joints = legOf(p, leg).joints;
  joints.target[k] = f32(target);
  joints.rate[k] = f32(rate);
}

/** 1cb6:015e: flight pose driven by the body angle and arm wobble. Mutates `p`. */
export function applyFlightPose(p: PoseState, bodyAngleRad: number, armWobbleRad: readonly [number, number]): void {
  setJoint(p, 0, 0, -bodyAngleRad / 3 + 0.42, 2);
  setJoint(p, 1, 0, -bodyAngleRad / 3 + 0.42, 2);
  setJoint(p, 0, 2, 0.64 + bodyAngleRad, 10);
  setJoint(p, 1, 2, 0.64 + bodyAngleRad, 10);
  setJoint(p, 0, 4, 0.8 * bodyAngleRad + 0.257, 10);
  setJoint(p, 0, 5, 0.8 + bodyAngleRad, 10);
  setJoint(p, 0, 6, bodyAngleRad * 0.5 + armWobbleRad[0] + 0.15, 10);
  setJoint(p, 1, 6, bodyAngleRad * 0.5 + armWobbleRad[1] + 0.15, 10);
  setJoint(p, 0, 7, bodyAngleRad * 0.5 + 0.3, 10);
  setJoint(p, 1, 7, bodyAngleRad * 0.5 + 0.3, 10);
}

/** 1cb6:0315: on the track, skis follow the slope (keeping whole turns). Mutates `p`. */
export function applyGroundPose(p: PoseState, slopeAngleRad: number): void {
  setJoint(p, 0, 8, slopeAngleRad / 3 + 0.2, 1);
  for (let leg = 0; leg < 2; leg++) {
    const joints = legOf(p, leg).joints;
    const turns = truncToInt((joints.current[SKI_JOINT] ?? 0) / (2 * Math.PI)) * 2;
    setJoint(p, leg, SKI_JOINT, turns * Math.PI + detCos(joints.current[0] ?? 0) * slopeAngleRad, 3);
  }
}

/** 1cb6:003a: preparing to land; the front leg reaches forward. Mutates `p`. */
export function applyLandingPrepPose(p: PoseState, frontLeg: number, backLeg: number, prepS: number, slopeAngleRad: number): void {
  setJoint(p, frontLeg, 2, 0.8 * prepS + 1.5 + slopeAngleRad * prepS * 1.6, 4);
  setJoint(p, backLeg, 2, 1.5 - 0.7 * prepS + slopeAngleRad * prepS * 1.6, 4);
  setJoint(p, 0, 4, 1.4 - 0.3 * prepS + 0.3 * slopeAngleRad, 4);
}

/** 1cb6:0a9e: absorbing the landing. Mutates `p`. */
export function applyLandingAbsorbPose(p: PoseState, frontLeg: number, backLeg: number, prepS: number, slopeAngleRad: number): void {
  setJoint(p, 0, 6, 0.2 * slopeAngleRad + 3.5, 3);
  setJoint(p, 1, 6, 0.2 * slopeAngleRad + 3.5, 3);
  for (const leg of p.legs) {
    leg.segments.target[LOWER_SEGMENT] = f32(0.518);
    leg.segments.rate[LOWER_SEGMENT] = 1;
  }
  setJoint(p, 0, 7, 1.3, 3);
  setJoint(p, 1, 7, 1.3, 3);
  const upper = f32((prepS * 0.5 + 0.6) * UPPER_SEGMENT_MAX_M);
  legOf(p, frontLeg).segments.target[UPPER_SEGMENT] = upper;
  legOf(p, backLeg).segments.target[UPPER_SEGMENT] = upper;
  p.legs[0].segments.rate[UPPER_SEGMENT] = 2;
  p.legs[1].segments.rate[UPPER_SEGMENT] = 2;
  legOf(p, frontLeg).joints.target[2] = f32(1.3 * prepS + 1.5 + slopeAngleRad * prepS * 1.6);
  p.legs[0].joints.rate[2] = 2;
  legOf(p, backLeg).joints.target[2] = f32(1.49 - 1.3 * prepS + slopeAngleRad * prepS * 1.3);
  p.legs[1].joints.rate[2] = 2;
  setJoint(p, 0, 4, 1.2 - 0.6 * prepS + 0.3 * slopeAngleRad, 1);
  setJoint(p, 0, 3, 0.18, 1.3);
  setJoint(p, 1, 3, 0.18, 1.3);
  setJoint(p, 0, 0, 0, 1);
  setJoint(p, 1, 0, 0, 1);
}

/** Parameters of 1cb6:0457 in call order. */
export interface PerturbParams {
  offsetRad: number;
  spreadRad: number;
  rateBase: number;
  rateSpread: number;
}

/** Takeoff from a crash (1c06:02a1 calls 1cb6:0457 with these values). */
export const CRASH_TAKEOFF_PERTURB: PerturbParams = {
  offsetRad: f32(3.4),
  spreadRad: f32(2.5),
  rateBase: f32(0.5),
  rateSpread: f32(2.2),
};

/** Joints 1..7 (1-based) except 4: the loop in 1cb6:0457 skips 4 and stops after 7. */
const PERTURBED_JOINTS = [0, 1, 2, 4, 5, 6] as const;

/** 1cb6:0457: random disturbance of the pose on impact. Mutates `p`, consumes `rng`. */
export function perturbPose(p: PoseState, a: PerturbParams, rng: BorlandRandom): void {
  const spreadRange = toWord(roundHalfEven(a.spreadRad * 100));
  const rateRange = toWord(roundHalfEven(a.rateSpread * 100));
  for (const k of PERTURBED_JOINTS) {
    for (const leg of p.legs) {
      const j = leg.joints;
      const base = (j.target[k] ?? 0) * 0.5 + (j.current[k] ?? 0) * 0.5;
      const offset = rng.below(spreadRange) / 100 + a.offsetRad;
      if (k === 0) {
        const sign = rng.below(2) * 2 - 1;
        j.target[k] = f32(base - offset * sign * 0.1);
      } else {
        j.target[k] = f32(base - offset);
      }
    }
    for (const leg of p.legs) {
      leg.joints.rate[k] = f32(rng.below(rateRange) / 100 + a.rateBase);
    }
  }
  const [l0, l1] = p.legs;
  const kneeMean = ((l0.joints.target[2] ?? 0) + (l1.joints.target[2] ?? 0)) * 0.5;
  l0.joints.target[4] = f32(kneeMean);
  l0.joints.rate[2] = l0.joints.rate[4] ?? 0;
  l1.joints.rate[2] = l0.joints.rate[4] ?? 0;
  l0.joints.target[SKI_JOINT] = f32((l0.joints.target[2] ?? 0) - 1.5);
  l1.joints.target[SKI_JOINT] = f32((l1.joints.target[2] ?? 0) - 1.5);
  l0.joints.rate[SKI_JOINT] = f32(0.4);
  l1.joints.rate[SKI_JOINT] = f32(0.4);
  l0.joints.target[5] = f32(kneeMean);
  l0.joints.rate[5] = l0.joints.rate[4] ?? 0;
  l0.joints.target[3] = f32((rng.below(4) + 8) / 10);
  l1.joints.target[3] = f32((rng.below(4) + 8) / 10);
  if (!((l0.joints.target[3] ?? 0) >= 0)) l0.joints.target[3] = 0;
  if (!((l1.joints.target[3] ?? 0) >= 0)) l1.joints.target[3] = 0;
  l0.joints.target[7] = f32((rng.below(4) + 9) / 10);
  l1.joints.target[7] = f32((rng.below(4) + 9) / 10);
  l0.segments.target[UPPER_SEGMENT] = f32((rng.below(40) / 100 + 0.6) * UPPER_SEGMENT_MAX_M);
  l1.segments.target[UPPER_SEGMENT] = f32((rng.below(40) / 100 + 0.6) * UPPER_SEGMENT_MAX_M);
  l0.segments.target[LOWER_SEGMENT] = f32((rng.below(30) / 100 + 0.7) * LOWER_SEGMENT_MAX_M);
  l1.segments.target[LOWER_SEGMENT] = f32((rng.below(30) / 100 + 0.7) * LOWER_SEGMENT_MAX_M);
  l0.segments.rate[UPPER_SEGMENT] = f32((rng.below(spreadRange) / 100 + a.offsetRad) * 0.1);
  l1.segments.rate[UPPER_SEGMENT] = f32((rng.below(spreadRange) / 100 + a.offsetRad) * 0.1);
  l0.segments.rate[LOWER_SEGMENT] = f32((rng.below(spreadRange) / 100 + a.offsetRad) * 0.1);
  l1.segments.rate[LOWER_SEGMENT] = f32((rng.below(spreadRange) / 100 + a.offsetRad) * 0.1);
}
