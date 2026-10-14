import { soundEvents, type SoundEvent } from "../audio/sound-mix";
import { feedbackEvents, type FeedbackEvent } from "../game/haptics";
import { stepTrainingJump, type TrainingJump } from "../game/training-session";
import type { FrameInput } from "../sim/jump-logic";
import { beatsRecord, type HillRecord } from "../storage/save-data";

export interface JumpResult {
  distanceM: number;
  points: number;
  fell: boolean;
}

/** A moment of the jump to be felt and heard (`feedback`), or only heard (`sound`), in the order they came. */
export type JumpCue = { kind: "feedback"; event: FeedbackEvent } | { kind: "sound"; event: SoundEvent };

export interface JumpSteps {
  jump: TrainingJump;
  /** Whether the left button was down before the frames or in any of them: a click shorter than a frame counts. */
  leftDown: boolean;
  cues: readonly JumpCue[];
  /**
   * Set when one of the frames was the touchdown, where the jump is scored. Whether it fell is settled in the
   * same frame and never changes after, so the verdict on the record holds from here on.
   */
  touchdown: { newRecord: boolean } | null;
}

interface StepRequest {
  steps: number;
  /** Whether the left button is held as the frames begin. */
  leftHeld: boolean;
  /** The hill record from before this jump. */
  record: HillRecord | undefined;
}

/**
 * The jump `steps` simulation frames later, with what happened on the way. `takeFrame` gives the input of each
 * frame, from the phase the jump is in before it: the player's hands, or a recording of them.
 */
export function stepJump(
  start: TrainingJump,
  { steps, leftHeld, record }: StepRequest,
  takeFrame: (phase: number) => FrameInput,
): JumpSteps {
  let jump = start;
  let leftDown = leftHeld;
  let touchdown: JumpSteps["touchdown"] = null;
  const cues: JumpCue[] = [];
  for (let i = 0; i < steps; i++) {
    const prev = jump.state;
    const input = takeFrame(prev.logic.phase);
    leftDown ||= input.left;
    jump = stepTrainingJump(jump, input);
    for (const event of feedbackEvents(prev, jump.state)) cues.push({ kind: "feedback", event });
    if (!prev.logic.finished && jump.state.logic.finished) {
      const L = jump.state.logic;
      touchdown = { newRecord: beatsRecord({ distanceM: L.distanceM, fell: L.fallType !== 0 }, record) };
    }
    for (const event of soundEvents(prev, jump.state)) cues.push({ kind: "sound", event });
  }
  return { jump, leftDown, cues, touchdown };
}

/** The result of a jump that is over, as the hill records keep it. */
export function jumpResult(jump: TrainingJump): JumpResult {
  const L = jump.state.logic;
  return { distanceM: L.distanceM, points: L.points, fell: L.fallType !== 0 };
}
