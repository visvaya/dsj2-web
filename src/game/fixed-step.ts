import { FRAME_DT_S } from "../sim/physics-constants";

/** The simulation always advances in steps of the original frame time (1/70 s). */
const SIM_STEP_S = FRAME_DT_S;
/** After a long pause (tab in the background) the game skips time instead of catching up. */
const MAX_STEPS_PER_UPDATE = 8;

export interface StepPlan {
  steps: number;
  accumulatorS: number;
  /** Time thrown away in this update because the steps could not keep up, in seconds; zero when none was. */
  droppedS: number;
}

/** How many fixed steps to run for the wall-clock time that has passed. */
export function planSteps(
  accumulatorS: number,
  elapsedS: number,
  stepS = SIM_STEP_S,
  maxSteps = MAX_STEPS_PER_UPDATE,
): StepPlan {
  let acc = accumulatorS + Math.max(0, elapsedS);
  let steps = Math.floor(acc / stepS);
  let droppedS = 0;
  if (steps > maxSteps) {
    steps = maxSteps;
    droppedS = acc - maxSteps * stepS;
    acc = 0;
  } else {
    acc -= steps * stepS;
  }
  return { steps, accumulatorS: acc, droppedS };
}
