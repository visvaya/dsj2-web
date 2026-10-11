import { BorlandRandom } from "../sim/borland-random";
import { ORIGINAL_POSES } from "../sim/data/pose-table";
import type { FrameInput } from "../sim/jump-logic";
import { createJump, jumpRunning, stepFrame, type JumpSetup, type JumpSimState } from "../sim/jump-sim";
import { createStartWind } from "../sim/training-wind";
import type { HillChoice } from "./hill-choice";

/** One training jump: everything the simulation needs, plus its current state. */
export interface TrainingJump {
  hill: HillChoice;
  setup: JumpSetup;
  state: JumpSimState;
  /** Generator seed the jump was created from; with the inputs it reproduces the jump. */
  seed: number;
  /** Frames stepped after the simulation stopped (the judges' notes keep appearing). */
  framesAfterEnd: number;
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
  return { hill, setup, state: createJump(setup), seed: seed >>> 0, framesAfterEnd: 0 };
}

/** Advances by one simulation frame; once the jump is over only the presentation clock moves. */
export function stepTrainingJump(jump: TrainingJump, input: FrameInput): void {
  if (!jumpRunning(jump.state)) {
    jump.framesAfterEnd++;
    return;
  }
  jump.state = stepFrame(jump.state, jump.setup, () => input);
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
