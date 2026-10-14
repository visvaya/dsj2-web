import { describe, expect, it } from "vitest";
import { OWN_HILLS } from "../game/hill-choice";
import { isJumpOver, startTrainingJump, stepTrainingJump, type TrainingJump } from "../game/training-session";
import type { FrameInput } from "../sim/jump-logic";
import { jumpResult, stepJump, type JumpCue } from "./jump-round";

const hill = OWN_HILLS[0];
const SEED = 12345;
const MAX_FRAMES = 4000;

/** A whole jump: the press that leaves the gate, then both buttons for the landing. */
const handsAt = (frame: number): FrameInput => ({
  left: frame === 70 || (frame > 500 && frame < 520),
  right: frame > 500 && frame < 520,
  dy: 0,
});

const start = (): TrainingJump => {
  if (!hill) throw new Error("no hill");
  return startTrainingJump(hill, SEED);
};

/** The jump played in chunks of `chunk` frames, as picture frames take them, with what each chunk reported. */
const inChunks = (chunk: number, record?: { distanceM: number; points: number; dateIso: string }) => {
  let jump = start();
  let leftHeld = false;
  const cues: JumpCue[] = [];
  const touchdowns: boolean[] = [];
  const leftDownChunks: number[] = [];
  for (let f = 0; f < MAX_FRAMES && !isJumpOver(jump); f += chunk) {
    let frame = jump.state.logic.frame;
    const stepped = stepJump(jump, { steps: chunk, leftHeld, record }, () => handsAt(++frame));
    if (stepped.leftDown) leftDownChunks.push(f);
    jump = stepped.jump;
    leftHeld = false;
    cues.push(...stepped.cues);
    if (stepped.touchdown) touchdowns.push(stepped.touchdown.newRecord);
  }
  return { jump, cues, touchdowns, leftDownChunks };
};

describe("jump steps", () => {
  it("leave the jump alone and report nothing for no frames", () => {
    const jump = start();
    const stepped = stepJump(jump, { steps: 0, leftHeld: true, record: undefined }, () => {
      throw new Error("no frame to take");
    });
    expect(stepped).toEqual({ jump, leftDown: true, cues: [], touchdown: null });
  });

  it("step the simulation as single frames do, whatever the chunk", () => {
    let single = start();
    for (let f = 0; f < MAX_FRAMES && !isJumpOver(single); f++) {
      single = stepTrainingJump(single, handsAt(single.state.logic.frame + 1));
    }
    expect(single.state.logic.finished).toBe(true);
    expect(inChunks(3).jump.state).toEqual(single.state);
  });

  it("give each frame's input the phase the jump is in before it", () => {
    const jump = start();
    const phases: number[] = [];
    stepJump(jump, { steps: 1, leftHeld: false, record: undefined }, (phase) => {
      phases.push(phase);
      return handsAt(1);
    });
    expect(phases).toEqual([jump.state.logic.phase]);
  });

  it("count a press inside the frames, and one held before them", () => {
    const { leftDownChunks } = inChunks(10);
    // The jump starts at frame 1, so frame 70 is the ninth frame of the chunk that starts at loop frame 60.
    expect(leftDownChunks[0]).toBe(60);
    const jump = start();
    const held = stepJump(jump, { steps: 1, leftHeld: true, record: undefined }, () => handsAt(1));
    expect(held.leftDown).toBe(true);
  });

  it("tell the touchdown once, with the verdict on the record", () => {
    const fresh = inChunks(2);
    const result = jumpResult(fresh.jump);
    expect(fresh.touchdowns).toEqual([!result.fell && result.distanceM > 0]);
    const unbeaten = inChunks(2, { distanceM: 1000, points: 0, dateIso: "2026-01-01T00:00:00.000Z" });
    expect(unbeaten.touchdowns).toEqual([false]);
  });

  it("report the moments of the jump in order, starting with the push from the gate", () => {
    const { cues } = inChunks(2);
    expect(cues[0]).toEqual({ kind: "feedback", event: "start" });
    expect(cues).toContainEqual({ kind: "feedback", event: "takeoff" });
    expect(cues.filter((c) => c.kind === "feedback" && c.event === "start")).toHaveLength(1);
  });
});
