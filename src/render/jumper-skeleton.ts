import { roundHalfEven } from "../sim/pascal-numeric";
import { LOWER_SEGMENT, UPPER_SEGMENT, legOf, type PoseState } from "../sim/pose";

/**
 * Jumper figure of the original (1cb6:1418): forward kinematics of the pose
 * into 21 points in metres, relative to the foot of the front leg.
 *
 * Each "leg" of PoseState is one half of the body: segment 0 is the leg
 * (hip to foot, up to 1.08 m), segment 1 the arm (shoulder to hand, up to
 * 0.74 m). Joints: 0 ski spread (V), 1 ski angle, 2 and 3 leg direction and
 * sideways tilt, 6 and 7 arm direction and tilt; on the first half also
 * 4 torso, 5 head and 8 the rotation of the whole figure.
 */

/** Lateral (z, towards the viewer), forward (x) and up (y), in metres. */
export interface Point3 {
  z: number;
  x: number;
  y: number;
}

export const POINT = {
  ski0Tail: 1,
  ski0Tip: 2,
  ski1Tail: 3,
  ski1Tip: 4,
  foot0: 5,
  knee0: 6,
  hip0: 7,
  foot1: 8,
  knee1: 9,
  hip1: 10,
  pelvis: 11,
  neck: 12,
  shoulder0: 13,
  hand0: 14,
  shoulder1: 15,
  hand1: 16,
  head: 17,
  ski1Shovel: 18,
  ski0Shovel: 19,
  elbow0: 20,
  elbow1: 21,
} as const;
export const POINT_COUNT = 21;

const LEG_MAX_M = 1.08;
const ARM_MAX_M = 0.74;
const HALF_LEG_M = 0.54;
const HALF_ARM_M = 0.37;
const TORSO_M = 0.49;
const SHOULDER_HALF_WIDTH_M = 0.22;
const NECK_TO_HEAD_M = 0.24;
const HEAD_TILT_RAD = 0.3;
const SKI_TAIL_M = 1;
const SKI_FRONT_M = 1.628;
const SKI_SHOVEL_M = 1.648;
const SKI_SHOVEL_RAD = 0.04;

/**
 * Bend of a two-part limb for its length as a percentage of full extension:
 * the original fills DS:42C2 with Single(arccos(i / 100)) at start-up (1cb6:2291).
 */
function bendRad(lengthM: number, maxM: number): number {
  const i = Math.min(100, Math.max(0, roundHalfEven((100 * lengthM) / maxM)));
  return Math.fround(Math.acos(i / 100));
}

