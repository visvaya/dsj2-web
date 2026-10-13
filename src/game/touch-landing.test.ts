import { describe, expect, it } from "vitest";
import { PHASE } from "../sim/jump-logic";
import { OWN_HILLS } from "./hill-choice";
import { createPlayerInput, leftTouchLeansOnly } from "./player-input";
import { startTrainingJump, stepTrainingJump, type TrainingJump } from "./training-session";

/** Metres before the edge of the inrun at which the take-off is pressed. */
const TAKEOFF_BEFORE_EDGE_M = 4;
const FRAME_LIMIT = 4000;

type Input = ReturnType<typeof createPlayerInput>;

/** A jump on touch zones, stepped the way the jump screen steps it. */
function touchJump() {
  const hill = OWN_HILLS[0];
  if (!hill) throw new Error("no hill");
  const input = createPlayerInput();
  let jump: TrainingJump = startTrainingJump(hill, 7);
  const phase = () => jump.state.logic.phase;
  const step = () => {
    input.setLeftTouchLeansOnly(leftTouchLeansOnly(phase()));
    jump = stepTrainingJump(jump, input.takeFrame());
  };
  const stepUntil = (reached: () => boolean) => {
    for (let frame = 0; frame < FRAME_LIMIT && !reached(); frame++) step();
    if (!reached()) throw new Error(`the jump did not get there; phase ${phase()}`);
  };
  const steps = (count: number) => {
    for (let frame = 0; frame < count; frame++) step();
  };
  return { input, phase, step, steps, stepUntil, state: () => jump.state, edgeXM: hill.profile.takeoffXM };
}

/** From the gate into the air, with the finger that pressed the left zone for the take-off still on it. */
function flyWithLeftZoneHeld(): ReturnType<typeof touchJump> & { input: Input } {
  const jump = touchJump();
  const { input, phase, stepUntil } = jump;
  input.setButton("touch", "left", true);
  stepUntil(() => phase() === PHASE.inrun);
  input.setButton("touch", "left", false);
  stepUntil(() => phase() === PHASE.crouch && jump.state().jumper.xM > jump.edgeXM - TAKEOFF_BEFORE_EDGE_M);
  input.setButton("touch", "left", true);
  input.setButton("touch", "right", true);
  stepUntil(() => phase() === PHASE.flightHold);
  input.setButton("touch", "right", false);
  return jump;
}

describe("landing on touch zones", () => {
  it("keeps flying while a finger leans on the left zone, lifts and comes back", () => {
    const { input, phase, steps, state } = flyWithLeftZoneHeld();
    // The finger of the take-off never lifted, and the flight still leaves the hold after the take-off.
    steps(3);
    expect(phase()).toBe(PHASE.flight);
    const angleBefore = state().logic.bodyAngleRad;
    input.addMotion(-20);
    steps(1);
    expect(state().logic.bodyAngleRad).not.toBe(angleBefore);
    input.setButton("touch", "left", false);
    steps(5);
    input.setButton("touch", "left", true);
    steps(10);
    expect(phase()).toBe(PHASE.flight);
    expect(state().jumper.airborne).toBe(true);
  });

  it("starts the landing with the right zone and ends its preparation with a new touch of the left one", () => {
    const { input, phase, steps, state } = flyWithLeftZoneHeld();
    steps(3);
    input.setButton("touch", "right", true);
    steps(1);
    expect(phase()).toBe(PHASE.landingPrep);
    // The leaning finger is still down: it is not the second button.
    input.setButton("touch", "right", false);
    steps(5);
    expect(state().jumper.airborne).toBe(true);
    expect(phase()).toBe(PHASE.landingPrep);
    input.setButton("touch", "left", false);
    input.setButton("touch", "left", true);
    steps(1);
    expect(phase()).toBe(PHASE.landing);
  });

  it("still lands with either button of the keyboard or the mouse", () => {
    const { input, phase, steps } = flyWithLeftZoneHeld();
    input.setButton("touch", "left", false);
    steps(3);
    input.setButton("keys", "left", true);
    steps(1);
    expect(phase()).toBe(PHASE.landingPrep);
  });
});
