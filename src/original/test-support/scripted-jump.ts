import { terrainYM } from "../../sim/hill-profile";
import { PHASE, type FrameInput } from "../../sim/jump-logic";
import { createJump, jumpRunning, stepFrame, type JumpSetup, type JumpSimState } from "../../sim/jump-sim";
import { BUTTON_WINDOW_FRAMES, planFromInputs, type ReplayPlan } from "../../storage/original-replay-file";

/**
 * Scripted jumps for replays of the original: the simulation runs with a player described by a few numbers, and
 * the input of that jump becomes a plan (src/storage/original-replay-file.ts). tools/re/craft_replays.py turns
 * the plan into a replay file the original game can play, so the two can be compared on any hill and for inputs
 * no shipped replay contains (docs/testing.md).
 */

const MAX_JUMP_FRAMES = 6000;
const NO_INPUT: FrameInput = { left: false, right: false, dy: 0 };

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
