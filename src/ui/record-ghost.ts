import type { HillChoice } from "../game/hill-choice";
import { isJumpOver, stepTrainingJump, type TrainingJump } from "../game/training-session";
import { PHASE } from "../sim/jump-logic";
import type { ReplaySource } from "./jump-replay";

/** No jumper waits at the gate this long: the start time runs out well before. */
const MAX_GATE_FRAMES = 6000;

/**
 * The jump of a hill's record, played beside the player's: a ghost on the hill. It leaves the gate when the
 * player does and keeps level with the player's jump frame by frame from there, whenever each of them started.
 */
export interface RecordGhost {
  source: ReplaySource;
  jump: TrainingJump;
  /** The frame of the ghost's own jump in which it left the gate. */
  startFrame: number;
}

const leftGate = (jump: TrainingJump): boolean => jump.state.logic.phase >= PHASE.inrun;

/** The ghost of a record, played up to the frame its jumper leaves the gate; null when it never does. */
export function ghostAtGate(hill: HillChoice, source: ReplaySource): RecordGhost | null {
  let jump = source.start(hill);
  while (!leftGate(jump) && !isJumpOver(jump) && jump.state.logic.frame < MAX_GATE_FRAMES) {
    jump = stepTrainingJump(jump, source.input(jump.state.logic));
  }
  return leftGate(jump) ? { source, jump, startFrame: jump.state.logic.frame } : null;
}

/** The ghost moved on to as many frames past its start as the player's jump is past the player's start. */
export function ghostAlong(ghost: RecordGhost, framesSinceStart: number): RecordGhost {
  let jump = ghost.jump;
  while (jump.state.logic.frame - ghost.startFrame < framesSinceStart && !isJumpOver(jump)) {
    jump = stepTrainingJump(jump, ghost.source.input(jump.state.logic));
  }
  return jump === ghost.jump ? ghost : { ...ghost, jump };
}