/** 1cb6:1418; `frontLeg` is 0 or 1 (DS:4CDC minus one). Index 0 of the result is unused. */
export function skeletonPoints(p: PoseState, frontLeg: number): Point3[] {
  const a = p.legs[0];
  const b = p.legs[1];
  const ja = (k: number) => a.joints.current[k] ?? 0;
  const jb = (k: number) => b.joints.current[k] ?? 0;
  const legA = a.segments.current[UPPER_SEGMENT] ?? 0;
  const armA = a.segments.current[LOWER_SEGMENT] ?? 0;
  const legB = b.segments.current[UPPER_SEGMENT] ?? 0;
  const armB = b.segments.current[LOWER_SEGMENT] ?? 0;
  const rot = ja(8);
  const kneeA = ja(2) - bendRad(legA, LEG_MAX_M);
  const kneeB = jb(2) - bendRad(legB, LEG_MAX_M);
  const elbowA = ja(6) + bendRad(armA, ARM_MAX_M);
  const elbowB = jb(6) + bendRad(armB, ARM_MAX_M);

  const front = legOf(p, frontLeg);
  const fLeg = front.segments.current[UPPER_SEGMENT] ?? 0;
  const fDir = (front.joints.current[2] ?? 0) + rot;
  const fTilt = Math.cos(front.joints.current[3] ?? 0);
  const pelvis = { z: 0, x: Math.cos(fDir) * fLeg * fTilt, y: Math.sin(fDir) * fLeg * fTilt };
  const hip0 = { ...pelvis };
  const hip1 = { ...pelvis };
  const neck = { z: pelvis.z, x: Math.cos(ja(4) + rot) * TORSO_M + pelvis.x, y: Math.sin(ja(4) + rot) * TORSO_M + pelvis.y };
  const shoulder0 = { z: SHOULDER_HALF_WIDTH_M + neck.z, x: neck.x, y: neck.y };
  const hand0 = {
    z: Math.sin(ja(7)) * armA + shoulder0.z,
    x: shoulder0.x - Math.cos(ja(6) + rot) * armA * Math.cos(ja(7)),
    y: shoulder0.y - Math.sin(ja(6) + rot) * armA * Math.cos(ja(7)),
  };
  const shoulder1 = { z: neck.z - SHOULDER_HALF_WIDTH_M, x: neck.x, y: neck.y };
  const hand1 = {
    z: shoulder1.z - Math.sin(jb(7)) * armB,
    x: shoulder1.x - Math.cos(jb(6) + rot) * armB * Math.cos(jb(7)),
    y: shoulder1.y - Math.sin(jb(6) + rot) * armB * Math.cos(jb(7)),
  };
  const head = {
    z: neck.z,
    x: Math.cos(ja(5) - HEAD_TILT_RAD + rot) * NECK_TO_HEAD_M + neck.x,
    y: Math.sin(ja(5) - HEAD_TILT_RAD + rot) * NECK_TO_HEAD_M + neck.y,
  };
  const foot0 = {
    z: pelvis.z + Math.sin(ja(3)) * legA,
    x: pelvis.x - Math.cos(ja(2) + rot) * legA * Math.cos(ja(3)),
    y: pelvis.y - Math.sin(ja(2) + rot) * legA * Math.cos(ja(3)),
  };
  const foot1 = {
    z: pelvis.z - Math.sin(jb(3)) * legB,
    x: pelvis.x - Math.cos(jb(2) + rot) * legB * Math.cos(jb(3)),
    y: pelvis.y - Math.sin(jb(2) + rot) * legB * Math.cos(jb(3)),
  };
  const ski = (foot: Point3, spread: number, angle: number, side: 1 | -1, length: number, lift: number): Point3 => ({
    z: foot.z + side * Math.sin(spread) * length,
    x: Math.cos(spread) * length * Math.cos(angle + lift) + foot.x,
    y: Math.sin(angle + lift) * length + foot.y,
  });
  const pts: Point3[] = Array.from({ length: POINT_COUNT + 1 }, () => ({ z: 0, x: 0, y: 0 }));
  // Tails extend 1 m behind the binding; the shovel is the tip bent up by 0.04 rad.
  pts[POINT.ski0Tail] = ski(foot0, ja(0), ja(1), 1, -SKI_TAIL_M, 0);
  pts[POINT.ski0Tip] = ski(foot0, ja(0), ja(1), 1, SKI_FRONT_M, 0);
  pts[POINT.ski0Shovel] = ski(foot0, ja(0), ja(1), 1, SKI_SHOVEL_M, SKI_SHOVEL_RAD);
  pts[POINT.ski1Tail] = ski(foot1, jb(0), jb(1), -1, -SKI_TAIL_M, 0);
  pts[POINT.ski1Tip] = ski(foot1, jb(0), jb(1), -1, SKI_FRONT_M, 0);
  pts[POINT.ski1Shovel] = ski(foot1, jb(0), jb(1), -1, SKI_SHOVEL_M, SKI_SHOVEL_RAD);
  pts[POINT.foot0] = foot0;
  pts[POINT.foot1] = foot1;
  pts[POINT.hip0] = hip0;
  pts[POINT.hip1] = hip1;
  pts[POINT.pelvis] = pelvis;
  pts[POINT.neck] = neck;
  pts[POINT.shoulder0] = shoulder0;
  pts[POINT.shoulder1] = shoulder1;
  pts[POINT.hand0] = hand0;
  pts[POINT.hand1] = hand1;
  pts[POINT.head] = head;
  pts[POINT.knee0] = {
    z: (foot0.z + hip0.z) / 2,
    x: Math.cos(kneeA + rot) * HALF_LEG_M + foot0.x,
    y: Math.sin(kneeA + rot) * HALF_LEG_M * Math.cos(ja(3)) + foot0.y,
  };
  pts[POINT.knee1] = {
    z: (foot1.z + hip1.z) / 2,
    x: Math.cos(kneeB + rot) * HALF_LEG_M + foot1.x,
    y: Math.sin(kneeB + rot) * HALF_LEG_M * Math.cos(jb(3)) + foot1.y,
  };
  pts[POINT.elbow0] = {
    z: (shoulder0.z + hand0.z) / 2,
    x: Math.cos(elbowA + rot) * HALF_ARM_M + hand0.x,
    y: Math.sin(elbowA + rot) * HALF_ARM_M * Math.cos(ja(7)) + hand0.y,
  };
  pts[POINT.elbow1] = {
    z: (shoulder1.z + hand1.z) / 2,
    x: Math.cos(elbowB + rot) * HALF_ARM_M + hand1.x,
    y: Math.sin(elbowB + rot) * HALF_ARM_M * Math.cos(jb(7)) + hand1.y,
  };
  return pts;
}

