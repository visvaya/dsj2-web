import { PHASE } from "../sim/jump-logic";
import type { JumpSimState } from "../sim/jump-sim";

export type FeedbackEvent = "start" | "takeoff" | "landing" | "crash";

/** Vibration patterns in milliseconds (on, off, on, ...). */
const VIBRATION_MS: Readonly<Record<FeedbackEvent, readonly number[]>> = {
  start: [15],
  takeoff: [30],
  landing: [45],
  crash: [90, 50, 140],
};

/** Events between two simulation states (output only: nothing here feeds back into the jump). */
export function feedbackEvents(prev: JumpSimState, next: JumpSimState): FeedbackEvent[] {
  const events: FeedbackEvent[] = [];
  if (prev.logic.phase === PHASE.gate && next.logic.phase !== PHASE.gate) events.push("start");
  if (!prev.jumper.airborne && next.jumper.airborne && prev.logic.phase !== PHASE.crash) events.push("takeoff");
  const touchdown = prev.jumper.airborne && !next.jumper.airborne && prev.logic.phase !== PHASE.crash;
  if (touchdown) {
    // The fall type is decided in the frame of the touchdown.
    events.push(next.logic.fallType === 0 ? "landing" : "crash");
  } else if (prev.logic.phase !== PHASE.crash && next.logic.phase === PHASE.crash && prev.logic.fallType === 0) {
    events.push("crash");
  }
  return events;
}

/**
 * Whether the browser can vibrate at all. Safari on iOS cannot, and nothing a page does stands in for it: the
 * tap that Safari gives when a system switch is toggled was tried and was not felt on a real phone.
 */
export function canVibrate(nav: { vibrate?: unknown } = navigator): boolean {
  return typeof nav.vibrate === "function";
}

/** Vibrates where the browser supports it (not Safari on iOS); silently does nothing otherwise. */
export function vibrate(event: FeedbackEvent, nav: { vibrate?: (pattern: number[]) => boolean } = navigator): void {
  if (typeof nav.vibrate !== "function") return;
  try {
    nav.vibrate([...VIBRATION_MS[event]]);
  } catch {
    // Some browsers throw when vibration is blocked by a permission policy.
  }
}
