import { BorlandRandom } from "../sim/borland-random";
import { ORIGINAL_POSES } from "../sim/data/pose-table";
import type { FrameInput } from "../sim/jump-logic";
import { createJump, jumpRunning, stepFrame, type JumpSetup, type JumpSimState } from "../sim/jump-sim";
import { createStartWind } from "../sim/training-wind";
import type { HillChoice } from "./hill-choice";
import { displayedWindMPerS } from "./wind-display";

const FRAME_S = 1 / 70;

/** One training jump: everything the simulation needs, plus its current state. */
export interface TrainingJump {
  hill: HillChoice;
  setup: JumpSetup;
  state: JumpSimState;
  /** Generator seed the jump was created from; with the inputs it reproduces the jump. */
  seed: number;
  /** Frames stepped after the simulation stopped (the judges' notes keep appearing). */
  framesAfterEnd: number;
  /** How far the displayed wind has carried the air so far, in metres (moves the falling snow; visual only). */
  windDriftM: { x: number; y: number };
}

export function startTrainingJump(hill: HillChoice, seed: number): TrainingJump {
  const rng = new BorlandRandom(seed);
  const wind = createStartWind(rng);
  const setup: JumpSetup = {
    hill: hill.profile,
    kPointM: hill.kPointM,
    poses: ORIGINAL_POSES,
    wind,
    randomSeed: rng.seed,
    points: 0,
    presentation: true,
  };
  return { hill, setup, state: createJump(setup), seed: seed >>> 0, framesAfterEnd: 0, windDriftM: { x: 0, y: 0 } };
}

/** The session one simulation frame later; once the jump is over only the presentation clock moves. */
export function stepTrainingJump(jump: TrainingJump, input: FrameInput): TrainingJump {
  const wind = displayedWindMPerS(jump.state.wind);
  const windDriftM = { x: jump.windDriftM.x + wind.x * FRAME_S, y: jump.windDriftM.y + wind.y * FRAME_S };
  if (!jumpRunning(jump.state)) {
    return { ...jump, windDriftM, framesAfterEnd: jump.framesAfterEnd + 1 };
  }
  return { ...jump, windDriftM, state: stepFrame(jump.state, jump.setup, () => input) };
}

/** Clock for presentation, in simulation frames; it keeps counting after the jump is over. */
export function presentationFrame(jump: TrainingJump): number {
  return jump.state.logic.frame + jump.framesAfterEnd;
}

export function isJumpOver(jump: TrainingJump): boolean {
  return !jumpRunning(jump.state);
}

/** A fresh seed for a new jump (the original seeds from the clock with Randomize). */
export function newSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] ?? 0;
}
