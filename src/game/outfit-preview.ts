import type { FrameInput } from "../sim/jump-logic";
import { PHASE } from "../sim/jump-logic";
import type { JumpSimState } from "../sim/jump-sim";
import type { HillChoice } from "./hill-choice";
import { startTrainingJump, stepTrainingJump, isJumpOver } from "./training-session";

const START_FRAME = 70;
const TAKEOFF_LEAD_M = 3;
/** Frames of flight before the picture is taken: the jumper has settled into the V. */
const FLIGHT_FRAMES = 45;
const PREVIEW_SEED = 2001;

/** A jumper in flight on the given hill, from a fixed seed and fixed inputs, for the outfit preview. */
export function previewFlightState(hill: HillChoice): JumpSimState {
  let jump = startTrainingJump(hill, PREVIEW_SEED);
  let flying = 0;
  for (let f = 0; f < 3000 && !isJumpOver(jump); f++) {
    const s = jump.state;
    const frame = s.logic.frame + 1;
    const nearEdge = s.logic.phase === PHASE.crouch && s.jumper.xM >= hill.profile.takeoffXM - TAKEOFF_LEAD_M;
    const takingOff = s.logic.phase === PHASE.takeoff && !s.jumper.airborne;
    const both = nearEdge || takingOff;
    const input: FrameInput = { left: frame === START_FRAME || both, right: both, dy: 0 };
    jump = stepTrainingJump(jump, input);
    if (jump.state.logic.phase === PHASE.flight) flying++;
    if (flying >= FLIGHT_FRAMES) break;
  }
  return jump.state;
}
