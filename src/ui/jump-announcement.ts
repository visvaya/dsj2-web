import type { JumpLogicState } from "../sim/jump-logic";

/** What a screen reader hears when the jumper leaves the gate. */
export const JUMP_STARTED_ANNOUNCEMENT = "Skok rozpoczęty.";

type Touchdown = Pick<JumpLogicState, "distanceM" | "fallType">;
type ScoredJump = Pick<JumpLogicState, "distanceM" | "fallType" | "points" | "judges">;

interface ResultContext {
  newRecord: boolean;
  /** How the game is played: it decides what starts the next jump. */
  controls: "mouse" | "touch" | "tilt";
}

const NEXT_JUMP = {
  mouse: "Lewy przycisk lub R: jeszcze raz.",
  touch: "Pole L: jeszcze raz.",
  tilt: "Dotknięcie ekranu: jeszcze raz.",
} as const;

/** A number as Polish text writes it, with a decimal comma. */
export function formatDecimal(value: number, digits: number): string {
  return value.toFixed(digits).replace(".", ",");
}

/** A jump without a distance is a disqualification: the start time ran out, or the jumper never left the inrun. */
function outcome(jump: Touchdown): string {
  if (jump.distanceM === 0) return "Dyskwalifikacja";
  const distance = `${formatDecimal(jump.distanceM, 2)} metra`;
  return jump.fallType === 0 ? `Lądowanie: ${distance}` : `Upadek: ${distance}`;
}

/** Said in the frame the jump is scored, while the jumper is still moving. */
export function touchdownAnnouncement(jump: Touchdown): string {
  return `${outcome(jump)}.`;
}

/** Said once the jumper has stopped: the outcome again, the five notes, the points and how to jump again. */
export function resultAnnouncement(jump: ScoredJump, context: ResultContext): string {
  const notes = jump.judges.map((judge) => formatDecimal(judge.note, 1)).join("; ");
  const parts = [
    `${outcome(jump)}.`,
    ...(jump.distanceM === 0 ? [] : [`Noty: ${notes}.`]),
    `Wynik: ${formatDecimal(jump.points, 1)} punktu.`,
    ...(context.newRecord ? ["Nowy rekord skoczni."] : []),
    NEXT_JUMP[context.controls],
  ];
  return parts.join(" ");
}
