import { BorlandRandom } from "./borland-random";
import { inrunYM, terrainSlopeRad, type HillProfile } from "./hill-profile";
import {
  JUDGE_COUNT,
  START_COUNTDOWN_SECONDS,
  stepLogic,
  type FrameInput,
  type JumpLogicState,
  type LogicContext,
} from "./jump-logic";
import { stepJumperDetailed, type JumperState } from "./jumper-step";
import { FRAME_DT_S, JUMPER_MASS_KG, f32 } from "./physics-constants";
import {
  CRASH_TAKEOFF_PERTURB,
  SKI_JOINT,
  clonePose,
  emptyPose,
  perturbPose,
  setPose,
  type PoseDefinition,
  type PoseState,
} from "./pose";
import { updateWind, type WindState } from "./wind";

/** Whole simulation state of one jump. */
export interface JumpSimState {
  logic: JumpLogicState;
  jumper: JumperState;
  pose: PoseState;
  wind: WindState;
  randomSeed: number;
}

export interface JumpSetup {
  hill: HillProfile;
  kPointM: number;
  poses: ReadonlyMap<number, PoseDefinition>;
  wind: WindState;
  randomSeed: number;
  /** Points carried into this jump (0 in a replay). */
  points: number;
  /** Mirrors the original's normal display mode; see LogicContext.presentation. */
  presentation: boolean;
}

/**
 * 1c06:0010 followed by 0baf:c9e6 (replay variant: seed and wind come from the setup). The original clears
 * only part of the jump state; the rest keeps what the jump before left in memory, which `previous` supplies
 * (fields listed in carriedFrom). Without it the state starts as after loading the game.
 */
export function createJump(setup: JumpSetup, previous?: JumpSimState): JumpSimState {
  const h = setup.hill;
  const x = h.startXM;
  const y = inrunYM(h, x);
  const jumper: JumperState = {
    xM: x,
    yM: y,
    vxMPerS: 0,
    vyMPerS: 0,
    speedMPerS: 0,
    trackAngleRad: 0,
    prevXM: 0,
    prevYM: 0,
    xBeforeMoveM: 0,
    airborne: false,
    contactEvent: false,
    landed: false,
    refYM: y,
    refSpeedMPerS: 0,
    energyLostJ: 0,
    massKg: JUMPER_MASS_KG,
    slopeAngleRad: terrainSlopeRad(h, x),
    impulseXNs: 0,
    impulseYNs: 0,
    flowAngleRad: 0,
    relativeSpeedMPerS: 0,
    forceBodyN: 0,
    forceSki1N: 0,
    forceSki2N: 0,
    forceYN: 0,
    forceXN: 0,
    impactAngleRad: 0,
    impactSpeedMPerS: 0,
  };
  const logic: JumpLogicState = {
    frame: 1,
    phase: 1,
    startCountdown: START_COUNTDOWN_SECONDS,
    finished: false,
    inrunFrames: 0,
    bodyAngleRad: 0,
    skiWobbleRad: [0, 0],
    armWobbleRad: [0, 0],
    takeoffForceNs: 0,
    takeoffTimingS: 0,
    flightStyle: 0,
    styleRampS: 0,
    flightTimeS: 0,
    landingPrepS: 0,
    impact: [0, 0, 0, 0, 0],
    impactMean: 0,
    fallType: 0,
    fallSeverity: 0,
    legSpreadRad: [0, 0],
    frontLeg: 0,
    backLeg: 1,
    bounceCount: 0,
    liftFactor: f32(0.5),
    groundProximity: 0,
    distanceM: 0,
    distanceHalfM: 0,
    points: setup.points,
    judges: Array.from({ length: JUDGE_COUNT }, () => ({ showFrame: 0, counted: false, note: 20 })),
    endFrame: 0,
    landedFrame: 0,
  };
  const carried = previous === undefined ? undefined : carriedFrom(previous);
  // 1cb6:0d15 sets the pose over what is in memory: a joint that moves keeps its old target.
  const pose = carried?.pose ?? emptyPose();
  setPose(pose, 1, jumper.slopeAngleRad, setup.poses);
  return {
    logic: { ...logic, ...carried?.logic },
    jumper: { ...jumper, ...carried?.jumper },
    pose,
    wind: { ...setup.wind },
    randomSeed: setup.randomSeed >>> 0,
  };
}

/**
 * The part of the jump state that the start of the next jump leaves as it is. Found by comparing the state at
 * the start of consecutive computer jumps in traces of the original with a fresh one; the routines that set
 * up a jump (1c06:0010, 0baf:c9e6, 1cb6:0d15) do not write these fields, and the first pose sets only the
 * targets of the joints it moves. In the traces these leftovers never changed how a jump ended; the state at
 * the start of a jump matches the original only with them.
 */
