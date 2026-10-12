import { terrainYM } from "../hill-profile";
import { PHASE, type FrameInput } from "../jump-logic";
import { createJump, jumpRunning, stepFrame, type JumpSetup, type JumpSimState } from "../jump-sim";
import { parseReplayRecord, replayInputForFrame } from "../replay";
import type { WindState } from "../wind";

/**
 * Replay plans: the input of a jump in the form a replay of the original game stores it (see
 * docs/replay-format.md). A plan is made by running this simulation with a scripted player, and
 * tools/re/craft_replays.py turns it into a replay file the original game can play, so the two can be compared
 * on any hill and for inputs no shipped replay contains.
 */

export const BUTTON_WINDOW_FRAMES = 20;
/** Motion bytes of a record: offsets 0x30..0x448. */
export const MOTION_CAPACITY_FRAMES = 0x449 - 0x30;
const RECORD_BYTES = 0x4b5;
const MAX_JUMP_FRAMES = 6000;

const OFFSET = {
  wind: 0x00,
  hillNumber: 0x20,
  randomSeed: 0x2c,
  motion: 0x30,
  startFrame: 0x44a,
  buttonWindowStart: 0x44e,
  motionStart: 0x452,
  buttonWindow: 0x456,
  leftLandingFrame: 0x46a,
  rightLandingFrame: 0x46e,
  motionEnd: 0x472,
} as const;

/** The 13 characters the original writes before a record for hills 1 to 32. */
const SYNTHETIC_HEADER = new TextEncoder().encode("//DSJ_v2.00//");

export interface ReplayPlan {
  /** Hill number of the original game, 1 to 37 (0 for a hill that is not one of them). */
  hillNumber: number;
  randomSeed: number;
  wind: WindState;
  /** Frame of the left press that leaves the gate; 0 when there is none. */
  startFrame: number;
  /** First frame of the takeoff window; 0 when no button is pressed around the takeoff. */
  buttonWindowStart: number;
  /** One value per frame of the window: 0 no button, 1 left, 2 left and right. */
  buttonWindow: number[];
  /** First and last frame with vertical mouse motion; an empty range is 1..0. */
  motionStart: number;
  motionEnd: number;
  /** Mouse motion in mickeys (-128..127) for motionStart..motionEnd. */
  motion: number[];
  /** Frames of the landing presses; 0 when there is none. */
  leftLandingFrame: number;
  rightLandingFrame: number;
}

export interface PlanBase {
  hillNumber: number;
  randomSeed: number;
  wind: WindState;
}

const NO_INPUT: FrameInput = { left: false, right: false, dy: 0 };

const sameInput = (one: FrameInput, other: FrameInput): boolean =>
  one.left === other.left && one.right === other.right && one.dy === other.dy;

function assertPlanFits(plan: ReplayPlan): void {
  const frames = [
    plan.startFrame,
    plan.buttonWindowStart,
    plan.motionStart,
    plan.motionEnd,
    plan.leftLandingFrame,
    plan.rightLandingFrame,
  ];
  if (!Number.isInteger(plan.hillNumber) || plan.hillNumber < 0 || plan.hillNumber > 255) {
    throw new RangeError(`hill number ${plan.hillNumber} does not fit in a byte`);
  }
  if (frames.some((frame) => !Number.isInteger(frame) || frame < 0)) {
    throw new RangeError("frame numbers of a plan must be non-negative integers");
  }
  if (plan.buttonWindow.length !== BUTTON_WINDOW_FRAMES || plan.buttonWindow.some((b) => ![0, 1, 2].includes(b))) {
    throw new RangeError(`the takeoff window needs ${BUTTON_WINDOW_FRAMES} values of 0, 1 or 2`);
  }
  if (plan.motion.length !== plan.motionEnd - plan.motionStart + 1) {
    throw new RangeError("the motion list does not match its first and last frame");
  }
  if (plan.motion.length > MOTION_CAPACITY_FRAMES) {
    throw new RangeError(`motion spans ${plan.motion.length} frames, a replay holds ${MOTION_CAPACITY_FRAMES}`);
  }
  if (plan.motion.some((dy) => !Number.isInteger(dy) || dy < -128 || dy > 127)) {
    throw new RangeError("mouse motion must be an integer in -128..127");
  }
}