export type BodyPart = "suit" | "pants" | "sleeves" | "gloves" | "helmet" | "skis";

export interface Bone {
  from: number;
  to: number;
  /** Shade within the part's colour ramp (far side darker). */
  shade: number;
  part: BodyPart;
  thick: boolean;
}

/** Drawing order of the original (far side first); a bone from a point to itself is a dot. */
export const BONES: readonly Bone[] = [
  { from: POINT.ski1Tail, to: POINT.ski1Tip, shade: 1, part: "skis", thick: false },
  { from: POINT.ski1Shovel, to: POINT.ski1Shovel, shade: 1, part: "skis", thick: false },
  { from: POINT.shoulder1, to: POINT.elbow1, shade: 0, part: "sleeves", thick: false },
  { from: POINT.elbow1, to: POINT.hand1, shade: 0, part: "sleeves", thick: false },
  { from: POINT.hand1, to: POINT.hand1, shade: 1, part: "gloves", thick: false },
  { from: POINT.foot1, to: POINT.knee1, shade: 0, part: "pants", thick: false },
  { from: POINT.knee1, to: POINT.hip1, shade: 1, part: "pants", thick: true },
  { from: POINT.ski0Tail, to: POINT.ski0Tip, shade: 3, part: "skis", thick: false },
  { from: POINT.ski0Shovel, to: POINT.ski0Shovel, shade: 3, part: "skis", thick: false },
  { from: POINT.foot0, to: POINT.knee0, shade: 1, part: "pants", thick: false },
  { from: POINT.knee0, to: POINT.hip0, shade: 2, part: "pants", thick: true },
  { from: POINT.pelvis, to: POINT.neck, shade: 0, part: "suit", thick: true },
  { from: POINT.head, to: POINT.head, shade: 1, part: "helmet", thick: true },
  { from: POINT.shoulder0, to: POINT.elbow0, shade: 4, part: "sleeves", thick: false },
  { from: POINT.elbow0, to: POINT.hand0, shade: 4, part: "sleeves", thick: false },
  { from: POINT.hand0, to: POINT.hand0, shade: 5, part: "gloves", thick: false },
];

/** Oblique projection of 1cb6:20e1: lateral offsets move points left and up. */
export const DEPTH_TO_X = 0.15;
export const DEPTH_TO_Y = 0.5;
