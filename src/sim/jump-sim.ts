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

/** 1c06:0010 followed by 0baf:c9e6 (replay variant: seed and wind come from the setup). */
export function createJump(setup: JumpSetup): JumpSimState {
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
  const pose = emptyPose();
  setPose(pose, 1, jumper.slopeAngleRad, setup.poses);
  return { logic, jumper, pose, wind: { ...setup.wind }, randomSeed: setup.randomSeed >>> 0 };
}

export type InputSource = (frame: number) => FrameInput;

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
    input(s.logic.frame),
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
