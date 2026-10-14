import { describe, expect, it } from "vitest";
import { OWN_HILLS } from "../game/hill-choice";
import { PHASE, type FrameInput } from "../sim/jump-logic";
import { recordingSource } from "./jump-replay";
import { ghostAlong, ghostAtGate } from "./record-ghost";

const hill = OWN_HILLS[0];
/** The frame in which the record's jumper pressed to leave the gate. */
const RECORD_START_FRAME = 120;

/** Inputs by simulation frame from 1: a press at the gate, then nothing. */
const pressAt = (frame: number, frames: number): FrameInput[] =>
  Array.from({ length: frames }, (_, i) => ({ left: i + 1 === frame, right: false, dy: 0 }));

describe("the ghost of a record", () => {
  it("waits at the gate until its jumper leaves it, then keeps level with the player's jump", () => {
    if (!hill) throw new Error("no hill");
    const source = recordingSource({ seed: 7, inputs: pressAt(RECORD_START_FRAME, 400), newRecord: true });
    const ghost = ghostAtGate(hill, source);
    if (!ghost) throw new Error("no ghost");
    expect(ghost.jump.state.logic.phase).toBe(PHASE.inrun);
    expect(ghost.startFrame).toBeGreaterThanOrEqual(RECORD_START_FRAME);
    expect(ghost.startFrame).toBeLessThanOrEqual(RECORD_START_FRAME + 1);

    // The player left the gate 50 frames ago: so did the ghost, whenever each of them started.
    const along = ghostAlong(ghost, 50);
    expect(along.jump.state.logic.frame).toBe(ghost.startFrame + 50);
    expect(along.jump.state.jumper.xM).toBeGreaterThan(ghost.jump.state.jumper.xM);
    // Already level: nothing is played and nothing changes.
    expect(ghostAlong(along, 50)).toBe(along);
  });

  it("is not there when the record's jumper never leaves the gate", () => {
    if (!hill) throw new Error("no hill");
    // No hands: the start time runs out and the jump is disqualified at the gate.
    expect(ghostAtGate(hill, recordingSource({ seed: 7, inputs: [], newRecord: false }))).toBeNull();
  });
});