function carriedFrom(previous: JumpSimState): {
  logic: Partial<JumpLogicState>;
  jumper: Partial<JumperState>;
  pose: PoseState;
} {
  const l = previous.logic;
  const j = previous.jumper;
  return {
    logic: {
      armWobbleRad: [l.armWobbleRad[0], l.armWobbleRad[1]],
      takeoffForceNs: l.takeoffForceNs,
      impact: [...l.impact],
      legSpreadRad: [...l.legSpreadRad],
      groundProximity: l.groundProximity,
      distanceM: l.distanceM,
      distanceHalfM: l.distanceHalfM,
    },
    jumper: {
      vxMPerS: j.vxMPerS,
      vyMPerS: j.vyMPerS,
      trackAngleRad: j.trackAngleRad,
      prevXM: j.prevXM,
      prevYM: j.prevYM,
      xBeforeMoveM: j.xBeforeMoveM,
      flowAngleRad: j.flowAngleRad,
      relativeSpeedMPerS: j.relativeSpeedMPerS,
      forceBodyN: j.forceBodyN,
      forceSki1N: j.forceSki1N,
      forceSki2N: j.forceSki2N,
      forceYN: j.forceYN,
      forceXN: j.forceXN,
    },
    pose: clonePose(previous.pose),
  };
}

/** The jump as read_input (0baf:9a3c) sees it: after this frame's wind update and jumper step. */
export interface InputContext {
  logic: Readonly<JumpLogicState>;
  jumper: Readonly<JumperState>;
  /** Generator seed at the entry of read_input; the original restores it when read_input returns. */
  randomSeed: number;
}

export type InputSource = (frame: number, at: InputContext) => FrameInput;

function cloneState(s: JumpSimState): JumpSimState {
  return {
    logic: {
      ...s.logic,
      skiWobbleRad: [s.logic.skiWobbleRad[0], s.logic.skiWobbleRad[1]],
      armWobbleRad: [s.logic.armWobbleRad[0], s.logic.armWobbleRad[1]],
      impact: [...s.logic.impact],
      legSpreadRad: [...s.logic.legSpreadRad],
      judges: s.logic.judges.map((judge) => ({ ...judge })),
    },
    jumper: { ...s.jumper },
    pose: clonePose(s.pose),
    wind: { ...s.wind },
    randomSeed: s.randomSeed,
  };
}

/** One frame of the jump loop (0baf:cb78 / 0baf:cc6e). Returns a new state. */
export function stepFrame(prev: JumpSimState, setup: JumpSetup, input: InputSource): JumpSimState {
  const s = cloneState(prev);
  const rng = new BorlandRandom(s.randomSeed);
  s.logic.frame++;
  s.wind = updateWind(s.wind, s.logic.frame, FRAME_DT_S, rng);
  const step = stepJumperDetailed(
    s.jumper,
    {
      dtS: FRAME_DT_S,
      windSpeedMPerS: s.wind.speedMPerS,
      windDirectionRad: s.wind.directionRad,
      bodyAngleRad: s.logic.bodyAngleRad,
      ski1AngleRad: s.pose.legs[0].joints.current[SKI_JOINT] ?? 0,
      ski2AngleRad: s.pose.legs[1].joints.current[SKI_JOINT] ?? 0,
      liftFactor: s.logic.liftFactor,
      poseId: s.pose.poseId,
    },
    setup.hill,
  );
  s.jumper = step.state;
  if (step.liftedOff && s.logic.fallType !== 0) {
    perturbPose(s.pose, CRASH_TAKEOFF_PERTURB, rng);
  }
  const ctx: LogicContext = {
    hill: setup.hill,
    kPointM: setup.kPointM,
    poses: setup.poses,
    dtS: FRAME_DT_S,
    presentation: setup.presentation,
  };
  stepLogic(
    {
      logic: s.logic,
      jumper: s.jumper,
      pose: s.pose,
      windSpeedMPerS: s.wind.speedMPerS,
      windDirectionRad: s.wind.directionRad,
    },
    input(s.logic.frame, { logic: s.logic, jumper: s.jumper, randomSeed: rng.seed }),
    ctx,
    rng,
  );
  s.randomSeed = rng.seed;
  return s;
}

/** The jump loop ends once the jumper has stopped and the result is in. */
export function jumpRunning(s: JumpSimState): boolean {
  return s.jumper.airborne || s.jumper.speedMPerS > 0.01 || !s.logic.finished;
}