/** The 1205-byte record of a replay with the plan's fields set and everything else zero. */
export function planToRecord(plan: ReplayPlan): Uint8Array {
  assertPlanFits(plan);
  const record = new Uint8Array(RECORD_BYTES);
  const view = new DataView(record.buffer);
  const wind = [
    plan.wind.xMPerS,
    plan.wind.yMPerS,
    plan.wind.variabilityMPerS,
    plan.wind.speedMPerS,
    plan.wind.directionRad,
    plan.wind.indicatorDirectionRad,
    plan.wind.indicatorTurnRateRad,
    plan.wind.indicatorMaxTurnRateRad,
  ];
  wind.forEach((value, i) => view.setFloat32(OFFSET.wind + 4 * i, value, true));
  view.setUint8(OFFSET.hillNumber, plan.hillNumber);
  view.setUint32(OFFSET.randomSeed, plan.randomSeed >>> 0, true);
  plan.motion.forEach((dy, i) => view.setInt8(OFFSET.motion + i, dy));
  plan.buttonWindow.forEach((buttons, i) => view.setUint8(OFFSET.buttonWindow + i, buttons));
  view.setInt32(OFFSET.startFrame, plan.startFrame, true);
  view.setInt32(OFFSET.buttonWindowStart, plan.buttonWindowStart, true);
  view.setInt32(OFFSET.motionStart, plan.motionStart, true);
  view.setInt32(OFFSET.motionEnd, plan.motionEnd, true);
  view.setInt32(OFFSET.leftLandingFrame, plan.leftLandingFrame, true);
  view.setInt32(OFFSET.rightLandingFrame, plan.rightLandingFrame, true);
  return record;
}

/** The input a replay made from the plan gives in each frame, read back through the replay decoder. */
export function planInputSource(plan: ReplayPlan): (frame: number) => FrameInput {
  const replay = parseReplayRecord(SYNTHETIC_HEADER, planToRecord(plan));
  return (frame) => replayInputForFrame(replay, frame);
}

function windowButtons(input: FrameInput): number {
  if (input.left) return input.right ? 2 : 1;
  return 0;
}

function buildPlan(inputs: readonly FrameInput[], base: PlanBase, windowed: boolean): ReplayPlan {
  const pressed = inputs.flatMap((input, frame) => (input.left || input.right ? [{ ...input, frame }] : []));
  const [first] = pressed;
  const startFrame = first !== undefined && first.left && !first.right ? first.frame : 0;
  const later = pressed.filter((press) => press.frame !== startFrame);
  const buttonWindowStart = windowed ? (later[0]?.frame ?? 0) : 0;
  const afterWindow = later.filter(
    (press) => press.frame < buttonWindowStart || press.frame >= buttonWindowStart + BUTTON_WINDOW_FRAMES,
  );
  const moving = inputs.flatMap((input, frame) => (input.dy === 0 ? [] : [frame]));
  const motionStart = moving[0] ?? 1;
  const motionEnd = moving.at(-1) ?? 0;
  return {
    ...base,
    startFrame,
    buttonWindowStart,
    buttonWindow: Array.from({ length: BUTTON_WINDOW_FRAMES }, (_, i) =>
      windowButtons(inputs[buttonWindowStart + i] ?? NO_INPUT),
    ),
    motionStart,
    motionEnd,
    motion: inputs.slice(motionStart, motionEnd + 1).map((input) => input.dy),
    leftLandingFrame: afterWindow.find((press) => press.left)?.frame ?? 0,
    rightLandingFrame: afterWindow.find((press) => press.right)?.frame ?? 0,
  };
}

function reproduces(plan: ReplayPlan, inputs: readonly FrameInput[]): boolean {
  const source = planInputSource(plan);
  // Frames past the recorded ones must stay without input for as long as a replay can hold any.
  const frames = inputs.length + BUTTON_WINDOW_FRAMES + MOTION_CAPACITY_FRAMES;
  return Array.from({ length: frames }, (_, frame) => frame).every((frame) =>
    sameInput(source(frame), inputs[frame] ?? NO_INPUT),
  );
}

/**
 * Turns per-frame input (index = frame number) into a plan. Throws when a replay cannot hold the input: its
 * format stores one start press, 20 frames of takeoff buttons, one press of each landing button and at most
 * MOTION_CAPACITY_FRAMES frames of mouse motion.
 */
export function planFromInputs(inputs: readonly FrameInput[], base: PlanBase): ReplayPlan {
  for (const windowed of [true, false]) {
    const plan = buildPlan(inputs, base, windowed);
    if (plan.motion.length <= MOTION_CAPACITY_FRAMES && reproduces(plan, inputs)) {
      return plan;
    }
  }
  throw new RangeError("the input does not fit the replay format");
}

/** A player that reacts to the state of the jump, described by a few numbers. */
export interface JumpScript {
  /** Frame of the left press that leaves the gate; null stays on the gate. */
  startFrame: number | null;
  /** Takeoff buttons; null never presses them. */
  takeoff: {
    /** Seconds before the edge (at the current speed) at which the buttons go down; negative is past it. */
    leadS: number;
    buttons: 1 | 2;
    /** Frames the buttons stay down, at most BUTTON_WINDOW_FRAMES. */
    holdFrames: number;
  } | null;
  /** Mouse motion in the air before the landing press, by frames since liftoff. */
  lean: (flightFrame: number) => number;
  /** Landing press; null never presses. */
  landing: {
    /** The press comes once the jumper, sinking at its current rate, would touch the ground within this many frames. */
    leadFrames: number;
    /** Frames to wait after that moment. */
    delayFrames: number;
    button: "left" | "right";
    /** Frames after the first press at which the other button follows; null never. */
    otherButtonAfterFrames: number | null;
  } | null;
}

