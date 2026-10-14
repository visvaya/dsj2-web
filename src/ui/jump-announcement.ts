import type { JumpLogicState } from "../sim/jump-logic";
import { UI_TEXT } from "../text/ui-text";

const T = UI_TEXT.announcement;

/** What a screen reader hears when the jumper leaves the gate. */
export const JUMP_STARTED_ANNOUNCEMENT = T.jumpStarted;

type Touchdown = Pick<JumpLogicState, "distanceM" | "fallType">;
type ScoredJump = Pick<JumpLogicState, "distanceM" | "fallType" | "points" | "judges">;

interface ResultContext {
  newRecord: boolean;
  /** How the game is played: it decides what starts the next jump. */
  controls: "mouse" | "touch" | "tilt";
}

/** A number as Polish text writes it, with a decimal comma. */
export function formatDecimal(value: number, digits: number): string {
  return value.toFixed(digits).replace(".", ",");
}

/** A jump without a distance is a disqualification: the start time ran out, or the jumper never left the inrun. */
function outcome(jump: Touchdown): string {
  if (jump.distanceM === 0) return T.disqualified;
  const distance = T.distance(formatDecimal(jump.distanceM, 2));
  return jump.fallType === 0 ? T.landing(distance) : T.fall(distance);
}

/** Said in the frame the jump is scored, while the jumper is still moving; a new record is known by then. */
export function touchdownAnnouncement(jump: Touchdown, newRecord = false): string {
  return newRecord ? `${outcome(jump)}. ${T.record}` : `${outcome(jump)}.`;
}

/** Said once the jumper has stopped: the outcome again, the five notes, the points and how to jump again. */
export function resultAnnouncement(jump: ScoredJump, context: ResultContext): string {
  const notes = jump.judges.map((judge) => formatDecimal(judge.note, 1)).join("; ");
  const parts = [
    `${outcome(jump)}.`,
    ...(jump.distanceM === 0 ? [] : [T.notes(notes)]),
    T.points(formatDecimal(jump.points, 1)),
    ...(context.newRecord ? [T.record] : []),
    T.nextJump[context.controls],
  ];
  return parts.join(" ");
}