interface PlayerMemory {
  takeoffFrame: number | null;
  liftoffFrame: number | null;
  landingFrame: number | null;
  /** Height above the terrain in the previous frame. */
  heightM: number;
}

const inFlightControl = (phase: number): boolean => phase === PHASE.flightHold || phase === PHASE.flight;

function remember(
  memory: PlayerMemory,
  s: JumpSimState,
  frame: number,
  setup: JumpSetup,
  script: JumpScript,
): PlayerMemory {
  const j = s.jumper;
  const { phase } = s.logic;
  const { takeoff, landing } = script;
  let { takeoffFrame, liftoffFrame, landingFrame } = memory;
  if (
    takeoffFrame === null &&
    takeoff !== null &&
    phase === PHASE.crouch &&
    j.xM + j.vxMPerS * takeoff.leadS >= setup.hill.takeoffXM
  ) {
    takeoffFrame = frame;
  }
  if (liftoffFrame === null && inFlightControl(phase)) {
    liftoffFrame = frame;
  }
  const heightM = j.yM - terrainYM(setup.hill, j.xM);
  const sinkM = memory.heightM - heightM;
  if (
    landingFrame === null &&
    landing !== null &&
    phase === PHASE.flight &&
    sinkM > 0 &&
    heightM <= landing.leadFrames * sinkM
  ) {
    // A replay has no room for a landing press inside the takeoff window.
    landingFrame = Math.max(frame + landing.delayFrames, (takeoffFrame ?? 0) + BUTTON_WINDOW_FRAMES);
  }
  return { takeoffFrame, liftoffFrame, landingFrame, heightM };
}

function clampMotion(dy: number): number {
  return Math.max(-128, Math.min(127, Math.trunc(dy)));
}

function playerInput(memory: PlayerMemory, s: JumpSimState, frame: number, script: JumpScript): FrameInput {
  const { takeoff, landing } = script;
  const { takeoffFrame, liftoffFrame, landingFrame } = memory;
  const taking = takeoff !== null && takeoffFrame !== null && frame < takeoffFrame + takeoff.holdFrames;
  const first = landing !== null && frame === landingFrame;
  const other =
    landing !== null &&
    landingFrame !== null &&
    landing.otherButtonAfterFrames !== null &&
    frame === landingFrame + landing.otherButtonAfterFrames;
  const landsLeft = landing?.button === "left";
  const leaning = liftoffFrame !== null && inFlightControl(s.logic.phase);
  return {
    left: frame === script.startFrame || taking || (first && landsLeft) || (other && !landsLeft),
    right: (taking && takeoff.buttons === 2) || (first && !landsLeft) || (other && landsLeft),
    dy: leaning ? clampMotion(script.lean(frame - liftoffFrame)) : 0,
  };
}

export interface ScriptedJump {
  /** Input by frame number, from frame 0 to the last frame of the jump. */
  inputs: FrameInput[];
  final: JumpSimState;
}

/** Runs a whole jump with the scripted player and keeps what it pressed. */
export function runScriptedJump(setup: JumpSetup, script: JumpScript): ScriptedJump {
  if (script.takeoff !== null && script.takeoff.holdFrames > BUTTON_WINDOW_FRAMES) {
    throw new RangeError(`takeoff buttons can be held for at most ${BUTTON_WINDOW_FRAMES} frames`);
  }
  let state = createJump(setup);
  let memory: PlayerMemory = { takeoffFrame: null, liftoffFrame: null, landingFrame: null, heightM: 0 };
  // The first step computes frame 2; frames 0 and 1 have no input.
  const inputs: FrameInput[] = [NO_INPUT, NO_INPUT];
  for (let guard = 0; guard < MAX_JUMP_FRAMES && jumpRunning(state); guard++) {
    const frame = state.logic.frame + 1;
    memory = remember(memory, state, frame, setup, script);
    const input = playerInput(memory, state, frame, script);
    inputs.push(input);
    state = stepFrame(state, setup, () => input);
  }
  return { inputs, final: state };
}

/** What the simulation made of a planned jump; kept next to the plan for whoever compares it with the original. */
export interface PlannedResult {
  frames: number;
  distanceM: number;
  fallType: number;
  phase: number;
  points: number;
}

export interface PlannedJump {
  plan: ReplayPlan;
  result: PlannedResult;
}

function resultOf(final: JumpSimState): PlannedResult {
  const { frame, distanceM, fallType, phase, points } = final.logic;
  return { frames: frame, distanceM, fallType, phase, points };
}

/** Runs the scripted jump and turns it into a plan. */
export function planJump(setup: JumpSetup, hillNumber: number, script: JumpScript): PlannedJump {
  const { inputs, final } = runScriptedJump(setup, script);
  const plan = planFromInputs(inputs, { hillNumber, randomSeed: setup.randomSeed >>> 0, wind: setup.wind });
  return { plan, result: resultOf(final) };
}
